/**
 * Disputes.
 * ----------------------------------------------------------------------------
 * `server/src/modules/dispute/dispute.routes.js`, mounted at `/api/disputes`.
 * Four of its six routes are customer-reachable; the other two live on the
 * admin sub-router and are deliberately absent here:
 *
 *   POST /disputes              open       (201, { dispute })   ← customer
 *   GET  /disputes/mine         list mine  (200, { disputes })  ← customer
 *   GET  /disputes/:id          one        (200, { dispute })   ← customer
 *   POST /disputes/:id/messages reply      (200, { dispute })   ← customer
 *   GET  /admin/disputes        list all                        ← ADMIN ONLY
 *   POST /admin/disputes/:id/resolve                            ← ADMIN ONLY
 *
 * Resolving a dispute — issuing the refund, penalising the worker — is an
 * admin capability and has no mobile surface by design.
 *
 * ── WHAT THE SERVER REFUSES ────────────────────────────────────────────────
 * `dispute.service.open()` enforces rules the UI cannot see, so the screens
 * surface the server's own message rather than guessing:
 *   NOT_PARTY               you are not on this order              403
 *   BAD_ORDER_STATUS        only completed / cancelled / failed    409
 *   DISPUTE_WINDOW_EXPIRED  more than 7 days since completion      409
 *   DISPUTE_ALREADY_OPEN    one open dispute per order per raiser  409
 *   DISPUTE_RATE_LIMIT      max 3 disputes per rolling 30 days     429
 * ----------------------------------------------------------------------------
 */

import { apiSlice } from './apiSlice';
import type { Dispute, OpenDisputeRequest } from '../../types/api';

interface DisputeEnvelope {
  dispute: Dispute;
}
interface DisputesEnvelope {
  disputes: Dispute[];
}

export const disputesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listMyDisputes: builder.query<Dispute[], void>({
      query: () => ({ url: '/disputes/mine' }),
      transformResponse: (r: DisputesEnvelope | Dispute[]) =>
        Array.isArray(r) ? r : (r.disputes ?? []),
      providesTags: (result) => [
        { type: 'Dispute' as const, id: 'LIST' },
        ...(result ?? []).map((d) => ({ type: 'Dispute' as const, id: d._id })),
      ],
    }),

    getDispute: builder.query<Dispute, string>({
      query: (id) => ({ url: `/disputes/${id}` }),
      transformResponse: (r: DisputeEnvelope | Dispute) =>
        'dispute' in r ? r.dispute : r,
      providesTags: (_r, _e, id) => [{ type: 'Dispute', id }],
    }),

    openDispute: builder.mutation<Dispute, OpenDisputeRequest>({
      query: (data) => ({ url: '/disputes', method: 'POST', data }),
      transformResponse: (r: DisputeEnvelope | Dispute) =>
        'dispute' in r ? r.dispute : r,
      invalidatesTags: [{ type: 'Dispute', id: 'LIST' }],
    }),

    addDisputeMessage: builder.mutation<Dispute, { id: string; text: string }>({
      query: ({ id, text }) => ({
        url: `/disputes/${id}/messages`,
        method: 'POST',
        data: { text },
      }),
      transformResponse: (r: DisputeEnvelope | Dispute) =>
        'dispute' in r ? r.dispute : r,
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data: updated } = await queryFulfilled;
          dispatch(
            disputesApi.util.updateQueryData('getDispute', id, () => updated),
          );
        } catch {
          // Surfaced by the caller.
        }
      },
      invalidatesTags: [{ type: 'Dispute', id: 'LIST' }],
    }),
  }),
});

export const {
  useListMyDisputesQuery,
  useGetDisputeQuery,
  useOpenDisputeMutation,
  useAddDisputeMessageMutation,
} = disputesApi;
