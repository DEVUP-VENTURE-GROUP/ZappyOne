/**
 * The money on an event booking, in one place.
 *
 *   themePricePaise   what the partner charges for the setup
 *   platformFeePaise  added on top for the customer (admin-set)
 *   totalPaise        what the customer pays: theme price + platform fee
 *
 * Commission is taken from the partner on the theme price only, never on our
 * own fee. The platform fee is collected with the advance, so the balance paid
 * at the event is the partner's theme price alone. Each booking freezes the
 * rates it was made at; bookings made before the fee existed have no
 * themePricePaise and fall back to totalPaise, so their math is unchanged.
 */

/** A new booking's pricing snapshot at today's admin rates. */
function priceBooking(theme, cfg) {
  const themePricePaise = theme.startingPricePaise;
  const platformFeePaise = Math.max(0, cfg.platformFeePaise ?? 0);
  const totalPaise = themePricePaise + platformFeePaise;
  const advancePaise = Math.round(themePricePaise * cfg.advancePaymentPct / 100) + platformFeePaise;
  return {
    themePricePaise,
    platformFeePaise,
    totalPaise,
    advancePaise,
    remainingPaise: totalPaise - advancePaise,
    platformCommissionPct: cfg.platformCommissionPct,
    advancePaymentPct: cfg.advancePaymentPct,
  };
}

/** What the partner's work is priced at on this booking. */
function partnerGrossOf(pricing = {}) {
  return pricing.themePricePaise ?? pricing.totalPaise ?? 0;
}

/** The partner's share after commission, at the rate frozen on the booking. */
function partnerNetOf(pricing = {}) {
  const pct = pricing.platformCommissionPct ?? 10;
  return Math.round(partnerGrossOf(pricing) * (100 - pct) / 100);
}

/** Everything the platform keeps: commission plus the customer platform fee. */
function platformTakeOf(pricing = {}) {
  return partnerGrossOf(pricing) - partnerNetOf(pricing) + (pricing.platformFeePaise || 0);
}

/* The same rules as aggregation expressions, for earnings reports. */
const PARTNER_GROSS = { $ifNull: ['$pricing.themePricePaise', '$pricing.totalPaise'] };
const PARTNER_NET = {
  $multiply: [PARTNER_GROSS, { $divide: [{ $subtract: [100, { $ifNull: ['$pricing.platformCommissionPct', 10] }] }, 100] }],
};

module.exports = { priceBooking, partnerGrossOf, partnerNetOf, platformTakeOf, PARTNER_GROSS, PARTNER_NET };
