/**
 * Endpoint registration barrel.
 * ----------------------------------------------------------------------------
 * `injectEndpoints` only runs its side effect (registering the endpoints on
 * `apiSlice`) when the module is imported somewhere. Importing each endpoint
 * module here — and having `store/index.ts` import this file — guarantees
 * every endpoint is registered at app boot, regardless of which screens
 * happen to use them. Without this, an endpoint module that no screen
 * imports yet would silently never register.
 * ----------------------------------------------------------------------------
 */

export * from './apiSlice';
export * from './authApi';
export * from './catalogApi';
export * from './ordersApi';
export * from './walletApi';
export * from './rewardsApi';
export * from './plansApi';
export * from './notificationsApi';
export * from './contentApi';
export * from './paymentsApi';
export * from './promosApi';
export * from './workerApi';
export * from './uploadApi';
export * from './supportApi';
export * from './disputesApi';
