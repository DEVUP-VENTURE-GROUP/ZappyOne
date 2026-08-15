/** Static content: FAQs + legal policies. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { Faq, PolicyDoc } from '../../types/api';

export const contentApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getFaqs: builder.query<Faq[], string | void>({
      query: (audience) => ({ url: '/content/faqs', params: audience ? { audience } : undefined }),
      transformResponse: (r: { faqs?: Faq[] } | Faq[]) => (Array.isArray(r) ? r : r.faqs ?? []),
    }),
    getPolicy: builder.query<PolicyDoc, string>({
      query: (slug) => ({ url: `/content/policies/${slug}` }),
      transformResponse: (r: { policy?: PolicyDoc } | PolicyDoc) =>
        r && 'policy' in r && r.policy ? r.policy : (r as PolicyDoc),
    }),
    getPolicies: builder.query<PolicyDoc[], void>({
      query: () => ({ url: '/content/policies' }),
      transformResponse: (r: { policies?: PolicyDoc[] } | PolicyDoc[]) =>
        Array.isArray(r) ? r : r.policies ?? [],
    }),
  }),
});

export const { useGetFaqsQuery, useGetPolicyQuery, useGetPoliciesQuery } = contentApi;
