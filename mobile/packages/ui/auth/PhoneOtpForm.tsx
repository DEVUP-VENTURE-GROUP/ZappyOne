/**
 * The phone number form that asks for a sign-in code, shared by every app's
 * sign-in screen. Validation, rate-limit copy and the dev code panel are the
 * same everywhere; each app says which account the code is for and where its
 * OTP screen lives.
 */
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useRequestOtpMutation } from '@zappy/core/api';
import type { OtpRole } from '@zappy/core/types/api';
import { getApiErrorMessage } from '@zappy/core/api/apiSlice';
import { stashDevOtp } from '@zappy/core/lib/devOtp';
import { Button, Text } from '../components';
import { PhoneField } from './AuthFields';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

/** Mirrors the server's `phoneSchema` (auth.routes.js): 10–15 digits. */
const PHONE_RE = /^[0-9]{10,15}$/;

export interface PhoneOtpFormProps {
  /** Which account the code is for. */
  role: OtpRole;
  /** The app's OTP route, e.g. '/(auth)/otp'. */
  otpPath: string;
  /** Extra params for the OTP screen (e.g. which kind of partner is signing in). */
  params?: Record<string, string>;
}

export function PhoneOtpForm({ role, otpPath, params }: PhoneOtpFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [requestOtp, { isLoading }] = useRequestOtpMutation();
  const isValid = PHONE_RE.test(phone);

  const handleSendOtp = async () => {
    setFormError(null);
    if (!isValid) { setFormError('Enter a valid phone number.'); return; }
    try {
      const res = await requestOtp({ phone, role }).unwrap();
      // Development only; a no-op in release builds (lib/devOtp).
      stashDevOtp(phone, res.otp);
      router.push({
        pathname: otpPath as never,
        params: { ...params, phone, isNewUser: res.isNewUser ? '1' : '0', cooldownSec: String(res.cooldownSec ?? 30) },
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setFormError(status === 429 ? 'Too many attempts. Please wait a moment and try again.' : getApiErrorMessage(err, 'Could not send the code. Please try again.'));
    }
  };

  return (
    <>
      <PhoneField value={phone} onChangeText={(next) => { setPhone(next); setFormError(null); }} error={formError}
        returnKeyType="go" onSubmitEditing={isValid ? handleSendOtp : undefined} autoFocus />
      <Button label="Continue" onPress={handleSendOtp} loading={isLoading} disabled={!isValid} fullWidth size="large" style={styles.submit} />
      <Text variant="caption" color={colors.textMuted} align="center" style={styles.legal}>
        By continuing, you agree to ZappyOne&apos;s{' '}
        <Text variant="caption" weight="semibold" color={colors.primary} onPress={() => router.push(`/policy/${role === 'user' ? 'terms' : 'partner-terms'}` as never)}>{role === 'user' ? 'Terms of Use' : 'Partner Terms'}</Text>
        {' '}and{' '}
        <Text variant="caption" weight="semibold" color={colors.primary} onPress={() => router.push('/policy/privacy-policy' as never)}>Privacy Policy</Text>.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.base },
  legal: { marginTop: spacing.lg },
});
