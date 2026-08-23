/**
 * Order + booking endpoints (customer side).
 * ----------------------------------------------------------------------------
 * URLs and request shapes mirror the live web client (client/src/services/api.js)
 * and server/src/modules/order/order.routes.js — the same backend, no new routes.
 * Worker-side order actions (accept/arrive/complete) live in workerApi, not here.
 * ----------------------------------------------------------------------------
 */

import { apiSlice } from './apiSlice';
import type {
  Order,
  OrderStatusHistoryEntry,
  PaginatedOrders,
  CreateOrderRequest,
  QuoteRequest,
  CancelPreview,
  ServiceQuote,
  ChatMessage,
} from '../../types/api';

/**
 * `GET /orders/quote` returns the pricing snapshot under `quote`. The shape
 * varies by vertical — see `ServiceQuote` and `normalizeQuote`.
 */
interface QuoteEnvelope {
  quote: ServiceQuote;
}
interface OrderEnvelope { order: Order }
interface NearbyPro {
  workerId: string;
  name?: string;
  rating?: number;
  jobs?: number;
  etaMin?: number;
  distanceKm?: number;
}

export const ordersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ── Pre-checkout: price + supply ─────────────────────────────────────────
    getQuote: builder.query<QuoteEnvelope['quote'], QuoteRequest>({
      query: (params) => ({ url: '/orders/quote', params }),
      transformResponse: (r: QuoteEnvelope) => r.quote ?? (r as unknown as QuoteEnvelope['quote']),
    }),
    /**
     * Supply near a pickup point. NOT WIRED TO ANY SCREEN — see below.
     *
     * The parameter names were wrong: this sent `pickupLat`/`pickupLng`, but
     * `order.routes.js` validates `lat`/`lng` and rejected every call with
     * HTTP 400 `"lat" is required`. Nothing called the hook, so the failure
     * was never seen. Corrected here so the next caller inherits a working
     * endpoint rather than this trap.
     *
     * Still unwired deliberately: with dispatch paused in development it
     * returns `{ pros: [] }` for every coordinate, so any UI built on it
     * could not be verified against real data, and "0 pros nearby" is worse
     * than saying nothing.
     */
    getNearbyPros: builder.query<NearbyPro[], { service: string; lat: number; lng: number }>({
      query: (params) => ({ url: '/orders/nearby-pros', params }),
      transformResponse: (r: { pros?: NearbyPro[] } | NearbyPro[]) =>
        Array.isArray(r) ? r : r.pros ?? [],
    }),
    /**
     * Warm-dispatch readiness. Same wrong-parameter bug, same fix, also
     * unwired. Its real response is richer than the old type claimed —
     * `{ warm, instantAvailable, readyCount, nearbyCount, etaMinutes,
     * candidates }`, verified against the dev backend — so the type now
     * matches what the server actually sends instead of a `ready`/`etaMin`
     * shape that appears nowhere in the API.
     */
    getWarmDispatch: builder.query<
      {
        warm: boolean;
        instantAvailable: boolean;
        readyCount: number;
        nearbyCount: number;
        etaMinutes: number | null;
        candidates: unknown[];
      },
      { service: string; lat: number; lng: number }
    >({
      query: (params) => ({ url: '/orders/warm', params }),
    }),

    // ── Create + read ────────────────────────────────────────────────────────
    createOrder: builder.mutation<Order, CreateOrderRequest>({
      query: (data) => ({ url: '/orders', method: 'POST', data }),
      transformResponse: (r: OrderEnvelope) => r.order ?? (r as unknown as Order),
      invalidatesTags: ['Order'],
    }),
    getOrder: builder.query<Order, string>({
      query: (id) => ({ url: `/orders/${id}` }),
      transformResponse: (r: OrderEnvelope) => r.order ?? (r as unknown as Order),
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    getOrderTimeline: builder.query<OrderStatusHistoryEntry[], string>({
      query: (id) => ({ url: `/orders/${id}/timeline` }),
      transformResponse: (r: { timeline?: OrderStatusHistoryEntry[] } | OrderStatusHistoryEntry[]) =>
        Array.isArray(r) ? r : r.timeline ?? [],
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    listOrders: builder.query<PaginatedOrders, number | void>({
      query: (page = 1) => ({ url: `/orders/mine`, params: { page } }),
      providesTags: ['Order'],
    }),

    // ── Lifecycle actions (customer) ─────────────────────────────────────────
    getCancelPreview: builder.query<CancelPreview, string>({
      query: (id) => ({ url: `/orders/${id}/cancel-preview` }),
    }),
    cancelOrder: builder.mutation<Order, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/orders/${id}/cancel`, method: 'POST', data: { reason } }),
      invalidatesTags: (_r, _e, a) => ['Order', { type: 'Order', id: a.id }],
    }),
    rebookOrder: builder.mutation<Order, string>({
      query: (id) => ({ url: `/orders/${id}/rebook`, method: 'POST' }),
      transformResponse: (r: OrderEnvelope) => r.order ?? (r as unknown as Order),
      invalidatesTags: ['Order'],
    }),
    rateOrder: builder.mutation<Order, { id: string; rating: number; review?: string }>({
      query: ({ id, rating, review }) => ({ url: `/orders/${id}/rate`, method: 'POST', data: { rating, review } }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Order', id: a.id }],
    }),
    getOrderInvoiceUrl: builder.query<{ url?: string } | string, string>({
      query: (id) => ({ url: `/orders/${id}/invoice` }),
    }),

    // ── In-order chat ────────────────────────────────────────────────────────
    getChatMessages: builder.query<ChatMessage[], { orderId: string; limit?: number }>({
      query: ({ orderId, limit = 50 }) => ({ url: `/orders/${orderId}/chat`, params: { limit } }),
      transformResponse: (r: { messages?: ChatMessage[] } | ChatMessage[]) =>
        Array.isArray(r) ? r : r.messages ?? [],
      providesTags: (_r, _e, a) => [{ type: 'Chat', id: a.orderId }],
    }),
    sendChatMessage: builder.mutation<ChatMessage, { orderId: string; text?: string; cannedCode?: string }>({
      query: ({ orderId, text, cannedCode }) => ({
        url: `/orders/${orderId}/chat`,
        method: 'POST',
        data: { text, cannedCode },
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Chat', id: a.orderId }],
    }),
  }),
});

export const {
  useGetQuoteQuery,
  useLazyGetQuoteQuery,
  useGetNearbyProsQuery,
  useGetWarmDispatchQuery,
  useCreateOrderMutation,
  useGetOrderQuery,
  useGetOrderTimelineQuery,
  useListOrdersQuery,
  useGetCancelPreviewQuery,
  useLazyGetCancelPreviewQuery,
  useCancelOrderMutation,
  useRebookOrderMutation,
  useRateOrderMutation,
  useLazyGetOrderInvoiceUrlQuery,
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
} = ordersApi;
