/**
 * An event partner's bookings and packages, for the events website and the
 * ServicePro app alike. The transitions mirror the server
 * (event-partner-api updateBookingStatus): confirmed -> partner_assigned ->
 * in_progress (the host's start code) -> completed (needs a photo of the
 * finished setup).
 */

/** How each booking state reads to a partner. */
export const PARTNER_STATUS_LABEL = {
  pending_payment: 'Awaiting payment',
  confirmed: 'New request',
  partner_assigned: 'Accepted',
  in_progress: 'Setting up',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Under review',
};

/** The one thing the partner does next, per state. */
export const NEXT_STEP = {
  confirmed: { to: 'partner_assigned', label: 'Accept booking' },
  partner_assigned: { to: 'in_progress', label: 'Start setup', needsCode: true },
  in_progress: { to: 'completed', label: 'Mark completed', needsAfterPhoto: true },
};

/** The booking list's tabs; '' is everything. */
export const FILTERS = [
  { key: 'confirmed', label: 'New' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: '', label: 'All' },
];

/** States where setup photos are shown, and where each set can still be added. */
export const PHOTO_STATES = ['partner_assigned', 'in_progress', 'completed'];
export const BEFORE_OPEN = ['partner_assigned', 'in_progress'];
export const AFTER_OPEN = ['in_progress', 'completed'];

/** What the partner keeps from a booking, at the rate frozen on it. */
export function partnerNetPaise(b) {
  if (b?.payout?.netPaise != null) return b.payout.netPaise;
  const pct = b?.pricing?.platformCommissionPct ?? 10;
  return Math.round((b?.pricing?.totalPaise || 0) * (100 - pct) / 100);
}

/** Packages go live only after review; live ones are changed through support. */
export const PACKAGE_STATUS_LABEL = {
  pending: 'In review',
  approved: 'Live',
  featured: 'Live, Featured',
  hidden: 'Hidden',
  rejected: 'Needs changes',
};
export const EDITABLE = ['pending', 'rejected'];

/** Why a package cannot be sent yet, first problem first (empty when it can). */
export function packageProblems({ title, categoryId, price, cover, cities, included }) {
  return [
    !String(title || '').trim() && 'a title',
    !categoryId && 'a category',
    (Number(price) || 0) < 500 && 'a price of at least ₹500',
    !cover && 'a cover photo',
    !cities?.length && 'at least one place you serve',
    !included?.length && 'what is included',
  ].filter(Boolean);
}

/** A package form's values as the server takes them. Media are storage keys. */
export function packageBody(form) {
  return {
    title: form.title.trim(), description: form.description.trim(), categoryId: form.categoryId,
    startingPricePaise: Math.round((Number(form.price) || 0) * 100),
    setupDurationMinutes: Math.max(30, Math.round(Number(form.setupHours || 2) * 60)),
    guestCapacity: { min: 1, max: Math.max(1, Number(form.guestsMax) || 50) },
    includedItems: form.included, excludedItems: form.excluded, cities: form.cities,
    coverImage: form.cover.key, gallery: form.gallery.map((g) => g.key), videoUrl: form.video?.key || '',
  };
}

/** A saved package back into the form. */
export function packageForm(theme) {
  return {
    title: theme.title || '', description: theme.description || '',
    categoryId: theme.categoryId?._id || theme.categoryId || '',
    price: theme.startingPricePaise ? String(Math.round(theme.startingPricePaise / 100)) : '',
    setupHours: String(Math.round((theme.setupDurationMinutes || 120) / 6) / 10),
    guestsMax: String(theme.guestCapacity?.max || 50),
    included: theme.includedItems || [], excluded: theme.excludedItems || [], cities: theme.cities || [],
    cover: theme.coverKey ? { key: theme.coverKey, url: theme.coverImage } : null,
    gallery: (theme.galleryKeys || []).map((k, i) => ({ key: k, url: theme.gallery?.[i] })),
    video: theme.videoKey ? { key: theme.videoKey, url: theme.videoUrl } : null,
  };
}

export const EMPTY_PACKAGE = {
  title: '', description: '', categoryId: '', price: '', setupHours: '2', guestsMax: '50',
  included: [], excluded: [], cities: [],
  cover: null, gallery: [], video: null, // each { key, url }
};

/** yyyy-mm-dd in local time (what the calendar compares on). */
export function ymd(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** A month grid, Monday first: leading nulls, then each day. */
export function monthCells(month) {
  const lead = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
}
