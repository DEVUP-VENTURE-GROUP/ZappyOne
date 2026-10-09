/**
 * Push device registration for provider accounts (workers, shop technicians).
 * Customers register through authApi's `registerDeviceToken` (/users/device-token).
 */
import { apiSlice } from './apiSlice';

export const devicesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    registerWorkerDeviceToken: builder.mutation<void, { token: string; platform: 'ios' | 'android' }>({
      query: (data) => ({ url: '/workers/device-token', method: 'POST', data }),
    }),
  }),
});

export const { useRegisterWorkerDeviceTokenMutation } = devicesApi;
