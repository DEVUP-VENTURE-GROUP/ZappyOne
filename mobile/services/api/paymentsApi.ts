/**
 * Cashfree payment orders — unified create-order for subscription /
 * wallet_topup / order_payment, plus verification after the SDK checkout.
 * URLs + shapes mirror server/src/modules/payment/payment.routes.js exactly.
 * The server is Cashfree — react-native-razorpay does NOT match this backend
 * and must not be used for the order-payment flow.
 */

import { apiSlice } from './apiSlice';
import type {
  CreatePaymentOrderRequest,
  VerifyPaymentRequest,
  PaymentOrderResponse,
} from '../../types/api';

export const paymentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createPaymentOrder: builder.mutation<PaymentOrderResponse, CreatePaymentOrderRequest>({
      query: (data) => ({ url: '/payments/create-order', method: 'POST', data }),
    }),
    verifyPayment: builder.mutation<{ ok: boolean; status?: string }, VerifyPaymentRequest>({
      query: (data) => ({ url: '/payments/verify', method: 'POST', data }),
      invalidatesTags: ['Order', 'Wallet', 'User'],
    }),
  }),
});

export const { useCreatePaymentOrderMutation, useVerifyPaymentMutation } = paymentsApi;
