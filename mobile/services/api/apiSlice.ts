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

export interface AxiosBaseQueryArgs {
  url: string;
  method?: AxiosRequestConfig['method'];
  data?: AxiosRequestConfig['data'];
  params?: AxiosRequestConfig['params'];
  headers?: AxiosRequestConfig['headers'];
}

const axiosBaseQuery =
  (): BaseQueryFn<AxiosBaseQueryArgs, unknown, ApiError> =>
  async ({ url, method = 'GET', data, params, headers }) => {
    try {
      const result = await axiosClient({ url, method, data, params, headers });
      return { data: result.data };
    } catch (axiosError) {
      const err = axiosError as AxiosError<ApiErrorBody>;
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data ?? err.message,
        },
      };
    }
  };

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Order', 'Worker', 'User', 'Wallet', 'Catalog', 'Chat', 'Notification', 'Rewards', 'Earnings', 'Kyc'],
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

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const body = getApiErrorBody(error);
  if (body?.error) return body.error;
  const data = (error as ApiError | undefined)?.data;
  if (typeof data === 'string') return data;
  return fallback;
}
