import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Phone, Wrench } from 'lucide-react-native';
import { useRequestOtpMutation } from '../../../services/api/authApi';
import { getApiErrorMessage } from '../../../services/api/apiSlice';

const PHONE_RE = /^[0-9]{10,15}$/;

export default function WorkerLoginScreen() {
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const [requestOtp, { isLoading }] = useRequestOtpMutation();

  const digits = phone.replace(/\D/g, '');
  const isValid = PHONE_RE.test(digits);

  const handleSendOtp = async () => {
    setFormError(null);
    if (!isValid) { setFormError('Enter a valid phone number.'); return; }
    try {
      const res = await requestOtp({ phone: digits, role: 'worker' }).unwrap();
      router.push({
        pathname: '/worker/(auth)/otp' as never,
        params: {
          phone: digits,
          isNewUser: res.isNewUser ? '1' : '0',
          cooldownSec: String(res.cooldownSec ?? 30),
        },
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setFormError(status === 429 ? 'Too many attempts. Please wait a moment.' : getApiErrorMessage(err, 'Could not send OTP.'));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-navy">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 px-6 justify-center">
          <View className="w-14 h-14 rounded-2xl bg-orange-500/15 items-center justify-center mb-5">
            <Wrench size={26} color="#F97316" />
          </View>
          <Text className="text-3xl font-bold text-white mb-2">Zappy Pro</Text>
          <Text className="text-slate-400 mb-8">Log in to start earning</Text>

          <View className="flex-row items-center border border-slate-700 rounded-xl px-4 mb-2">
            <Phone size={18} color="#64748B" />
            <TextInput
              className="flex-1 p-4 text-lg ml-2 text-white"
              placeholder="10-digit mobile number"
              placeholderTextColor="#64748B"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(t) => { setPhone(t); setFormError(null); }}
              maxLength={15}
              autoComplete="tel"
            />
          </View>

          {formError ? <Text className="text-red-400 mb-4 text-sm">{formError}</Text> : <View className="mb-4" />}

          <TouchableOpacity
            className={`rounded-xl p-4 items-center justify-center flex-row ${isValid ? 'bg-orange-500' : 'bg-slate-700'}`}
            onPress={handleSendOtp}
            disabled={isLoading || !isValid}
          >
            {isLoading ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} /> : null}
            <Text className="text-white text-lg font-bold">Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity className="mt-6" onPress={() => router.replace('/(auth)/login')}>
            <Text className="text-center text-slate-400 text-sm">
              Looking to book a service? <Text className="text-orange-400 font-semibold">Customer app</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
