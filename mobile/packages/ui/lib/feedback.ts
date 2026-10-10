/**
 * Small pieces every screen uses the same way: the touch ripple, and turning
 * a server error into the message to show.
 */

import { getApiErrorMessage } from '@zappy/core/api/apiSlice';

/** Android touch feedback for rows and cards (NativeWind ignores Pressable's style function). */
export const RIPPLE = { color: 'rgba(16,24,40,0.08)' };

/** What an RTK Query `unwrap()` throws for a server error. */
export interface ApiErr {
  status?: number | string;
  data?: { error?: string; message?: string; code?: string; kind?: string; passed?: boolean; score?: number; job?: { link?: string } };
  message?: string;
}

/**
 * What to tell the person when a call fails: the server's message when it is
 * theirs to act on (a 4xx), else the screen's own calm line. A fault on our
 * side is never shown as one (core getApiErrorMessage).
 */
export const errText = (e: unknown, fallback: string): string => getApiErrorMessage(e, fallback);
