/** Rupees from paise, Indian grouping, no decimals: 125000 -> "₹1,250". */
export function rupees(paise) {
  return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;
}

/** "Sat, 14 Dec" */
export function shortDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "14 December 2026" */
export function longDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "5m ago", "3h ago", "2d ago" */
export function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** yyyy-mm-dd in local time (what the calendar compares on); shared with the app. */
export { ymd } from '@shared/events/partnerBookings';
