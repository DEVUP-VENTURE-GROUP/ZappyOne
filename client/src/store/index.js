import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@shared/modules/auth/authSlice";
import orderReducer from "@shared/modules/order/orderSlice";
import workerReducer from "@shared/modules/worker/workerSlice";
import locationReducer from "@shared/store/locationSlice";
import { api } from "@shared/services/api";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    order: orderReducer,
    worker: workerReducer,
    location: locationReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});
