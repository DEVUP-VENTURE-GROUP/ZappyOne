/**
 * Public service catalog + search — same source as the website (live prices).
 * URLs mirror client/src/services/api.js.
 */

import { apiSlice } from './apiSlice';
import type { ServiceCatalogItem, ServiceCategory, SearchResult } from '../../types/api';

interface ServicesEnvelope { services: ServiceCatalogItem[] }
interface CategoriesEnvelope { categories: ServiceCategory[] }

export const catalogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getServices: builder.query<ServiceCatalogItem[], void>({
      query: () => ({ url: '/catalog/services' }),
      transformResponse: (r: ServicesEnvelope | ServiceCatalogItem[]) =>
        Array.isArray(r) ? r : r.services ?? [],
      providesTags: ['Catalog'],
    }),
    getCategories: builder.query<ServiceCategory[], void>({
      query: () => ({ url: '/catalog/categories' }),
      transformResponse: (r: CategoriesEnvelope | ServiceCategory[]) =>
        Array.isArray(r) ? r : r.categories ?? [],
      providesTags: ['Catalog'],
    }),

    // Brand → model → variant drilldown for the "depth" services (phone/laptop).
    getCatalogBrands: builder.query<{ code: string; name: string }[], string | void>({
      query: (category = 'mobile') => ({ url: '/catalog/services/brands', params: { category } }),
      transformResponse: (r: { brands?: { code: string; name: string }[] } | { code: string; name: string }[]) =>
        Array.isArray(r) ? r : r.brands ?? [],
    }),
    getCatalogModels: builder.query<{ code: string; name: string }[], { brandCode?: string; search?: string }>({
      query: (params) => ({ url: '/catalog/services/models', params }),
      transformResponse: (r: { models?: { code: string; name: string }[] } | { code: string; name: string }[]) =>
        Array.isArray(r) ? r : r.models ?? [],
    }),

    // Unified search (fuzzy + intent + rank).
    smartSearch: builder.query<SearchResult[], { q: string }>({
      query: (params) => ({ url: '/search', params }),
      transformResponse: (r: { results?: SearchResult[] } | SearchResult[]) =>
        Array.isArray(r) ? r : r.results ?? [],
    }),
    searchSuggest: builder.query<string[], { q: string }>({
      query: (params) => ({ url: '/search/suggest', params }),
      transformResponse: (r: { suggestions?: string[] } | string[]) =>
        Array.isArray(r) ? r : r.suggestions ?? [],
    }),
    searchTrending: builder.query<string[], void>({
      query: () => ({ url: '/search/trending' }),
      transformResponse: (r: { trending?: string[] } | string[]) => (Array.isArray(r) ? r : r.trending ?? []),
    }),

    getRecommendations: builder.query<ServiceCatalogItem[], void>({
      query: () => ({ url: '/recommendations' }),
      transformResponse: (r: ServicesEnvelope | ServiceCatalogItem[]) =>
        Array.isArray(r) ? r : r.services ?? [],
    }),
  }),
});

export const {
  useGetServicesQuery,
  useGetCategoriesQuery,
  useGetCatalogBrandsQuery,
  useGetCatalogModelsQuery,
  useLazySmartSearchQuery,
  useLazySearchSuggestQuery,
  useSearchTrendingQuery,
  useGetRecommendationsQuery,
} = catalogApi;
