/**
 * Worker-side endpoints. URLs and shapes mirror client/src/services/api.js
 * and server/src/modules/worker/*.routes.js — the same backend.
 */

import { apiSlice } from './apiSlice';
import type {
  WorkerProfile, WorkerEarnings, WorkerKyc, SubmitKycRequest, Order, PaginatedOrders,
} from '../../types/api';

interface WorkerEnvelope { worker: WorkerProfile }
interface KycEnvelope { kyc: WorkerKyc }
interface OrderEnvelope { order: Order }

export const workerApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ── Profile ───────────────────────────────────────────────────────────────
    getWorkerMe: builder.query<WorkerProfile, void>({
      query: () => ({ url: '/workers/me' }),
      transformResponse: (r: WorkerEnvelope) => r.worker,
      providesTags: ['Worker'],
    }),
    updateWorkerProfile: builder.mutation<WorkerProfile, Partial<Pick<WorkerProfile, 'name' | 'email' | 'avatarUrl' | 'skills'>>>({
      query: (data) => ({ url: '/workers/profile', method: 'PATCH', data }),
      transformResponse: (r: WorkerEnvelope) => r.worker,
      invalidatesTags: ['Worker'],
    }),

    // ── Online / offline ─────────────────────────────────────────────────────
    goOnline: builder.mutation<WorkerProfile, { lat: number; lng: number }>({
      query: (data) => ({ url: '/workers/online', method: 'POST', data }),
      transformResponse: (r: WorkerEnvelope) => r.worker,
      invalidatesTags: ['Worker'],
    }),
    goOffline: builder.mutation<WorkerProfile, void>({
      query: () => ({ url: '/workers/offline', method: 'POST' }),
      transformResponse: (r: WorkerEnvelope) => r.worker,
      invalidatesTags: ['Worker'],
    }),
    /** Best-effort HTTP location ping — the socket 'worker:location' emit is the primary path; this is the fallback the web also uses. */
    updateWorkerLocation: builder.mutation<{ ok: boolean }, { lat: number; lng: number; orderId?: string }>({
      query: (data) => ({ url: '/workers/location', method: 'POST', data }),
    }),

    // ── Earnings ─────────────────────────────────────────────────────────────
    getEarnings: builder.query<WorkerEarnings, 'today' | 'week' | 'month' | void>({
      query: (range = 'today') => ({ url: '/workers/earnings', params: { range } }),
      providesTags: ['Earnings'],
    }),

    // ── Job lifecycle ────────────────────────────────────────────────────────
    workerAccept: builder.mutation<Order, string>({
      query: (id) => ({ url: `/orders/${id}/accept`, method: 'POST' }),
      transformResponse: (r: OrderEnvelope) => r.order ?? (r as unknown as Order),
      invalidatesTags: (_r, _e, id) => ['Order', { type: 'Order', id }],
    }),
    workerReject: builder.mutation<void, string>({
      query: (id) => ({ url: `/orders/${id}/reject`, method: 'POST' }),
    }),
    workerStartTrip: builder.mutation<Order, { id: string; lat?: number; lng?: number }>({
      query: ({ id, lat, lng }) => ({
        url: `/orders/${id}/start-trip`,
        method: 'POST',
        data: lat != null && lng != null ? { lat, lng } : {},
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Order', id: a.id }],
    }),
    workerArrive: builder.mutation<Order, { id: string; lat?: number; lng?: number }>({
      query: ({ id, lat, lng }) => ({
        url: `/orders/${id}/arrived`,
        method: 'POST',
        data: lat != null && lng != null ? { lat, lng } : undefined,
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Order', id: a.id }],
    }),
    workerStartService: builder.mutation<Order, { id: string; otp: string }>({
      query: ({ id, otp }) => ({ url: `/orders/${id}/start-service`, method: 'POST', data: { otp } }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Order', id: a.id }],
    }),
    workerComplete: builder.mutation<Order, { id: string; completionPhotos?: string[] }>({
      query: ({ id, completionPhotos = [] }) => ({
        url: `/orders/${id}/complete`,
        method: 'POST',
        data: { completionPhotos },
      }),
      invalidatesTags: (_r, _e, a) => ['Order', 'Earnings', { type: 'Order', id: a.id }],
    }),
    getWorkerOrders: builder.query<PaginatedOrders, number | void>({
      query: (page = 1) => ({ url: '/workers/orders', params: { page } }),
      providesTags: ['Order'],
    }),
    getWorkerCancelPreview: builder.query<{ penaltyPaise?: number; message?: string }, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/orders/${id}/worker-cancel-preview`, params: reason ? { reason } : undefined }),
    }),
    workerCancel: builder.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/orders/${id}/worker-cancel`, method: 'POST', data: { reason } }),
      invalidatesTags: (_r, _e, a) => ['Order', 'Worker', { type: 'Order', id: a.id }],
    }),

    // ── KYC ───────────────────────────────────────────────────────────────────
    getKycStatus: builder.query<WorkerKyc, void>({
      query: () => ({ url: '/workers/kyc/status' }),
      transformResponse: (r: KycEnvelope) => r.kyc,
      providesTags: ['Kyc'],
    }),
    submitKyc: builder.mutation<void, SubmitKycRequest>({
      query: (data) => ({ url: '/workers/kyc/submit', method: 'POST', data }),
      invalidatesTags: ['Kyc', 'Worker'],
    }),
    requestKycDocumentChange: builder.mutation<void, { message: string }>({
      query: (data) => ({ url: '/workers/kyc/request-change', method: 'POST', data }),
      invalidatesTags: ['Kyc'],
    }),

    // ── Device push token ────────────────────────────────────────────────────
    registerWorkerDeviceToken: builder.mutation<void, { token: string; platform: 'ios' | 'android' }>({
      query: (data) => ({ url: '/workers/device-token', method: 'POST', data }),
    }),
  }),
});

export const {
  useGetWorkerMeQuery,
  useUpdateWorkerProfileMutation,
  useGoOnlineMutation,
  useGoOfflineMutation,
  useUpdateWorkerLocationMutation,
  useGetEarningsQuery,
  useWorkerAcceptMutation,
  useWorkerRejectMutation,
  useWorkerStartTripMutation,
  useWorkerArriveMutation,
  useWorkerStartServiceMutation,
  useWorkerCompleteMutation,
  useGetWorkerOrdersQuery,
  useLazyGetWorkerCancelPreviewQuery,
  useWorkerCancelMutation,
  useGetKycStatusQuery,
  useSubmitKycMutation,
  useRequestKycDocumentChangeMutation,
  useRegisterWorkerDeviceTokenMutation,
} = workerApi;
