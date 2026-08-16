/**
 * Development-only login helper.
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS
 * Visual QA in the web preview is unreliable for multi-field forms: the router
 * keeps a second copy of the previous screen mounted, so typed input can land
 * in one instance while the submit handler reads state from the other. The OTP
 * screen fails this way every time — the server rejects with OTP_INVALID even
 * though the visible field holds the correct code.
 *
 * This bypasses the FORM, not the AUTH. It performs the same two real API calls
 * the OTP screen makes (`/auth/otp/request` then `/auth/user/login`) and stores
 * the resulting real tokens through the normal `saveSession` path. There is no
 * fake session, no forged token, and no server change.
 *
 * The dev OTP comes back in the response body only because the server
 * deliberately returns it outside production (`auth.service` force-nulls it
 * when NODE_ENV=production), so this helper simply cannot work against a
 * production backend.
 *
 * SAFETY: the whole module is behind `__DEV__`, so `installDevLogin()` no-ops
 * and the global is never attached in a release build. Nothing imports it at
 * module scope except the root layout's dev-only branch.
 * ----------------------------------------------------------------------------
 */

import { API_BASE_URL } from '../config/env';
import { createLogger } from './logger';
import { saveSession } from '../services/api/tokenStorage';
import { store } from '../store';
import { setSession } from '../store/authSlice';

const log = createLogger('dev-login');

export interface DevLoginResult {
  ok: boolean;
  phone: string;
  name?: string;
  error?: string;
}

/**
 * Request an OTP and immediately exchange it for a session.
 * Returns the outcome rather than throwing, so it is easy to call from a
 * console during QA.
 */
export async function devLogin(
  phone = '9101010101',
  name = 'Dev Tester',
): Promise<DevLoginResult> {
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Client-Type': 'mobile' };

    const otpRes = await fetch(`${API_BASE_URL}/auth/otp/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, role: 'user' }),
    });
    const otpBody = await otpRes.json();

    // Present only outside production — see the header note.
    const otp: string | undefined = otpBody?.otp;
    if (!otp) {
      return {
        ok: false,
        phone,
        error:
          otpBody?.error ??
          'No dev OTP in the response — this only works against a non-production backend.',
      };
    }

    const loginRes = await fetch(`${API_BASE_URL}/auth/user/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, otp, name }),
    });
    const loginBody = await loginRes.json();

    if (!loginRes.ok || !loginBody?.accessToken) {
      return { ok: false, phone, error: loginBody?.error ?? `HTTP ${loginRes.status}` };
    }

    // Exactly what the real OTP screen does on success: persist, then put the
    // profile in Redux so the route guard sees an authenticated user.
    // Note for web QA: token storage is in-memory on web, so do NOT reload the
    // page after this — a reload discards the session and bounces to /login.
    await saveSession({
      accessToken: loginBody.accessToken,
      refreshToken: loginBody.refreshToken,
      role: 'user',
    });
    store.dispatch(setSession({ user: loginBody.user ?? null, role: 'user' }));

    log.info('dev session established');
    return { ok: true, phone, name: loginBody?.user?.name };
  } catch (err) {
    return { ok: false, phone, error: String((err as Error)?.message ?? err) };
  }
}

/**
 * Attach `devLogin` to the global scope in development builds only.
 * Call once from the root layout. No-ops entirely when `__DEV__` is false.
 */
export function installDevLogin(): void {
  if (!__DEV__) return;
  const scope = globalThis as unknown as { devLogin?: typeof devLogin };
  if (scope.devLogin) return;
  scope.devLogin = devLogin;
  log.debug('devLogin() available on the global scope (development only)');
}
