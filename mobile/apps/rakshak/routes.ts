/**
 * Server deep link → this app's screen, for notification taps. Only paths
 * listed here open anything; every other link is ignored (lib/pushRouting
 * has already refused unsafe ones). Add a line when a screen is built.
 */
export function resolveRoute(deepLink: string): string | null {
  const path = deepLink.split('?')[0];
  if (path === '/' || path === '/home') return '/(main)';
  if (path === '/account' || path === '/profile') return '/(main)/account';
  return null;
}
