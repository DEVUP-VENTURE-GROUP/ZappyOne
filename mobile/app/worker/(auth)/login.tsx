/**
 * Worker login — phone entry.
 * ----------------------------------------------------------------------------
 * The same shell and fields as the customer login, so a pro sees one product.
 * The only differences are the ones that are actually true: the copy names the
 * professional side, and `role: 'worker'` goes to the OTP request — which is
 * what routes the account to the worker login endpoint afterwards.
 *
 * Previously this screen was navy-on-orange with its own hand-rolled input.
 * `#F97316` is not the Zappy accent, and a separate visual language here made
 * the pro app look like a different company's product.
 * ----------------------------------------------------------------------------
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Text } from '../../../components/ui';
import { AuthShell } from '../../../components/auth/AuthShell';
import { PhoneField } from '../../../components/auth/AuthFields';
import { useRequestOtpMutation } from '../../../services/api/authApi';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';

/** Mirrors the server's `phoneSchema`: 10–15 digits, numeric. */
const PHONE_RE = /^[0-9]{10,15}$/;

export default function WorkerLoginScreen() {
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
      const res = await requestOtp({ phone, role: 'worker' }).unwrap();
      router.push({
        pathname: '/worker/(auth)/otp' as never,
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
      title="Zappy for Professionals"
      subtitle="Log in to start earning"
      footer={
        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
          accessibilityLabel="Switch to the customer app"
        >
          <Text variant="bodySmall" color={colors.textSecondary} align="center">
            Looking to book a service?{' '}
            <Text variant="bodySmall" weight="semibold" color={colors.primary}>
              Customer app
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
