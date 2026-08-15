import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { useRequestOtpMutation } from '../../services/api/authApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';

/** Mirrors the server's `phoneSchema` (auth.routes.js): 10-15 digits, numeric only. */
const PHONE_RE = /^[0-9]{10,15}$/;

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const [requestOtp, { isLoading }] = useRequestOtpMutation();

  const digits = phone.replace(/\D/g, '');
  const isValid = PHONE_RE.test(digits);

  const handleSendOtp = async () => {
    setFormError(null);
    if (!isValid) {
      setFormError('Enter a valid phone number.');
      return;
    }
    try {
      const res = await requestOtp({ phone: digits, role: 'user' }).unwrap();
      router.push({
        pathname: '/(auth)/otp',
        params: {
          phone: digits,
          isNewUser: res.isNewUser ? '1' : '0',
          cooldownSec: String(res.cooldownSec ?? 30),
        },
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 429) {
        setFormError('Too many attempts. Please wait a moment and try again.');
      } else {
        setFormError(getApiErrorMessage(err, 'Could not send OTP. Please try again.'));
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 px-6 justify-center">
          <Text className="text-3xl font-bold text-navy mb-2">Welcome to Zappy</Text>
          <Text className="text-gray-500 mb-8">Enter your phone number to continue</Text>

          <View className="flex-row items-center border border-gray-300 rounded-xl px-4 mb-2">
            <Phone size={18} color="#94A3B8" />
            <TextInput
              className="flex-1 p-4 text-lg ml-2"
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(t) => { setPhone(t); setFormError(null); }}
              maxLength={15}
              autoCapitalize="none"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
          </View>

          {formError ? <Text className="text-red-500 mb-4 text-sm">{formError}</Text> : <View className="mb-4" />}

          <TouchableOpacity
            className={`rounded-xl p-4 items-center justify-center flex-row ${isValid ? 'bg-primary' : 'bg-gray-300'}`}
            onPress={handleSendOtp}
            disabled={isLoading || !isValid}
          >
            {isLoading ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} /> : null}
            <Text className="text-white text-lg font-bold">Continue</Text>
          </TouchableOpacity>

          <Text className="text-xs text-gray-400 mt-6 text-center">
            By continuing, you agree to Zappy's Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
