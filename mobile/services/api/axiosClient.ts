/**
 * Axios client with automatic access-token refresh.
 * ----------------------------------------------------------------------------
 * The refresh mutex + queue-drain design here was already correct and is
 * PRESERVED. What changed in Phase 4:
 *   - base URL now comes from `config/env` instead of a hardcoded localhost (C8)
 *   - token reads/writes go through `tokenStorage` so the socket sees rotations (S1)
 *   - console noise replaced with the scoped logger (S3)
 *   - a failed refresh now announces `session_end` instead of dying silently
 *
 * Server contract (server/src/modules/auth/auth.controller.js):
 *   - `X-Client-Type: mobile` makes the server return `refreshToken` in the JSON
 *     body. Native apps cannot use the httpOnly cookie the web client relies on.
 *   - `/auth/refresh` ROTATES the refresh token. The new one must be persisted;
 *     replaying an old generation triggers reuse detection and revokes the
 *     entire token family (ENTERPRISE-ADDITIONS.md §1).
 * ----------------------------------------------------------------------------
 */

import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config/env';
import { createLogger } from '../../lib/logger';
import { emitSessionEnd } from '../../lib/sessionBus';
import type { RefreshResponse } from '../../types/api';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveRotatedTokens,
} from './tokenStorage';

const log = createLogger('api');

/** Re-exported for callers that need the origin (kept for compatibility). */
export const BASE_URL = API_BASE_URL;

export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    // Tells the backend to return the refresh token in the JSON body
    // (mobile can't use the httpOnly refresh cookie the web relies on).
    'X-Client-Type': 'mobile',
  },
});

/** Requests that failed with 401 while a refresh was already in flight. */
interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

function processQueue(error: unknown, token: string | null) {
  for (const pending of failedQueue) {
    if (token) pending.resolve(token);
    else pending.reject(error);
  }
  failedQueue = [];
}

/** Axios strips unknown fields from its config type; track our retry flag. */
type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

axiosClient.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    // Only a 401 on a request we haven't already retried is refreshable.
    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Never try to refresh a failed refresh — that recurses forever.
    if (originalRequest.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    // A refresh is already running: park this request until it resolves.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return axiosClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        // Nothing to refresh with — the session is over.
        processQueue(error, null);
        await clearSession();
        emitSessionEnd('refresh_failed');
        return Promise.reject(error);
      }

      // Bare axios, not axiosClient — this must bypass the interceptor stack.
      const { data } = await axios.post<RefreshResponse>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        {
          headers: { 'X-Client-Type': 'mobile', 'Content-Type': 'application/json' },
          timeout: REQUEST_TIMEOUT_MS,
        },
      );

      // Persist the ROTATED pair. This also notifies the socket client (S1).
      await saveRotatedTokens(data.accessToken, data.refreshToken);
      log.debug('access token refreshed');

      axiosClient.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

      processQueue(null, data.accessToken);
      return await axiosClient(originalRequest);
    } catch (refreshError) {
      // Refresh genuinely failed: expired, revoked, or reuse detected. The
      // server has already invalidated the family — drop everything locally.
      log.warn('token refresh failed — ending session');
      processQueue(refreshError, null);
      await clearSession();
      emitSessionEnd('refresh_failed');
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

/**
 * Refresh the access token on demand, outside the 401 path.
 * The socket client calls this before reconnecting so it never retries with a
 * token the server will reject (S1).
 *
 * Returns the new access token, or null when the session cannot be recovered.
 */
export async function refreshAccessToken(): Promise<string | null> {
  // Piggyback on an in-flight refresh rather than starting a competing one —
  // two concurrent refreshes would trip the server's reuse detection.
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    }).catch(() => null);
  }

  isRefreshing = true;
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const { data } = await axios.post<RefreshResponse>(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      {
        headers: { 'X-Client-Type': 'mobile', 'Content-Type': 'application/json' },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    await saveRotatedTokens(data.accessToken, data.refreshToken);
    processQueue(null, data.accessToken);
    return data.accessToken;
  } catch (err) {
    log.warn('on-demand token refresh failed');
    processQueue(err, null);
    await clearSession();
    emitSessionEnd('refresh_failed');
    return null;
  } finally {
    isRefreshing = false;
  }
}

export type { AxiosRequestConfig };
