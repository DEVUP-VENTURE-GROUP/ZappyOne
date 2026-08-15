import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, TextInput, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Search, Wrench, X } from 'lucide-react-native';
import { useGetServicesQuery, useGetCategoriesQuery } from '../../services/api/catalogApi';
import type { ServiceCatalogItem } from '../../types/api';

export default function ServicesScreen() {
  const router = useRouter();
  const { category: initialCategory } = useLocalSearchParams<{ category?: string }>();
  const { data: services = [], isLoading, refetch, isFetching } = useGetServicesQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const [q, setQ] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory ?? null);

  const filtered = useMemo(() => {
    let list = services;
    if (activeCategory) {
      list = list.filter((s) => s.category === activeCategory);
    }
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((s) =>
        (s.name || '').toLowerCase().includes(term) || (s.code || '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [services, q, activeCategory]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-navy">Services</Text>
        <Text className="text-gray-500 mb-3">Book a verified professional</Text>
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3">
          <Search size={18} color="#94A3B8" />
          <TextInput
            className="flex-1 p-3 text-base"
            placeholder="Search services"
            value={q}
            onChangeText={setQ}
          />
        </View>
      </View>

      {categories.length > 0 ? (
        <View className="mb-2">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={(c) => c._id}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            renderItem={({ item }) => {
              const on = activeCategory === item.key;
              return (
                <TouchableOpacity
                  onPress={() => setActiveCategory(on ? null : item.key)}
                  className={`px-4 py-2 rounded-full border flex-row items-center gap-1 ${on ? 'bg-primary border-primary' : 'bg-white border-gray-200'}`}
                >
                  {on ? <X size={12} color="#fff" /> : null}
                  <Text className={`text-xs font-bold ${on ? 'text-white' : 'text-navy'}`}>{item.customerLabel}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      ) : null}

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          contentContainerStyle={{ padding: 16 }}
          refreshing={isFetching}
          onRefresh={refetch}
          renderItem={({ item }: { item: ServiceCatalogItem }) => {
            const price = item.servicePricePaise
              ? Math.round(item.servicePricePaise / 100)
              : Math.round((item.priceRangeMinPaise || 0) / 100);
            return (
              <TouchableOpacity
                className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center justify-between"
                // `as never`: typed-routes stale-cache artifact (see home.tsx) — route is real.
                onPress={() => router.push(`/service/${item.code}` as never)}
              >
                <View className="flex-row items-center flex-1 pr-3">
                  <View className="w-11 h-11 rounded-xl bg-gray-50 items-center justify-center mr-3 overflow-hidden">
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                      <Wrench size={18} color="#CBD5E1" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-navy capitalize">{(item.name || item.code || '').replace(/_/g, ' ')}</Text>
                    {item.shortDescription ? (
                      <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>{item.shortDescription}</Text>
                    ) : null}
                    <Text className="text-sm font-semibold text-primary mt-1">{price > 0 ? `From ₹${price}` : 'Get Quote'}</Text>
                  </View>
                </View>
                <View className="bg-primary rounded-xl px-4 py-2">
                  <Text className="text-white font-bold text-xs">Book</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">No services found</Text>}
        />
      )}
    </SafeAreaView>
  );
}
