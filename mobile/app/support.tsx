import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ChevronLeft, ChevronDown, MessageCircle, Phone } from 'lucide-react-native';
import { useGetFaqsQuery } from '../services/api/contentApi';

const SUPPORT_PHONE = 'tel:+911800000000';

export default function SupportScreen() {
  const router = useRouter();
  const { data: faqs = [], isLoading } = useGetFaqsQuery();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Help &amp; Support</Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row gap-3 mt-3 mb-6">
          <TouchableOpacity
            className="flex-1 flex-row items-center justify-center gap-2 bg-primary rounded-2xl p-4"
            onPress={() => Linking.openURL(SUPPORT_PHONE)}
          >
            <Phone size={16} color="#fff" />
            <Text className="text-white font-bold text-sm">Call us</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 flex-row items-center justify-center gap-2 border border-gray-200 rounded-2xl p-4"
            onPress={() => router.push('/(tabs)/chat')}
          >
            <MessageCircle size={16} color="#2563EB" />
            <Text className="text-primary font-bold text-sm">Chat with us</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-base font-bold text-navy mb-3">Frequently asked questions</Text>
        {isLoading ? (
          <ActivityIndicator color="#2563EB" />
        ) : faqs.length === 0 ? (
          <Text className="text-gray-400">No FAQs available right now.</Text>
        ) : (
          faqs.map((faq) => {
            const open = openId === faq._id;
            return (
              <TouchableOpacity
                key={faq._id}
                className="border-b border-gray-100 py-4"
                onPress={() => setOpenId(open ? null : faq._id)}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-navy flex-1 pr-3">{faq.question}</Text>
                  <ChevronDown size={16} color="#94A3B8" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                </View>
                {open ? <Text className="text-sm text-gray-500 mt-2 leading-relaxed">{faq.answer}</Text> : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
