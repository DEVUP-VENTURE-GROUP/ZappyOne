import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Calendar, Repeat2 } from 'lucide-react-native';
import { useListOrdersQuery, useRebookOrderMutation } from '../../services/api/ordersApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../types/api';

const STATUS_STYLE: Record<string, string> = {
  completed: 'text-emerald-600',
  cancelled: 'text-red-500',
  failed: 'text-red-500',
  searching: 'text-accent',
};

export default function BookingsScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch, isFetching } = useListOrdersQuery(page);
  const [rebookOrder, { isLoading: rebooking }] = useRebookOrderMutation();

  const orders = data?.orders ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleRebook = async (order: Order) => {
    try {
      const newOrder = await rebookOrder(order._id).unwrap();
      router.push(`/tracking/order/${newOrder._id}`);
    } catch (e) {
      Alert.alert('Rebook failed', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-navy">My Bookings</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshing={isFetching}
          onRefresh={() => { setPage(1); refetch(); }}
          renderItem={({ item }) => {
            const isActive = (ACTIVE_ORDER_STATUSES as readonly string[]).includes(item.status);
            const canRebook = item.status === 'completed' || item.status === 'cancelled';
            return (
              <View className="bg-white border border-gray-100 rounded-2xl p-4 mb-3">
                <TouchableOpacity onPress={() => router.push(`/tracking/order/${item._id}`)}>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-base font-bold text-navy capitalize">{String(item.service || '').replace(/_/g, ' ')}</Text>
                    <Text className={`text-xs font-bold capitalize ${STATUS_STYLE[item.status] || 'text-primary'}`}>
                      {String(item.status || '').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-400 mt-1">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                  <View className="flex-row justify-between items-center mt-2">
                    {item.pricing?.total ? <Text className="text-sm font-bold text-navy">₹{item.pricing.total}</Text> : <View />}
                    {isActive ? <Text className="text-xs font-semibold text-primary">Track →</Text> : null}
                  </View>
                </TouchableOpacity>
                {canRebook ? (
                  <TouchableOpacity
                    className="flex-row items-center gap-1 self-end mt-2 pt-2 border-t border-gray-50"
                    onPress={() => handleRebook(item)}
                    disabled={rebooking}
                  >
                    <Repeat2 size={13} color="#2563EB" />
                    <Text className="text-xs font-semibold text-primary">Rebook</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <Calendar size={40} color="#CBD5E1" />
              <Text className="text-gray-400 mt-3">No bookings yet</Text>
            </View>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View className="flex-row items-center justify-center gap-4 mt-2">
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
                  <Text className={`text-sm font-bold ${page <= 1 ? 'text-gray-300' : 'text-primary'}`}>Previous</Text>
                </TouchableOpacity>
                <Text className="text-xs text-gray-400">Page {page} of {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
                  <Text className={`text-sm font-bold ${page >= totalPages ? 'text-gray-300' : 'text-primary'}`}>Next</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
