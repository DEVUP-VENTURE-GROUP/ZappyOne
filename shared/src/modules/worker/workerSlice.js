import { createSlice } from '@reduxjs/toolkit';

const slice = createSlice({
  name: 'worker',
  initialState: {
    isOnline: false,
    currentOffer: null, // { orderId, service, pickupAddress, pickupCoords, price, expiresAt }
    currentOrder: null, // active assigned/on_the_way order
    location: null,
  },
  reducers: {
    setOnline: (state, { payload }) => {
      state.isOnline = payload;
    },
    setOffer: (state, { payload }) => {
      state.currentOffer = payload;
    },
    clearOffer: (state) => {
      state.currentOffer = null;
    },
    setCurrentOrder: (state, { payload }) => {
      state.currentOrder = payload;
    },
    setLocation: (state, { payload }) => {
      state.location = payload;
    },
  },
});

export const { setOnline, setOffer, clearOffer, setCurrentOrder, setLocation } = slice.actions;
export const selectWorker = (s) => s.worker;
export default slice.reducer;
