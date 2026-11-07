// More on the owner's bar: who they are, every page not on the bar (shared ownerMenu, the website's menu), and sign out.
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChart3, ChevronRight, Headphones, KanbanSquare, Landmark, LogOut, Mail, MessageSquareQuote, Phone, PhoneCall, PlusCircle, Repeat, Scale, ShieldCheck, Star, Wallet, type LucideIcon } from 'lucide-react-native';
import { useProviderWorkspaceQuery, useShopMeQuery, useUpdateShopMeMutation } from '@zappy/core/api';
import { ownerMenu, STAFF_HELP_PHONE } from '@zappy/core/shared/partnerPages';
import { LanguageSwitcher } from '@zappy/ui/components/account/LanguageSwitcher';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { Button, ErrorState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { RIPPLE, errText } from '@zappy/ui/lib/feedback';
import { colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { DeleteAccountCard } from '@zappy/ui/components/account/DeleteAccountCard';
import { LegalLinks } from '@zappy/ui/components/account/LegalLinks';

const ICONS: Record<string, LucideIcon> = { MessageSquareQuote, KanbanSquare, Repeat, BarChart3, Wallet, Landmark, Star, ShieldCheck, Scale, PlusCircle, Headphones };
const HINTS: Record<string, string> = {
  orders: 'Every booking, new to finished',
  pricereq: 'Customers waiting for your price',
  plans: 'Monthly plans customers bought',
  insights: 'Jobs, ratings and arrival times',
  withdraw: 'What ZappyOne owes you, and asking for it',
  bank: 'Where we send your money',
  reviews: 'What customers said',
  kyc: 'Your documents and services',
  appeals: 'If we said no and you disagree',
  services: 'Start taking a new kind of work',
  support: 'Chat or call us',
};

export function ShopAccountPage() {
  const router = useRouter();
  const signOut = useSignOut();
  const { data, isLoading, isError, refetch } = useShopMeQuery();
  const { data: workspace } = useProviderWorkspaceQuery(undefined);
  const links = ownerMenu(workspace);
  const [save, { isLoading: saving }] = useUpdateShopMeMutation();
  const shop = data?.shop;
  const [ownerName, setOwnerName] = useState('');
  useEffect(() => { if (shop) setOwnerName(shop.ownerName || ''); }, [shop]);

  if (isError && !shop) return <View style={styles.page}><ScreenHeader title="More" safeArea /><ErrorState title="Your profile did not load" onRetry={refetch} /></View>;
  if (isLoading || !shop) return <View style={styles.page}><ScreenHeader title="More" safeArea /><LoadingState /></View>;

  async function submit() {
    try { await save({ ownerName: ownerName.trim() }).unwrap(); toast.success('Saved'); }
    catch (err) { toast.error(errText(err, 'Could not save')); }
  }

  return (
    <View style={styles.page}>
      <ScreenHeader title="More" safeArea />
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
          <View style={styles.row}><Phone size={14} color={ink[400]} /><Text variant="caption" color={ink[700]}>{shop.phone} <Text variant="caption" color={ink[400]}>(sign-in number)</Text></Text></View>
          <View style={styles.row}><Mail size={14} color={ink[400]} /><Text variant="caption" color={ink[700]}>{shop.email || 'No email yet'}</Text></View>
          <Button label="Save" onPress={submit} loading={saving} disabled={ownerName.trim().length < 2 || ownerName.trim() === (shop.ownerName || '')} fullWidth />
        </View>

        <View style={styles.cardFlat}>
          {links.map(({ key, label, icon, to }, i) => { const Icon = ICONS[icon] || ChevronRight; return (
            <Pressable key={key} onPress={() => router.push(to as never)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.link, i > 0 && styles.rule]}>
              <Icon size={18} color={ink[500]} />
              <View style={styles.flex}><Text variant="bodySmall" weight="semibold">{label}</Text>{HINTS[key] ? <Text variant="caption" color={ink[500]}>{HINTS[key]}</Text> : null}</View>
              <ChevronRight size={16} color={slate[300]} />
            </Pressable>
          ); })}
        </View>

        <View style={styles.cardFlat}>
          <Pressable onPress={() => void Linking.openURL(`tel:+91${STAFF_HELP_PHONE}`)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.link}>
            <PhoneCall size={18} color={danger[600]} />
            <Text variant="bodySmall" weight="bold" color={danger[600]} style={styles.flex}>Call ZappyOne help</Text>
          </Pressable>
        </View>
        <LanguageSwitcher />
        <LegalLinks audience="provider" />
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
