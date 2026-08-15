import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import { ChevronLeft } from 'lucide-react-native';
import { useLoginUserMutation, useResendOtpMutation } from '../../services/api/authApi';
import { getApiErrorCode, getApiErrorMessage } from '../../services/api/apiSlice';
import { saveSession } from '../../services/api/tokenStorage';
import { setSession } from '../../store/authSlice';
import { socketClient } from '../../services/socket/socketClient';

export default function OtpScreen() {
  const { phone, isNewUser, cooldownSec } = useLocalSearchParams<{
    phone: string;
    isNewUser?: string;
    cooldownSec?: string;
  }>();
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(Number(cooldownSec ?? 30));

  const router = useRouter();
  const dispatch = useDispatch();

  const [loginUser, { isLoading }] = useLoginUserMutation();
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const isNew = isNewUser === '1';
  const canVerify = otp.length >= 4 && (!isNew || name.trim().length > 0);

  const handleVerify = async () => {
    setError(null);
    if (!canVerify) return;
    try {
      const data = await loginUser({
        phone: String(phone),
        otp,
        ...(isNew && name.trim() ? { name: name.trim() } : {}),
      }).unwrap();

      await saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, role: 'user' });
      dispatch(setSession({ user: data.user, role: 'user' }));
      socketClient.connect();
      // Navigation to (tabs)/home is handled by RootLayout's auth guard.
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'OTP_INVALID') {
        setError('Incorrect code. Please check and try again.');
      } else if (code === 'ACCOUNT_BLOCKED') {
        setError('This account has been blocked. Contact support for help.');
      } else {
        setError(getApiErrorMessage(err, 'Verification failed. Please try again.'));
      }
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    try {
      const res = await resendOtp({ phone: String(phone) }).unwrap();
      setCooldown(res.cooldownSec ?? 30);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not resend the code.'));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="px-6 pt-4">
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
            <ChevronLeft size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-6 justify-center">
          <Text className="text-3xl font-bold text-navy mb-2">Verify your number</Text>
          <Text className="text-gray-500 mb-8">Code sent to +91 {phone}</Text>

          <TextInput
            className="border border-gray-300 rounded-xl p-4 text-2xl mb-4 text-center tracking-[10px]"
            placeholder="••••••"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(t) => { setOtp(t.replace(/\D/g, '')); setError(null); }}
            autoFocus
          />

          {isNew ? (
            <>
              <Text className="text-sm font-bold text-gray-400 uppercase mb-2">Your name</Text>
              <TextInput
                className="border border-gray-300 rounded-xl p-4 text-base mb-4"
                placeholder="What should we call you?"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </>
          ) : null}

          {error ? <Text className="text-red-500 mb-4 text-sm">{error}</Text> : null}

          <TouchableOpacity
            className={`rounded-xl p-4 items-center justify-center flex-row ${canVerify ? 'bg-primary' : 'bg-gray-300'}`}
            onPress={handleVerify}
            disabled={isLoading || !canVerify}
          >
            {isLoading ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} /> : null}
            <Text className="text-white text-lg font-bold">Verify &amp; Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || resending} className="mt-5">
            <Text className={`text-center text-sm font-semibold ${cooldown > 0 ? 'text-gray-400' : 'text-primary'}`}>
              {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
