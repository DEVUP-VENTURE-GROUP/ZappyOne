/**
 * Phone entry, for every ZappyOne app.
 * ----------------------------------------------------------------------------
 * Each app gives its own title, the account role the code is for, and where
 * its OTP screen lives; everything else (validation, rate-limit copy, the dev
 * code panel) is the same in all three apps.
 * ----------------------------------------------------------------------------
 */

import React, { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useRequestOtpMutation, type OtpRole } from '@zappy/core/api/authApi';
import { getApiErrorMessage } from '@zappy/core/api/apiSlice';
import { stashDevOtp } from '@zappy/core/lib/devOtp';
import { Button, Text } from '../components';
import { AuthShell } from './AuthShell';
import { PhoneField } from './AuthFields';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

/** Mirrors the server's `phoneSchema` (auth.routes.js): 10–15 digits. */
const PHONE_RE = /^[0-9]{10,15}$/;

export interface PhoneLoginScreenProps {
  title: string;
  subtitle: string;
  /** Which account the code is for. */
  role: OtpRole;
  /** The app's OTP route, e.g. '/(auth)/otp'. */
  otpPath: string;
  /** Extra params for the OTP screen (e.g. which kind of partner is signing in). */
  params?: Record<string, string>;
  /** Shown under the form, e.g. a switch between owner and technician. */
  footer?: ReactNode;
  /** Shown above the phone field. */
  header?: ReactNode;
}

export function PhoneLoginScreen({ title, subtitle, role, otpPath, params, footer, header }: PhoneLoginScreenProps) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [requestOtp, { isLoading }] = useRequestOtpMutation();

  const isValid = PHONE_RE.test(phone);

  const handleSendOtp = async () => {
    setFormError(null);
    if (!isValid) {
      setFormError('Enter a valid phone number.');
      return;
    }
    try {
      const res = await requestOtp({ phone, role }).unwrap();
      // Development only; a no-op in release builds (lib/devOtp).
      stashDevOtp(phone, res.otp);
      router.push({
        pathname: otpPath as never,
        params: {
          ...params,
          phone,
          isNewUser: res.isNewUser ? '1' : '0',
          cooldownSec: String(res.cooldownSec ?? 30),
        },
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setFormError(
        status === 429
          ? 'Too many attempts. Please wait a moment and try again.'
          : getApiErrorMessage(err, 'Could not send the code. Please try again.'),
      );
    }
  };

  return (
    <AuthShell title={title} subtitle={subtitle} footer={footer}>
      {header}
      <PhoneField
        value={phone}
        onChangeText={(next) => {
          setPhone(next);
          setFormError(null);
        }}
        error={formError}
        returnKeyType="go"
        onSubmitEditing={isValid ? handleSendOtp : undefined}
        autoFocus
      />

      <Button
        label="Continue"
        onPress={handleSendOtp}
        loading={isLoading}
        disabled={!isValid}
        fullWidth
        size="large"
        style={styles.submit}
      />

      <Text variant="caption" color={colors.textMuted} align="center" style={styles.legal}>
        By continuing, you agree to ZappyOne&apos;s Terms of Service and Privacy Policy.
      </Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.base },
  legal: { marginTop: spacing.lg },
});
