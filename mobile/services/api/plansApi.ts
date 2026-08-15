/** Subscription plans (Zappy Plus etc). URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { Plan, Subscription } from '../../types/api';

export const plansApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listPlans: builder.query<Plan[], string | void>({
      query: (audience) => ({ url: '/subscriptions/plans', params: audience ? { audience } : undefined }),
      transformResponse: (r: { plans?: Plan[] } | Plan[]) => (Array.isArray(r) ? r : r.plans ?? []),
    }),
    mySubscription: builder.query<Subscription | null, void>({
      query: () => ({ url: '/subscriptions/me' }),
      transformResponse: (r: { subscription?: Subscription | null } | Subscription | null) =>
        r && typeof r === 'object' && 'subscription' in r ? r.subscription ?? null : (r as Subscription | null),
      providesTags: ['User'],
    }),
    subscribe: builder.mutation<{ cfOrderId: string; paymentSessionId: string }, { planCode: string }>({
      query: (data) => ({ url: '/subscriptions/subscribe', method: 'POST', data }),
      invalidatesTags: ['User'],
    }),
    cancelSubscription: builder.mutation<void, string>({
      query: (id) => ({ url: `/subscriptions/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useListPlansQuery,
  useMySubscriptionQuery,
  useSubscribeMutation,
  useCancelSubscriptionMutation,
} = plansApi;
