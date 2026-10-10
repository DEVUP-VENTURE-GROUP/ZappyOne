/**
 * Sign in with a password, and recover a forgotten one (the websites'
 * PasswordLogin, used by every app): a free email link when the email is
 * verified, otherwise an SMS code entered right here with the new password.
 *
 *   role       'user' | 'worker' | 'shop' | 'event_partner'
 *   onSuccess  receives the login response ({ accessToken, refreshToken, user|worker|shop|partner })
 *   onUseOtp   switches back to OTP sign-in
 *   idLabel    what the field takes when it is more than phone or email (a Worker ID)
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MailCheck } from 'lucide-react-native';
import {
  useAccountCapabilitiesQuery, useForgotPasswordMutation, usePasswordLoginMutation, useResetPasswordMutation,
} from '@zappy/core/api';
import { passwordOk } from '@zappy/core/shared/passwordRules';
import { Button, Text } from '..';
import { toast } from '../Toast';
import { errText } from '../../lib/feedback';
import { colors, ink, success, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { PasswordField } from './PasswordField';

type Mode = 'login' | 'forgot' | 'otp-reset' | 'sent';
export interface PasswordLoginResult { accessToken: string; refreshToken?: string; [account: string]: unknown }

export function PasswordLogin({ role, onSuccess, onUseOtp, idLabel }: {
  role: 'user' | 'worker' | 'shop' | 'event_partner'; onSuccess: (r: PasswordLoginResult) => void | Promise<void>; onUseOtp?: () => void; idLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPw, setNewPw] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [login, { isLoading: signingIn }] = usePasswordLoginMutation();
  const [forgot, { isLoading: asking }] = useForgotPasswordMutation();
  const [reset, { isLoading: resetting }] = useResetPasswordMutation();
  // Email sign-in and reset links are offered only once outgoing mail is set up.
  const { data: caps } = useAccountCapabilitiesQuery();
  const email = !!caps?.email;
  const id = identifier.trim();

  async function doLogin() {
    try { await onSuccess(await login({ role, identifier: id, password }).unwrap()); }
    catch (err) { toast.error(errText(err, 'That did not go through. Check your details and try again.')); }
  }
  async function doForgot() {
    try {
      const r = await forgot({ role, identifier: id }).unwrap();
      setSentTo(r.to || null);
      setMode(r.channel === 'sms' ? 'otp-reset' : 'sent');
    } catch (err) { toast.error(errText(err, 'That did not go through. Check the number and try again.')); }
  }
  async function doOtpReset() {
    try {
      await reset({ role, identifier: id, otp, newPassword: newPw }).unwrap();
      toast.success('Password changed. Sign in with it now.');
      setPassword(''); setOtp(''); setNewPw(''); setMode('login');
    } catch (err) { toast.error(errText(err, 'That did not go through. Check the code and try again.')); }
  }

  const backToLogin = <Pressable onPress={() => setMode('login')} style={styles.link}><Text variant="caption" weight="semibold" color={ink[500]}>Back to sign in</Text></Pressable>;
  const idField = (
    <View style={styles.gapXs}>
      <Text variant="caption" weight="semibold" color={ink[700]}>{idLabel || (email ? 'Mobile number or email' : 'Mobile number')}</Text>
      <TextInput value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"
        keyboardType={email || idLabel ? 'default' : 'phone-pad'} placeholder={idLabel ? 'e.g. ravi_kumar or 98765 43210' : email ? '98765 43210 or you@example.com' : '98765 43210'}
        placeholderTextColor={ink[400]} accessibilityLabel={idLabel || 'Mobile number'} style={styles.input} />
    </View>
  );

  if (mode === 'sent') {
    return (
      <View style={styles.form}>
        <View style={styles.sent}>
          <MailCheck size={18} color={success[700]} />
          <Text variant="bodySmall" color={success[700]} style={styles.flex}>
            {sentTo ? `If an account matches, a reset link is on its way to ${sentTo}. It works for 30 minutes.` : 'If an account matches, a reset link is on its way to its email. It works for 30 minutes.'}
          </Text>
        </View>
        <Button label="Back to sign in" variant="outline" onPress={() => setMode('login')} fullWidth />
      </View>
    );
  }

  if (mode === 'otp-reset') {
    return (
      <View style={styles.form}>
        <Text variant="bodySmall" color={ink[500]}>We sent a code to {sentTo}. Enter it and choose a new password.</Text>
        <View style={styles.gapXs}>
          <Text variant="caption" weight="semibold" color={ink[700]}>Code</Text>
          <TextInput value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
            accessibilityLabel="Code" style={[styles.input, styles.code]} />
        </View>
        <PasswordField label="New password" value={newPw} onChange={setNewPw} showRules />
        <Button label="Change password" onPress={doOtpReset} loading={resetting} disabled={otp.length < 4 || !passwordOk(newPw)} fullWidth size="large" />
        {backToLogin}
      </View>
    );
  }

  if (mode === 'forgot') {
    return (
      <View style={styles.form}>
        <Text variant="bodySmall" color={ink[500]}>
          {email ? 'We send a reset link to your confirmed email, or a code to your phone if you have not confirmed an email.' : 'We send a code to your phone. Enter it with your new password.'}
        </Text>
        {idField}
        <Button label="Send reset" onPress={doForgot} loading={asking} disabled={id.length < 3} fullWidth size="large" />
        {backToLogin}
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {idField}
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <Pressable onPress={() => setMode('forgot')} hitSlop={8} style={styles.forgot}><Text variant="caption" weight="semibold" color={zappy[600]}>Forgot password?</Text></Pressable>
      <Button label="Sign in" onPress={doLogin} loading={signingIn} disabled={!id || !password} fullWidth size="large" />
      {onUseOtp ? <Pressable onPress={onUseOtp} style={styles.link}><Text variant="caption" weight="semibold" color={ink[500]}>Sign in with an OTP instead</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  gapXs: { gap: 6 },
  flex: { flex: 1 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  code: { letterSpacing: 6, fontFamily: 'Figtree-Bold', fontSize: 18 },
  forgot: { alignSelf: 'flex-end' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm },
  sent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, backgroundColor: success[50] },
});
