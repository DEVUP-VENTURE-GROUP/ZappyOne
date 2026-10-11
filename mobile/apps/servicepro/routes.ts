/**
 * Server deep link → this app's screen, for notification taps. ServicePro's
 * screens use the website's own paths (/shop…, /worker…, /provider…, and the
 * events website's /partner…), so a
 * link opens as is; old paths are mapped the way the website redirects them.
 */
import { providerPath } from '@zappy/ui/provider/paths';

export function resolveRoute(deepLink: string): string | null {
  const path = providerPath(deepLink);
  return /^\/(shop|worker|provider|partner)(\/|$)/.test(path) ? path : null;
}
