/**
 * First-time setup after the first OTP sign-in (the websites' AccountSetup):
 * name, password and email on one screen, with the profile photo. Accounts
 * already set up but never asked for a photo see a short photo-only version once.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, MailCheck, ShieldCheck } from 'lucide-react-native';
import {
  useAccountMeQuery,
  useSetAccountNameMutation,
  useSetAccountPasswordMutation,
  useStartEmailVerificationMutation,
  useCompleteAccountSetupMutation,
  useSkipAccountPhotoMutation,
} from '@zappy/core/api';
import { passwordOk } from '@zappy/core/shared/passwordRules';
import { Button, Text, ZappyWordmark } from '..';
import { errText } from '../../lib/feedback';
import { EMAIL_RE } from '../../lib/validation';
import { colors, zappy, ink, slate, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';
import { PasswordField } from './PasswordField';
import { ProfilePhoto } from './ProfilePhoto';

export function AccountSetup({ appName, intro, onSignOut }: { appName: string; intro?: string; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const { data: st, isLoading } = useAccountMeQuery();
  const [setName] = useSetAccountNameMutation();
  const [setPassword] = useSetAccountPasswordMutation();
  const [startEmail] = useStartEmailVerificationMutation();
  const [complete] = useCompleteAccountSetupMutation();
  const [skipPhoto, { isLoading: skipping }] = useSkipAccountPhotoMutation();
  const [name, setNameV] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!st) return;
    setNameV((v) => v || st.name || '');
    setEmail((v) => v || st.pendingEmail || st.email || '');
  }, [st?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <View style={[styles.between, styles.setupHead, { paddingTop: insets.top + spacing.sm }]}>
      <ZappyWordmark size={24} />
      <Pressable onPress={onSignOut} style={styles.row} hitSlop={8}><LogOut size={15} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>Sign out</Text></Pressable>
    </View>
  );
  if (isLoading || !st) return <View style={[styles.page, styles.center]}><ActivityIndicator color={zappy[600]} /></View>;

  const shopLabel = st.role === 'shop' ? 'Shop photo' : 'Your photo';
  // Already set up; only the photo is new to them.
  if (!st.needsSetup) {
    const provider = st.role !== 'user';
    return (
      <View style={styles.page}>
        {header}
        <ScrollView contentContainerStyle={[styles.setupBody, styles.centerCol]}>
          <Text variant="heading2" weight="bold" style={styles.centerText}>{st.role === 'shop' ? 'Add a photo of your shop' : 'Add your photo'}</Text>
          <Text variant="body" color={ink[500]} style={styles.centerText}>
            {provider ? 'Customers book more readily when they can see who is coming. Your photo shows on your profile and on their booking.'
              : `It helps your technician recognise you, and makes ${appName} feel like yours.`}
          </Text>
          <View style={[styles.card, { alignSelf: 'stretch', paddingVertical: spacing.xl }]}>
            <ProfilePhoto url={st.photoUrl} role={st.role} size={112} label={shopLabel} />
          </View>
          <Button label="Skip for now" variant="ghost" loading={skipping} onPress={() => skipPhoto().unwrap().catch(() => {})} fullWidth />
        </ScrollView>
      </View>
    );
  }

  const askName = st.needs?.name;
  const askPassword = st.needs?.password;
  const emailOk = !email.trim() || EMAIL_RE.test(email.trim());
  const ready = (!askName || name.trim().length >= 2)
    && (!askPassword || (passwordOk(pw, st.phone) && pw === pw2))
    && (!st.emailRequired || (email.trim() && emailOk)) && emailOk;

  async function submit() {
    if (!ready) return;
    setSaving(true);
    try {
      if (askName) await setName({ name: name.trim() }).unwrap();
      if (askPassword) await setPassword({ newPassword: pw }).unwrap();
      const wantEmail = email.trim().toLowerCase();
      if (wantEmail && !(st.emailVerified && st.email === wantEmail) && st.pendingEmail !== wantEmail) {
        const r = await startEmail({ email: wantEmail }).unwrap();
        setSentTo(r.emailSent ? wantEmail : null);
      }
      await complete().unwrap();
      // They saw the photo offer here; it is not asked again on its own screen.
      if (st.askPhoto) await skipPhoto().unwrap().catch(() => {});
      toast.success('All set');
    } catch (err) { toast.error(errText(err, 'Could not save. Try again.')); }
    finally { setSaving(false); }
  }

  const onlyEmail = !askName && !askPassword;
  return (
    <View style={styles.page}>
      {header}
      <ScrollView contentContainerStyle={[styles.setupBody, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.iconBoxBrand}><ShieldCheck size={21} color={zappy[600]} /></View>
        <Text variant="heading2" weight="bold">{onlyEmail ? 'Add your email' : 'Finish setting up your account'}</Text>
        <Text variant="body" color={ink[500]}>
          {onlyEmail ? 'So booking confirmations, receipts and updates reach you. It takes a moment.'
            : intro || `Set a password so you can sign in to ${appName} without waiting for an OTP next time.`}
        </Text>
        <View style={[styles.card, { gap: spacing.base }]}>
          <ProfilePhoto url={st.photoUrl} role={st.role} label={shopLabel} />
          {askName ? (
            <View style={styles.gapXs}>
              <Text variant="caption" weight="semibold" color={ink[700]}>Your name</Text>
              <TextInput value={name} onChangeText={setNameV} placeholder="e.g. Ravi Kumar" placeholderTextColor={ink[400]} maxLength={60} autoComplete="name" style={styles.input} />
            </View>
          ) : null}
          <View style={styles.gapXs}>
            <Text variant="caption" weight="semibold" color={ink[700]}>Mobile number</Text>
            <View style={[styles.input, styles.readonly]}><Text variant="body" weight="semibold" color={ink[700]}>{st.phone}</Text></View>
          </View>
          {askPassword ? (
            <>
              <PasswordField label="Create a password" value={pw} onChange={setPw} showRules phone={st.phone} />
              <PasswordField label="Type it again" value={pw2} onChange={setPw2} />
              {pw2 && pw !== pw2 ? <Text variant="caption" weight="semibold" color={danger[600]}>The two passwords do not match</Text> : null}
            </>
          ) : null}
          <View style={styles.gapXs}>
            <Text variant="caption" weight="semibold" color={ink[700]}>Email {st.emailRequired ? <Text variant="caption" color={danger[600]}>*</Text> : <Text variant="caption" color={ink[400]}>(optional)</Text>}</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={ink[400]} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
            <Text variant="caption" color={ink[500]}>{st.role === 'user' ? 'Booking confirmations, receipts and updates come here. We send a link to confirm it.' : 'For statements, receipts and resetting your password. We send a link to confirm it.'}</Text>
            {!emailOk ? <Text variant="caption" weight="semibold" color={danger[600]}>That email does not look right</Text> : null}
          </View>
          <Button label="Continue" onPress={submit} loading={saving} disabled={!ready} fullWidth size="large" />
          {sentTo ? <View style={styles.row}><MailCheck size={15} color={success[700]} /><Text variant="caption" color={success[700]}>Link sent to {sentTo}</Text></View> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerCol: { alignItems: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gapXs: { gap: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  iconBoxBrand: { width: 44, height: 44, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  readonly: { justifyContent: 'center', backgroundColor: slate[50] },
  setupHead: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  setupBody: { padding: spacing.lg, gap: spacing.md },
});
