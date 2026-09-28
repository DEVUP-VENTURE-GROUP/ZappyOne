import { createSlice } from '@reduxjs/toolkit';
import { saveGeoLocation, loadGeoLocation } from '../utils/geoCache';

/**
 * Where the customer is.
 *
 * This used to start empty on every single page load and was written by exactly
 * one screen — the booking flow's LocationPicker. Every other screen only READ
 * it. So a customer who opened a repair booking directly, or who simply
 * refreshed the page, hit "We need your location" with nothing on the app able
 * to fill it in. That is the "location not detecting" bug: nothing was
 * detecting because nothing ever asked.
 *
 * Two changes fix it at the source:
 *
 *   1. The slice HYDRATES from the same localStorage cache useGeolocation
 *      already writes. A fix obtained on one screen now survives a refresh and
 *      is visible to every other screen.
 *   2. setLocation WRITES that cache too, so the two stores cannot drift apart.
 *
 * The address rides along because every screen that needs coordinates also
 * needs something human to show for them — "Plot 4, Kompally" reassures where
 * "17.5449, 78.4983" does not.
 */

const cached = loadGeoLocation();

const initialState = {
  lat: cached?.lat ?? null,
  lng: cached?.lng ?? null,
  accuracy: cached?.accuracy ?? null,
  address: cached?.address ?? '',
  // Cached fixes are deliberately treated as already-resolved: a 20-minute-old
  // pin from the same session is far better than an empty map, and the GPS
  // refresh happening in the background will overwrite it shortly.
  resolvedAt: cached ? Date.now() : null,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setLocation(state, { payload }) {
      state.lat        = payload.lat;
      state.lng        = payload.lng;
      state.accuracy   = payload.accuracy ?? null;
      // An update that carries no address must not erase the one we have —
      // a GPS refresh behind a confirmed pin would otherwise blank the label.
      if (payload.address != null) state.address = payload.address;
      state.resolvedAt = Date.now();

      saveGeoLocation({
        lat: state.lat,
        lng: state.lng,
        accuracy: state.accuracy,
        address: state.address,
      });
    },
    clearLocation(state) {
      state.lat = null;
      state.lng = null;
      state.accuracy = null;
      state.address = '';
      state.resolvedAt = null;
    },
  },
});

export const { setLocation, clearLocation } = locationSlice.actions;

export const selectLocation    = (s) => s.location;
export const selectHasLocation = (s) => s.location.lat !== null && s.location.lng !== null;

export default locationSlice.reducer;
