/**
 * Server deep link → this app's screen, for notification taps. Rakshak's
 * screens use the website's own paths (/worker…, /provider…), so a link opens
 * as is; old paths are mapped the way the website redirects them.
 */
import { providerPath } from '@zappy/ui/provider/paths';

export function resolveRoute(deepLink: string): string | null {
  const path = providerPath(deepLink);
  return /^\/(worker|provider)(\/|$)/.test(path) ? path : null;
}

/** What a signed-out visitor may open: the legal pages linked from sign-in. */
export const isPublic = (path: string) => /^\/policy\/[\w-]+$/.test(path.split('?')[0]);
