import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import { Zap, ChevronRight, Bell, Wrench } from 'lucide-react-native';
import type { RootState } from '../../store';
import { useGetServicesQuery, useGetCategoriesQuery } from '../../services/api/catalogApi';
import { useListOrdersQuery } from '../../services/api/ordersApi';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../types/api';

const STATUS_LABEL: Record<string, string> = {
  created: 'Booking placed', searching: 'Finding a pro…', assigned: 'Pro assigned',
  on_the_way: 'On the way', arrived: 'Pro has arrived', in_progress: 'Service in progress',
};

function serviceLabel(code = ''): string {
  return code.replace(/_/g, ' ');
}

export default function HomeScreen() {
  const user = useSelector((state: RootState) => state.auth.user);
  const router = useRouter();

  const { data: categories = [], isLoading: catsLoading } = useGetCategoriesQuery();
  const { data: services = [] } = useGetServicesQuery();
  const { data: ordersPage, isLoading: ordersLoading } = useListOrdersQuery(1);
  const { data: notifData } = useListNotificationsQuery({ unreadOnly: true, page: 1 });

  const orders = ordersPage?.orders ?? [];
  const activeOrder = useMemo<Order | undefined>(
    () => orders.find((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status)),
    [orders],
  );
  const recentCompleted = useMemo(
    () => orders.filter((o) => o.status === 'completed').slice(0, 5),
    [orders],
  );
  const featuredServices = useMemo(
    () => [...services].filter((s) => s.isFeatured).slice(0, 8),
    [services],
  );
  const unreadCount = notifData?.unreadCount ?? notifData?.notifications?.length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-lightBg">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-5 pt-6 mb-6">
          <View>
            <Text className="text-gray-500 text-sm">What do you need done?</Text>
            <Text className="text-2xl font-bold text-navy">{user?.name || 'Hey there'}</Text>
          </View>
          <TouchableOpacity
            // `as never`: typed-routes hasn't rescanned since this screen was
            // added — the route is real (app/notifications.tsx). Regenerates
            // automatically on the next `expo start` / `eas build`.
            onPress={() => router.push('/notifications' as never)}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-gray-100"
          >
            <Bell size={20} color="#0F172A" />
            {unreadCount > 0 ? (
              <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                <Text className="text-white text-[10px] font-bold">{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Active order banner — surfaces the live job above everything else */}
        {activeOrder ? (
          <TouchableOpacity
            className="mx-5 mb-6 bg-navy rounded-3xl p-5"
            onPress={() => router.push(`/tracking/order/${activeOrder._id}`)}
          >
            <View className="flex-row items-center gap-2 mb-1">
              <View className="w-2 h-2 rounded-full bg-emerald-400" />
              <Text className="text-emerald-400 text-xs font-bold uppercase tracking-wide">Live booking</Text>
            </View>
            <Text className="text-white text-lg font-bold capitalize">{serviceLabel(activeOrder.service)}</Text>
            <View className="flex-row items-center justify-between mt-2">
              <Text className="text-slate-300 text-sm">{STATUS_LABEL[activeOrder.status] || activeOrder.status}</Text>
              <ChevronRight size={16} color="#CBD5E1" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity className="mx-5 mb-6 bg-primary p-6 rounded-3xl" onPress={() => router.push('/(tabs)/services')}>
            <Text className="text-white text-2xl font-bold mb-2">Need Help Now?</Text>
            <Text className="text-blue-100 mb-4">Book a top-rated professional in minutes.</Text>
            <View className="bg-white px-6 py-3 rounded-full self-start flex-row items-center gap-2">
              <Zap size={16} color="#2563EB" />
              <Text className="text-primary font-bold">Explore Services</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Categories */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between px-5 mb-3">
            <Text className="text-lg font-bold text-navy">Categories</Text>
          </View>
          {catsLoading ? (
            <ActivityIndicator color="#2563EB" style={{ marginLeft: 20 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  className="items-center w-20"
                  onPress={() => router.push({ pathname: '/(tabs)/services', params: { category: c.key } })}
                >
                  <View
                    className="w-16 h-16 rounded-2xl items-center justify-center mb-1.5"
                    style={{ backgroundColor: c.theme?.soft || '#EEF2FF' }}
                  >
                    <Wrench size={22} color={c.theme?.accent || '#2563EB'} />
                  </View>
                  <Text className="text-xs font-semibold text-navy text-center" numberOfLines={1}>
                    {c.customerLabel}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Featured services */}
        {featuredServices.length > 0 ? (
          <View className="mb-6">
            <Text className="text-lg font-bold text-navy px-5 mb-3">Popular services</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {featuredServices.map((s) => {
                const price = s.servicePricePaise
                  ? Math.round(s.servicePricePaise / 100)
                  : Math.round((s.priceRangeMinPaise || 0) / 100);
                return (
                  <TouchableOpacity
                    key={s.code}
                    className="w-36 bg-white rounded-2xl border border-gray-100 p-3"
                    // `as never`: see the /notifications note above — route is real.
                    onPress={() => router.push(`/service/${s.code}` as never)}
                  >
                    <View className="w-full h-20 rounded-xl bg-gray-50 items-center justify-center mb-2 overflow-hidden">
                      {s.imageUrl ? (
                        <Image source={{ uri: s.imageUrl }} className="w-full h-full" resizeMode="cover" />
                      ) : (
                        <Wrench size={24} color="#CBD5E1" />
                      )}
                    </View>
                    <Text className="text-sm font-bold text-navy capitalize" numberOfLines={1}>{s.name}</Text>
                    <Text className="text-xs font-semibold text-primary mt-0.5">
                      {price > 0 ? `From ₹${price}` : 'Get quote'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Recent bookings */}
        <View className="px-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-navy">Recent bookings</Text>
            {orders.length > 0 ? (
              <TouchableOpacity onPress={() => router.push('/(tabs)/bookings')}>
                <Text className="text-primary text-xs font-bold">See all</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {ordersLoading ? (
            <ActivityIndicator color="#2563EB" />
          ) : recentCompleted.length ? (
            recentCompleted.map((order) => (
              <TouchableOpacity
                key={order._id}
                className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100"
                onPress={() => router.push(`/book/${order.service}`)}
              >
                <View className="flex-row justify-between mb-1">
                  <Text className="font-bold text-base capitalize">{serviceLabel(order.service)}</Text>
                  <Text className="text-primary font-bold">₹{order.pricing?.total ?? '—'}</Text>
                </View>
                <Text className="text-gray-400 text-xs">
                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text className="text-gray-400">No bookings yet — try a service above.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
