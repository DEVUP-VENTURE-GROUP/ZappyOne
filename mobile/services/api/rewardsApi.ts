/** Rewards points + scratch cards. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { Gamification, RewardsSummary } from '../../types/api';

export const rewardsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRewards: builder.query<RewardsSummary, void>({
      query: () => ({ url: '/rewards' }),
      providesTags: ['Rewards'],
    }),
    redeemRewardPoints: builder.mutation<{ walletCreditPaise: number }, { points: number }>({
      query: (data) => ({ url: '/rewards/redeem', method: 'POST', data }),
      invalidatesTags: ['Rewards', 'Wallet'],
    }),
    scratchRewardCard: builder.mutation<{ rewardType: string; rewardValue: number }, string>({
      query: (cardId) => ({ url: `/rewards/scratch/${cardId}`, method: 'POST' }),
      invalidatesTags: ['Rewards'],
    }),
    getGamification: builder.query<Gamification, void>({
      query: () => ({ url: '/gamification' }),
      // Wrapped in `{ gamification: … }` by the controller.
      transformResponse: (r: { gamification?: Gamification } | Gamification) =>
        (r as { gamification?: Gamification }).gamification ?? (r as Gamification),
    }),
  }),
});

export const {
  useGetRewardsQuery,
  useRedeemRewardPointsMutation,
  useScratchRewardCardMutation,
  useGetGamificationQuery,
} = rewardsApi;
