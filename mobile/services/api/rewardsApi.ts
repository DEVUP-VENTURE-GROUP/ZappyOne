/** Rewards points + scratch cards. URLs mirror client/src/services/api.js. */

import { apiSlice } from './apiSlice';
import type { RewardsSummary } from '../../types/api';

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
    getGamification: builder.query<{ streak?: number; badges?: string[]; nextMilestone?: string }, void>({
      query: () => ({ url: '/gamification' }),
    }),
  }),
});

export const {
  useGetRewardsQuery,
  useRedeemRewardPointsMutation,
  useScratchRewardCardMutation,
  useGetGamificationQuery,
} = rewardsApi;
