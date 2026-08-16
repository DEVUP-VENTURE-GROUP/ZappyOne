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
  SavedAddressWire,
  StoredPaymentMethod,
  WorkerProfile,
} from '../../types/api';

interface WorkerLoginResponse {
  accessToken: string;
  refreshToken: string;
  worker: WorkerProfile;
}

interface MeEnvelope { user: UserProfile }
interface AddressesEnvelope { addresses: SavedAddressWire[] }

/**
 * Flattens the server's GeoJSON point onto the address.
 *
 * `GET /users/addresses` returns `location.coordinates` as [lng, lat] and no
 * flat fields; screens all want `lat`/`lng`. Doing this once at the boundary
 * means a saved address can be handed straight to the quote and order APIs.
 * Before this, `saved.lat` was `undefined` at runtime everywhere.
 */
function normalizeAddress(wire: SavedAddressWire): SavedAddress {
  const [lng, lat] = wire.location?.coordinates ?? [];
  return {
    _id: wire._id,
    label: wire.label,
    tag: wire.tag,
    address: wire.address,
    lat: typeof lat === 'number' ? lat : 0,
    lng: typeof lng === 'number' ? lng : 0,
    landmark: wire.landmark,
    flatNumber: wire.flatNumber,
    notes: wire.notes,
    isDefault: wire.isDefault,
  };
}
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
    loginWorker: builder.mutation<WorkerLoginResponse, { phone: string; otp: string; name?: string; skills?: string[]; deviceId?: string }>({
      query: (data) => ({ url: '/auth/worker/login', method: 'POST', data }),
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
      transformResponse: (r: AddressesEnvelope | SavedAddressWire[]) =>
        (Array.isArray(r) ? r : (r.addresses ?? []))
          // An entry with no coordinates can't be dispatched against, so it is
          // dropped rather than shown as a bookable option.
          .filter((a) => Array.isArray(a.location?.coordinates) && a.location.coordinates.length === 2)
          .map(normalizeAddress),
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
  useLoginWorkerMutation,
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
