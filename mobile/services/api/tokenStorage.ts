/**
 * Secure token storage.
 * ----------------------------------------------------------------------------
 * Single owner of the credential keys. Previously each caller reached into
 * SecureStore with its own string literal, which is how the socket ended up
 * holding a stale access token after a refresh (S1).
 *
 * Per SECURITY.md: refresh tokens NEVER touch AsyncStorage, Redux persistence,
 * or a plain file. expo-secure-store maps to the iOS Keychain and Android
 * EncryptedSharedPreferences.
 * ----------------------------------------------------------------------------
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createLogger } from '../../lib/logger';
import type { Role } from '../../types/api';

const log = createLogger('tokens');

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const ROLE_KEY = 'role';

/**
 * `expo-secure-store` has NO web implementation — every call throws
 * `getValueWithKeyAsync is not a function`. Web is not a shipping target
 * (Android + iOS are), but `expo start --web` is a useful preview surface, so
 * it degrades to an in-memory store rather than spraying errors.
 *
 * It is deliberately NOT backed by localStorage. SECURITY.md forbids putting
 * refresh tokens in localStorage, and the web client's own posture is
 * "access token in memory, refresh token in an httpOnly cookie". An in-memory
 * store matches that: it works for the life of the tab and is gone on reload,
 * which is the correct trade for a preview surface.
 */
const isWeb = Platform.OS === 'web';
const memoryStore = new Map<string, string>();

if (isWeb) {
  log.warn(
    'secure storage is unavailable on web — using an in-memory store. ' +
      'Sessions will not survive a page reload. Android/iOS use the Keychain / EncryptedSharedPreferences.',
  );
}

async function readItem(key: string): Promise<string | null> {
  if (isWeb) return memoryStore.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function writeItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  role: Role;
}

/**
 * Listeners fired whenever the access token changes (login, refresh, logout).
 * The socket client subscribes so it can reconnect with a fresh token instead
 * of retrying forever against an expired one.
 */
type TokenListener = (accessToken: string | null) => void;
const listeners = new Set<TokenListener>();

export function onAccessTokenChange(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(accessToken: string | null) {
  for (const listener of listeners) {
    try {
      listener(accessToken);
    } catch (err) {
      log.warn('token listener threw', err);
    }
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await readItem(ACCESS_TOKEN_KEY);
  } catch (err) {
    log.error('failed to read access token', err);
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await readItem(REFRESH_TOKEN_KEY);
  } catch (err) {
    log.error('failed to read refresh token', err);
    return null;
  }
}

export async function getRole(): Promise<Role | null> {
  try {
    const value = await readItem(ROLE_KEY);
    return value === 'user' || value === 'worker' || value === 'admin' ? value : null;
  } catch (err) {
    log.error('failed to read role', err);
    return null;
  }
}

/** Read the whole session in one pass — used by the splash gate on cold start. */
export async function getSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, role] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getRole(),
  ]);
  if (!accessToken || !refreshToken || !role) return null;
  return { accessToken, refreshToken, role };
}

/** Persist a full session after login. */
export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    writeItem(ACCESS_TOKEN_KEY, session.accessToken),
    writeItem(REFRESH_TOKEN_KEY, session.refreshToken),
    writeItem(ROLE_KEY, session.role),
  ]);
  notify(session.accessToken);
}

/**
 * Persist a rotated token pair after `POST /auth/refresh`. The server rotates
 * the refresh token on every use and revokes the whole family if an old
 * generation is replayed, so the new one MUST be written.
 */
export async function saveRotatedTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await Promise.all([
    writeItem(ACCESS_TOKEN_KEY, accessToken),
    writeItem(REFRESH_TOKEN_KEY, refreshToken),
  ]);
  notify(accessToken);
}

/** Wipe every credential. Safe to call repeatedly. */
export async function clearSession(): Promise<void> {
  await Promise.all([
    deleteItem(ACCESS_TOKEN_KEY).catch(() => {}),
    deleteItem(REFRESH_TOKEN_KEY).catch(() => {}),
    deleteItem(ROLE_KEY).catch(() => {}),
  ]);
  notify(null);
}
