import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import { User, Phone, Star, Briefcase, ShieldCheck, ShieldAlert, LogOut, ChevronRight } from 'lucide-react-native';
import { useGetWorkerMeQuery } from '../../../services/api/workerApi';
import { useLogoutMutation } from '../../../services/api/authApi';
import { getRefreshToken, clearSession } from '../../../services/api/tokenStorage';
import { socketClient } from '../../../services/socket/socketClient';
import { apiSlice } from '../../../services/api/apiSlice';
import { logout as logoutAction } from '../../../store/authSlice';

const KYC_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: 'Verified', color: '#16A34A', bg: '#ECFDF5' },
  pending_review: { label: 'Under review', color: '#B45309', bg: '#FFFBEB' },
  rejected: { label: 'Action needed', color: '#DC2626', bg: '#FEF2F2' },
  not_submitted: { label: 'Not submitted', color: '#64748B', bg: '#F8FAFC' },
  suspended: { label: 'Suspended', color: '#DC2626', bg: '#FEF2F2' },
};

export default function WorkerProfileScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { data: worker, isLoading } = useGetWorkerMeQuery();
  const [logoutMutation] = useLogoutMutation();

  const doLogout = async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await logoutMutation({ refreshToken }).unwrap().catch(() => {});
      }
    } finally {
      await clearSession();
      socketClient.destroy();
      dispatch(apiSlice.util.resetApiState());
      dispatch(logoutAction());
      router.replace('/worker/login' as never);
    }
  };

  if (isLoading || !worker) {
    return <SafeAreaView className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#F97316" /></SafeAreaView>;
  }

  const kyc = KYC_BADGE[worker.kyc.status] ?? KYC_BADGE.not_submitted;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-8">
          <View className="items-center mb-6">
            <View className="w-20 h-20 rounded-full bg-orange-500/10 items-center justify-center mb-3">
              <User size={36} color="#F97316" />
            </View>
            <Text className="text-xl font-bold text-navy">{worker.name}</Text>
            <View className="flex-row items-center gap-1 mt-1">
              <Star size={13} color="#F59E0B" fill="#F59E0B" />
              <Text className="text-gray-500 text-sm">{worker.rating.toFixed(1)} · {worker.completedJobs} jobs</Text>
            </View>
          </View>

          <View className="bg-gray-50 rounded-2xl p-4 mb-4">
            <View className="flex-row items-center gap-3 py-2">
              <Phone size={16} color="#64748B" />
              <Text className="text-navy">+91 {worker.phone}</Text>
            </View>
            <View className="flex-row items-center gap-3 py-2">
              <Briefcase size={16} color="#64748B" />
              <Text className="text-navy flex-1" numberOfLines={2}>
                {worker.skills.length ? worker.skills.map((s) => s.replace(/_/g, ' ')).join(', ') : 'No skills set'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            className="rounded-2xl p-4 mb-6 flex-row items-center gap-3"
            style={{ backgroundColor: kyc.bg }}
            onPress={() => router.push('/worker/kyc' as never)}
          >
            {worker.kyc.status === 'approved' ? <ShieldCheck size={20} color={kyc.color} /> : <ShieldAlert size={20} color={kyc.color} />}
            <View className="flex-1">
              <Text className="text-xs font-bold uppercase" style={{ color: kyc.color }}>KYC status</Text>
              <Text className="text-sm font-semibold mt-0.5" style={{ color: kyc.color }}>{kyc.label}</Text>
            </View>
            <ChevronRight size={16} color={kyc.color} />
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-row items-center justify-center gap-2 border border-red-200 rounded-xl p-4"
            onPress={() => Alert.alert('Log out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: doLogout },
            ])}
          >
            <LogOut size={18} color="#EF4444" />
            <Text className="text-red-500 font-bold">Log out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
