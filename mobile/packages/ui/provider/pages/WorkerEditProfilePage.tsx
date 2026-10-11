/**
 * The provider's profile and settings (the websites' WorkerEditProfilePage):
 * photo, name, bio, verified services, login & security, Worker ID, and links
 * to every money and growth screen. The app adds Sign out at the end.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  BarChart2,
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  GraduationCap,
  KeyRound,
  LogOut,
  Shield,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  User,
} from 'lucide-react-native';
import {
  useGetWorkerMeQuery,
  useUpdateWorkerProfileMutation,
  useSetWorkerCredentialsMutation,
  useAccountMeQuery,
  useProviderOnboardingStatusQuery,
} from '@zappy/core/api';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { Button, LoadingState, ScreenHeader, Text } from '../../components';
import { toast } from '../../components/Toast';
import { LoginSecurityCard } from '../../components/account/LoginSecurityCard';
import { ProfilePhoto } from '../../components/account/ProfilePhoto';
import { errText, RIPPLE } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { providerPath } from '../paths';
import { DeleteAccountCard } from '../../components/account/DeleteAccountCard';
import { LegalLinks } from '../../components/account/LegalLinks';

const NAV_SECTIONS = [
  { title: 'Earnings & finance', items: [
    { to: '/worker/earnings', Icon: BarChart2, label: 'Earnings breakdown', desc: 'Per-job breakdown & payslip', bg: zappy[50], fg: zappy[600] },
    { to: '/worker/goals', Icon: Target, label: 'Earnings goals', desc: 'Daily & weekly targets', bg: '#F5F3FF', fg: '#7C3AED' },
    { to: '/worker/bank', Icon: Building2, label: 'Bank & UPI accounts', desc: 'Manage payment destinations', bg: '#EFF6FF', fg: '#2563EB' },
    { to: '/worker/withdraw', Icon: CreditCard, label: 'Withdraw earnings', desc: 'Transfer to bank or UPI', bg: success[50], fg: success[600] },
  ] },
  { title: 'Services & growth', items: [
    { to: '/provider/onboarding', Icon: ShieldCheck, label: 'Services & verification', desc: 'What you are approved to work on', bg: success[50], fg: success[600] },
    { to: '/worker/training', Icon: GraduationCap, label: 'Training & certification', desc: 'Video courses + quiz certs', bg: '#FFF1F2', fg: '#E11D48' },
    { to: '/worker/reviews', Icon: Star, label: 'My reviews', desc: 'What customers said about you', bg: '#FFF7ED', fg: '#EA580C' },
    { to: '/worker/appeals', Icon: AlertCircle, label: 'Appeals', desc: 'Contest penalties', bg: '#FFF7ED', fg: '#EA580C' },
  ] },
  { title: 'Insights', items: [
    { to: '/worker/goals', Icon: TrendingUp, label: 'Zone benchmark', desc: 'See how you rank nearby', bg: '#ECFEFF', fg: '#0891B2' },
    { to: '/provider/documents', Icon: Shield, label: 'My documents', desc: 'Verification & compliance', bg: slate[100], fg: ink[700] },
  ] },
];

export function WorkerEditProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const { data: meData, isLoading } = useGetWorkerMeQuery();
  const { data: account } = useAccountMeQuery();
  const { data: providerStatus } = useProviderOnboardingStatusQuery();
  const [updateProfile, { isLoading: isSaving }] = useUpdateWorkerProfileMutation();
  const [setCredentials, { isLoading: savingCreds }] = useSetWorkerCredentialsMutation();
  const me = meData?.worker;
  const verified: { _id: string; lineCode: string; line?: { name?: string } }[] = (providerStatus?.enrolments ?? []).filter((e: { status: string }) => e.status === 'approved');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (me && !loaded) { setName(me.name ?? ''); setBio(me.bio ?? ''); setLoaded(true); }
  }, [me, loaded]);

  async function save() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const body: Record<string, string> = {};
    if (name.trim() !== (me?.name ?? '')) body.name = name.trim();
    if (bio.trim() !== (me?.bio ?? '')) body.bio = bio.trim();
    if (!Object.keys(body).length) { toast.success('No changes'); return; }
    try { await updateProfile(body).unwrap(); toast.success('Profile updated'); }
    catch (err) { toast.error(errText(err, 'Failed to save. Try again.')); }
  }
  async function saveCredentials() {
    try {
      const r = await setCredentials({ username: username.trim() }).unwrap();
      toast.success(`Worker ID saved: ${r.username}. Sign in with it and your password.`);
      setUsername('');
    } catch (err) { toast.error(errText(err, 'Could not save your Worker ID')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Profile & settings" safeArea right={<Button label={isSaving ? 'Saving…' : 'Save'} size="small" onPress={save} loading={isSaving} disabled={!loaded} />} />
      {isLoading || !loaded ? <LoadingState /> : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, styles.row]}>
            <ProfilePhoto url={account?.photoUrl} role="worker" size={64} />
            <View style={styles.flex}>
              <Text variant="body" weight="bold" numberOfLines={1}>{me?.name || 'Your name'}</Text>
              <View style={styles.row}><Star size={12} color={accent[500]} fill={accent[500]} /><Text variant="caption" color={ink[500]}>{me?.rating?.toFixed(1) ?? '—'} · {me?.completedJobs ?? 0} jobs completed</Text></View>
            </View>
            {me?.trust?.isVerified ? <View style={[styles.tag, { backgroundColor: success[100] }]}><Shield size={9} color={success[700]} /><Text variant="caption" weight="bold" color={success[700]}>Verified</Text></View> : null}
          </View>

          <View style={styles.card}>
            <View style={styles.row}><User size={15} color={zappy[500]} /><Text variant="bodySmall" weight="semibold">Display name</Text></View>
            <TextInput value={name} onChangeText={setName} maxLength={100} placeholder="Your full name" placeholderTextColor={ink[400]} style={styles.input} />
          </View>

          <View style={styles.card}>
            <View style={styles.row}><FileText size={15} color={zappy[500]} /><Text variant="bodySmall" weight="semibold" style={styles.flex}>Bio</Text><Text variant="caption" color={ink[400]}>{bio.length}/300</Text></View>
            <TextInput value={bio} onChangeText={setBio} maxLength={300} multiline placeholder="Describe your experience. Shown to customers when they view your profile."
              placeholderTextColor={ink[400]} style={[styles.input, styles.area]} />
          </View>

          <View style={styles.card}>
            <View style={styles.row}><ShieldCheck size={15} color={success[500]} /><Text variant="bodySmall" weight="semibold">Services you're verified for</Text></View>
            {verified.length ? (
              <View style={styles.wrap}>
                {verified.map((e) => <View key={e._id} style={[styles.tag, { backgroundColor: success[50] }]}><ShieldCheck size={11} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>{e.line?.name || e.lineCode}</Text></View>)}
              </View>
            ) : <Text variant="caption" color={ink[500]}>Nothing yet. Choose what you work on and get verified to start receiving jobs.</Text>}
            <Pressable onPress={() => router.push('/provider/onboarding' as never)} style={styles.row} hitSlop={6}>
              <Text variant="caption" weight="semibold" color={zappy[600]}>Manage services & verification</Text><ChevronRight size={12} color={zappy[600]} />
            </Pressable>
          </View>

          <LoginSecurityCard />

          {/* Worker ID: an easy name to sign in with instead of a phone number. */}
          <View style={styles.card}>
            <View style={styles.row}><KeyRound size={15} color={zappy[600]} /><Text variant="body" weight="bold">Worker ID</Text></View>
            <Text variant="caption" color={ink[500]}>{me?.username ? `Yours is ${me.username}. Sign in with it and your password.` : 'Optional: a short ID to sign in with instead of your phone number.'}</Text>
            <View style={styles.row}>
              <TextInput value={username} onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={30} autoCapitalize="none"
                placeholder={me?.username || 'e.g. ravi_kumar'} placeholderTextColor={ink[400]} accessibilityLabel="Worker ID" style={[styles.input, styles.flex]} />
              <Button label="Save" onPress={saveCredentials} loading={savingCreds} disabled={username.trim().length < 3} />
            </View>
          </View>

          {NAV_SECTIONS.map((section) => (
            <View key={section.title} style={styles.gapXs}>
              <Text variant="caption" weight="bold" color={ink[500]}>{section.title.toUpperCase()}</Text>
              <View style={[styles.card, { padding: 0, gap: 0 }]}>
                {section.items.map(({ to, Icon, label, desc, bg, fg }, i) => (
                  <Pressable key={to + label} onPress={() => router.push(providerPath(to) as never)} android_ripple={RIPPLE} style={[styles.navRow, i > 0 && styles.ruleTop]}>
                    <View style={[styles.iconBox, { backgroundColor: bg }]}><Icon size={16} color={fg} /></View>
                    <View style={styles.flex}><Text variant="bodySmall" weight="semibold">{label}</Text><Text variant="caption" color={ink[500]} numberOfLines={1}>{desc}</Text></View>
                    <ChevronRight size={14} color={slate[300]} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <LegalLinks audience="provider" />
          <Button label="Sign out" variant="outline" icon={<LogOut size={16} color={danger[600]} />} onPress={signOut} fullWidth />
          <DeleteAccountCard />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gapXs: { gap: 6 },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  area: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  iconBox: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  ruleTop: { borderTopWidth: 1, borderTopColor: slate[100] },
});
