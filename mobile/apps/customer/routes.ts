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
  /^\/pet$/, /^\/pet\/my-pets(\/[\w-]+)?$/, /^\/pet\/book\/[\w-]+$/, /^\/pet\/bookings\/[\w-]+$/, /^\/pet\/recurring$/,
  /^\/helping(\/(shopping|returns))?$/, /^\/helping\/tasks\/[\w-]+$/,
  /^\/my-assets$/, /^\/nearby-shops$/, /^\/shops\/[\w-]+$/,
  /^\/repair(\/(laptop|two-wheeler|four-wheeler|water-tank-care))?$/,
  /^\/repair\/price-requests\/[\w-]+$/, /^\/repair\/bookings\/[\w-]+$/, /^\/repair\/category\/[\w-]+\/[\w-]+$/,
];

/**
 * What a signed-out guest may browse (the website's public pages): home, the
 * catalogue, help and policies, and the map picker home uses. Booking, bookings
 * and the account ask for sign-in first.
 */
const PUBLIC = [/^\/$/, /^\/home$/, /^\/services$/, /^\/faq$/, /^\/policy\/[\w-]+$/, /^\/location\/picker$/];
export const isPublic = (path: string) => PUBLIC.some((re) => re.test(path.split('?')[0]));

/** Whether this app has a screen for `path`: entries to screens not built yet are hidden, not dead ends. */
export const isBuilt = (path: string) => BUILT.some((re) => re.test(path.split('?')[0]));

export function resolveRoute(deepLink: string): string | null {
  const path = deepLink.split('?')[0];
  if (path === '/home') return '/';
  return BUILT.some((re) => re.test(path)) ? path : null;
}
