import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MessageCircle, Share2, UserRound } from 'lucide-react-native';
import { useGetReferralCodeQuery, useGetReferralHistoryQuery } from '@zappy/core/api';
import { Button, Skeleton, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { openLink } from '@zappy/ui/lib/openLink';
import { accent, colors, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const rupees = (p: number) => `₹${Math.floor((p || 0) / 100).toLocaleString('en-IN')}`;
const mask = (n = '') => (n.length <= 2 ? n || 'A friend' : n[0] + '*'.repeat(Math.max(n.length - 2, 3)) + n[n.length - 1]);
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Invite friends (the website's ReferralPage): the code, the server's real reward amounts, sharing, and each invite.
export function ReferralPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetReferralCodeQuery(undefined);
  const { data: hist } = useGetReferralHistoryQuery(undefined);
  const code: string | undefined = data?.code;
  const link: string | undefined = data?.shareUrl;
  const friend: number | undefined = data?.rewards?.friendPaise;
  const you: number | undefined = data?.rewards?.youPaise;
  const stats = data?.stats ?? { totalReferrals: 0, pendingReferrals: 0, earnedPaise: 0 };
  const history: { _id?: string; name?: string; joinedAt?: string; earnedPaise?: number }[] = hist?.referrals ?? [];
  const pitch = friend ? `Use my code ${code} on ZappyOne and get ${rupees(friend)} off your first booking.` : `Use my code ${code} on ZappyOne.`;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as never));
  const share = () => { if (code) Share.share({ message: `${pitch}\n${link || ''}` }).catch(() => {}); };
  const whatsapp = () => { if (code) openLink(`https://wa.me/?text=${encodeURIComponent(`${pitch}\n${link || ''}`)}`, 'WhatsApp could not be opened. Use Share instead.'); };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}><ArrowLeft size={22} color={ink[900]} /></Pressable>
        <Text variant="bodyLarge" weight="bold">{t('referral.title', 'Invite friends')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={styles.section}>
          <Text variant="heading2" weight="extrabold" style={styles.lead}>
            {friend && you ? `Your friend gets ${rupees(friend)}. You get ${rupees(you)}.` : 'Invite friends to ZappyOne'}
          </Text>
          {friend && you ? <Text variant="body" color={ink[500]}>They get {rupees(friend)} in their wallet when they sign up with your code. You get {rupees(you)} when they finish their first booking.</Text> : null}
          <View style={styles.codeBox}>
            <Text variant="caption" weight="bold" color={ink[500]} style={styles.spaced}>YOUR CODE</Text>
            {isLoading || !code ? <Skeleton width={140} height={30} /> : <Text variant="heading1" weight="bold" style={styles.code} selectable>{code}</Text>}
          </View>
          <View style={styles.row}>
            <View style={styles.flex}><Button label="WhatsApp" icon={<MessageCircle size={17} color="#fff" />} onPress={whatsapp} disabled={!code} fullWidth /></View>
            <View style={styles.flex}><Button label="Share" variant="outline" icon={<Share2 size={17} color={ink[700]} />} onPress={share} disabled={!code} fullWidth /></View>
          </View>
        </View>

        <View style={[styles.section, styles.stats]}>
          {[[String(stats.totalReferrals), 'Signed up', ink[900]], [String(stats.pendingReferrals), 'Yet to book', ink[900]], [rupees(stats.earnedPaise), 'Earned', success[700]]].map(([v, l, c]) => (
            <View key={l} style={styles.stat}><Text variant="heading2" weight="bold" color={c}>{v}</Text><Text variant="caption" color={ink[500]}>{l}</Text></View>
          ))}
        </View>

        <View style={[styles.section, styles.last]}>
          <Text variant="heading3" weight="extrabold">Your invites</Text>
          {!history.length ? (
            <Text variant="body" color={ink[500]}>Nobody has used your code yet. Share it with a friend who needs a repair or a hand at home.</Text>
          ) : history.map((h, i) => (
            <View key={h._id ?? i} style={[styles.person, i > 0 && styles.line]}>
              <View style={styles.avatar}><UserRound size={19} color={ink[400]} /></View>
              <View style={styles.flex}>
                <Text variant="body" numberOfLines={1}>{mask(h.name)}</Text>
                <Text variant="caption" color={ink[500]}>Joined {h.joinedAt ? ago(h.joinedAt) : 'recently'}</Text>
              </View>
              {(h.earnedPaise || 0) > 0
                ? <Text variant="bodySmall" weight="bold" color={success[700]}>+{rupees(h.earnedPaise || 0)}</Text>
                : <View style={styles.pending}><Text variant="caption" weight="semibold" color={accent[700]}>Yet to book</Text></View>}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: slate[200] },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.md, padding: spacing.base, borderBottomWidth: 8, borderBottomColor: slate[100] },
  last: { borderBottomWidth: 0 },
  lead: { letterSpacing: -0.4 },
  codeBox: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderStyle: 'dashed', borderColor: slate[300], backgroundColor: slate[50] },
  spaced: { letterSpacing: 1 },
  code: { letterSpacing: 3 },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: slate[300] },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  pending: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: accent[50] },
});
