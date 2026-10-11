/**
 * The owner's own account (the website's ShopAccountPage): their name, how
 * ZappyOne reaches them, and the shortcuts to the shop's money and settings.
 * The app adds Sign out at the end. (The shop itself is "Shop & hours".)
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, Landmark, LogOut, Mail, Phone, ShieldCheck, Store, Wallet } from 'lucide-react-native';
import { useShopMeQuery, useUpdateShopMeMutation } from '@zappy/core/api';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { RIPPLE, errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { DeleteAccountCard } from '@zappy/ui/components/account/DeleteAccountCard';

const LINKS: [string, string, typeof Store, string][] = [
  ['Shop & hours', 'Name, photos, address and opening hours', Store, '/shop/profile'],
  ['Bank & UPI', 'Where your payouts go', Landmark, '/shop/bank'],
  ['Withdraw', 'What ZappyOne owes you, and asking for it', Wallet, '/shop/withdraw'],
  ['Notifications', 'Everything we have told you', Bell, '/shop/notifications'],
  ['Verification', 'Your documents and services', ShieldCheck, '/shop/kyc'],
];

export function ShopAccountPage() {
  const router = useRouter();
  const signOut = useSignOut();
  const { data, isLoading } = useShopMeQuery();
  const [save, { isLoading: saving }] = useUpdateShopMeMutation();
  const shop = data?.shop;
  const [ownerName, setOwnerName] = useState('');
  useEffect(() => { if (shop) setOwnerName(shop.ownerName || ''); }, [shop]);

  if (isLoading || !shop) return <View style={styles.page}><ScreenHeader title="Profile" safeArea /><LoadingState /></View>;

  async function submit() {
    try { await save({ ownerName: ownerName.trim() }).unwrap(); toast.success('Saved'); }
    catch (err) { toast.error(errText(err, 'Could not save')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="Profile" safeArea />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, styles.row]}>
          <View style={styles.avatar}><Text variant="heading3" weight="black" color="#fff">{(shop.ownerName || shop.businessName || 'S').trim()[0].toUpperCase()}</Text></View>
          <View style={styles.flex}>
            <Text variant="body" weight="bold" numberOfLines={1}>{shop.ownerName || 'Owner'}</Text>
            <Text variant="caption" color={ink[500]} numberOfLines={1}>{shop.businessName}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text variant="caption" weight="semibold" color={ink[700]}>Your name (as on your ID)</Text>
          <TextInput value={ownerName} onChangeText={setOwnerName} maxLength={100} autoCapitalize="words" style={styles.input} />
          <View style={styles.row}><Phone size={14} color={ink[400]} /><Text variant="caption" color={ink[700]}>{shop.phone} <Text variant="caption" color={ink[400]}>· sign-in number</Text></Text></View>
          <View style={styles.row}><Mail size={14} color={ink[400]} /><Text variant="caption" color={ink[700]}>{shop.email || 'No email yet'}</Text></View>
          <Button label="Save" onPress={submit} loading={saving} disabled={ownerName.trim().length < 2 || ownerName.trim() === (shop.ownerName || '')} fullWidth />
        </View>

        <View style={styles.cardFlat}>
          {LINKS.map(([title, hint, Icon, to], i) => (
            <Pressable key={to} onPress={() => router.push(to as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.link, i > 0 && styles.rule]}>
              <Icon size={18} color={ink[500]} />
              <View style={styles.flex}><Text variant="bodySmall" weight="semibold">{title}</Text><Text variant="caption" color={ink[500]}>{hint}</Text></View>
              <ChevronRight size={16} color={slate[300]} />
            </Pressable>
          ))}
        </View>

        <Button label="Sign out" variant="outline" icon={<LogOut size={16} color={danger[600]} />} onPress={signOut} fullWidth />
          <DeleteAccountCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { padding: spacing.base, gap: spacing.md, paddingBottom: 120 },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardFlat: { borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.button, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Figtree-Regular', color: ink[900], backgroundColor: colors.surface },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  rule: { borderTopWidth: 1, borderTopColor: slate[100] },
});
