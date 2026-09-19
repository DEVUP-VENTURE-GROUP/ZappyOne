/**
 * Public service catalog + search — same source as the website (live prices).
 * URLs mirror client/src/services/api.js.
 */

import { apiSlice } from './apiSlice';
import type {
  ServiceCatalogItem, ServiceCategory, SearchResult,
  LiveCatalogDomain, LiveCatalogResponse,
} from '../../types/api';

interface ServicesEnvelope { services: ServiceCatalogItem[] }
interface CategoriesEnvelope { categories: ServiceCategory[] }

export const catalogApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * What a customer can actually book today.
     *
     * `GET /provider/onboarding/catalog` is PUBLIC (verified in
     * `onboarding.routes.js` — everything else in that router is
     * provider-scoped, this one route deliberately is not, because the home
     * page renders before anyone signs in).
     *
     * ── WHY THIS EXISTS ALONGSIDE `getServices` ────────────────────────────
     * `/catalog/services` lists every service the platform has ever defined,
     * including ones with no verified provider behind them. The website
     * retired its catalog page over exactly that: a customer could browse in,
     * pick a symptom, and reach a dead end nobody could fulfil. This endpoint
     * returns only lines that are live AND have an approved provider
     * enrolment, which is the same list providers are verified against, so
     * the two sides cannot disagree.
     *
     * `getServices` is left in place — other screens still use it — but new
     * discovery surfaces should prefer this one.
     *
     * An empty array is a VALID result meaning "nothing is bookable yet", not
     * a failure. See `LiveCatalogResponse` in types/api.ts.
     */
    getLiveCatalog: builder.query<LiveCatalogDomain[], void>({
      query: () => ({ url: '/provider/onboarding/catalog' }),
      transformResponse: (r: LiveCatalogResponse) => r?.domains ?? [],
      providesTags: ['Catalog'],
    }),

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

    /**
     * Personalised service recommendations. NOT WIRED TO ANY SCREEN.
     *
     * The old signature claimed `ServiceCatalogItem[]`, which was simply
     * untrue: `GET /recommendations` returns `{ services: [{ service, reason
     * }], trending: [...] }` — a SLUG and a human reason, with no name, price,
     * icon or `_id`. Rendering it as a catalog item would have produced blank
     * tiles, the same class of bug the FAQ list had. The type now describes
     * the real payload.
     *
     * ── WHY IT IS STILL NOT ON THE HOME SCREEN ─────────────────────────────
     * `recommendations.service.js` pads its results from a hardcoded
     * `ALL_SERVICES` list — electrical, plumbing, ac_repair, carpenter,
     * helper, puncture, cleaning, painting — that predates the current
     * catalog. Checked against the live `/catalog/services` (86 entries), only
     * ONE of the six slugs returned for this account actually exists as a
     * bookable service. The personal and trending entries are real; the
     * padding is not.
     *
     * So wiring this up today would render mostly-unbookable tiles, and
     * filtering to the valid ones leaves too few to justify a section. The
     * fix belongs in that service's fallback list, which is server-side and
     * out of scope. Left connected-but-unused, with an honest type.
     */
    getRecommendations: builder.query<
      { services: { service: string; reason: string }[]; trending: string[] },
      void
    >({
      query: () => ({ url: '/recommendations' }),
      transformResponse: (r: {
        services?: { service: string; reason: string }[];
        trending?: string[];
      }) => ({ services: r.services ?? [], trending: r.trending ?? [] }),
    }),
  }),
});

export const {
  useGetLiveCatalogQuery,
  useGetServicesQuery,
  useGetCategoriesQuery,
  useGetCatalogBrandsQuery,
  useGetCatalogModelsQuery,
  useLazySmartSearchQuery,
  useLazySearchSuggestQuery,
  useSearchTrendingQuery,
  useGetRecommendationsQuery,
} = catalogApi;
