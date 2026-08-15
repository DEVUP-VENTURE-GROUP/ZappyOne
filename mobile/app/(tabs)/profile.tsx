import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import {
  LogOut, User, Phone, Shield, MapPin, Wallet, Gift, Bell,
  CreditCard, HelpCircle, FileText, ChevronRight,
} from 'lucide-react-native';
import type { RootState } from '../../store';
import { logout as logoutAction } from '../../store/authSlice';
import { socketClient } from '../../services/socket/socketClient';
import { apiSlice } from '../../services/api/apiSlice';
import { useLogoutMutation } from '../../services/api/authApi';
import { getRefreshToken, clearSession } from '../../services/api/tokenStorage';
import { useAppDispatch } from '../../store/hooks';

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  route: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useSelector((s: RootState) => s.auth.user);
  const role = useSelector((s: RootState) => s.auth.role);
  const [logoutMutation] = useLogoutMutation();

  const menuGroups: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Activity',
      items: [
        { icon: <Wallet size={18} color="#2563EB" />, label: 'Wallet', route: '/wallet' },
        { icon: <Gift size={18} color="#2563EB" />, label: 'Rewards', sub: 'Points & scratch cards', route: '/rewards' },
        { icon: <Bell size={18} color="#2563EB" />, label: 'Notifications', route: '/notifications' },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: <MapPin size={18} color="#2563EB" />, label: 'Saved addresses', route: '/addresses' },
        { icon: <CreditCard size={18} color="#2563EB" />, label: 'Payment methods', route: '/payment-methods' },
      ],
    },
    {
      title: 'Help',
      items: [
        { icon: <HelpCircle size={18} color="#2563EB" />, label: 'FAQs & Support', route: '/support' },
        { icon: <FileText size={18} color="#2563EB" />, label: 'Terms & Policies', route: '/policies' },
      ],
    },
  ];

  const doLogout = async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await logoutMutation({ refreshToken }).unwrap().catch(() => {
          // Best-effort server-side revoke — local session clears regardless.
        });
      }
    } finally {
      await clearSession();
      socketClient.destroy();
      dispatch(apiSlice.util.resetApiState());
      dispatch(logoutAction());
      router.replace('/(auth)/login');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-8">
          <View className="items-center mb-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-3">
              <User size={36} color="#2563EB" />
            </View>
            <Text className="text-xl font-bold text-navy">{user?.name || 'Zappy User'}</Text>
            <Text className="text-gray-500 capitalize">{role || 'customer'}</Text>
          </View>

          <View className="bg-gray-50 rounded-2xl p-4 mb-6">
            {user?.phone ? (
              <View className="flex-row items-center gap-3 py-2">
                <Phone size={16} color="#64748B" />
                <Text className="text-navy">+91 {user.phone}</Text>
              </View>
            ) : null}
            <View className="flex-row items-center gap-3 py-2">
              <Shield size={16} color="#64748B" />
              <Text className="text-navy">Verified account</Text>
            </View>
          </View>

          {menuGroups.map((group) => (
            <View key={group.title} className="mb-6">
              <Text className="text-xs font-bold text-gray-400 uppercase mb-2 px-1">{group.title}</Text>
              <View className="bg-gray-50 rounded-2xl overflow-hidden">
                {group.items.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    className={`flex-row items-center gap-3 p-4 ${i < group.items.length - 1 ? 'border-b border-white' : ''}`}
                    onPress={() => router.push(item.route as never)}
                  >
                    {item.icon}
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-navy">{item.label}</Text>
                      {item.sub ? <Text className="text-xs text-gray-400">{item.sub}</Text> : null}
                    </View>
                    <ChevronRight size={16} color="#CBD5E1" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

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
