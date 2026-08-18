/**
 * Static content: FAQs + legal policies.
 * ----------------------------------------------------------------------------
 * Both endpoints return a different shape from what this file used to claim,
 * and each mismatch had a visible consequence:
 *
 *   /content/faqs        returns GROUPS ({ category, items }), not a flat list,
 *                        and each item is keyed `id`, not `_id`.
 *
 *   /content/policy/:slug is SINGULAR. The query below asked for
 *                        `/content/policies/:slug`, which is not a route — it
 *                        404'd every time, so nothing ever used it, so the
 *                        Policies screen tried to read `body` off the list
 *                        response, which does not include one.
 * ----------------------------------------------------------------------------
 */

import { apiSlice } from './apiSlice';
import type { FaqGroup, PolicyDoc, PolicySummary } from '../../types/api';

export const contentApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getFaqs: builder.query<FaqGroup[], string | void>({
      query: (audience) => ({ url: '/content/faqs', params: audience ? { audience } : undefined }),
      transformResponse: (r: { faqs?: FaqGroup[] } | FaqGroup[]) =>
        Array.isArray(r) ? r : r.faqs ?? [],
    }),

    /** The only endpoint that carries a policy's text. */
    getPolicy: builder.query<PolicyDoc, string>({
      query: (slug) => ({ url: `/content/policy/${slug}` }),
      transformResponse: (r: { policy?: PolicyDoc } | PolicyDoc) =>
        r && 'policy' in r && r.policy ? r.policy : (r as PolicyDoc),
    }),

    /** Slugs and titles only — see `PolicySummary`. */
    getPolicies: builder.query<PolicySummary[], void>({
      query: () => ({ url: '/content/policies' }),
      transformResponse: (r: { policies?: PolicySummary[] } | PolicySummary[]) =>
        Array.isArray(r) ? r : r.policies ?? [],
    }),
  }),
});

export const { useGetFaqsQuery, useGetPolicyQuery, useGetPoliciesQuery } = contentApi;
