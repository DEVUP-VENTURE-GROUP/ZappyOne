/**
 * Live job offers.
 * ----------------------------------------------------------------------------
 * Offers are SOCKET-ONLY. There is no REST endpoint that lists pending offers —
 * verified against the server's worker and order routes. They arrive as
 * `new_job_request`, live for the window in their own `expiresAt`, and are gone.
 * That has two consequences this slice exists to handle:
 *
 *  1. NOTHING CAN REFETCH THEM. If the payload is dropped, it is lost until
 *     dispatch re-broadcasts. Holding them in component state — as the
 *     dashboard did — means an offer arriving while the pro is on any other
 *     screen is missed entirely. Shared state plus one subscription fixes that.
 *
 *  2. THEY ARE NOT A LIST THE SERVER AGREES WITH. This store is a local cache
 *     of what this device happened to receive, so it must be pruned honestly:
 *     expired offers are dropped, and `offer.cancelled` (someone else accepted)
 *     removes them immediately.
 *
 * Dispatch logic is untouched — this only decides where the received payload
 * is kept on the client.
 * ----------------------------------------------------------------------------
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { JobOffer } from '../types/api';

interface OffersState {
  /** Newest first. Keyed by order id; a re-broadcast replaces in place. */
  items: JobOffer[];
}

const initialState: OffersState = { items: [] };

const offersSlice = createSlice({
  name: 'offers',
  initialState,
  reducers: {
    offerReceived: (state, action: PayloadAction<JobOffer>) => {
      const existing = state.items.findIndex((o) => o._id === action.payload._id);
      // Dispatch re-broadcasts the same order as the radius widens, so replace
      // rather than stack duplicates of one job.
      if (existing >= 0) state.items[existing] = action.payload;
      else state.items.unshift(action.payload);
    },
    /** `offer.cancelled`, `job.assigned` to someone else, or a local decline. */
    offerRemoved: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((o) => o._id !== action.payload);
    },
    /** `offer.boosted` — the customer raised the price while it was on screen. */
    offerBoosted: (
      state,
      action: PayloadAction<{ orderId: string; newTotal: number }>,
    ) => {
      const offer = state.items.find((o) => o._id === action.payload.orderId);
      if (offer) offer.price = action.payload.newTotal;
    },
    /** Drops anything past its own `expiresAt`. Called on a ticking interval. */
    offersPruned: (state) => {
      const now = Date.now();
      state.items = state.items.filter(
        (o) => new Date(o.expiresAt).getTime() > now,
      );
    },
    /** Going offline ends eligibility, so held offers are no longer valid. */
    offersCleared: (state) => {
      state.items = [];
    },
  },
});

export const {
  offerReceived,
  offerRemoved,
  offerBoosted,
  offersPruned,
  offersCleared,
} = offersSlice.actions;
export default offersSlice.reducer;
