/**
 * Worker OTP verification.
 * ----------------------------------------------------------------------------
 * The customer OTP card, plus the two things a NEW pro must supply on the same
 * call: a name and at least one skill. Both are required by
 * `POST /auth/worker/login`, and the skill list is the live catalog rather
 * than a hardcoded one.
 *
 * Auth flow is unchanged — same mutation, same `saveSession`, same
 * `setSession({ role: 'worker' })`, same socket connect, and the worker layout
 * guard still owns the redirect.
 *
 * No auto-submit here, unlike the customer screen: a new pro has a name and
 * skills to fill in after the code, so submitting on the sixth digit would
 * fire before the form is complete.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Chip, Input, SectionTitle, Text } from '../../../components/ui';
import { AuthShell } from '../../../components/auth/AuthShell';
import { OtpBoxes } from '../../../components/auth/AuthFields';
import {
  useLoginWorkerMutation,
  useResendOtpMutation,
} from '../../../services/api/authApi';
import { useGetServicesQuery } from '../../../services/api/catalogApi';
import { getApiErrorCode, getApiErrorMessage } from '../../../services/api/apiSlice';
import { saveSession } from '../../../services/api/tokenStorage';
import { setSession } from '../../../store/authSlice';
import { useAppDispatch } from '../../../store/hooks';
import { socketClient } from '../../../services/socket/socketClient';
import { humanizeCode } from '../../../components/catalog/categoryIcons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';

const OTP_LENGTH = 6;

export default function WorkerOtpScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const { phone, isNewUser, cooldownSec } = useLocalSearchParams<{
    phone?: string;
    isNewUser?: string;
    cooldownSec?: string;
  }>();

  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(Number(cooldownSec ?? 30));

  const [loginWorker, { isLoading: verifying }] = useLoginWorkerMutation();
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();

  const isNew = isNewUser === '1';
  const { data: services = [] } = useGetServicesQuery(undefined, { skip: !isNew });

  useEffect(() => {
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleSkill = useCallback((code: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const complete = otp.length === OTP_LENGTH;
  const canVerify =
    complete && (!isNew || (name.trim().length > 0 && selectedSkills.size > 0));

  // The catalog is long; a pro picking skills at signup does not need all of
  // it on this card. The full list is editable later from their profile.
  const skillOptions = useMemo(() => services.slice(0, 12), [services]);

  const handleVerify = async () => {
    setError(null);
    if (!canVerify) return;
    try {
      const data = await loginWorker({
        phone: String(phone),
        otp,
        ...(isNew ? { name: name.trim(), skills: Array.from(selectedSkills) } : {}),
      }).unwrap();

      await saveSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        role: 'worker',
      });
      dispatch(setSession({ user: null, role: 'worker' }));
      socketClient.connect();
      // The worker layout guard owns the redirect from here.
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
    setOtp('');
    try {
      const res = await resendOtp({ phone: String(phone) }).unwrap();
      setCooldown(res.cooldownSec ?? 30);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not resend the code.'));
    }
  };

  return (
    <AuthShell title="Zappy for Professionals" subtitle="Log in to start earning">
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
          accessibilityLabel={
            cooldown > 0 ? `Resend available in ${cooldown} seconds` : 'Resend code'
          }
        >
          <Text
            variant="bodySmall"
            weight="semibold"
            color={cooldown > 0 ? colors.textMuted : colors.primary}
          >
            {resending ? 'Sending…' : cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
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

      {/* New pros only — both fields are required by the login endpoint. */}
      {isNew ? (
        <View style={styles.signupBlock}>
          <Input
            label="Your name"
            placeholder="What should customers call you?"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            maxLength={60}
          />

          <View>
            <SectionTitle>What can you do?</SectionTitle>
            <View style={styles.skillRow}>
              {skillOptions.map((service) => (
                <Chip
                  key={service.code}
                  label={service.name || humanizeCode(service.code)}
                  selected={selectedSkills.has(service.code)}
                  tone={selectedSkills.has(service.code) ? 'blue' : 'neutral'}
                  onPress={() => toggleSkill(service.code)}
                />
              ))}
            </View>
            <Text variant="caption" color={colors.textMuted} style={styles.skillHint}>
              Pick at least one. You can change these later from your profile.
            </Text>
          </View>
        </View>
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
  signupBlock: { marginTop: spacing.lg, gap: spacing.lg },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  skillHint: { marginTop: spacing.sm },
  errorCard: {
    marginTop: spacing.base,
    backgroundColor: colors.errorTint,
    borderColor: colors.errorTint,
  },
  submit: { marginTop: spacing.lg },
});
