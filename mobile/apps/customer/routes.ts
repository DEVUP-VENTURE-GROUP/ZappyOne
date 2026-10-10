/**
 * Server deep link → this app's screen, for notification taps. The customer
 * app's screens use the website's own paths, so a link opens as is when the
 * screen exists here; any other link is ignored (lib/pushRouting has already
 * refused unsafe ones). Add a path when its screen is built.
 */
const BUILT = [/^\/$/, /^\/home$/, /^\/services$/, /^\/profile$/];

export function resolveRoute(deepLink: string): string | null {
  const path = deepLink.split('?')[0];
  if (path === '/home') return '/';
  return BUILT.some((re) => re.test(path)) ? path : null;
}
