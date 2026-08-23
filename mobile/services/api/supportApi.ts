/**
 * Support tickets.
 * ----------------------------------------------------------------------------
 * The backend has carried a complete ticket system all along —
 * `server/src/modules/engagement/engagement.routes.js`, mounted at `/api` —
 * and the mobile app had no surface for any of it. The website
 * (`client/src/pages/SupportPage.jsx`) has used these four endpoints for a
 * while, so the contract below is matched against that consumer as well as
 * against the routes themselves.
 *
 *   POST /support              create           (201, { ticket })
 *   GET  /support/mine         list mine        (200, { tickets })
 *   GET  /support/:id          one, w/ messages (200, { ticket })
 *   POST /support/:id/messages reply            (200, { ticket })
 *
 * ── WHY `/support` AND NOT `/engagement/support` ───────────────────────────
 * `routes/index.js` mounts the engagement router at `/api` bare, not under a
 * module prefix. Verified live: `GET /api/support/mine` → 200.
 *
 * A reply returns the FULL updated ticket, so the mutation feeds the thread
 * cache directly and the open screen re-renders without a second round trip.
 * ----------------------------------------------------------------------------
 */

import { apiSlice } from './apiSlice';
import type { CreateTicketRequest, SupportTicket } from '../../types/api';

interface TicketEnvelope {
  ticket: SupportTicket;
}
interface TicketsEnvelope {
  tickets: SupportTicket[];
}

export const supportApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listMyTickets: builder.query<SupportTicket[], void>({
      query: () => ({ url: '/support/mine' }),
      transformResponse: (r: TicketsEnvelope | SupportTicket[]) =>
        Array.isArray(r) ? r : (r.tickets ?? []),
      providesTags: (result) => [
        { type: 'SupportTicket' as const, id: 'LIST' },
        ...(result ?? []).map((t) => ({ type: 'SupportTicket' as const, id: t._id })),
      ],
    }),

    getTicket: builder.query<SupportTicket, string>({
      query: (id) => ({ url: `/support/${id}` }),
      transformResponse: (r: TicketEnvelope | SupportTicket) =>
        'ticket' in r ? r.ticket : r,
      providesTags: (_r, _e, id) => [{ type: 'SupportTicket', id }],
    }),

    createTicket: builder.mutation<SupportTicket, CreateTicketRequest>({
      query: (data) => ({ url: '/support', method: 'POST', data }),
      transformResponse: (r: TicketEnvelope | SupportTicket) =>
        'ticket' in r ? r.ticket : r,
      invalidatesTags: [{ type: 'SupportTicket', id: 'LIST' }],
    }),

    addTicketMessage: builder.mutation<SupportTicket, { id: string; text: string }>({
      query: ({ id, text }) => ({
        url: `/support/${id}/messages`,
        method: 'POST',
        data: { text },
      }),
      transformResponse: (r: TicketEnvelope | SupportTicket) =>
        'ticket' in r ? r.ticket : r,
      // The response IS the updated ticket — write it straight into the thread
      // cache instead of invalidating and refetching what we already hold.
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data: updated } = await queryFulfilled;
          dispatch(
            supportApi.util.updateQueryData('getTicket', id, () => updated),
          );
        } catch {
          // The mutation's own error handling covers the user-facing part.
        }
      },
      invalidatesTags: [{ type: 'SupportTicket', id: 'LIST' }],
    }),
  }),
});

export const {
  useListMyTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useAddTicketMessageMutation,
} = supportApi;
