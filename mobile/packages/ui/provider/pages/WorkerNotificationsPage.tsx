/**
 * A provider's notifications (the websites' WorkerNotificationsPage): tabs for
 * jobs, earnings and KYC, grouped by day, unread first in colour, mark one or
 * all as read, new ones arrive live. Types, tabs and links are the shared
 * workerNotifications logic.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Bell,
  BadgeIndianRupee,
  Briefcase,
  CheckCheck,
  ChevronRight,
  Clock,
  FileCheck,
  MessageSquare,
  Shield,
  Star,
  Trophy,
  Wallet,
  Zap,
} from 'lucide-react-native';
import { useListNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import {
  NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_TYPE,
  NOTIFICATION_TABS,
  NOTIFICATION_TAB_TYPES,
  inNotificationTab,
  emptyNotificationText,
  timeAgo,
  groupByDay,
  notificationPath,
} from '@zappy/core/shared/workerNotifications';
import type { NotificationEvent } from '@zappy/core/socket/events';
import { EmptyState, ScreenHeader, SkeletonList, Text } from '../../components';
import { toast } from '../../components/Toast';
import { RIPPLE } from '../../lib/feedback';
import { colors, zappy, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { providerPath } from '../paths';

type Item = { _id: string; type: string; title: string; body?: string; createdAt: string; readAt?: string | null; deepLink?: string; data?: Record<string, unknown> };

const TONE: Record<string, { bg: string; fg: string }> = {
  good: { bg: success[50], fg: success[700] }, bad: { bg: danger[50], fg: danger[600] }, warn: { bg: accent[50], fg: accent[700] },
  brand: { bg: zappy[50], fg: zappy[700] }, neutral: { bg: slate[100], fg: ink[700] }, hot: { bg: accent[50], fg: accent[600] },
};

const ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  kyc_approved: FileCheck, kyc_rejected: AlertTriangle, kyc_clarification: MessageSquare, order_cancelled: Briefcase,
  job_assigned: Briefcase, order_completed: Trophy, shield_payout: Shield, worker_earning: BadgeIndianRupee,
  wallet_credited: Wallet, penalty_applied: AlertTriangle, milestone_reached: Trophy, rating_received: Star,
  cancellation_fee_charged: Wallet, cancellation_fee_pending: Clock, cancellation_warning: AlertTriangle,
  system_alert: Bell, promotional: Zap,
};

export function WorkerNotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const [local, setLocal] = useState<Item[] | null>(null);
  const { data, isLoading, refetch } = useListNotificationsQuery({ page: 1, unreadOnly: false }, { refetchOnMountOrArgChange: true, pollingInterval: 30000 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const [refreshing, setRefreshing] = useState(false);

  const serverItems: Item[] = data?.items ?? [];
  useEffect(() => { setLocal(null); }, [data]);
  const items = local ?? serverItems;

  useSocketEvent('notification', (n: NotificationEvent) => {
    setLocal((prev) => {
      const base = prev ?? serverItems;
      return base.some((x) => x._id === n._id) ? base : [n as Item, ...base];
    });
    toast(n.title, { duration: 4000 });
  });

  async function read(id: string) {
    try {
      await markRead(id).unwrap();
      setLocal((prev) => (prev ?? serverItems).map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch { /* best effort */ }
  }
  async function readAll() {
    try {
      await markAll(undefined).unwrap();
      setLocal((prev) => (prev ?? serverItems).map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      toast.success('All marked as read');
      refetch();
    } catch { toast.error('Failed'); }
  }

  const filtered = items.filter((n) => inNotificationTab(n, tab));
  const sections = useMemo(() => {
    const g = groupByDay(filtered);
    return [
      { title: 'Today', data: g.today as Item[] },
      { title: 'Yesterday', data: g.yesterday as Item[] },
      { title: 'Earlier', data: g.earlier as Item[] },
    ].filter((s) => s.data.length);
  }, [filtered]);
  const unread: number = data?.unread ?? items.filter((n) => !n.readAt).length;
  const empty = emptyNotificationText(tab);

  return (
    <View style={styles.page}>
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : undefined}
        safeArea
        right={unread > 0 ? (
          <Pressable onPress={readAll} disabled={markingAll} accessibilityRole="button" style={styles.markAll} hitSlop={6}>
            <CheckCheck size={14} color={colors.primary} /><Text variant="caption" weight="semibold" color={colors.primary}>Mark all read</Text>
          </Pressable>
        ) : undefined}
      />
      <View style={styles.tabs}>
        {NOTIFICATION_TABS.map((t: { id: string; label: string }) => {
          const n = t.id === 'all' ? unread : items.filter((x) => !x.readAt && (NOTIFICATION_TAB_TYPES[t.id as keyof typeof NOTIFICATION_TAB_TYPES] || []).includes(x.type)).length;
          const on = tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
              <Text variant="caption" weight="semibold" color={on ? colors.textInverse : ink[700]}>{t.label}</Text>
              {n > 0 ? <View style={[styles.count, on && styles.countOn]}><Text variant="caption" weight="bold" color={on ? colors.primary : '#fff'} style={styles.countText}>{n}</Text></View> : null}
            </Pressable>
          );
        })}
      </View>
      {isLoading ? <View style={styles.pad}><SkeletonList count={5} /></View> : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n._id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetch(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={empty.title} message={empty.body} icon={<Bell size={28} color={ink[300]} />} />}
          renderSectionHeader={({ section }) => <Text variant="caption" weight="bold" color={ink[400]} style={styles.section}>{section.title.toUpperCase()}</Text>}
          renderItem={({ item: n }) => {
            const type = NOTIFICATION_TYPES[n.type as keyof typeof NOTIFICATION_TYPES] ?? DEFAULT_NOTIFICATION_TYPE;
            const tone = TONE[type.tone];
            const Icon = ICON[n.type] ?? Bell;
            const isUnread = !n.readAt;
            return (
              <Pressable
                onPress={() => { if (isUnread) void read(n._id); router.push(providerPath(notificationPath(n)) as never); }}
                accessibilityRole="button" accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${n.title}`}
                android_ripple={RIPPLE} style={[styles.card, isUnread ? { backgroundColor: tone.bg, borderColor: tone.bg } : null]}>
                <View style={[styles.icon, { backgroundColor: isUnread ? colors.surface : slate[100] }]}><Icon size={17} color={isUnread ? tone.fg : ink[400]} /></View>
                <View style={styles.flex}>
                  <View style={styles.between}>
                    <Text variant="bodySmall" weight="bold" color={isUnread ? ink[900] : ink[700]} style={styles.flex}>{n.title}</Text>
                    {isUnread ? <View style={styles.unreadDot} /> : null}
                    <Text variant="caption" color={ink[400]}>{timeAgo(n.createdAt)}</Text>
                  </View>
                  {n.body ? <Text variant="caption" color={colors.textSecondary} numberOfLines={2} style={styles.mtXs}>{n.body}</Text> : null}
                  <View style={[styles.typeTag, { backgroundColor: tone.bg }]}><Text variant="caption" weight="bold" color={tone.fg}>{type.label}</Text></View>
                </View>
                <ChevronRight size={14} color={ink[300]} />
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: spacing.base },
  between: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  mtXs: { marginTop: 2 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, minHeight: 36 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.button, paddingHorizontal: spacing.md, minHeight: 34, backgroundColor: slate[100] },
  tabOn: { backgroundColor: colors.primary },
  count: { backgroundColor: danger[500], borderRadius: radius.pill, paddingHorizontal: 6 },
  countOn: { backgroundColor: '#fff' },
  countText: { fontSize: 10 },
  list: { padding: spacing.base, paddingBottom: spacing.xxxl, flexGrow: 1 },
  section: { marginTop: spacing.md, marginBottom: spacing.sm, letterSpacing: 1 },
  sep: { height: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: zappy[500], marginTop: 5 },
  typeTag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
});
