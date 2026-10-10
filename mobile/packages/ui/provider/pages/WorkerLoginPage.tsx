/**
 * Provider sign-in (the websites' WorkerLoginPage): a code to the phone, or a
 * Worker ID / email / phone with a password (the shared PasswordLogin, which
 * also resets a forgotten password). Signing up is the OTP path; what
 * a worker may do is decided later, per service, by verification.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { saveSession } from '@zappy/core/api/tokenStorage';
import { socketClient } from '@zappy/core/socket/socketClient';
import { setSession } from '@zappy/core/store/authSlice';
import { AuthShell } from '../../auth/AuthShell';
import { PhoneOtpForm } from '../../auth/PhoneOtpForm';
import { PasswordLogin, type PasswordLoginResult } from '../../components/account/PasswordLogin';
import { Text } from '../../components';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Mode = 'otp' | 'password';
const MODES: [Mode, string][] = [['otp', 'OTP'], ['password', 'Password']];

export function WorkerLoginPage({ title, subtitle, otpPath = '/(auth)/otp' }: { title: string; subtitle: string; otpPath?: string }) {
  const [mode, setMode] = useState<Mode>('otp');
  const dispatch = useDispatch();

  // Password sign-in keeps the session the way the OTP screen does; the root guard then goes home.
  async function signedIn(r: PasswordLoginResult) {
    await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken ?? '', role: 'worker' });
    dispatch(setSession({ user: (r.worker as never) ?? null, role: 'worker' }));
    socketClient.connect();
  }

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <View style={styles.toggle} accessibilityRole="tablist">
        {MODES.map(([m, label]) => (
          <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} style={[styles.tab, mode === m && styles.tabOn]}>
            <Text variant="bodySmall" weight="bold" color={mode === m ? zappy[600] : ink[500]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'otp' ? <PhoneOtpForm role="worker" otpPath={otpPath} /> : <PasswordLogin role="worker" idLabel="Worker ID, email or phone" onSuccess={signedIn} onUseOtp={() => setMode('otp')} />}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: radius.large, backgroundColor: slate[100], marginBottom: spacing.base },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium },
  tabOn: { backgroundColor: colors.surface },
});
