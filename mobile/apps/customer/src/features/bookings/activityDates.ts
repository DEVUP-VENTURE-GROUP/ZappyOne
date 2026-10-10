/** Times and day headers for the Activity list (the website's fmtTime and dateBucket). */
type T = (key: string, fallback?: string) => string;

export const fmtTime = (d: string) => new Date(d).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

/** "Today", "Yesterday", a weekday this week, "14 Jul", or "14 Jul 2025". */
export function dateBucket(d: string, t: T, lang = 'en') {
  const date = new Date(d);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  const loc = `${lang}-IN`;
  if (diffDays === 0) return t('date.today', 'Today');
  if (diffDays === 1) return t('date.yesterday', 'Yesterday');
  if (diffDays < 7) return date.toLocaleString(loc, { weekday: 'long' });
  return date.toLocaleString(loc, date.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
