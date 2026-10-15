/**
 * The customer's account (the website's ProfilePage): photo, name, contact;
 * the activity menu; language; saved addresses; help; log out. Online-only
 * entries (payment methods) appear only when the server can take payments.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Calendar, ClipboardList, CreditCard, Gift, Headphones, LogOut, Package, PawPrint, Scale, Shield, ShieldCheck, ShoppingBag, Tag, TrendingUp, Wallet } from 'lucide-react-native';
import { useGetMeQuery, useGetPaymentAvailabilityQuery } from '@zappy/core/api';
import { useSignOut } from '@zappy/core/hooks/useSignOut';
import { useAppSelector } from '@zappy/core/store/hooks';
import { Button, Text } from '@zappy/ui/components';
import { LanguageSwitcher } from '@zappy/ui/components/account/LanguageSwitcher';
import { LegalLinks } from '@zappy/ui/components/account/LegalLinks';
import { MenuItem, MenuSection } from '@zappy/ui/components/account/MenuSection';
import { ProfilePhoto } from '@zappy/ui/components/account/ProfilePhoto';
import { toast } from '@zappy/ui/components/Toast';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, danger, ink, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { SavedAddresses } from './addresses/SavedAddresses';

export function ProfilePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const signOut = useSignOut();
  const profile = useAppSelector((s) => s.auth.user) as { name?: string; phone?: string; email?: string; avatar?: string } | null;
  const { data } = useGetMeQuery(undefined);
  const { data: pay } = useGetPaymentAvailabilityQuery(undefined);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const user = data?.user || profile;
  const go = (path: string) => () => router.push(path as never);

  async function logout() {
    await signOut();
    toast.success(t('profile.toast.loggedOut', 'Logged out successfully'));
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg }]}>
      <Text variant="heading3" weight="black" style={styles.center}>{t('profile.title', 'Profile')}</Text>
      <View style={styles.hero}>
        <ProfilePhoto url={user?.avatar} role="user" size={88} />
        <Text variant="heading2" weight="black">{user?.name || 'User'}</Text>
        <Text variant="bodySmall" weight="semibold" color={ink[500]}>{user?.phone || user?.email || '—'}</Text>
        <View style={styles.verified}><ShieldCheck size={14} color={success[600]} /><Text variant="caption" weight="black" color={success[700]}>{t('profile.verified', 'Verified')}</Text></View>
      </View>

      <MenuSection title={t('profile.section.activity', 'Activity')}>
        <MenuItem Icon={ClipboardList} label={t('profile.bookings', 'My Bookings')} sublabel={t('profile.bookings.sub', 'View order history')} onPress={go('/orders')} />
        <MenuItem Icon={Package} label={t('profile.myAssets', 'My Things')} sublabel={t('profile.myAssets.sub', 'Saved tanks, phones & vehicles')} onPress={go('/my-assets')} />
        <MenuItem Icon={ShoppingBag} label={t('profile.helping', 'Helping Services')} sublabel={t('profile.helping.sub', 'Shopping, pickup, returns & exchange')} onPress={go('/helping')} />
        <MenuItem Icon={PawPrint} label={t('profile.pet', 'Pet Services')} sublabel={t('profile.pet.sub', 'Grooming, boarding, walking & care')} onPress={go('/pet')} />
        <MenuItem Icon={Wallet} label={t('profile.wallet', 'Wallet')} sublabel={t('profile.wallet.sub', 'Balance & transactions')} onPress={go('/wallet')} />
        <MenuItem Icon={Gift} label={t('profile.rewards', 'Rewards')} sublabel={t('profile.rewards.sub', 'Points & scratch cards')} onPress={go('/rewards')} />
        {pay?.online ? <MenuItem Icon={CreditCard} label={t('profile.payments', 'Payment Methods')} sublabel={t('profile.payments.sub', 'Cards, UPI & more')} onPress={go('/payments')} /> : null}
        <MenuItem Icon={Bell} label={t('profile.notifications', 'Notifications')} onPress={go('/notifications')} />
        <MenuItem Icon={TrendingUp} label={t('profile.spending', 'Spending Analytics')} sublabel={t('profile.spending.sub', 'Monthly & service breakdown')} onPress={go('/spending')} />
        <MenuItem Icon={Tag} label={t('profile.promos', 'Promo Codes')} sublabel={t('profile.promos.sub', 'Browse all active offers')} onPress={go('/promos')} />
        <MenuItem Icon={Calendar} label={t('profile.scheduled', 'Your schedule')} sublabel={t('profile.scheduled.sub', 'Upcoming bookings, change times, add to calendar')} onPress={go('/scheduled')} />
      </MenuSection>

      <View style={styles.gap}>
        <Text variant="caption" weight="black" color={ink[400]} style={styles.label}>{t('profile.language', 'Language').toUpperCase()}</Text>
        <LanguageSwitcher />
      </View>

      <SavedAddresses />

      <MenuSection title={t('profile.section.help', 'Help')}>
        <MenuItem Icon={Headphones} label={t('profile.support', 'Help & Support')} sublabel={t('profile.support.sub', 'Create a support ticket')} onPress={go('/support')} />
        <MenuItem Icon={Scale} label={t('profile.disputes', 'Disputes')} sublabel={t('profile.disputes.sub', 'Raise or track an issue')} onPress={go('/disputes')} />
        <MenuItem Icon={Bell} label={t('profile.notifSettings', 'Notification Settings')} sublabel={t('profile.notifSettings.sub', 'Manage what you receive')} onPress={go('/notification-prefs')} />
        <MenuItem Icon={Shield} label={t('profile.security', 'Account Security')} sublabel={t('profile.security.sub', 'Login history & deletion')} onPress={go('/account-security')} />
      </MenuSection>
      <LegalLinks title={t('profile.section.legal', 'Legal')} />

      {confirmLogout ? (
        <View style={styles.confirm}>
          <Text variant="bodySmall" weight="semibold" color={danger[600]}>{t('profile.logoutConfirm', 'Are you sure you want to log out?')}</Text>
          <View style={styles.row}>
            <View style={styles.flex}><Button label={t('common.cancel', 'Cancel')} variant="outline" onPress={() => setConfirmLogout(false)} fullWidth /></View>
            <View style={styles.flex}><Button label={t('profile.logout', 'Log Out')} variant="danger" onPress={logout} fullWidth /></View>
          </View>
        </View>
      ) : (
        <Button label={t('profile.logout', 'Log Out')} variant="dangerGhost" icon={<LogOut size={16} color={danger[500]} />} onPress={() => setConfirmLogout(true)} fullWidth />
      )}
      <Text variant="caption" color={ink[300]} style={styles.center}>{t('profile.version', 'Zappy Platform, v1.0')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 120 },
  center: { textAlign: 'center' },
  hero: { alignItems: 'center', gap: spacing.xs },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: success[50] },
  gap: { gap: spacing.sm },
  label: { paddingHorizontal: spacing.base, letterSpacing: 1.2 },
  confirm: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: danger[100], backgroundColor: danger[50] },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
