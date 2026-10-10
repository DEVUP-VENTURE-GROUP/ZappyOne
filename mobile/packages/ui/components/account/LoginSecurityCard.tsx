/**
 * Password and email after setup: change the password, add or change the email,
 * resend its link (the websites' LoginSecurityCard).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CheckCircle2, Clock, KeyRound, Mail } from 'lucide-react-native';
import { useAccountMeQuery, useSetAccountPasswordMutation, useStartEmailVerificationMutation } from '@zappy/core/api';
import { passwordOk } from '@zappy/core/shared/passwordRules';
import { Button, Text } from '..';
import { errText } from '../../lib/feedback';
import { EMAIL_RE } from '../../lib/validation';
import { colors, zappy, ink, slate, success, accent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';
import { PasswordField } from './PasswordField';

export function LoginSecurityCard() {
  const { data: st } = useAccountMeQuery();
  const [setPassword, { isLoading: savingPw }] = useSetAccountPasswordMutation();
  const [startEmail, { isLoading: sending }] = useStartEmailVerificationMutation();
  const [open, setOpen] = useState<'password' | 'email' | null>(null);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [email, setEmail] = useState('');
  if (!st) return null;

  async function savePw() {
    try {
      await setPassword({ currentPassword: cur, newPassword: pw }).unwrap();
      toast.success(st.hasPassword ? 'Password changed' : 'Password set');
      setCur(''); setPw(''); setOpen(null);
    } catch (err) { toast.error(errText(err, 'Could not save')); }
  }
  async function sendEmail() {
    try {
      const r = await startEmail({ email: (email || st.pendingEmail || st.email || '').trim() }).unwrap();
      toast.success(r.emailSent ? 'Confirmation link sent. Check your inbox.' : 'Saved. The confirmation email could not be sent right now.');
      setEmail(''); setOpen(null);
    } catch (err) { toast.error(errText(err, 'Could not send')); }
  }

  const waiting = st.pendingEmail || (!st.emailVerified && st.email);
  const emailLine = waiting ? { Icon: Clock, tone: accent[700], text: `${st.pendingEmail || st.email}: waiting for confirmation` }
    : st.email ? { Icon: CheckCircle2, tone: success[700], text: `${st.email}: confirmed` } : { Icon: Mail, tone: ink[500], text: 'No email added' };

  return (
    <View style={styles.card0}>
      <Text variant="body" weight="bold" style={styles.cardHead}>Login & security</Text>
      <View style={[styles.cardPad, st.mailConfigured && styles.ruleBottom]}>
        <View style={styles.row}>
          <View style={styles.iconBox}><KeyRound size={16} color={ink[700]} /></View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="semibold">Password</Text>
            <Text variant="caption" color={ink[500]}>{st.hasPassword ? `Set${st.passwordSetAt ? ` on ${new Date(st.passwordSetAt).toLocaleDateString('en-IN')}` : ''}` : 'Not set: you sign in with an OTP each time'}</Text>
          </View>
          <Button label={st.hasPassword ? 'Change' : 'Set'} size="small" variant="outline" onPress={() => setOpen(open === 'password' ? null : 'password')} />
        </View>
        {open === 'password' ? (
          <View style={styles.gap}>
            {st.hasPassword ? <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" /> : null}
            <PasswordField label="New password" value={pw} onChange={setPw} showRules phone={st.phone} />
            <Button label="Save password" onPress={savePw} loading={savingPw} disabled={!passwordOk(pw, st.phone) || (st.hasPassword && !cur)} fullWidth />
          </View>
        ) : null}
      </View>
      {/* The email row appears once outgoing mail is set up; until then it could not be confirmed. */}
      {st.mailConfigured ? (
        <View style={styles.cardPad}>
          <View style={styles.row}>
            <View style={styles.iconBox}><Mail size={16} color={ink[700]} /></View>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold">Email</Text>
              <View style={styles.row}><emailLine.Icon size={12} color={emailLine.tone} /><Text variant="caption" color={emailLine.tone} numberOfLines={1} style={styles.flex}>{emailLine.text}</Text></View>
            </View>
            <Button label={st.email || st.pendingEmail ? 'Change' : 'Add'} size="small" variant="outline" onPress={() => setOpen(open === 'email' ? null : 'email')} />
          </View>
          {waiting && open !== 'email' ? <Pressable onPress={sendEmail} disabled={sending}><Text variant="caption" weight="semibold" color={zappy[600]}>Resend confirmation link</Text></Pressable> : null}
          {open === 'email' ? (
            <View style={styles.gap}>
              <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={ink[400]} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
              <Button label="Send confirmation link" onPress={sendEmail} loading={sending} disabled={!EMAIL_RE.test(email.trim())} fullWidth />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gap: { gap: spacing.md, marginTop: spacing.md },
  card0: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border },
  cardHead: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  cardPad: { padding: spacing.base, gap: spacing.sm },
  ruleBottom: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBox: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
});
