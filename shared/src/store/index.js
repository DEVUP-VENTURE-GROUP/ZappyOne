import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../modules/auth/authSlice";
import orderReducer from "../modules/order/orderSlice";
import workerReducer from "../modules/worker/workerSlice";
import locationReducer from "./locationSlice";
import { api } from "../services/api";

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
