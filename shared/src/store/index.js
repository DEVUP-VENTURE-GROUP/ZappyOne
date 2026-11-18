import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
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
// Tells the API when the tab is in front and when the network is back: polls can pause unseen, and refetchOnReconnect works.
setupListeners(store.dispatch);
