/** One notification (the website's NotifCard): an icon for its type, unread ones tinted with a rail, the time, and a chevron when it opens something. */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertCircle, AlertTriangle, Bell, CheckCheck, CheckCircle2, ChevronRight, Clock, CreditCard, Gift, MapPin, Package, Rocket, ShieldCheck, Star, Tag, Trophy, Wallet, XCircle, Zap, type LucideIcon } from 'lucide-react-native';
import { timeAgo } from '@zappy/core/shared/workerNotifications';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export interface Notice { _id: string; type: string; title: string; body?: string; createdAt: string; readAt?: string | null; deepLink?: string }

const ICONS: Record<string, [LucideIcon, boolean]> = {
  order_placed: [Package, true], worker_assigned: [Zap, true], worker_on_the_way: [Rocket, true], worker_arriving_soon: [MapPin, true],
  worker_arrived: [CheckCheck, true], order_completed: [CheckCircle2, true], order_cancelled: [XCircle, false], order_failed: [AlertTriangle, false],
  rating_request: [Star, true], wallet_credited: [Wallet, true], cashback_received: [Gift, true], referral_reward: [Trophy, true],
  kyc_approved: [ShieldCheck, true], kyc_rejected: [AlertCircle, false], late_arrival_penalty: [Clock, false], trip_started: [Rocket, true],
  refund_processed: [CreditCard, true], promotional: [Tag, true], system_alert: [Bell, false],
};

export const NotificationCard = memo(function NotificationCard({ n, onTap }: { n: Notice; onTap: (n: Notice) => void }) {
  const [Icon, brand] = ICONS[n.type] || [Bell, true];
  const unread = !n.readAt;
  return (
    <Pressable onPress={() => onTap(n)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.card, unread && styles.unread]}>
      {unread ? <View style={styles.rail} /> : null}
      <Icon size={20} color={unread && brand ? zappy[600] : slate[400]} strokeWidth={unread ? 2.5 : 2} />
      <View style={styles.flex}>
        <View style={styles.top}>
          <Text variant="bodySmall" weight={unread ? 'semibold' : 'medium'} color={unread ? ink[900] : ink[700]} style={styles.flex}>{n.title}</Text>
          <Text variant="caption" weight={unread ? 'medium' : 'regular'} color={unread ? zappy[600] : ink[400]}>{timeAgo(n.createdAt)}</Text>
        </View>
        {n.body ? <Text variant="bodySmall" color={unread ? ink[700] : ink[500]}>{n.body}</Text> : null}
      </View>
      {n.deepLink ? <ChevronRight size={18} color={slate[300]} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.base, padding: spacing.lg, overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  unread: { borderColor: zappy[100], backgroundColor: zappy[50] },
  rail: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: zappy[600] },
  flex: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: 2 },
});
