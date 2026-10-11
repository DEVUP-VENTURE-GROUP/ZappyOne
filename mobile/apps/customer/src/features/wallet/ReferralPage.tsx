/**
 * Refer a friend (the website's ReferralPage): the code, what it has earned,
 * friends still to book, sharing by WhatsApp or the share sheet, and who
 * joined (names masked).
 */
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Clock, Gift, MessageCircle, Share2, Trophy, Users, Wallet } from 'lucide-react-native';
import { useGetReferralCodeQuery, useGetReferralHistoryQuery } from '@zappy/core/api';
import { WEB_ORIGIN } from '@zappy/core/config/env';
import { Skeleton, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { openLink } from '@zappy/ui/lib/openLink';
import { accent, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const NIGHT = '#030712';
const rupees = (p: number) => Math.floor((p || 0) / 100);
const mask = (n = '') => (n.length <= 2 ? n || '---' : n[0] + '*'.repeat(Math.max(n.length - 2, 3)) + n[n.length - 1]);
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const m = Math.floor(days / 30);
  return `${m} month${m > 1 ? 's' : ''} ago`;
}

export function ReferralPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetReferralCodeQuery(undefined);
  const { data: hist } = useGetReferralHistoryQuery(undefined);
  const code: string | undefined = data?.code;
  const stats = data?.stats ?? { totalReferrals: 0, pendingReferrals: 0, earnedPaise: 0 };
  const history: { _id?: string; name?: string; joinedAt?: string; earnedPaise?: number }[] = hist?.referrals ?? [];
  const link = `${WEB_ORIGIN}/signup?ref=${code ?? ''}`;
  const message = t('referral.message', 'Use my ZappyOne code {code} and get ₹50 off your first booking!').replace('{code}', code ?? '');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));

  const share = () => { if (code) Share.share({ message: `${message}\n${link}` }).catch(() => {}); };
  const whatsapp = () => { if (code) openLink(`https://wa.me/?text=${encodeURIComponent(`${message}\n${link}`)}`, 'WhatsApp could not be opened. Use Share instead.'); };

  const tiles: [React.ReactNode, string, string, string][] = [
    [<Users key="u" size={20} color={zappy[400]} />, String(stats.totalReferrals), t('referral.invited', 'INVITED'), '#fff'],
    [<Wallet key="w" size={20} color={success[500]} />, `₹${rupees(stats.earnedPaise)}`, t('referral.earned', 'EARNED'), success[500]],
    [<Clock key="c" size={20} color={accent[500]} />, String(stats.pendingReferrals), t('referral.pending', 'PENDING'), '#fff'],
  ];

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }]}>
      <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}><ArrowLeft size={20} color={slate[300]} /></Pressable>
      <View style={styles.center}>
        <Text variant="display" weight="black" color="#fff" style={styles.centerText}>{t('referral.give', 'Give ₹50.')}</Text>
        <Text variant="display" weight="black" color={zappy[400]} style={styles.centerText}>{t('referral.get', 'Get ₹100.')}</Text>
        <Text variant="bodySmall" color={slate[400]} style={styles.centerText}>{t('referral.intro', 'Invite friends to ZappyOne. They get a discount, and you earn real wallet cash when they book.')}</Text>
      </View>

      <Pressable onPress={share} accessibilityRole="button" accessibilityLabel={t('referral.shareCode', 'Share your code')} style={styles.codeCard}>
        <Gift size={24} color={accent[500]} />
        <Text variant="caption" weight="bold" color={zappy[300]} style={styles.spaced}>{t('referral.yourCode', 'YOUR CODE')}</Text>
        {isLoading || !code ? <Skeleton width={140} height={40} /> : <Text variant="display" weight="black" color="#fff" style={styles.code}>{code}</Text>}
        <Text variant="caption" weight="bold" color={slate[500]}>{t('referral.tapShare', 'TAP TO SHARE')}</Text>
      </Pressable>

      <View style={styles.tiles}>
        {tiles.map(([icon, value, label, color]) => (
          <View key={label} style={styles.tile}>{icon}<Text variant="heading2" weight="black" color={color}>{value}</Text><Text variant="caption" weight="bold" color={slate[500]}>{label}</Text></View>
        ))}
      </View>
      {stats.pendingReferrals > 0 ? (
        <View style={styles.pending}>
          <Clock size={16} color={accent[500]} />
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="bold" color="#FEF3C7">{t('referral.unlock', 'Unlock ₹{x} cash').replace('{x}', String(stats.pendingReferrals * 100))}</Text>
            <Text variant="caption" color="rgba(253,230,138,0.6)">{t('referral.unlockHint', '{n} friend(s) signed up. Cash unlocks when they book!').replace('{n}', String(stats.pendingReferrals))}</Text>
          </View>
        </View>
      ) : null}

      <Text variant="caption" weight="bold" color={slate[500]}>{t('referral.shareIt', 'SHARE IT')}</Text>
      <View style={styles.tiles}>
        <Pressable onPress={whatsapp} accessibilityRole="button" style={[styles.shareBtn, styles.wa]}><MessageCircle size={24} color="#4ADE80" /><Text variant="caption" weight="black" color="#4ADE80">WHATSAPP</Text></Pressable>
        <Pressable onPress={share} accessibilityRole="button" style={styles.shareBtn}><Share2 size={24} color={zappy[300]} /><Text variant="caption" weight="black" color={zappy[300]}>{t('referral.share', 'SHARE')}</Text></Pressable>
      </View>

      <Text variant="caption" weight="bold" color={slate[500]}>{t('referral.activity', 'ACTIVITY')}</Text>
      {!history.length ? (
        <View style={styles.empty}><Trophy size={24} color={slate[500]} /><Text variant="body" weight="black" color={slate[300]}>{t('referral.empty', 'No friends invited yet')}</Text><Text variant="caption" color={slate[500]}>{t('referral.emptyHint', 'Invite friends and the cash shows up here.')}</Text></View>
      ) : history.map((h, i) => (
        <View key={h._id ?? i} style={styles.person}>
          <View style={styles.initial}><Text variant="bodySmall" weight="black" color="#fff">{mask(h.name)[0].toUpperCase()}</Text></View>
          <View style={styles.flex}>
            <Text variant="bodySmall" weight="bold" color={slate[200]}>{mask(h.name)}</Text>
            <Text variant="caption" weight="bold" color={slate[500]}>{t('referral.joined', 'Joined')} {h.joinedAt ? ago(h.joinedAt) : 'recently'}</Text>
          </View>
          {(h.earnedPaise || 0) > 0
            ? <View style={[styles.badge, styles.earnedBadge]}><Text variant="caption" weight="black" color={success[500]}>+₹{rupees(h.earnedPaise || 0)}</Text></View>
            : <View style={[styles.badge, styles.pendingBadge]}><Text variant="caption" weight="bold" color={accent[500]}>{t('referral.pendingOne', 'Pending')}</Text></View>}
        </View>
      ))}
    </ScrollView>
  );
}

