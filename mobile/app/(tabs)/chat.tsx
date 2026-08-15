import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare } from 'lucide-react-native';
import { useListOrdersQuery } from '../../services/api/ordersApi';
import type { OrderStatus } from '../../types/api';

// Chats are tied to active orders (you can message the assigned worker).
const CHATTABLE: OrderStatus[] = ['assigned', 'on_the_way', 'arrived', 'in_progress'];

export default function ChatListScreen() {
  const router = useRouter();
  const { data, isLoading } = useListOrdersQuery(1);

  const chats = useMemo(
    () => (data?.orders ?? []).filter((o) => CHATTABLE.includes(o.status) && o.workerId),
    [data],
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-navy">Chats</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : chats.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <MessageSquare size={40} color="#CBD5E1" />
          <Text className="text-gray-400 mt-3 text-center">Chats appear here once a worker is assigned to your booking</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center gap-3"
              onPress={() => router.push(`/chat/${item._id}`)}
            >
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <MessageSquare size={18} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-navy capitalize">{item.workerName || String(item.service || '').replace(/_/g, ' ')}</Text>
                <Text className="text-xs text-gray-400 capitalize">{String(item.status || '').replace(/_/g, ' ')}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
