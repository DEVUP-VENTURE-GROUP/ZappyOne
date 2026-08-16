/**
 * Location draft — the picker's hand-off channel.
 * ----------------------------------------------------------------------------
 * `expo-router` params are strings, so returning a structured location from a
 * pushed screen means either serialising it through the URL or holding it in
 * shared state. A booking location is six fields including two floats, and the
 * URL is the wrong place for a customer's address.
 *
 * So the picker writes its result here and calls `router.back()`; the opener
 * reads it, uses it, and clears it. `requestId` exists so the opener can tell a
 * fresh result from a stale one it has already consumed — without it, a picker
 * result would be re-applied every time the opening screen re-rendered.
 * ----------------------------------------------------------------------------
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DraftLocation {
  lat: number;
  lng: number;
  address: string;
  landmark?: string;
  flatNumber?: string;
  /** How the pin was obtained — drives the label on the opener's summary card. */
  source: 'gps' | 'saved' | 'recent' | 'search' | 'map';
  savedLabel?: string;
}

interface LocationDraftState {
  picked: DraftLocation | null;
  /** Increments on every confirm, so repeats of the same address still apply. */
  requestId: number;
  /**
   * Where the picker should open. This travels through the store rather than
   * router params on purpose: a home address is personal data, and router
   * params land in the URL, which on web is written to browser history and can
   * escape via the referrer.
   */
  seed: DraftLocation | null;
}

const initialState: LocationDraftState = { picked: null, requestId: 0, seed: null };

const locationDraftSlice = createSlice({
  name: 'locationDraft',
  initialState,
  reducers: {
    locationPicked: (state, action: PayloadAction<DraftLocation>) => {
      state.picked = action.payload;
      state.requestId += 1;
    },
    locationDraftCleared: (state) => {
      state.picked = null;
    },
    locationSeeded: (state, action: PayloadAction<DraftLocation | null>) => {
      state.seed = action.payload;
    },
  },
});

export const { locationPicked, locationDraftCleared, locationSeeded } =
  locationDraftSlice.actions;
export default locationDraftSlice.reducer;
