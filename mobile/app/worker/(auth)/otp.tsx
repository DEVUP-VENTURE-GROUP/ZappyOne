import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDispatch } from 'react-redux';
import { ChevronLeft, Check } from 'lucide-react-native';
import { useLoginWorkerMutation, useResendOtpMutation } from '../../../services/api/authApi';
import { useGetServicesQuery, useGetCategoriesQuery } from '../../../services/api/catalogApi';
import { getApiErrorCode, getApiErrorMessage } from '../../../services/api/apiSlice';
import { saveSession } from '../../../services/api/tokenStorage';
import { setSession } from '../../../store/authSlice';
import { socketClient } from '../../../services/socket/socketClient';

export default function WorkerOtpScreen() {
  const { phone, isNewUser, cooldownSec } = useLocalSearchParams<{
    phone: string; isNewUser?: string; cooldownSec?: string;
  }>();
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(Number(cooldownSec ?? 30));

  const router = useRouter();
  const dispatch = useDispatch();
  const [loginWorker, { isLoading }] = useLoginWorkerMutation();
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isNew = isNewUser === '1';
  const { data: services = [] } = useGetServicesQuery(undefined, { skip: !isNew });
  const { data: categories = [] } = useGetCategoriesQuery(undefined, { skip: !isNew });

  useEffect(() => {
    timerRef.current = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const toggleSkill = (code: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const canVerify = otp.length >= 4 && (!isNew || (name.trim().length > 0 && selectedSkills.size > 0));

  const handleVerify = async () => {
    setError(null);
    if (!canVerify) return;
    try {
      const data = await loginWorker({
        phone: String(phone),
        otp,
        ...(isNew ? { name: name.trim(), skills: Array.from(selectedSkills) } : {}),
      }).unwrap();

      await saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, role: 'worker' });
      dispatch(setSession({ user: null, role: 'worker' }));
      socketClient.connect();
      // Navigation to /worker/dashboard is handled by worker/_layout.tsx's guard.
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'OTP_INVALID') setError('Incorrect code. Please check and try again.');
      else if (code === 'ACCOUNT_BLOCKED') setError('This account has been blocked. Contact support for help.');
      else if (code === 'WORKER_ONBOARDING_REQUIRED') setError('Enter your name and pick at least one skill.');
      else setError(getApiErrorMessage(err, 'Verification failed. Please try again.'));
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
    <SafeAreaView className="flex-1 bg-navy">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="px-6 pt-4">
          <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-white/10 items-center justify-center">
            <ChevronLeft size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40, justifyContent: isNew ? undefined : 'center', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Text className="text-3xl font-bold text-white mb-2 mt-4">Verify your number</Text>
          <Text className="text-slate-400 mb-8">Code sent to +91 {phone}</Text>

          <TextInput
            className="border border-slate-700 rounded-xl p-4 text-2xl mb-4 text-center tracking-[10px] text-white"
            placeholder="••••••"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(t) => { setOtp(t.replace(/\D/g, '')); setError(null); }}
            autoFocus
          />

          {isNew ? (
            <>
              <Text className="text-xs font-bold text-slate-400 uppercase mb-2 mt-2">Your name</Text>
              <TextInput
                className="border border-slate-700 rounded-xl p-4 text-base mb-5 text-white"
                placeholder="Full name"
                placeholderTextColor="#64748B"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

              <Text className="text-xs font-bold text-slate-400 uppercase mb-3">What can you do?</Text>
              <Text className="text-xs text-slate-500 mb-3">Pick every service you're able to take on — this decides which jobs you'll be offered.</Text>
              {categories.map((cat) => {
                const catServices = services.filter((s) => s.category === cat.key);
                if (catServices.length === 0) return null;
                return (
                  <View key={cat._id} className="mb-4">
                    <Text className="text-sm font-bold text-slate-300 mb-2">{cat.customerLabel}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {catServices.map((s) => {
                        const on = selectedSkills.has(s.code);
                        return (
                          <TouchableOpacity
                            key={s.code}
                            onPress={() => toggleSkill(s.code)}
                            className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${on ? 'bg-orange-500 border-orange-500' : 'border-slate-700'}`}
                          >
                            {on ? <Check size={12} color="#fff" /> : null}
                            <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{s.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}

          {error ? <Text className="text-red-400 mb-4 text-sm">{error}</Text> : null}

          <TouchableOpacity
            className={`rounded-xl p-4 items-center justify-center flex-row mt-2 ${canVerify ? 'bg-orange-500' : 'bg-slate-700'}`}
            onPress={handleVerify}
            disabled={isLoading || !canVerify}
          >
            {isLoading ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} /> : null}
            <Text className="text-white text-lg font-bold">{isNew ? 'Create account' : 'Verify & Continue'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || resending} className="mt-5">
            <Text className={`text-center text-sm font-semibold ${cooldown > 0 ? 'text-slate-500' : 'text-orange-400'}`}>
              {resending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
