import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ChevronLeft, CheckCircle2, Clock, ListChecks, Wrench, ShieldCheck } from 'lucide-react-native';
import { useGetServicesQuery } from '../../services/api/catalogApi';

function formatRupees(paise = 0): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function formatDuration(minutes?: number): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function ServiceDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { data: services = [], isLoading } = useGetServicesQuery();

  const service = useMemo(() => services.find((s) => s.code === code), [services, code]);

  if (isLoading) {
    return <SafeAreaView className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#2563EB" /></SafeAreaView>;
  }

  if (!service) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
        <Text className="text-gray-400 text-center">This service isn't available right now.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary font-semibold">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const checklist = service.checklist ?? [];
  const guidelines = service.guidelines ?? [];
  const duration = formatDuration(service.estimatedDurationMinutes);
  const hasFixedPrice = (service.servicePricePaise ?? 0) > 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="w-full h-48 bg-gray-50 items-center justify-center">
          {service.coverImage || service.imageUrl ? (
            <Image source={{ uri: service.coverImage || service.imageUrl }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <Wrench size={40} color="#CBD5E1" />
          )}
        </View>

        <View className="px-5 pt-5">
          <Text className="text-2xl font-bold text-navy capitalize">{service.name}</Text>
          {service.shortDescription ? (
            <Text className="text-gray-500 mt-1">{service.shortDescription}</Text>
          ) : null}

          <View className="flex-row items-center gap-4 mt-4">
            {duration ? (
              <View className="flex-row items-center gap-1.5">
                <Clock size={14} color="#64748B" />
                <Text className="text-xs text-gray-500 font-semibold">{duration}</Text>
              </View>
            ) : null}
            {checklist.length > 0 ? (
              <View className="flex-row items-center gap-1.5">
                <ListChecks size={14} color="#64748B" />
                <Text className="text-xs text-gray-500 font-semibold">{checklist.length}-point checklist</Text>
              </View>
            ) : null}
            <View className="flex-row items-center gap-1.5">
              <ShieldCheck size={14} color="#64748B" />
              <Text className="text-xs text-gray-500 font-semibold">Verified pros</Text>
            </View>
          </View>

          {/* Price */}
          <View className="bg-primary/5 rounded-2xl p-4 mt-5">
            <Text className="text-xs font-bold text-gray-400 uppercase mb-1">Price</Text>
            <Text className="text-2xl font-extrabold text-navy">
              {hasFixedPrice
                ? formatRupees(service.servicePricePaise!)
                : service.priceRangeMinPaise > 0
                  ? `From ${formatRupees(service.priceRangeMinPaise)}`
                  : 'Get a quote'}
            </Text>
            <Text className="text-xs text-gray-400 mt-1">Includes travel + platform fee, shown at checkout</Text>
          </View>

          {service.description ? (
            <View className="mt-5">
              <Text className="text-base font-bold text-navy mb-2">About this service</Text>
              <Text className="text-gray-500 leading-relaxed">{service.description}</Text>
            </View>
          ) : null}

          {checklist.length > 0 ? (
            <View className="mt-5">
              <Text className="text-base font-bold text-navy mb-2">What's included</Text>
              {checklist.map((item, i) => (
                <View key={i} className="flex-row items-start gap-2 mb-2">
                  <CheckCircle2 size={16} color="#16A34A" style={{ marginTop: 2 }} />
                  <Text className="text-gray-600 flex-1">{item.item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {guidelines.length > 0 ? (
            <View className="mt-5">
              <Text className="text-base font-bold text-navy mb-2">Good to know</Text>
              {guidelines.map((line, i) => (
                <Text key={i} className="text-gray-500 mb-1.5">• {line}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-3 bg-white border-t border-gray-100">
        <TouchableOpacity
          className="bg-primary rounded-2xl p-4 items-center"
          onPress={() => router.push(`/book/${service.code}`)}
        >
          <Text className="text-white text-lg font-bold">Book now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