const glass = { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)' };
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: NIGHT },
  body: { gap: spacing.lg, paddingHorizontal: spacing.base },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...glass },
  center: { alignItems: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  codeCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, borderRadius: 28, borderWidth: 2, borderColor: zappy[500], backgroundColor: '#020617' },
  spaced: { letterSpacing: 3 },
  code: { letterSpacing: 4 },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, alignItems: 'center', gap: 4, padding: spacing.base, borderRadius: radius.large, ...glass },
  pending: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', backgroundColor: 'rgba(245,158,11,0.1)' },
  flex: { flex: 1 },
  shareBtn: { flex: 1, alignItems: 'center', gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, ...glass },
  wa: { borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(31,74,49,0.8)' },
  empty: { alignItems: 'center', gap: 4, padding: spacing.xl, borderRadius: 28, borderStyle: 'dashed', ...glass },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.base, borderRadius: radius.large, ...glass },
  initial: { width: 44, height: 44, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: zappy[500], backgroundColor: '#020617' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  earnedBadge: { borderColor: 'rgba(16,185,129,0.2)', backgroundColor: 'rgba(16,185,129,0.1)' },
  pendingBadge: { borderColor: 'rgba(245,158,11,0.2)', backgroundColor: 'rgba(245,158,11,0.1)' },
});
