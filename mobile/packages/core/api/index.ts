/**
 * The apps' API. Screens import hooks from here, by the same names as the
 * websites: `import { useGetMeQuery } from '@zappy/core/api';`
 *
 * Importing this file registers every endpoint, so the store imports it once
 * at boot (store/index.ts).
 */
export { apiSlice, getApiErrorCode, getApiErrorMessage, getApiErrorBody } from './apiSlice';
export { api } from './sharedApi';
export * from './hooks';
