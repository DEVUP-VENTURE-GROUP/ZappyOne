/**
 * Development-only OTP relay.
 * ----------------------------------------------------------------------------
 * The dev SMS provider isn't configured, so no code ever arrives on the phone.
 * The server already solves this: `POST /auth/otp/request` returns the code in
 * its `otp` field outside production, and `auth.service` force-nulls that field
 * when `NODE_ENV=production`. So this is purely a way to carry a value the API
 * ALREADY SENDS from the login screen to the OTP screen. No backend change, no
 * new endpoint, no bypass — the code still goes through the real login call
 * (`/auth/user/login` or `/auth/worker/login`) exactly as an SMS code would.
 *
 * ── WHY A MODULE VARIABLE AND NOT ROUTER PARAMS ────────────────────────────
 * The obvious route is `router.push({ params: { devOtp } })`, and it is wrong.
 * Expo Router params are serialised into the navigation state and, on web,
 * straight into the URL and browser history. That is persistence. A one-time
 * credential must not be written anywhere it can outlive the screen, so it
 * lives in a plain module-scoped variable: no AsyncStorage, no SecureStore, no
 * Redux, no file, no URL. It dies with the JS context.
 *
 * ── WHY EVERY FUNCTION RE-CHECKS `__DEV__` ─────────────────────────────────
 * Metro replaces `__DEV__` with a literal `false` in release builds, so each
 * guard collapses to a constant and the minifier drops the body. Guarding once
 * at the call site would be enough for behaviour; guarding here too means the
 * store cannot be written even by a future caller that forgets.
 * ----------------------------------------------------------------------------
 */

/**
 * What the OTP screen should show.
 *   off      production build, or no request has been made for this number
 *   missing  a request was made and the server returned no dev code — i.e. the
 *            SMS provider is genuinely configured, or this is a prod backend
 *   ready    the server sent a code and it can be filled in
 */
export type DevOtpState =
  | { kind: 'off' }
  | { kind: 'missing' }
  | { kind: 'ready'; code: string };

const OFF: DevOtpState = { kind: 'off' };

/** Transient, in-memory, single-entry. Never serialised. */
let stash: { phone: string; code: string | null } | null = null;

/**
 * Record what `POST /auth/otp/request` (or `/resend`) returned for this number.
 * Pass the response's `otp` straight through — `undefined` is meaningful and
 * becomes the "SMS provider not configured" state.
 */
export function stashDevOtp(phone: string, code: string | null | undefined): void {
  if (!__DEV__) return;
  stash = { phone, code: code ?? null };
}

/**
 * What to display for `phone`. Scoped by number so a stale code from a previous
 * attempt can never be offered against a different one.
 */
export function readDevOtp(phone: string): DevOtpState {
  if (!__DEV__) return OFF;
  if (!stash || stash.phone !== phone) return OFF;
  return stash.code ? { kind: 'ready', code: stash.code } : { kind: 'missing' };
}

/** Drop the code. Called once verification succeeds and on sign-out. */
export function clearDevOtp(): void {
  if (!__DEV__) return;
  stash = null;
}
