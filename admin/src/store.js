import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@shared/modules/auth/authSlice';
import { api } from '@shared/services/api';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});
