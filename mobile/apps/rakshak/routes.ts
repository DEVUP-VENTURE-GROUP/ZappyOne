/**
 * Server deep link → this app's screen, for notification taps. Rakshak's
 * screens use the website's own paths (/worker…, /provider…), so a link opens
 * as is; old paths are mapped the way the website redirects them.
 */
import { providerPath } from '@zappy/ui/worker/paths';

export function resolveRoute(deepLink: string): string | null {
  const path = providerPath(deepLink);
  return /^\/(worker|provider)(\/|$)/.test(path) ? path : null;
}
