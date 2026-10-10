/**
 * Small pieces every screen uses the same way: the touch ripple, and turning
 * a server error into the message to show.
 */

/** Android touch feedback for rows and cards (NativeWind ignores Pressable's style function). */
export const RIPPLE = { color: 'rgba(16,24,40,0.08)' };

/** What an RTK Query `unwrap()` throws for a server error. */
export interface ApiErr {
  status?: number | string;
  data?: { error?: string; message?: string; code?: string; kind?: string; passed?: boolean; score?: number; job?: { link?: string } };
  message?: string;
}

/** The server's own message when it sent one, else the screen's fallback. */
export const errText = (e: unknown, fallback: string): string => (e as ApiErr)?.data?.error || fallback;
