/**
 * Every ZappyOne server call, the same list the websites use
 * (shared/src/services/endpoints.js), on the apps' secure connection
 * (apiSlice: X-Client-Type mobile, X-App, token refresh).
 */
import { apiSlice } from './apiSlice';
// Generated from shared/src/services/endpoints.js (npm run sync:api), the websites' own list.
import { TAG_TYPES, bindApi, endpoints } from './endpoints.generated';

export const api = apiSlice
  .enhanceEndpoints({ addTagTypes: TAG_TYPES })
  .injectEndpoints({
    // The apps never call admin routes; the path is only needed to build the list.
    endpoints: (b) => endpoints(b, { adminApiPath: (sub = '') => `/admin${sub}` }),
  });

// The optimistic patches in the shared list (mark read, cancel) need the finished API.
bindApi(api);
