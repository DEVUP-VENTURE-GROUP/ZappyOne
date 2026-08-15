import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft, CreditCard, Star, Trash2, Smartphone } from 'lucide-react-native';
import {
  useGetPaymentMethodsQuery, useDeletePaymentMethodMutation, useSetDefaultPaymentMethodMutation,
} from '../services/api/authApi';
import type { StoredPaymentMethod } from '../types/api';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { data: methods = [], isLoading } = useGetPaymentMethodsQuery();
  const [deleteMethod] = useDeletePaymentMethodMutation();
  const [setDefault] = useSetDefaultPaymentMethodMutation();

  const handleDelete = (m: StoredPaymentMethod) => {
    Alert.alert('Remove payment method', `Remove ${m.label || m.type}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMethod(m._id) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Payment methods</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                {item.type === 'upi' ? <Smartphone size={16} color="#2563EB" /> : <CreditCard size={16} color="#2563EB" />}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-navy capitalize">{item.label || item.type}</Text>
                  {item.isDefault ? (
                    <View className="bg-emerald-50 rounded-full px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-emerald-600">DEFAULT</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {item.type === 'upi' ? item.upiId : item.last4 ? `•••• ${item.last4}` : ''}
                </Text>
                <View className="flex-row items-center gap-4 mt-2">
                  {!item.isDefault ? (
                    <TouchableOpacity className="flex-row items-center gap-1" onPress={() => setDefault(item._id)}>
                      <Star size={12} color="#64748B" />
                      <Text className="text-xs font-semibold text-gray-500">Set default</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity className="flex-row items-center gap-1" onPress={() => handleDelete(item)}>
                    <Trash2 size={12} color="#EF4444" />
                    <Text className="text-xs font-semibold text-red-500">Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center mt-20 px-8">
              <CreditCard size={40} color="#CBD5E1" />
              <Text className="text-gray-400 mt-3 text-center">No saved payment methods. Cards and UPI IDs used at checkout are saved here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
