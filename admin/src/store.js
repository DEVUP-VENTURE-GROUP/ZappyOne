import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@client/modules/auth/authSlice';
import { api } from '@client/services/api';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});
