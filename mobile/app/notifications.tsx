import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft, Bell, CheckCheck } from 'lucide-react-native';
import {
  useListNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation,
} from '../services/api/notificationsApi';
import { useSocket } from '../hooks/useSocket';
import type { AppNotification } from '../types/api';

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useListNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const socketClient = useSocket();

  // `items`, not `notifications` — see NotificationsEnvelope.
  const notifications = data?.items ?? [];

  // New notifications push live over the personal room — refresh the list.
  useEffect(() => {
    const handler = () => refetch();
    socketClient.on('notification', handler);
    return () => socketClient.off('notification', handler);
  }, [socketClient, refetch]);

  const handlePress = (n: AppNotification) => {
    if (!n.readAt) markRead(n._id);
    if (n.deepLink) {
      // In-app links are always relative paths (e.g. /tracking/order/<id>).
      router.push(n.deepLink as never);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
            <ChevronLeft size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-navy ml-3">Notifications</Text>
        </View>
        {notifications.some((n) => !n.readAt) ? (
          <TouchableOpacity className="flex-row items-center gap-1" onPress={() => markAllRead()} disabled={markingAll}>
            <CheckCheck size={14} color="#2563EB" />
            <Text className="text-xs font-bold text-primary">Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#2563EB" /></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              className={`rounded-2xl p-4 mb-2 border ${item.readAt ? 'bg-white border-gray-100' : 'bg-primary/5 border-primary/20'}`}
              onPress={() => handlePress(item)}
            >
              <View className="flex-row items-start justify-between">
                <Text className="text-sm font-bold text-navy flex-1 pr-3">{item.title}</Text>
                {!item.readAt ? <View className="w-2 h-2 rounded-full bg-primary mt-1.5" /> : null}
              </View>
              <Text className="text-xs text-gray-500 mt-1">{item.body}</Text>
              <Text className="text-[10px] text-gray-400 mt-2">
                {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <Bell size={40} color="#CBD5E1" />
              <Text className="text-gray-400 mt-3">You're all caught up</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
