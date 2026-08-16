/**
 * OTP verification.
 * ----------------------------------------------------------------------------
 * Matches the website's card: six boxed digits, a resend countdown on the left
 * and "Change number" on the right, then Verify & Continue.
 *
 * The auth flow is unchanged — same `POST /auth/user/login`, same session
 * persistence through `saveSession`, same `setSession` dispatch, same socket
 * connect, and the root layout's guard still owns the redirect afterwards.
 *
 * ── THE COUNTDOWN IS THE SERVER'S ──────────────────────────────────────────
 * `cooldownSec` comes from the OTP request and is refreshed from each resend
 * response. It is not a number this screen picked. Resend stays disabled until
 * it reaches zero, so the button can't fire a request the server would reject.
 *
 * ── AUTO-SUBMIT ────────────────────────────────────────────────────────────
 * A full code submits itself for returning users, which is what makes SMS
 * autofill feel finished rather than "now press a button". New users have a
 * name to enter first, so it waits for them.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Input, Text } from '../../components/ui';
import { AuthShell } from '../../components/auth/AuthShell';
import { OtpBoxes } from '../../components/auth/AuthFields';
import { useLoginUserMutation, useResendOtpMutation } from '../../services/api/authApi';
import { getApiErrorCode, getApiErrorMessage } from '../../services/api/apiSlice';
import { saveSession } from '../../services/api/tokenStorage';
import { setSession } from '../../store/authSlice';
import { useAppDispatch } from '../../store/hooks';
import { socketClient } from '../../services/socket/socketClient';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const { phone, isNewUser, cooldownSec } = useLocalSearchParams<{
    phone?: string;
    isNewUser?: string;
    cooldownSec?: string;
  }>();

  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(Number(cooldownSec ?? 30));

  const [loginUser, { isLoading: verifying }] = useLoginUserMutation();
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();

  const isNew = isNewUser === '1';
  const complete = otp.length === OTP_LENGTH;
  const canVerify = complete && (!isNew || name.trim().length > 0);

  // One ticker for the resend cooldown.
  useEffect(() => {
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const handleVerify = useCallback(async () => {
    setError(null);
    if (!canVerify) return;
    try {
      const data = await loginUser({
        phone: String(phone),
        otp,
        ...(isNew && name.trim() ? { name: name.trim() } : {}),
      }).unwrap();

      await saveSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        role: 'user',
      });
      dispatch(setSession({ user: data.user, role: 'user' }));
      socketClient.connect();
      // The root layout's auth guard owns the redirect from here.
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
  }, [canVerify, loginUser, phone, otp, isNew, name, dispatch]);

  // Auto-submit once the code is complete — but only for returning users, and
  // only once per code, so a failed attempt doesn't retry itself in a loop.
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
      // The server decides the next window, not this screen.
      setCooldown(res.cooldownSec ?? 30);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not resend the code.'));
    }
  }, [cooldown, resending, resendOtp, phone]);

  return (
    <AuthShell title="Welcome to Zappy" subtitle="Log in to connect with us!">
      <Text variant="bodySmall" color={colors.textSecondary} align="center" style={styles.sentTo}>
        Enter the {OTP_LENGTH}-digit code sent to +91 {phone}
      </Text>

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
          <Text
            variant="bodySmall"
            weight="semibold"
            color={cooldown > 0 ? colors.textMuted : colors.primary}
          >
            {resending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend OTP in ${cooldown}s`
                : 'Resend OTP'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Change phone number"
        >
          <Text variant="bodySmall" weight="semibold" color={colors.primary}>
            Change number
          </Text>
        </Pressable>
      </View>

      {/* New accounts need a name; the server takes it on the same call. */}
      {isNew ? (
        <Input
          label="Your name"
          placeholder="What should we call you?"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={60}
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  nameInput: { marginTop: spacing.lg },
  errorCard: {
    marginTop: spacing.base,
    backgroundColor: colors.errorTint,
    borderColor: colors.errorTint,
  },
  submit: { marginTop: spacing.lg },
});
