/**
 * Auth + user-profile endpoints.
 * URLs mirror client/src/services/api.js — same backend contract.
 */

import { apiSlice } from './apiSlice';
import type {
  UserProfile,
  OtpRequestResponse,
  UserLoginResponse,
  SavedAddress,
  StoredPaymentMethod,
} from '../../types/api';

interface MeEnvelope { user: UserProfile }
interface AddressesEnvelope { addresses: SavedAddress[] }
interface PaymentMethodsEnvelope { methods: StoredPaymentMethod[] }

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ── OTP + login ───────────────────────────────────────────────────────────
    requestOtp: builder.mutation<OtpRequestResponse, { phone: string; role?: 'user' | 'worker' | 'event_partner' }>({
      query: (data) => ({ url: '/auth/otp/request', method: 'POST', data }),
    }),
    resendOtp: builder.mutation<OtpRequestResponse, { phone: string }>({
      query: (data) => ({ url: '/auth/otp/resend', method: 'POST', data }),
    }),
    loginUser: builder.mutation<UserLoginResponse, { phone: string; otp: string; name?: string }>({
      query: (data) => ({ url: '/auth/user/login', method: 'POST', data }),
    }),
    logout: builder.mutation<void, { refreshToken: string }>({
      query: (data) => ({ url: '/auth/logout', method: 'POST', data }),
    }),
    revokeAllSessions: builder.mutation<void, void>({
      query: () => ({ url: '/auth/revoke-all', method: 'POST' }),
    }),

    // ── Profile ───────────────────────────────────────────────────────────────
    getMe: builder.query<UserProfile, void>({
      query: () => ({ url: '/users/me' }),
      transformResponse: (r: MeEnvelope) => r.user ?? (r as unknown as UserProfile),
      providesTags: ['User'],
    }),
    updateMe: builder.mutation<UserProfile, Partial<Pick<UserProfile, 'name' | 'email' | 'avatarUrl'>>>({
      query: (data) => ({ url: '/users/me', method: 'PATCH', data }),
      transformResponse: (r: MeEnvelope) => r.user ?? (r as unknown as UserProfile),
      invalidatesTags: ['User'],
    }),

    // ── Saved addresses ───────────────────────────────────────────────────────
    getAddresses: builder.query<SavedAddress[], void>({
      query: () => ({ url: '/users/addresses' }),
      transformResponse: (r: AddressesEnvelope | SavedAddress[]) => (Array.isArray(r) ? r : r.addresses ?? []),
      providesTags: ['User'],
    }),
    addAddress: builder.mutation<SavedAddress, Omit<SavedAddress, '_id'>>({
      query: (data) => ({ url: '/users/addresses', method: 'POST', data }),
      invalidatesTags: ['User'],
    }),
    editAddress: builder.mutation<SavedAddress, { addrId: string } & Partial<SavedAddress>>({
      query: ({ addrId, ...data }) => ({ url: `/users/addresses/${addrId}`, method: 'PATCH', data }),
      invalidatesTags: ['User'],
    }),
    deleteAddress: builder.mutation<void, string>({
      query: (addrId) => ({ url: `/users/addresses/${addrId}`, method: 'DELETE' }),
      invalidatesTags: ['User'],
    }),
    setDefaultAddress: builder.mutation<void, string>({
      query: (addrId) => ({ url: `/users/addresses/${addrId}/default`, method: 'PATCH' }),
      invalidatesTags: ['User'],
    }),

    // ── Saved payment methods (tokens only, never raw card data) ─────────────
    getPaymentMethods: builder.query<StoredPaymentMethod[], void>({
      query: () => ({ url: '/users/payment-methods' }),
      transformResponse: (r: PaymentMethodsEnvelope | StoredPaymentMethod[]) =>
        Array.isArray(r) ? r : r.methods ?? [],
      providesTags: ['User'],
    }),
    deletePaymentMethod: builder.mutation<void, string>({
      query: (methodId) => ({ url: `/users/payment-methods/${methodId}`, method: 'DELETE' }),
      invalidatesTags: ['User'],
    }),
    setDefaultPaymentMethod: builder.mutation<void, string>({
      query: (methodId) => ({ url: `/users/payment-methods/${methodId}/default`, method: 'PATCH' }),
      invalidatesTags: ['User'],
    }),

    // ── Device push token (FCM) ───────────────────────────────────────────────
    registerDeviceToken: builder.mutation<void, { token: string; platform: 'ios' | 'android' }>({
      query: (data) => ({ url: '/users/device-token', method: 'POST', data }),
    }),

    // ── Recent location (speeds up next booking's default pin) ───────────────
    saveRecentLocation: builder.mutation<void, { lat: number; lng: number; address: string }>({
      query: (data) => ({ url: '/users/recent-location', method: 'POST', data }),
    }),
  }),
});

export const {
  useRequestOtpMutation,
  useResendOtpMutation,
  useLoginUserMutation,
  useLogoutMutation,
  useRevokeAllSessionsMutation,
  useGetMeQuery,
  useUpdateMeMutation,
  useGetAddressesQuery,
  useAddAddressMutation,
  useEditAddressMutation,
  useDeleteAddressMutation,
  useSetDefaultAddressMutation,
  useGetPaymentMethodsQuery,
  useDeletePaymentMethodMutation,
  useSetDefaultPaymentMethodMutation,
  useRegisterDeviceTokenMutation,
  useSaveRecentLocationMutation,
} = authApi;
