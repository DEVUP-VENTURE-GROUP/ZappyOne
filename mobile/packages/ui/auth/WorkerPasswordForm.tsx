/**
 * Sign in with a Worker ID, email or phone and a password (the websites'
 * WorkerLoginPage, password tab). "Forgot password?" sends a reset code to
 * the account's phone, as the website does.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { Eye, EyeOff, Lock, User } from 'lucide-react-native';
import { useForgotWorkerPasswordMutation, useLoginWorkerPasswordMutation } from '@zappy/core/api';
import { getApiErrorMessage } from '@zappy/core/api/apiSlice';
import { saveSession } from '@zappy/core/api/tokenStorage';
import { socketClient } from '@zappy/core/socket/socketClient';
import { setSession } from '@zappy/core/store/authSlice';
import { Button, Text } from '../components';
import { toast } from '../components/Toast';
import { colors, danger, ink, zappy } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export function WorkerPasswordForm() {
  const dispatch = useDispatch();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, { isLoading }] = useLoginWorkerPasswordMutation();
  const [forgot, { isLoading: sendingReset }] = useForgotWorkerPasswordMutation();

  async function signIn() {
    setError(null);
    if (!identifier.trim() || !password) { setError('Enter your Worker ID / email / phone and password'); return; }
    try {
      const r = await login({ identifier: identifier.trim(), password }).unwrap();
      await saveSession({ accessToken: r.accessToken, refreshToken: r.refreshToken, role: 'worker' });
      dispatch(setSession({ user: r.worker ?? null, role: 'worker' }));
      socketClient.connect();
      // The root layout's guard owns the redirect from here.
    } catch (err) { setError(getApiErrorMessage(err, 'Invalid credentials')); }
  }

  async function forgotPassword() {
    if (!identifier.trim()) { setError('Enter your Worker ID / email / phone first'); return; }
    try {
      await forgot({ identifier: identifier.trim() }).unwrap();
      toast.success('If the account exists, a reset code has been sent to its phone.');
    } catch (err) { toast.error(getApiErrorMessage(err, 'Could not start password reset')); }
  }

  return (
    <View style={styles.form}>
      <Text variant="caption" weight="black" color={ink[500]}>WORKER ID / EMAIL / PHONE</Text>
      <View style={styles.field}>
        <User size={18} color={zappy[500]} />
        <TextInput value={identifier} onChangeText={(v) => { setIdentifier(v); setError(null); }} placeholder="Enter your Worker ID, email or phone" placeholderTextColor={ink[400]}
          autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" autoFocus style={styles.input} accessibilityLabel="Worker ID, email or phone" />
      </View>
      <Text variant="caption" weight="black" color={ink[500]}>PASSWORD</Text>
      <View style={styles.field}>
        <Lock size={18} color={zappy[500]} />
        <TextInput value={password} onChangeText={(v) => { setPassword(v); setError(null); }} secureTextEntry={!show} placeholder="Enter your password" placeholderTextColor={ink[400]}
          autoCapitalize="none" autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={signIn} style={styles.input} accessibilityLabel="Password" />
        <Pressable onPress={() => setShow((s) => !s)} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={18} color={ink[400]} /> : <Eye size={18} color={ink[400]} />}
        </Pressable>
      </View>
      {error ? <Text variant="caption" weight="semibold" color={danger[600]}>{error}</Text> : null}
      <Pressable onPress={forgotPassword} disabled={sendingReset} hitSlop={8} style={styles.forgot}>
        <Text variant="caption" weight="bold" color={zappy[600]}>{sendingReset ? 'Sending…' : 'Forgot password?'}</Text>
      </Pressable>
      <Button label="Sign in" onPress={signIn} loading={isLoading} fullWidth size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.base, borderRadius: radius.large, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, fontSize: 15, fontFamily: 'Figtree-SemiBold', color: ink[900], paddingVertical: spacing.sm },
  forgot: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
});
