/**
 * Provider sign-in (the websites' WorkerLoginPage and ShopLoginPage): a code
 * to the phone, or a password (the shared PasswordLogin, which also resets a
 * forgotten one). Signing up is the OTP path; what a provider may do is
 * decided later, per service, by verification.
 *
 *   role    who is signing in: a customer ('user'), an individual or shop technician ('worker'), a shop owner ('shop'), or an event partner ('event_partner')
 *   header  shown above the switch, e.g. ServicePro's owner / technician choice
 *   params  passed to the OTP screen with the phone
 *   footer  under the card, e.g. the customer app's "Continue browsing"
 */
import { useState, type ReactNode } from 'react';
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

export function WorkerLoginPage({ title, subtitle, role = 'worker', header, footer, params, otpPath = '/(auth)/otp' }: {
  title: string; subtitle: string; role?: 'user' | 'worker' | 'shop' | 'event_partner'; header?: ReactNode; footer?: ReactNode; params?: Record<string, string>; otpPath?: string;
}) {
  const [mode, setMode] = useState<Mode>('otp');
  const dispatch = useDispatch();

  // Password sign-in keeps the session the way the OTP screen does; the root guard then goes home.
  async function signedIn(r: PasswordLoginResult) {
    await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken ?? '', role });
    dispatch(setSession({ user: ((r as Record<string, unknown>)[role] as never) ?? null, role }));
    socketClient.connect();
  }

  return (
    <AuthShell title={title} subtitle={subtitle} footer={footer}>
      {header}
      <View style={styles.toggle} accessibilityRole="tablist">
        {MODES.map(([m, label]) => (
          <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} style={[styles.tab, mode === m && styles.tabOn]}>
            <Text variant="bodySmall" weight="bold" color={mode === m ? zappy[600] : ink[500]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'otp' ? <PhoneOtpForm role={role} otpPath={otpPath} params={params} />
        : <PasswordLogin role={role} idLabel={role === 'worker' ? 'Worker ID, email or phone' : undefined} onSuccess={signedIn} onUseOtp={() => setMode('otp')} />}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: radius.large, backgroundColor: slate[100], marginBottom: spacing.base },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium },
  tabOn: { backgroundColor: colors.surface },
});
