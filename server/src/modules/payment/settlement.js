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

function bookCommission({ source, bookingId, reference, platformPaise, cash, meta = null }) {
  if (platformPaise <= 0) return null;
  return Transaction.create({
    type: 'credit',
    owner: { kind: 'platform', id: null },
    amountPaise: platformPaise,
    reason: Transaction.REASONS.PLATFORM_COMMISSION,
    idempotencyKey: `${source}:commission:${bookingId}`,
    description: `${source} commission — ${reference}`,
    metadata: { source, bookingId: String(bookingId), ...(cash ? { cash: true } : {}), ...(meta || {}) },
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
        allowDebt: true, // owed, however deep; the dues limit stops new work instead
        refs,
        description: `Commission on cash ${source} ${reference}`,
      });
      require('../worker/worker-dues.service').notifyIfCrossed(ownerId);
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
/**
 * ZappyOne's own salaried staff (workforce/): the job's money is ZappyOne's,
 * the customer's boost and the whole surge with it. Paid online, all of it is
 * revenue; paid in cash, they hold it and owe all of it until they deposit it
 * at the hub. Their tip is still theirs (settleTip, as for anyone).
 */
async function settleStaff({ source, booking, reference, paymentMethod, totalPaise, refs = {} }) {
  const { KINDS } = require('../jobs/kinds');
  const Model = KINDS[source]?.model();
  const doc = Model ? await Model.findById(booking._id).select('boost surge').lean() : null;
  const boostPaise = doc?.boost?.paise && !doc.boost.settledAt ? doc.boost.paise : 0;
  const surgePaise = doc?.surge?.paise && !doc.surge.settledAt ? doc.surge.paise : 0;
  if (Model && (boostPaise || surgePaise)) {
    await Model.updateOne({ _id: booking._id }, { $set: { ...(boostPaise ? { 'boost.settledAt': new Date() } : {}), ...(surgePaise ? { 'surge.settledAt': new Date() } : {}) } });
  }
  const all = (totalPaise || 0) + boostPaise + surgePaise;
  if (all <= 0) return { settled: false, reason: 'zero_value', totalPaise: 0 };
  const cash = paymentMethod === 'cash';
  if (cash) {
    await walletService.apply({
      kind: 'worker', id: booking.workerId, type: 'debit', amountPaise: all, allowDebt: true,
      reason: Transaction.REASONS.PLATFORM_COMMISSION, idempotencyKey: `${source}:staff_cash:${booking._id}`, refs,
      description: `Cash to deposit at your hub — ${source} ${reference}`,
    });
  }
  // Tagged with the staff member and their hub, for the hub's profit and loss (workforce/finance).
  const w = await require('../worker/worker.model').findById(booking.workerId).select('employment.hubId').lean();
  await bookCommission({ source, bookingId: booking._id, reference, platformPaise: all, cash, meta: { staff: true, workerId: String(booking.workerId), hubId: w?.employment?.hubId ? String(w.employment.hubId) : null } });
  return { settled: true, staff: true, cash, ownerKind: 'worker', ownerId: String(booking.workerId), totalPaise: all, providerPaise: 0, platformPaise: all };
}

async function settleProviderShare(args) {
  if (!args.booking.shopId && args.booking.workerId && await require('../workforce/staff').isStaff(args.booking.workerId)) {
    const result = await settleStaff(args);
    await require('../jobs/cancel-fee').settleCarried(args.source, args.booking._id)
      .catch((err) => logger.error({ err: err.message, bookingId: String(args.booking._id) }, '[settlement] carried cancellation fee not settled'));
    await require('../jobs/boost-tip').settleTip(args.source, args.booking._id)
      .catch((err) => logger.error({ err: err.message, bookingId: String(args.booking._id) }, '[settlement] tip not paid to staff'));
    return result;
  }
  const result = await settleShare(args);
  // An earlier cancellation fee paid with this booking goes to the shield fund (jobs/cancel-fee).
  await require('../jobs/cancel-fee').settleCarried(args.source, args.booking._id)
    .catch((err) => logger.error({ err: err.message, bookingId: String(args.booking._id) }, '[settlement] carried cancellation fee not settled'));
  // The customer's boost is all the provider's (jobs/boost-tip).
  await require('../jobs/boost-tip').settleBoost(args.source, args.booking._id)
    .catch((err) => logger.error({ err: err.message, bookingId: String(args.booking._id) }, '[settlement] boost not paid to provider'));
  // Surge: the provider's share to them, ZappyOne's booked as revenue (jobs/surge).
  await require('../jobs/surge').settleSurge(args.source, args.booking._id)
    .catch((err) => logger.error({ err: err.message, bookingId: String(args.booking._id) }, '[settlement] surge not split'));
  // A tip the customer put on the bill, likewise all theirs.
  await require('../jobs/boost-tip').settleTip(args.source, args.booking._id)
    .catch((err) => logger.error({ err: err.message, bookingId: String(args.booking._id) }, '[settlement] tip not paid to provider'));
  // Tell them what they earned (messaging/catalog 'provider.paid'), once per job.
  if (result?.settled) {
    const to = result.ownerKind === 'shop' ? { kind: 'shop', id: result.ownerId } : { kind: 'worker', id: result.ownerId };
    const { KINDS } = require('../jobs/kinds');
    KINDS[args.source]?.model().findById(args.booking._id).lean()
      .then((doc) => doc && require('../messaging/facts').jobFacts(args.source, doc))
      .then((f) => f && require('../messaging/send').send('provider.paid', {
        to, refId: `${args.source}:${args.booking._id}`,
        ctx: { f, earningPaise: (result.providerPaise || 0) + (f.linesPaise.find(([l]) => l === 'Boost for a faster match')?.[1] || 0), cash: !!result.cash },
      }))
      .catch(() => {});
  }
  return result;
}

async function settleShare({ source, booking, reference, paymentMethod, totalPaise, platformPaise, refs = {} }) {
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
