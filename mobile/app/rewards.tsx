import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft, Gift, Sparkles, Award } from 'lucide-react-native';
import { useGetRewardsQuery, useRedeemRewardPointsMutation, useScratchRewardCardMutation } from '../services/api/rewardsApi';
import { getApiErrorMessage } from '../services/api/apiSlice';

export default function RewardsScreen() {
  const router = useRouter();
  const { data: rewards, isLoading, refetch } = useGetRewardsQuery();
  const [redeemPoints, { isLoading: redeeming }] = useRedeemRewardPointsMutation();
  const [scratchCard, { isLoading: scratching }] = useScratchRewardCardMutation();
  const [scratchingId, setScratchingId] = useState<string | null>(null);

  const handleRedeem = async () => {
    if (!rewards?.points) return;
    try {
      const res = await redeemPoints({ points: rewards.points }).unwrap();
      Alert.alert('Redeemed!', `₹${Math.round(res.walletCreditPaise / 100)} credited to your wallet.`);
      refetch();
    } catch (e) {
      Alert.alert('Redeem failed', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  const handleScratch = async (cardId: string) => {
    setScratchingId(cardId);
    try {
      const res = await scratchCard(cardId).unwrap();
      Alert.alert('You won!', `${res.rewardValue} ${res.rewardType === 'points' ? 'points' : res.rewardType === 'cashback' ? 'cashback' : 'off'} 🎉`);
      refetch();
    } catch (e) {
      Alert.alert('Could not scratch', getApiErrorMessage(e, 'Please try again.'));
    } finally {
      setScratchingId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Rewards</Text>
      </View>

      {isLoading || !rewards ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="mx-5 mt-2 rounded-3xl p-6" style={{ backgroundColor: '#7C3AED' }}>
            <View className="flex-row items-center gap-2 mb-2">
              <Sparkles size={16} color="#DDD6FE" />
              <Text className="text-purple-100 text-xs font-bold uppercase">Your points</Text>
            </View>
            <Text className="text-white text-4xl font-extrabold">{rewards.points.toLocaleString('en-IN')}</Text>
            {rewards.tier ? (
              <View className="flex-row items-center gap-1.5 mt-2">
                <Award size={14} color="#DDD6FE" />
                <Text className="text-purple-100 text-xs font-semibold capitalize">{rewards.tier} tier</Text>
              </View>
            ) : null}
            <TouchableOpacity
              className="bg-white rounded-full px-5 py-2.5 self-start mt-4"
              onPress={handleRedeem}
              disabled={redeeming || !rewards.points}
            >
              {redeeming ? <ActivityIndicator color="#7C3AED" size="small" /> : (
                <Text className="text-[#7C3AED] font-bold text-sm">Redeem to wallet</Text>
              )}
            </TouchableOpacity>
          </View>

          {rewards.scratchCards && rewards.scratchCards.length > 0 ? (
            <View className="mt-6 px-5">
              <Text className="text-base font-bold text-navy mb-3">Scratch cards</Text>
              <View className="flex-row flex-wrap gap-3">
                {rewards.scratchCards.map((card) => {
                  const isScratched = card.status === 'scratched';
                  return (
                    <TouchableOpacity
                      key={card._id}
                      disabled={isScratched || scratching}
                      onPress={() => handleScratch(card._id)}
                      className={`w-[47%] aspect-square rounded-2xl items-center justify-center ${isScratched ? 'bg-gray-50 border border-gray-100' : 'bg-purple-50 border border-purple-200'}`}
                    >
                      {scratchingId === card._id ? (
                        <ActivityIndicator color="#7C3AED" />
                      ) : isScratched ? (
                        <>
                          <Text className="text-lg font-extrabold text-navy">{card.rewardValue}</Text>
                          <Text className="text-[11px] text-gray-400 capitalize">{card.rewardType}</Text>
                        </>
                      ) : (
                        <>
                          <Gift size={28} color="#7C3AED" />
                          <Text className="text-xs font-bold text-purple-700 mt-2">Tap to scratch</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {rewards.history && rewards.history.length > 0 ? (
            <View className="mt-6 px-5">
              <Text className="text-base font-bold text-navy mb-3">History</Text>
              {rewards.history.map((h) => (
                <View key={h._id} className="flex-row justify-between py-2.5 border-b border-gray-50">
                  <Text className="text-sm text-gray-600 flex-1" numberOfLines={1}>{h.reason || 'Points'}</Text>
                  <Text className={`text-sm font-bold ${h.points >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {h.points >= 0 ? '+' : ''}{h.points}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
