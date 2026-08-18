/**
 * Login — phone entry.
 * ----------------------------------------------------------------------------
 * Matches the website's sign-in card. The auth contract is untouched: the same
 * `POST /auth/otp/request`, the same national-number format, and the same
 * hand-off of `cooldownSec` / `isNewUser` to the OTP screen.
 *
 * Validation mirrors the server's own `phoneSchema` (10–15 digits, numeric).
 * The Continue button stays disabled until that passes rather than letting a
 * request fail — the rule is known on the client, so there is no reason to
 * spend a round trip discovering it.
 * ----------------------------------------------------------------------------
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Text } from '../../components/ui';
import { AuthShell } from '../../components/auth/AuthShell';
import { PhoneField } from '../../components/auth/AuthFields';
import { useRequestOtpMutation } from '../../services/api/authApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { stashDevOtp } from '../../lib/devOtp';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

/** Mirrors the server's `phoneSchema` (auth.routes.js): 10–15 digits, numeric. */
const PHONE_RE = /^[0-9]{10,15}$/;

export default function LoginScreen() {
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
      const res = await requestOtp({ phone, role: 'user' }).unwrap();
      // Dev only, and a no-op in release builds. The server already returns
      // `otp` outside production; this carries it in memory to the next screen
      // rather than through router params, which would be persisted state.
      stashDevOtp(phone, res.otp);
      router.push({
        pathname: '/(auth)/otp',
        params: {
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
    <AuthShell
      title="Welcome to Zappy"
      subtitle="Log in to connect with us!"
      footer={
        <Pressable
          onPress={() => router.push('/worker/login')}
          accessibilityRole="button"
          accessibilityLabel="Log in as a professional"
        >
          <Text variant="bodySmall" color={colors.textSecondary} align="center">
            Looking to earn with Zappy?{' '}
            <Text variant="bodySmall" weight="semibold" color={colors.primary}>
              Log in as a professional
            </Text>
          </Text>
        </Pressable>
      }
    >
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
        By continuing, you agree to Zappy&apos;s Terms of Service and Privacy Policy.
      </Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.base },
  legal: { marginTop: spacing.lg },
});
