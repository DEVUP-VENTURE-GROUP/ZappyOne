/**
 * Server deep link → this app's screen, for notification taps. The customer
 * app's screens use the website's own paths, so a link opens as is when the
 * screen exists here; any other link is ignored (lib/pushRouting has already
 * refused unsafe ones). Add a path when its screen is built.
 */
const BUILT = [
  /^\/$/, /^\/home$/, /^\/services$/, /^\/profile$/, /^\/orders$/, /^\/track$/,
  /^\/notifications$/, /^\/notification-prefs$/, /^\/account-security$/, /^\/faq$/, /^\/policy\/[\w-]+$/,
  /^\/support$/, /^\/support\/tickets\/[\w-]+$/, /^\/disputes(\/[\w-]+)?$/,
  /^\/wallet$/, /^\/spending$/, /^\/promos$/, /^\/rewards$/, /^\/referral$/,
  /^\/repair(\/(laptop|two-wheeler|four-wheeler|water-tank-care))?$/,
  /^\/repair\/price-requests\/[\w-]+$/, /^\/repair\/bookings\/[\w-]+$/, /^\/repair\/category\/[\w-]+\/[\w-]+$/,
];

export function resolveRoute(deepLink: string): string | null {
  const path = deepLink.split('?')[0];
  if (path === '/home') return '/';
  return BUILT.some((re) => re.test(path)) ? path : null;
}
