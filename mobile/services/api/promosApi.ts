/** Promo code validation at checkout. URL mirrors client/src/services/api.js. */

import { apiSlice } from './apiSlice';

export interface PromoValidationResult {
  valid: boolean;
  discountPaise?: number;
  message?: string;
  code?: string;
}

export const promosApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    validatePromo: builder.mutation<
      PromoValidationResult,
      { code: string; service?: string; totalPaise?: number }
    >({
      query: (data) => ({ url: '/promos/validate', method: 'POST', data }),
    }),
  }),
});

export const { useValidatePromoMutation } = promosApi;
