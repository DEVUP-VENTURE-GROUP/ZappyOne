import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import { apiSlice } from '../services/api/apiSlice';
// Registers every endpoint module on apiSlice — see services/api/index.ts.
import '../services/api';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
