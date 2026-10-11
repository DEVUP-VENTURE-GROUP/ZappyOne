/**
 * The business customers see, where it works, and the way to everything else
 * (the events website's ProfilePage and menu): earnings, reviews,
 * verification, sign-in security. The app adds Sign out at the end.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, LogOut, ShieldCheck, Star, Wallet, type LucideIcon } from 'lucide-react-native';
import { useUpdatePartnerMeMutation } from '@zappy/core/api';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { Button, Input, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { DeleteAccountCard } from '@zappy/ui/components/account/DeleteAccountCard';
import { LegalLinks } from '@zappy/ui/components/account/LegalLinks';
import { LoginSecurityCard } from '@zappy/ui/components/account/LoginSecurityCard';
import { ProfilePhoto } from '@zappy/ui/components/account/ProfilePhoto';
import { RIPPLE, errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PlacePicker } from '../PlacePicker';
import { usePartner } from '../usePartner';

const LINKS: [string, string, LucideIcon, string][] = [
  ['Earnings', 'What you have earned, event by event', Wallet, '/partner/earnings'],
  ['Reviews', 'What customers said', Star, '/partner/reviews'],
  ['Verification', 'Your documents and where they stand', ShieldCheck, '/partner/kyc'],
  ['Notifications', 'Everything we have told you', Bell, '/partner/notifications'],
];

export function PartnerAccountPage() {
  const router = useRouter();
  const signOut = useSignOut();
  const { partner, verified } = usePartner();
  const [updateMe, { isLoading: saving }] = useUpdatePartnerMeMutation();
  const [form, setForm] = useState<{ businessName: string; ownerName: string; bio: string; yearsExperience: string; cities: string[]; serviceRadiusKm: string } | null>(null);

  useEffect(() => {
    if (!partner) return;
    setForm({
      businessName: partner.businessName || '', ownerName: partner.ownerName || '', bio: partner.bio || '',
      yearsExperience: partner.yearsExperience != null ? String(partner.yearsExperience) : '', cities: partner.cities || [],
      serviceRadiusKm: String(partner.serviceRadiusKm || 30),
    });
  }, [partner?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!partner || !form) return <View style={styles.page}><ScreenHeader title="Profile" safeArea /><LoadingState /></View>;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    if (form.businessName.trim().length < 2) { toast.error('Add your business name'); return; }
    if (!form.cities.length) { toast.error('Choose at least one place you serve'); return; }
    try {
      await updateMe({
        businessName: form.businessName.trim(), ownerName: form.ownerName.trim(), bio: form.bio.trim(),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
        cities: form.cities, serviceRadiusKm: Number(form.serviceRadiusKm) || 30,
      }).unwrap();
      toast.success('Profile saved');
    } catch (err) { toast.error(errText(err, 'Could not save')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Profile" safeArea />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, styles.row]}>
          <ProfilePhoto url={partner.profilePhotoUrl} role="event_partner" size={64} label="Business photo" />
          <View style={styles.flex}>
            <Text variant="body" weight="bold" numberOfLines={1}>{form.businessName || 'Your business'}</Text>
            <Text variant="caption" color={ink[500]}>{partner.phone}</Text>
            <Text variant="caption" weight="semibold" color={verified ? '#15803D' : ink[500]}>{verified ? 'Verified partner' : 'Verification pending'}</Text>
          </View>
        </View>

        <View style={styles.flat}>
          {LINKS.map(([title, hint, Icon, to], i) => (
            <Pressable key={to} onPress={() => router.push(to as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.link, i > 0 && styles.rule]}>
              <Icon size={18} color={ink[500]} />
              <View style={styles.flex}><Text variant="bodySmall" weight="semibold">{title}</Text><Text variant="caption" color={ink[500]}>{hint}</Text></View>
              <ChevronRight size={16} color={slate[300]} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text variant="body" weight="bold">What customers see</Text>
          <Input label="Business name" value={form.businessName} onChangeText={(v) => set('businessName', v)} maxLength={150} />
          <Input label="Your name" value={form.ownerName} onChangeText={(v) => set('ownerName', v)} maxLength={100} autoCapitalize="words" />
          <View style={styles.row}>
            <View style={styles.flex}><Input label="Years of experience" value={form.yearsExperience} onChangeText={(v) => set('yearsExperience', v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /></View>
            <View style={styles.flex}><Input label="Travel up to (km)" value={form.serviceRadiusKm} onChangeText={(v) => set('serviceRadiusKm', v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" /></View>
          </View>
          <Input label="About your business" value={form.bio} onChangeText={(v) => set('bio', v)} maxLength={600} multiline multilineHeight={88} helper="Your style, the events you do best." />
          <Text variant="bodySmall" weight="semibold">Where you work<Text variant="bodySmall" color={danger[500]}> *</Text></Text>
          <PlacePicker value={form.cities} onChange={(v) => set('cities', v)} />
          <Button label="Save profile" loading={saving} onPress={save} fullWidth />
        </View>

        <LoginSecurityCard />
        <LegalLinks audience="provider" />
        <Button label="Sign out" variant="outline" icon={<LogOut size={16} color={danger[600]} />} onPress={signOut} fullWidth />
        <DeleteAccountCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base, paddingBottom: spacing.xxl },
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  flat: { overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
});
