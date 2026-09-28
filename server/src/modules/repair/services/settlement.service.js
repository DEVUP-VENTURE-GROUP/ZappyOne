const settlement = require('../../payment/settlement');
const logger = require('../../../core/logger');

/**
 * Repair settlement: the split comes from the BOOKING SNAPSHOT, not live
 * config. The commission the customer was quoted under is the commission the
 * provider is settled under, even if an admin changes the rate the next day.
 * Money moves through the shared settlement pipeline (payment/settlement.js).
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

/** Settle a completed repair. Online pays the provider; cash bills them the commission. */
async function settleBooking(booking) {
  const { totalPaise, platformPaise } = splitFor(booking);
  return settlement.settleProviderShare({
    source: 'repair', booking, reference: booking.reference, paymentMethod: booking.paymentMethod,
    totalPaise, platformPaise, refs: { orderId: booking._id },
  });
}

/** Wrapper that never throws — the caller is a state transition. */
async function settleSafely(booking) {
  const { totalPaise, platformPaise } = splitFor(booking);
  return settlement.settleSafely({
    source: 'repair', booking, reference: booking.reference, paymentMethod: booking.paymentMethod,
    totalPaise, platformPaise, refs: { orderId: booking._id },
  });
}

module.exports = { settleBooking, settleSafely, splitFor };
