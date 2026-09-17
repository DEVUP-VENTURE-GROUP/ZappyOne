/**
 * RTK Query base API.
 * ----------------------------------------------------------------------------
 * Uses the shared axios instance so every RTK Query call inherits the
 * `X-Client-Type: mobile` header, the auth header, and the automatic
 * refresh-and-retry interceptor. Do not swap this for `fetchBaseQuery` — that
 * would bypass the refresh logic entirely.
 * ----------------------------------------------------------------------------
 */

import { createApi } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import { AxiosError, type AxiosRequestConfig } from 'axios';
import { axiosClient } from './axiosClient';
import type { ApiError, ApiErrorBody } from '../../types/api';
import { toApiError, normalizeError } from './apiError';

export interface AxiosBaseQueryArgs {
  url: string;
  method?: AxiosRequestConfig['method'];
  data?: AxiosRequestConfig['data'];
  params?: AxiosRequestConfig['params'];
  headers?: AxiosRequestConfig['headers'];
}

const axiosBaseQuery =
  (): BaseQueryFn<AxiosBaseQueryArgs, unknown, ApiError> =>
  async ({ url, method = 'GET', data, params, headers }, api) => {
    try {
      // `api.signal` aborts when the last subscriber unsubscribes or the query
      // arg changes. Forwarding it is what actually cancels the HTTP request —
      // without it a search-as-you-type keeps every superseded request alive to
      // completion, and a screen that unmounts mid-flight still pays for its
      // responses. Axios has supported AbortSignal since 0.22.
      const result = await axiosClient({
        url,
        method,
        data,
        params,
        headers,
        signal: api.signal,
      });
      return { data: result.data };
    } catch (axiosError) {
      const err = axiosError as AxiosError<ApiErrorBody>;
      return { error: toApiError(err) };
    }
  };

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Order', 'Worker', 'User', 'Wallet', 'Catalog', 'Chat', 'Notification',
    'Rewards', 'Earnings', 'Kyc', 'SupportTicket', 'Dispute', 'Shop',
  ],
  endpoints: () => ({}),
});

/**
 * Narrow an RTK Query error to the server's structured error body so call sites
 * can switch on `code` (e.g. `NO_WORKERS_IN_AREA`) instead of matching strings.
 */
export function getApiErrorBody(error: unknown): ApiErrorBody | null {
  if (!error || typeof error !== 'object') return null;
  const data = (error as ApiError).data;
  if (data && typeof data === 'object') return data as ApiErrorBody;
  return null;
}

export function getApiErrorCode(error: unknown): string | undefined {
  return getApiErrorBody(error)?.code;
}

/**
 * A message that is always safe to render.
 *
 * Order: the server's own `error` string, then the classified fallback for the
 * failure kind, then the caller's fallback. It no longer returns a bare string
 * `data` — that path is how axios's "Network Error" and "timeout of 20000ms
 * exceeded" reached the UI as user-facing copy.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const body = getApiErrorBody(error);
  if (body?.error) return body.error;

  const normalized = (error as ApiError | undefined)?.normalized;
  if (normalized) {
    // A caller-supplied fallback is more specific than the generic
    // "something went wrong", so it wins for the unclassifiable case only.
    return normalized.kind === 'UNKNOWN_ERROR' ? fallback : normalized.message;
  }
  return fallback;
}

export { normalizeError, isCancelled } from './apiError';
export type { ApiErrorKind, NormalizedApiError } from './apiError';
