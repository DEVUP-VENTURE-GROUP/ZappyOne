import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { TrendingUp, Wallet, Banknote, CreditCard } from 'lucide-react-native';
import { useGetEarningsQuery } from '../../../services/api/workerApi';

const RANGES: { key: 'today' | 'week' | 'month'; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

export default function WorkerEarningsScreen() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const { data: earnings, isLoading } = useGetEarningsQuery(range);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-navy">Earnings</Text>
      </View>

      <View className="flex-row gap-2 px-5 mb-4">
        {RANGES.map((r) => {
          const on = range === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRange(r.key)}
              className={`flex-1 rounded-full py-2 items-center border ${on ? 'bg-navy border-navy' : 'border-gray-200'}`}
            >
              <Text className={`text-xs font-bold ${on ? 'text-white' : 'text-navy'}`}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading || !earnings ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#F97316" /></View>
      ) : (
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="bg-navy rounded-3xl p-6 mb-5">
            <View className="flex-row items-center gap-2 mb-2">
              <TrendingUp size={16} color="#93C5FD" />
              <Text className="text-blue-200 text-xs font-bold uppercase">Net earnings</Text>
            </View>
            <Text className="text-white text-4xl font-extrabold">₹{earnings.earningsRupees.toLocaleString('en-IN')}</Text>
            <Text className="text-slate-400 text-xs mt-2">{earnings.jobs} job{earnings.jobs === 1 ? '' : 's'} completed</Text>
          </View>

          <View className="flex-row gap-3 mb-5">
            <View className="flex-1 bg-gray-50 rounded-2xl p-4">
              <Wallet size={16} color="#64748B" />
              <Text className="text-lg font-extrabold text-navy mt-2">₹{earnings.avgEarningPerJobRupees}</Text>
              <Text className="text-[11px] text-gray-400 font-semibold">Avg per job</Text>
            </View>
            <View className="flex-1 bg-gray-50 rounded-2xl p-4">
              <Banknote size={16} color="#64748B" />
              <Text className="text-lg font-extrabold text-navy mt-2">{earnings.cashJobs}</Text>
              <Text className="text-[11px] text-gray-400 font-semibold">Cash jobs</Text>
            </View>
            <View className="flex-1 bg-gray-50 rounded-2xl p-4">
              <CreditCard size={16} color="#64748B" />
              <Text className="text-lg font-extrabold text-navy mt-2">{earnings.onlineJobs}</Text>
              <Text className="text-[11px] text-gray-400 font-semibold">Online jobs</Text>
            </View>
          </View>

          {earnings.dailyBreakdown.length > 0 ? (
            <View>
              <Text className="text-base font-bold text-navy mb-3">Last 30 days</Text>
              {[...earnings.dailyBreakdown].reverse().map((d) => (
                <View key={d.date} className="flex-row items-center justify-between py-2.5 border-b border-gray-50">
                  <Text className="text-sm text-gray-600">
                    {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-xs text-gray-400">{d.jobs} job{d.jobs === 1 ? '' : 's'}</Text>
                    <Text className="text-sm font-bold text-navy">₹{Math.round(d.earningsPaise / 100)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-gray-400 text-center mt-8">No completed jobs in the last 30 days</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
