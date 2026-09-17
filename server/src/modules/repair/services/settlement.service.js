const walletService = require('../../wallet/wallet.service');
const Transaction = require('../../payment/transaction.model');
const logger = require('../../../utils/logger');

/**
 * Repair settlement — paying the provider for completed work.
 *
 * Mirrors the order-completion path rather than inventing a second money
 * pipeline: same wallet service, same Transaction reasons, same idempotency
 * key discipline. A repair that pays through different rails would be a
 * reconciliation problem the first time finance looked at it.
 *
 * The split comes from the BOOKING SNAPSHOT, not from live config. The
 * commission the customer was quoted under is the commission the provider is
 * settled under, even if an admin changes the rate the next day (§22/§69).
 *
 * Every write is keyed on the booking id, so replaying a completion — a retried
 * webhook, a double transition, an ops re-run — credits exactly once.
 */

/**
 * What the provider earns and what the platform keeps.
 *
 * `commissionPaise` was frozen at booking time. It is recomputed here ONLY as a
 * fallback for older bookings written before commission was snapshotted, and
 * that fallback is logged rather than applied silently.
 */
function splitFor(booking) {
  const snap = booking.priceSnapshot || {};
  const totalPaise = snap.totalPaise || 0;

  let platformPaise = snap.commissionPaise;
  if (platformPaise == null) {
    platformPaise = 0;
    logger.warn(
      { bookingId: String(booking._id) },
      '[repair] booking has no snapshotted commission — settling at zero platform share',
    );
  }

  // Defensive: a commission larger than the bill would pay the provider a
  // negative amount, which is never a legitimate outcome.
  platformPaise = Math.min(Math.max(platformPaise, 0), totalPaise);

  return { totalPaise, platformPaise, providerPaise: totalPaise - platformPaise };
}


/**
 * Cash settles in the opposite direction to online.
 *
 * Online: the platform holds the customer's money, so it pays the provider
 * their share and keeps the commission.
 *
 * Cash: the provider already took the full amount from the customer, so
 * there is nothing to pay them — instead they OWE us the commission, which is
 * debited from their wallet exactly as it is for cash orders. The wallet
 * already models this: a worker may run negative down to a hard floor, and the
 * debt is recovered from their next earnings.
 *
 * Getting this backwards would pay a provider twice for the same job.
 */
async function settleCashBooking(booking, { totalPaise, platformPaise }) {
  const isShop = !!booking.shopId;
  const ownerId = isShop ? booking.shopId : booking.workerId;

  if (platformPaise <= 0) {
    return {
      settled: true, cash: true, ownerKind: isShop ? 'shop' : 'worker',
      ownerId: String(ownerId), totalPaise, providerPaise: totalPaise, platformPaise: 0,
    };
  }

  if (isShop) {
    // Shops have no wallet rail yet, so the debt is booked against the shop and
    // collected on the shop payout run.
    await Transaction.create({
      type: 'debit',
      owner: { kind: 'platform', id: null },
      amountPaise: -platformPaise,
      reason: Transaction.REASONS.PLATFORM_COMMISSION,
      idempotencyKey: `repair:cash_commission_due:${booking._id}`,
      description: `Commission due on cash repair ${booking.reference}`,
      metadata: { shopId: String(ownerId), bookingId: String(booking._id), totalPaise, cash: true },
      status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });
  } else {
    try {
      await walletService.apply({
        kind: 'worker',
        id: ownerId,
        type: 'debit',
        amountPaise: platformPaise,
        reason: Transaction.REASONS.PLATFORM_COMMISSION,
        idempotencyKey: `repair:cash_commission:${booking._id}`,
        refs: { orderId: booking._id },
        description: `Commission on cash repair ${booking.reference}`,
      });
    } catch (err) {
      /**
       * The wallet refused — the technician is already at the dues floor.
       *
       * The debt is real whether or not the wallet can hold it, so it is
       * recorded against the booking instead of being lost. Dropping it here
       * would quietly forfeit the platform's commission on every job a
       * struggling provider does, which is exactly the provider we most need
       * an accurate number for.
       *
       * Prevention lives in matching: a provider past the dues limit stops
       * being offered cash work until they clear it.
       */
      await Transaction.create({
        type: 'debit',
        owner: { kind: 'worker', id: ownerId },
        amountPaise: -platformPaise,
        reason: Transaction.REASONS.PLATFORM_COMMISSION,
        idempotencyKey: `repair:cash_commission_unpaid:${booking._id}`,
        description: `Commission due (wallet at limit) — repair ${booking.reference}`,
        metadata: { bookingId: String(booking._id), cash: true, walletRefused: err.message },
        status: 'pending',
      }).catch((e) => { if (e.code !== 11000) throw e; });

      logger.warn(
        { bookingId: String(booking._id), workerId: String(ownerId), platformPaise },
        '[repair] commission recorded as a due — provider wallet at its limit',
      );
    }
  }

  // Platform revenue is booked the same way either method, so the books do not
  // depend on how the customer happened to pay.
  await Transaction.create({
    type: 'credit',
    owner: { kind: 'platform', id: null },
    amountPaise: platformPaise,
    reason: Transaction.REASONS.PLATFORM_COMMISSION,
    idempotencyKey: `repair:commission:${booking._id}`,
    description: `Repair commission — ${booking.reference}`,
    metadata: { bookingId: String(booking._id), cash: true },
    status: 'succeeded',
  }).catch((e) => { if (e.code !== 11000) throw e; });

  return {
    settled: true,
    cash: true,
    ownerKind: isShop ? 'shop' : 'worker',
    ownerId: String(ownerId),
    totalPaise,
    providerPaise: totalPaise - platformPaise,   // kept, not paid
    platformPaise,
  };
}

