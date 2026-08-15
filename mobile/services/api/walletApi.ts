/** Wallet balance + transaction history. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { Wallet, WalletTransaction, PaginatedWalletTransactions, PaymentOrderResponse } from '../../types/api';

export const walletApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWallet: builder.query<Wallet, void>({
      query: () => ({ url: '/wallet' }),
      providesTags: ['Wallet'],
    }),
    walletTransactions: builder.query<WalletTransaction[], { page?: number; limit?: number } | void>({
      query: ({ page = 1, limit = 50 } = {}) => ({ url: '/wallet/transactions', params: { page, limit } }),
      transformResponse: (r: PaginatedWalletTransactions | WalletTransaction[]) =>
        Array.isArray(r) ? r : r.transactions ?? [],
      providesTags: ['Wallet'],
    }),
    walletTopup: builder.mutation<PaymentOrderResponse, { amountPaise: number; returnUrl?: string }>({
      query: (data) => ({ url: '/wallet/topup', method: 'POST', data }),
    }),
  }),
});

export const { useGetWalletQuery, useWalletTransactionsQuery, useWalletTopupMutation } = walletApi;
