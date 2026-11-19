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
import { Chip, Text } from '../../components';
import { colors, ink, slate, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Mode = 'otp' | 'password';
const MODES: [Mode, string][] = [['otp', 'OTP'], ['password', 'Password']];

type Role = 'user' | 'worker' | 'shop' | 'event_partner';
// The account each role's password sign-in returns (server auth.controller ACCOUNT_KEY).
const ACCOUNT_KEY: Record<Role, string> = { user: 'user', worker: 'worker', shop: 'shop', event_partner: 'partner' };

export function WorkerLoginPage({ title, subtitle, role = 'worker', passwordRoles, header, footer, params, otpPath = '/(auth)/otp' }: {
  title: string; subtitle: string; role?: Role; header?: ReactNode; footer?: ReactNode; params?: Record<string, string>; otpPath?: string;
  /** Passwords belong to one account each: an app serving several kinds (ServicePro) lets the person say which. */
  passwordRoles?: [Role, string][];
}) {
  const [mode, setMode] = useState<Mode>('otp');
  const [pwRole, setPwRole] = useState<Role>(passwordRoles?.[0]?.[0] ?? role);
  const dispatch = useDispatch();

  // Password sign-in keeps the session the way the OTP screen does; the root guard then goes home.
  async function signedIn(r: PasswordLoginResult) {
    await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken ?? '', role: pwRole });
    dispatch(setSession({ user: ((r as Record<string, unknown>)[ACCOUNT_KEY[pwRole]] as never) ?? null, role: pwRole }));
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
        : (
          <>
            {passwordRoles ? (
              <View style={styles.roles} accessibilityRole="radiogroup">
                {passwordRoles.map(([r, label]) => <Chip key={r} label={label} selected={pwRole === r} onPress={() => setPwRole(r)} />)}
              </View>
            ) : null}
            <PasswordLogin key={pwRole} role={pwRole} idLabel={pwRole === 'worker' ? 'Worker ID, email or phone' : undefined} onSuccess={signedIn} onUseOtp={() => setMode('otp')} />
          </>
        )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: radius.large, backgroundColor: slate[100], marginBottom: spacing.base },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium },
  tabOn: { backgroundColor: colors.surface },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.base },
});
