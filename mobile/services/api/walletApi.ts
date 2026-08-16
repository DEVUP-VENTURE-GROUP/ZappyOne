/** Wallet balance + transaction history. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { Wallet, WalletTransaction, PaginatedWalletTransactions, PaymentOrderResponse } from '../../types/api';

export const walletApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWallet: builder.query<Wallet, void>({
      query: () => ({ url: '/wallet' }),
      // The server wraps it: `{ wallet: { balancePaise, … } }`. Without this
      // every field read off the result was undefined and the balance never
      // rendered.
      transformResponse: (r: { wallet?: Wallet } | Wallet) =>
        (r as { wallet?: Wallet }).wallet ?? (r as Wallet),
      providesTags: ['Wallet'],
    }),
    walletTransactions: builder.query<WalletTransaction[], { page?: number; limit?: number } | void>({
      query: ({ page = 1, limit = 50 } = {}) => ({ url: '/wallet/transactions', params: { page, limit } }),
      // `items`, not `transactions` — see the type. This read the wrong key,
      // so the history list was always empty regardless of the account.
      transformResponse: (r: PaginatedWalletTransactions | WalletTransaction[]) =>
        Array.isArray(r) ? r : (r.items ?? []),
      providesTags: ['Wallet'],
    }),
    walletTopup: builder.mutation<PaymentOrderResponse, { amountPaise: number; returnUrl?: string }>({
      query: (data) => ({ url: '/wallet/topup', method: 'POST', data }),
    }),
  }),
});

export const { useGetWalletQuery, useWalletTransactionsQuery, useWalletTopupMutation } = walletApi;