/**
 * Settle a completed repair.
 *
 * Best effort by design: a wallet outage must not un-complete a finished repair
 * or block the customer's warranty. Failures are logged and surfaced in the
 * return value so a reconciliation job can pick them up, rather than throwing
 * into the state machine.
 */
async function settleBooking(booking) {
  const { totalPaise, platformPaise, providerPaise } = splitFor(booking);

  // Nothing to move — an inspection fully credited against a repair, or a
  // zero-value booking. Recording a ₹0 payout would only add noise.
  if (totalPaise <= 0) {
    return { settled: false, reason: 'zero_value', totalPaise };
  }

  // Shop-employed workers are paid by their shop, not by us — the shop is the
  // counterparty on the booking and receives the settlement.
  const isShop = !!booking.shopId;
  const ownerKind = isShop ? 'shop' : 'worker';
  const ownerId = isShop ? booking.shopId : booking.workerId;

  if (!ownerId) {
    return { settled: false, reason: 'no_provider', totalPaise };
  }

  // Cash runs the other way round — see settleCashBooking.
  if (booking.paymentMethod === 'cash') {
    return settleCashBooking(booking, { totalPaise, platformPaise });
  }

  // The wallet ledger only models user/worker/platform principals, so a shop's
  // earnings are recorded as a transaction against the shop without a balance
  // movement until shop payouts exist as their own rail.
  if (isShop) {
    await Transaction.create({
      type: 'credit',
      owner: { kind: 'platform', id: null },
      amountPaise: providerPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `repair:shop_earning:${booking._id}`,
      description: `Shop earning — repair ${booking.reference}`,
      metadata: { shopId: String(ownerId), bookingId: String(booking._id), totalPaise },
      status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });
  } else {
    await walletService.apply({
      kind: 'worker',
      id: ownerId,
      type: 'credit',
      amountPaise: providerPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `repair:earning:${booking._id}`,
      refs: { orderId: booking._id },
      description: `Earning for repair ${booking.reference}`,
    });
  }

  // Platform commission booked once, regardless of who the provider is.
  if (platformPaise > 0) {
    await Transaction.create({
      type: 'credit',
      owner: { kind: 'platform', id: null },
      amountPaise: platformPaise,
      reason: Transaction.REASONS.PLATFORM_COMMISSION,
      idempotencyKey: `repair:commission:${booking._id}`,
      description: `Repair commission — ${booking.reference}`,
      metadata: { bookingId: String(booking._id) },
      status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });
  }

  return {
    settled: true,
    ownerKind,
    ownerId: String(ownerId),
    totalPaise,
    providerPaise,
    platformPaise,
  };
}

/** Wrapper that never throws — the caller is a state transition. */
async function settleSafely(booking) {
  try {
    const result = await settleBooking(booking);
    if (result.settled) {
      logger.info(
        { bookingId: String(booking._id), providerPaise: result.providerPaise, platformPaise: result.platformPaise },
        '[repair] booking settled',
      );
    }
    return result;
  } catch (err) {
    // Money did not move. Loud, and left for reconciliation — never silent.
    logger.error(
      { err: err.message, bookingId: String(booking._id) },
      '[repair] SETTLEMENT FAILED — provider not credited, needs reconciliation',
    );
    return { settled: false, reason: 'error', error: err.message };
  }
}

module.exports = { settleBooking, settleSafely, splitFor };
