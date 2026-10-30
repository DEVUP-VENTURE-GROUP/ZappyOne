/**
 * OTP verification, for every ZappyOne app.
 * ----------------------------------------------------------------------------
 * Six boxes, the server's resend countdown, "Change number", and a name for a
 * new account. The app supplies `verify` (its own sign-in call); this screen
 * saves the session, connects the socket, and leaves the redirect to the
 * app's root layout guard.
 *
 * A full code submits itself for returning accounts, so SMS autofill feels
 * finished. New accounts have a name to enter first, so it waits for them.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useResendOtpMutation } from '@zappy/core/api';
import { getApiErrorCode, getApiErrorMessage } from '@zappy/core/api/apiSlice';
import { saveSession } from '@zappy/core/api/tokenStorage';
import { setSession } from '@zappy/core/store/authSlice';
import { useAppDispatch } from '@zappy/core/store/hooks';
import { socketClient } from '@zappy/core/socket/socketClient';
import { clearDevOtp, readDevOtp, stashDevOtp } from '@zappy/core/lib/devOtp';
import type { Role, UserProfile } from '@zappy/core/types/api';
import { Button, Card, Input, Text } from '../components';
import { AuthShell } from './AuthShell';
import { OtpBoxes } from './AuthFields';
import { DevOtpPanel } from './DevOtpPanel';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

const OTP_LENGTH = 6;

/** What an app's sign-in call returns. */
export interface VerifiedSession {
  accessToken: string;
  refreshToken: string;
  role: Role;
  user?: UserProfile | null;
}

export interface OtpScreenProps {
  title: string;
  subtitle: string;
  /** The app's sign-in call for this code. `name` is set for a new account. */
  // Resolves null when the app takes over after the code (ServicePro's account picker and sign-up).
  verify: (input: { phone: string; otp: string; name?: string; second?: string; params: Record<string, string | undefined> }) => Promise<VerifiedSession | null>;
  // False when new accounts are set up after the code instead of here.
  collectNewDetails?: boolean;
  /** Label and placeholder for a new account's name. */
  nameLabel?: string;
  namePlaceholder?: string;
  /** A second required detail for a new account (a new shop also gives its owner's name). */
  secondField?: { label: string; placeholder: string } | null;
}

export function OtpScreen({ title, subtitle, verify, nameLabel = 'Your name', namePlaceholder = 'What should we call you?', secondField = null, collectNewDetails = true }: OtpScreenProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const params = useLocalSearchParams<Record<string, string>>();
  const { phone, isNewUser, cooldownSec } = params;

  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(Number(cooldownSec ?? 30));
  // Development only: `readDevOtp` returns `{ kind: 'off' }` in release builds.
  const [devOtp, setDevOtp] = useState(() => readDevOtp(String(phone)));
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();

  const isNew = collectNewDetails && isNewUser === '1';
  const complete = otp.length === OTP_LENGTH;
  const canVerify = complete && (!isNew || (name.trim().length > 0 && (!secondField || second.trim().length > 0)));

  useEffect(() => {
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const handleVerify = useCallback(async () => {
    setError(null);
    if (!canVerify || verifying) return;
    setVerifying(true);
    try {
      const session = await verify({
        phone: String(phone),
        otp,
        ...(isNew && name.trim() ? { name: name.trim() } : {}),
        ...(isNew && secondField && second.trim() ? { second: second.trim() } : {}),
        params,
      });
      if (!session) return;
      await saveSession({ accessToken: session.accessToken, refreshToken: session.refreshToken, role: session.role });
      dispatch(setSession({ user: session.user ?? null, role: session.role }));
      clearDevOtp();
      socketClient.connect();
      // The root layout's guard owns the redirect from here.
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'OTP_INVALID') setError('Incorrect code. Please check and try again.');
      else if (code === 'ACCOUNT_BLOCKED') setError('This account has been blocked. Contact support for help.');
      else if (code === 'WRONG_PORTAL') setError(getApiErrorMessage(err, 'This account signs in on a different ZappyOne app.'));
      else setError(getApiErrorMessage(err, 'Verification failed. Please try again.'));
    } finally {
      setVerifying(false);
    }
  }, [canVerify, verifying, verify, phone, otp, isNew, name, second, secondField, params, dispatch]);

  // Auto-submit once per complete code, for returning accounts only.
  const submittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (isNew || !complete || verifying) return;
    if (submittedFor.current === otp) return;
    submittedFor.current = otp;
    handleVerify();
  }, [isNew, complete, otp, verifying, handleVerify]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    setOtp('');
    submittedFor.current = null;
    try {
      const res = await resendOtp({ phone: String(phone) }).unwrap();
      setCooldown(res.cooldownSec ?? 30);
      stashDevOtp(String(phone), res.otp);
      setDevOtp(readDevOtp(String(phone)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not resend the code.'));
    }
  }, [cooldown, resending, resendOtp, phone]);

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <Text variant="bodySmall" color={colors.textSecondary} align="center" style={styles.sentTo}>
        Enter the {OTP_LENGTH}-digit code sent to +91 {phone}
      </Text>

      {__DEV__ ? (
        <DevOtpPanel
          state={devOtp}
          onFill={(code) => {
            setOtp(code);
            setError(null);
          }}
        />
      ) : null}

      <OtpBoxes
        value={otp}
        onChangeText={(next) => {
          setOtp(next);
          setError(null);
        }}
        length={OTP_LENGTH}
        error={Boolean(error)}
        autoFocus
      />

      <View style={styles.metaRow}>
        <Pressable
          onPress={handleResend}
          disabled={cooldown > 0 || resending}
          accessibilityRole="button"
          accessibilityLabel={cooldown > 0 ? `Resend available in ${cooldown} seconds` : 'Resend code'}
        >
          <Text variant="bodySmall" weight="semibold" color={cooldown > 0 ? colors.textMuted : colors.primary}>
            {resending ? 'Sending…' : cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Change phone number">
          <Text variant="bodySmall" weight="semibold" color={colors.primary}>
            Change number
          </Text>
        </Pressable>
      </View>

      {isNew ? (
        <Input
          label={nameLabel}
          placeholder={namePlaceholder}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={100}
          containerStyle={styles.nameInput}
        />
      ) : null}
      {isNew && secondField ? (
        <Input
          label={secondField.label}
          placeholder={secondField.placeholder}
          value={second}
          onChangeText={setSecond}
          autoCapitalize="words"
          maxLength={100}
          containerStyle={styles.nameInput}
        />
      ) : null}

      {error ? (
        <Card variant="outline" style={styles.errorCard} padding={spacing.md}>
          <Text variant="bodySmall" color={colors.errorDark} align="center">
            {error}
          </Text>
        </Card>
      ) : null}

      <Button
        label="Verify & Continue"
        onPress={handleVerify}
        loading={verifying}
        disabled={!canVerify}
        fullWidth
        size="large"
        style={styles.submit}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sentTo: { marginBottom: spacing.lg },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  nameInput: { marginTop: spacing.lg },
  errorCard: { marginTop: spacing.base, backgroundColor: colors.errorTint, borderColor: colors.errorTint },
  submit: { marginTop: spacing.lg },
});
