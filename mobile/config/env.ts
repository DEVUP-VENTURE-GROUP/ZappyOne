/**
 * Environment configuration (C8).
 * ----------------------------------------------------------------------------
 * Replaces the hardcoded `localhost:4000` base URL.
 *
 * Resolution order for the API origin:
 *   1. `EXPO_PUBLIC_API_URL` — set per environment via .env files or EAS build
 *      env vars. This is the only mechanism used for staging/production.
 *   2. The Expo dev-server host (development only). When you run `expo start`,
 *      Metro reports the LAN address the device already reached it on, so a
 *      PHYSICAL device works with no manual IP editing. This is what makes
 *      `10.0.2.2` (emulator-only) unnecessary.
 *   3. Platform localhost fallback — simulator/emulator on the same machine.
 *
 * Nothing secret lives here. Per SECURITY.md the app carries only public,
 * client-safe configuration; all gateway/JWT/DB secrets stay server-side.
 * ----------------------------------------------------------------------------
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AppEnvironment = 'development' | 'staging' | 'production';

/** Which environment this bundle represents. */
export const APP_ENV: AppEnvironment =
  (process.env.EXPO_PUBLIC_APP_ENV as AppEnvironment | undefined) ??
  (__DEV__ ? 'development' : 'production');

export const isProduction = APP_ENV === 'production';
export const isDevelopment = APP_ENV === 'development';

const DEFAULT_PORT = 4000;

/**
 * Pull the LAN host Metro is being served from, e.g. "192.168.1.7:8081".
 * Only meaningful while a dev server is attached.
 */
function devServerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older/dev-client shapes keep it under different keys; check them defensively
    // rather than assuming one manifest format.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    null;

  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  return host && host.length > 0 ? host : null;
}

/** Resolve the API origin (scheme + host + port), without a trailing slash. */
function resolveApiOrigin(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  if (isDevelopment) {
    const host = devServerHost();
    if (host) return `http://${host}:${DEFAULT_PORT}`;

    // No dev server host available — fall back to the loopback address that
    // works for the current platform's simulator/emulator.
    return Platform.OS === 'android'
      ? `http://10.0.2.2:${DEFAULT_PORT}`
      : `http://localhost:${DEFAULT_PORT}`;
  }

  // Staging/production MUST be configured explicitly. Failing loudly here is
  // far safer than silently shipping a build that points at localhost.
  throw new Error(
    `[env] EXPO_PUBLIC_API_URL is required for the "${APP_ENV}" environment but was not set.`,
  );
}

/** Origin only — e.g. "https://api.zappyone.com". Socket.io connects here. */
export const API_ORIGIN = resolveApiOrigin();

/** REST base — e.g. "https://api.zappyone.com/api". Axios uses this. */
export const API_BASE_URL = `${API_ORIGIN}/api`;

/** Socket.io endpoint. The server mounts it at the origin root. */
export const SOCKET_URL = API_ORIGIN;

/**
 * Request timeout in ms. Mobile networks are slower and less reliable than the
 * web client's, so this is deliberately more generous than a browser default.
 */
export const REQUEST_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? 20000);

export const env = {
  APP_ENV,
  isProduction,
  isDevelopment,
  API_ORIGIN,
  API_BASE_URL,
  SOCKET_URL,
  REQUEST_TIMEOUT_MS,
} as const;
