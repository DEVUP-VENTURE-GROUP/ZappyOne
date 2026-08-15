import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useGetPoliciesQuery } from '../services/api/contentApi';

export default function PoliciesScreen() {
  const router = useRouter();
  const { data: policies = [], isLoading } = useGetPoliciesQuery();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const active = policies.find((p) => p.slug === activeSlug) ?? policies[0] ?? null;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Terms &amp; Policies</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : policies.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-gray-400 text-center">No policy documents available right now.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}>
            {policies.map((p) => {
              const on = active?.slug === p.slug;
              return (
                <TouchableOpacity
                  key={p.slug}
                  onPress={() => setActiveSlug(p.slug)}
                  className={`px-4 py-2 rounded-full border ${on ? 'bg-primary border-primary' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`text-xs font-bold ${on ? 'text-white' : 'text-navy'}`}>{p.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
            {active ? (
              <>
                <Text className="text-lg font-bold text-navy mb-3">{active.title}</Text>
                <Text className="text-sm text-gray-600 leading-relaxed">{active.body}</Text>
              </>
            ) : null}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}
