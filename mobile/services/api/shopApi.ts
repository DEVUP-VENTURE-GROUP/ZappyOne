/**
 * Shop discovery endpoints (customer side) — "Nearby Shops" browse + profile.
 * Mirrors client/src/services/api.js's shop endpoints and
 * server/src/modules/shop/shop.routes.js.
 */

import { apiSlice } from './apiSlice';
import type { Shop } from '../../types/api';

interface ShopsEnvelope { shops: Shop[] }
interface ShopEnvelope { shop: Shop }

export const shopApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    nearbyShops: builder.query<Shop[], { lat: number; lng: number; service?: string; radiusKm?: number }>({
      query: (params) => ({ url: '/shops/nearby', params }),
      transformResponse: (r: ShopsEnvelope) => r.shops ?? [],
      providesTags: ['Shop'],
    }),
    getShopProfile: builder.query<Shop, string>({
      query: (id) => ({ url: `/shops/${id}` }),
      transformResponse: (r: ShopEnvelope) => r.shop ?? (r as unknown as Shop),
      providesTags: (_r, _e, id) => [{ type: 'Shop', id }],
    }),
  }),
});

export const {
  useNearbyShopsQuery,
  useGetShopProfileQuery,
} = shopApi;
