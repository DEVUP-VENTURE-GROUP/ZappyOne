const walletService = require('../wallet/wallet.service');
const Transaction = require('./transaction.model');
const logger = require('../../core/logger');

/**
 * Paying the provider for finished work: one pipeline for repair, pet care
 * and helping, so finance reconciles one set of rows.
 *
 *   online  the platform holds the customer's money
 *           → credit the provider their share, book the commission
 *   cash    the provider already holds the whole amount
 *           → debit the commission from their wallet, book the commission
 *
 * Getting the direction wrong pays a provider twice for the same job.
 *
 * The commission is booked here and only here, at settlement, never at
 * payment capture: a payment later refunded must not leave revenue behind.
 *
 * Every write is keyed on `${source}:…:${bookingId}`, so a replayed completion
 * moves money exactly once.
 */

const ignoreDuplicate = (e) => { if (e.code !== 11000) throw e; };

function bookCommission({ source, bookingId, reference, platformPaise, cash }) {
  if (platformPaise <= 0) return null;
  return Transaction.create({
    type: 'credit',
    owner: { kind: 'platform', id: null },
    amountPaise: platformPaise,
    reason: Transaction.REASONS.PLATFORM_COMMISSION,
    idempotencyKey: `${source}:commission:${bookingId}`,
    description: `${source} commission — ${reference}`,
    metadata: { source, bookingId: String(bookingId), ...(cash ? { cash: true } : {}) },
    status: 'succeeded',
  }).catch(ignoreDuplicate);
}

async function settleCash({ source, bookingId, reference, isShop, ownerId, totalPaise, platformPaise, refs }) {
  if (platformPaise > 0 && isShop) {
    // Shops have no wallet rail yet: the debt is booked against the shop and
    // collected on the shop payout run.
    await Transaction.create({
      type: 'debit',
      owner: { kind: 'platform', id: null },
      amountPaise: -platformPaise,
      reason: Transaction.REASONS.PLATFORM_COMMISSION,
      idempotencyKey: `${source}:cash_commission_due:${bookingId}`,
      description: `Commission due on cash ${source} ${reference}`,
      metadata: { source, shopId: String(ownerId), bookingId: String(bookingId), totalPaise, cash: true },
      status: 'succeeded',
    }).catch(ignoreDuplicate);
  } else if (platformPaise > 0) {
    try {
      await walletService.apply({
        kind: 'worker',
        id: ownerId,
        type: 'debit',
        amountPaise: platformPaise,
        reason: Transaction.REASONS.PLATFORM_COMMISSION,
        idempotencyKey: `${source}:cash_commission:${bookingId}`,
        refs,
        description: `Commission on cash ${source} ${reference}`,
      });
    } catch (err) {
      // The wallet is at its dues floor. The debt is still real, so it is kept
      // as a pending row rather than lost; matching stops offering this
      // provider cash work until it is cleared.
      await Transaction.create({
        type: 'debit',
        owner: { kind: 'worker', id: ownerId },
        amountPaise: -platformPaise,
        reason: Transaction.REASONS.PLATFORM_COMMISSION,
        idempotencyKey: `${source}:cash_commission_unpaid:${bookingId}`,
        description: `Commission due (wallet at limit) — ${source} ${reference}`,
        metadata: { source, bookingId: String(bookingId), cash: true, walletRefused: err.message },
        status: 'pending',
      }).catch(ignoreDuplicate);
      logger.warn({ source, bookingId: String(bookingId), workerId: String(ownerId), platformPaise },
        '[settlement] commission recorded as a due — provider wallet at its limit');
    }
  }
  await bookCommission({ source, bookingId, reference, platformPaise, cash: true });
  return {
    settled: true, cash: true, ownerKind: isShop ? 'shop' : 'worker', ownerId: String(ownerId),
    totalPaise, providerPaise: totalPaise - platformPaise, platformPaise,
  };
}

/**
 * Settle one finished booking.
 *
 * @param {object} p
 * @param {'repair'|'pet'|'helping'} p.source
 * @param {object} p.booking         needs _id, workerId, shopId
 * @param {string} p.reference       shown on ledger rows
 * @param {'cash'|'online'} p.paymentMethod
 * @param {number} p.totalPaise      what the customer paid for the work
 * @param {number} p.platformPaise   the platform's cut, frozen at booking time
 * @param {object} [p.refs]          wallet refs, e.g. { orderId }
 */
async function settleProviderShare({ source, booking, reference, paymentMethod, totalPaise, platformPaise, refs = {} }) {
  if (!totalPaise || totalPaise <= 0) return { settled: false, reason: 'zero_value', totalPaise: totalPaise || 0 };

  // Shop-employed workers are paid by their shop; the shop is the counterparty.
  const isShop = !!booking.shopId;
  const ownerId = isShop ? booking.shopId : booking.workerId;
  if (!ownerId) return { settled: false, reason: 'no_provider', totalPaise };

  // A commission larger than the bill would pay the provider a negative amount.
  const platform = Math.min(Math.max(platformPaise || 0, 0), totalPaise);
  const providerPaise = totalPaise - platform;
  const bookingId = booking._id;

  if (paymentMethod === 'cash') {
    return settleCash({ source, bookingId, reference, isShop, ownerId, totalPaise, platformPaise: platform, refs });
  }

  if (isShop) {
    // The wallet ledger has no shop principal: the earning is recorded against
    // the shop without a balance movement until shop payouts exist.
    await Transaction.create({
      type: 'credit',
      owner: { kind: 'platform', id: null },
      amountPaise: providerPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `${source}:shop_earning:${bookingId}`,
      description: `Shop earning — ${source} ${reference}`,
      metadata: { source, shopId: String(ownerId), bookingId: String(bookingId), totalPaise },
      status: 'succeeded',
    }).catch(ignoreDuplicate);
  } else if (providerPaise > 0) {
    await walletService.apply({
      kind: 'worker',
      id: ownerId,
      type: 'credit',
      amountPaise: providerPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `${source}:earning:${bookingId}`,
      refs,
      description: `Earning for ${source} ${reference}`,
    });
  }

  await bookCommission({ source, bookingId, reference, platformPaise: platform });
  return {
    settled: true, ownerKind: isShop ? 'shop' : 'worker', ownerId: String(ownerId),
    totalPaise, providerPaise, platformPaise: platform,
  };
}

/** Never throws: the caller is a state transition that must not be undone by a ledger outage. */
async function settleSafely(args) {
  try {
    const result = await settleProviderShare(args);
    if (result.settled) {
      logger.info({ source: args.source, bookingId: String(args.booking._id), providerPaise: result.providerPaise, platformPaise: result.platformPaise },
        `[${args.source}] booking settled`);
    }
    return result;
  } catch (err) {
    logger.error({ err: err.message, source: args.source, bookingId: String(args.booking._id) },
      `[${args.source}] SETTLEMENT FAILED — provider not credited, needs reconciliation`);
    return { settled: false, reason: 'error', error: err.message };
  }
}

module.exports = { settleProviderShare, settleSafely };
