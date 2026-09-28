/**
 * Money, in one place.
 *
 * THE RULE: paise in the database and over the wire, rupees on the screen.
 * Nothing is ever stored in rupees, and nothing is ever displayed in paise.
 *
 * There were eight copies of this conversion across the app, two of them named
 * almost identically while taking DIFFERENT units — one `inr()` expecting
 * rupees next to a `rupees()` expecting paise. That is how a screen ends up
 * showing ₹118000 for a ₹1,180 repair, or a worker gets paid 50 paise for a ₹50
 * bonus. The names here say their unit out loud so the mistake is hard to make:
 *
 *   formatPaise(118000)  → "₹1,180"     ← use this to display anything stored
 *   rupeesToPaise('1180') → 118000      ← use this on form input before saving
 *   paiseToRupees(118000) → 1180        ← only when you need the number itself
 */

/** Indian digit grouping — 1,18,000 rather than 118,000. */
const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const GROUPED_WITH_PAISE = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Display a stored amount.
 *
 * Rounds to whole rupees by default, because that is how repair prices are
 * quoted and read aloud. Pass `{ exact: true }` where the paise genuinely
 * matter — a refund, a commission line, an invoice total that must reconcile.
 */
export function formatPaise(paise, { exact = false, blankWhenNull = false } = {}) {
  if (paise == null && blankWhenNull) return '';
  const value = Number(paise) || 0;
  return exact
    ? `₹${GROUPED_WITH_PAISE.format(value / 100)}`
    : `₹${GROUPED.format(Math.round(value / 100))}`;
}

/** The numeric rupee value, for arithmetic or for filling a form field. */
export function paiseToRupees(paise) {
  return Math.round(((Number(paise) || 0) / 100) * 100) / 100;
}

/**
 * Turn what someone typed into storable paise.
 *
 * Always integer paise: a float amount that survives into the database becomes
 * a total that does not add up, and reconciliation then takes an afternoon.
 */
export function rupeesToPaise(rupees) {
  const value = Number(rupees);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** A range, collapsed when both ends match. */
export function formatPaiseRange(minPaise, maxPaise) {
  if (minPaise == null && maxPaise == null) return null;
  if (minPaise == null || maxPaise == null) return formatPaise(minPaise ?? maxPaise);
  if (minPaise === maxPaise) return formatPaise(minPaise);
  return `${formatPaise(minPaise)}–${GROUPED.format(Math.round(maxPaise / 100))}`;
}
