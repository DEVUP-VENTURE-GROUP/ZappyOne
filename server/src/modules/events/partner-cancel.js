/**
 * An event partner cancelling a confirmed booking: the customer always gets
 * everything back (event-partner-api declineBooking); the partner pays for the
 * damage, and repeat cancellers stop taking bookings.
 *
 *   penalty   a share of the partner's own value of the booking, by how close
 *             the event is (EventConfig.partnerCancelPenalty, admin-set):
 *             7+ days 0% (a strike only) · 3–7 days 10% · 1–3 days 20% · under 1 day 30%
 *             Owed to ZappyOne and taken from their payouts (a PROVIDER_PENALTY row).
 *   strikes   every partner cancellation in the last strikeWindowDays counts;
 *             at strikeLimit the partner is paused: their themes leave the
 *             catalogue and new bookings stop, until admin reinstates them.
 *             Bookings they already have go on.
 *   told      the partner sees the penalty and strikes BEFORE confirming
 *             (quote), and is told after; ops is emailed on a pause.
 */
const EventBooking = require('./event-booking.model');
const EventPartner = require('./event-partner.model');

const DEFAULTS = {
  partnerCancelPenalty: [
    { daysBeforeEvent: 7, penaltyPct: 0 },
    { daysBeforeEvent: 3, penaltyPct: 10 },
    { daysBeforeEvent: 1, penaltyPct: 20 },
    { daysBeforeEvent: 0, penaltyPct: 30 },
  ],
  partnerStrikeLimit: 3,
  partnerStrikeWindowDays: 90,
};
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

async function settings() {
  const cfg = await require('./event.service').getActiveConfig();
  return {
    tiers: Array.isArray(cfg.partnerCancelPenalty) && cfg.partnerCancelPenalty.length ? cfg.partnerCancelPenalty : DEFAULTS.partnerCancelPenalty,
    limit: cfg.partnerStrikeLimit ?? DEFAULTS.partnerStrikeLimit,
    windowDays: cfg.partnerStrikeWindowDays ?? DEFAULTS.partnerStrikeWindowDays,
  };
}

async function strikesOf(partnerId, windowDays) {
  return EventBooking.countDocuments({ partnerId, cancelledBy: 'partner', updatedAt: { $gte: new Date(Date.now() - windowDays * 86400e3) } });
}

/** What cancelling this booking would cost the partner, right now. */
async function quote(booking) {
  const s = await settings();
  const days = booking.eventDate ? (new Date(booking.eventDate) - Date.now()) / 86400e3 : 0;
  const tier = [...s.tiers].sort((a, b) => b.daysBeforeEvent - a.daysBeforeEvent).find((t) => days >= t.daysBeforeEvent) || s.tiers[s.tiers.length - 1];
  const value = require('./event-money').partnerGrossOf(booking.pricing) || 0;
  const penaltyPaise = Math.round((value * (tier?.penaltyPct || 0)) / 100);
  const strikes = await strikesOf(booking.partnerId, s.windowDays);
  const willPause = strikes + 1 >= s.limit;
  return {
    penaltyPaise, penaltyPct: tier?.penaltyPct || 0, daysBefore: Math.max(0, Math.floor(days)),
    strikes, strikeLimit: s.limit, windowDays: s.windowDays, willPause,
    message: `${penaltyPaise ? `Cancelling costs you ${rupees(penaltyPaise)} (${tier.penaltyPct}% of this booking), taken from your payouts. ` : 'No charge this far ahead, but it counts. '}`
      + `This would be cancellation ${strikes + 1} of ${s.limit} in ${s.windowDays} days${willPause ? ': your listings would be paused until ZappyOne reviews them.' : '.'} The customer gets a full refund.`,
  };
}

/** After the cancel went through: the penalty, the strike, a pause at the limit. Never throws. */
async function apply(booking) {
  try {
    const q = await quote({ ...booking, partnerId: booking.partnerId });
    const Transaction = require('../payment/transaction.model');
    if (q.penaltyPaise > 0) {
      await Transaction.create({
        type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -q.penaltyPaise, reason: Transaction.REASONS.PROVIDER_PENALTY,
        idempotencyKey: `event:partner_cancel:${booking._id}`, description: `Partner cancelled event booking ${booking.reference || booking._id}`,
        metadata: { partnerId: String(booking.partnerId), bookingId: String(booking._id), penaltyPct: q.penaltyPct }, status: 'succeeded',
      }).catch((e) => { if (e.code !== 11000) throw e; });
    }
    const strikes = q.strikes; // this cancellation is already counted (status saved first)
    const s = await settings();
    let paused = false;
    if (strikes >= s.limit) {
      const r = await EventPartner.updateOne({ _id: booking.partnerId, suspendedAt: null }, {
        $set: { suspendedAt: new Date(), suspendReason: `${strikes} cancellations in ${s.windowDays} days` },
      });
      paused = r.modifiedCount > 0;
    }
    require('../notification/notification.service').notify({
      recipient: { kind: 'event_partner', id: String(booking.partnerId) }, type: 'system_alert',
      title: paused ? 'Your listings are paused' : 'Booking cancelled',
      body: paused
        ? `That was ${strikes} cancellations in ${s.windowDays} days, so customers cannot book you for now. ZappyOne will review it with you.`
        : `${q.penaltyPaise ? `${rupees(q.penaltyPaise)} comes off your next payout. ` : ''}Cancellation ${strikes} of ${s.limit} in ${s.windowDays} days.`,
      data: { bookingId: String(booking._id) },
    }).catch(() => {});
    if (paused) {
      const p = await EventPartner.findById(booking.partnerId).select('businessName phone').lean();
      require('../messaging/send').send('ops.partner_paused', {
        to: 'ops', refId: `partnerpause:${booking.partnerId}:${Date.now()}`,
        ctx: { partner: p?.businessName || 'A partner', phone: p?.phone || '', strikes, windowDays: s.windowDays },
      }).catch(() => {});
    }
    return { penaltyPaise: q.penaltyPaise, strikes, paused };
  } catch (e) {
    require('../../core/logger').warn({ err: e.message, bookingId: String(booking._id) }, '[events] partner cancel penalty not applied');
    return null;
  }
}

/** Penalties owed by a partner (subtracted from what they are paid). */
async function penaltiesOf(partnerId) {
  const Transaction = require('../payment/transaction.model');
  const [r] = await Transaction.aggregate([
    { $match: { 'metadata.partnerId': String(partnerId), reason: Transaction.REASONS.PROVIDER_PENALTY } },
    { $group: { _id: null, paise: { $sum: { $multiply: ['$amountPaise', -1] } } } },
  ]);
  return r?.paise || 0;
}

/** Partner ids that are paused: their themes are hidden and new bookings refused. */
async function pausedPartnerIds() {
  return EventPartner.distinct('_id', { suspendedAt: { $ne: null } });
}

async function reinstate(partnerId) {
  await EventPartner.updateOne({ _id: partnerId }, { $set: { suspendedAt: null, suspendReason: '' } });
  require('../notification/notification.service').notify({
    recipient: { kind: 'event_partner', id: String(partnerId) }, type: 'system_alert',
    title: 'Your listings are live again', body: 'Customers can book you again. Please avoid cancelling confirmed bookings.', data: {},
  }).catch(() => {});
}

module.exports = { quote, apply, penaltiesOf, pausedPartnerIds, reinstate, DEFAULTS };
