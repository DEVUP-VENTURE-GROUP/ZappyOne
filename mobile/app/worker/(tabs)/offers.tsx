import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Briefcase } from 'lucide-react-native';
import { useGetWorkerOrdersQuery } from '../../../services/api/workerApi';

const STATUS_STYLE: Record<string, string> = {
  completed: 'text-emerald-600',
  cancelled: 'text-red-500',
  failed: 'text-red-500',
  in_progress: 'text-orange-500',
  on_the_way: 'text-orange-500',
  arrived: 'text-orange-500',
  assigned: 'text-orange-500',
};

export default function WorkerJobsScreen() {
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch, isFetching } = useGetWorkerOrdersQuery(page);

  const orders = data?.orders ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-navy">Jobs</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#F97316" /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshing={isFetching}
          onRefresh={() => { setPage(1); refetch(); }}
          renderItem={({ item }) => (
            <View className="bg-white border border-gray-100 rounded-2xl p-4 mb-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-bold text-navy capitalize">{String(item.service || '').replace(/_/g, ' ')}</Text>
                <Text className={`text-xs font-bold capitalize ${STATUS_STYLE[item.status] || 'text-gray-400'}`}>
                  {String(item.status || '').replace(/_/g, ' ')}
                </Text>
              </View>
              <Text className="text-xs text-gray-400 mt-1" numberOfLines={1}>{item.pickupLocation?.address}</Text>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-xs text-gray-400">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
                {item.pricing?.total ? <Text className="text-sm font-bold text-navy">₹{item.pricing.total}</Text> : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <Briefcase size={40} color="#CBD5E1" />
              <Text className="text-gray-400 mt-3">No jobs yet</Text>
            </View>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View className="flex-row items-center justify-center gap-4 mt-2">
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
                  <Text className={`text-sm font-bold ${page <= 1 ? 'text-gray-300' : 'text-orange-500'}`}>Previous</Text>
                </TouchableOpacity>
                <Text className="text-xs text-gray-400">Page {page} of {totalPages}</Text>
                <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>
                  <Text className={`text-sm font-bold ${page >= totalPages ? 'text-gray-300' : 'text-orange-500'}`}>Next</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
