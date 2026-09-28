import { createSlice } from '@reduxjs/toolkit';

const slice = createSlice({
  name: 'order',
  initialState: {
    activeOrderId:          null,
    status:                 null,
    workerLocation:         null,   // { lat, lng, at }
    workerInfo:             null,
    etaMinutes:             null,
    dispatchMessage:        null,   // live search-radius status ("Expanding to 3km…")

    // Dispatch phase — drives the real-time searching UI
    dispatchPhase:          'created',  // 'created'|'searching'|'expanding'|'notifying'|'reviewing'
    dispatchStep:           0,
    dispatchTotalSteps:     10,
    dispatchRadiusKm:       null,
    dispatchRadiusLabel:    null,
    dispatchWorkersFound:   0,    // count of workers notified at current step
    dispatchElapsedSec:     0,
    dispatchBoostPaise:     0,    // current live boost amount

    history:                [],
  },
  reducers: {
    setActiveOrder: (state, { payload }) => {
      state.activeOrderId         = payload.orderId;
      state.status                = payload.status;
      state.workerLocation        = null;
      state.workerInfo            = null;
      state.dispatchMessage       = null;
      state.dispatchPhase         = payload.status === 'searching' ? 'searching' : 'created';
      state.dispatchStep          = 0;
      state.dispatchTotalSteps    = 10;
      state.dispatchRadiusKm      = null;
      state.dispatchRadiusLabel   = null;
      state.dispatchWorkersFound  = 0;
      state.dispatchElapsedSec    = 0;
      state.dispatchBoostPaise    = 0;
      state.history               = [];
    },
    clearActiveOrder: (state) => {
      state.activeOrderId         = null;
      state.status                = null;
      state.workerLocation        = null;
      state.workerInfo            = null;
      state.dispatchMessage       = null;
      state.dispatchPhase         = 'created';
      state.dispatchStep          = 0;
      state.dispatchTotalSteps    = 10;
      state.dispatchRadiusKm      = null;
      state.dispatchRadiusLabel   = null;
      state.dispatchWorkersFound  = 0;
      state.dispatchElapsedSec    = 0;
      state.dispatchBoostPaise    = 0;
      state.history               = [];
    },
    setStatus: (state, { payload }) => {
      state.status = payload.status;
      if (payload.status === 'assigned') state.dispatchPhase = 'accepted';
      if (payload.status !== 'searching') state.dispatchMessage = null;
      state.history.push({ status: payload.status, at: payload.at || Date.now() });
    },
    setWorkerLocation: (state, { payload }) => {
      state.workerLocation = payload;
    },
    setWorkerInfo: (state, { payload }) => {
      state.workerInfo = payload;
    },
    setEta: (state, { payload }) => {
      state.etaMinutes = payload.minutes ?? null;
    },
    setDispatchMessage: (state, { payload }) => {
      state.dispatchMessage    = payload.message ?? null;
      if (payload.radiusKm)    state.dispatchRadiusKm    = payload.radiusKm;
      if (payload.radiusLabel) state.dispatchRadiusLabel = payload.radiusLabel;
      if (payload.step)        state.dispatchStep        = payload.step;
      if (payload.totalSteps)  state.dispatchTotalSteps  = payload.totalSteps;
      if (payload.elapsedSec)  state.dispatchElapsedSec  = payload.elapsedSec;
      // Phase: step 1 = searching nearby, step 2+ = expanding
      if (payload.step === 1)       state.dispatchPhase = 'searching';
      else if (payload.step > 1)    state.dispatchPhase = 'expanding';
    },
    setWorkersNotified: (state, { payload }) => {
      state.dispatchWorkersFound = payload.count ?? 0;
      state.dispatchPhase        = payload.count > 0 ? 'reviewing' : state.dispatchPhase;
    },
    setDispatchBoost: (state, { payload }) => {
      state.dispatchBoostPaise = payload.amountPaise ?? 0;
    },
  },
});

export const {
  setActiveOrder,
  clearActiveOrder,
  setStatus,
  setWorkerLocation,
  setWorkerInfo,
  setEta,
  setDispatchMessage,
  setWorkersNotified,
  setDispatchBoost,
} = slice.actions;

export const selectOrder = (s) => s.order;
export default slice.reducer;
