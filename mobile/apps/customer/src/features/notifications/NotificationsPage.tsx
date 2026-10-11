/**
 * The customer's notifications (the website's NotificationsPage): Today,
 * Yesterday, Earlier; unread tinted; tap to mark read and open it; mark all;
 * settings one tap away; new ones arrive live.
 */
import { useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, CheckCheck, Settings } from 'lucide-react-native';
import { useListNotificationsQuery, useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation } from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { groupByDay } from '@zappy/core/shared/workerNotifications';
import { Button, EmptyState, ErrorState, ScreenHeader, Skeleton, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { resolveRoute } from '../../../routes';
import { NotificationCard, type Notice } from './NotificationCard';

export function NotificationsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, isFetching, isError, refetch } = useListNotificationsQuery({ page: 1, unreadOnly: false });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: marking }] = useMarkAllNotificationsReadMutation();
  useSocketEvent('notification', () => refetch());

  const items: Notice[] = data?.items || [];
  const unread: number = data?.unread ?? 0;
  const sections = useMemo(() => {
    const g = groupByDay(items) as Record<'today' | 'yesterday' | 'earlier', Notice[]>;
    return ([['today', t('date.today', 'Today')], ['yesterday', t('date.yesterday', 'Yesterday')], ['earlier', t('notif.earlier', 'Earlier')]] as const)
      .filter(([k]) => g[k].length).map(([k, title]) => ({ title, data: g[k] }));
  }, [items, t]);

  async function tap(n: Notice) {
    if (!n.readAt) markRead(n._id).unwrap().catch(() => {});
    const to = n.deepLink ? resolveRoute(n.deepLink) : null;
    if (to) router.push(to as never);
  }
  async function readAll() {
    try { await markAll(undefined).unwrap(); toast.success(t('notif.allRead', 'All marked as read')); }
    catch { toast.error(t('notif.allReadFailed', 'Could not mark all as read. Try again.')); }
  }
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('notif.title', 'Notifications')} onBack={back}
        right={<Pressable onPress={() => router.push('/notification-prefs' as never)} accessibilityRole="button" accessibilityLabel={t('profile.notifSettings', 'Notification Settings')} hitSlop={8} style={styles.gear}><Settings size={18} color={ink[500]} /></Pressable>} />
      {isError ? <ErrorState onRetry={refetch} /> : isLoading ? (
        <View style={styles.body}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} borderRadius={radius.large} />)}</View>
      ) : (
        <SectionList sections={sections} keyExtractor={(n) => n._id} stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={zappy[500]} />}
          ListHeaderComponent={(
            <View style={styles.intro}>
              <Text variant="bodySmall" color={ink[500]} style={styles.flex}>{t('notif.subtitle', 'Stay updated with your bookings, payments, account activity, and service updates.')}</Text>
              {unread > 0 ? <Button label={t('notif.markAll', 'Mark all as read')} size="small" variant="outline" loading={marking} icon={<CheckCheck size={15} color={ink[700]} />} onPress={readAll} /> : null}
            </View>
          )}
          ListEmptyComponent={<EmptyState icon={<Bell size={28} color={slate[400]} />} title={t('notif.empty', "You're all caught up.")} message={t('notif.emptyHint', 'New notifications will appear here when there are booking updates, payments, offers, or account activity.')} />}
          renderSectionHeader={({ section }) => <Text variant="caption" weight="semibold" color={ink[400]} style={styles.section}>{section.title.toUpperCase()}</Text>}
          renderItem={({ item }) => <NotificationCard n={item} onTap={tap} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  gear: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  section: { paddingTop: spacing.lg, paddingBottom: spacing.sm, letterSpacing: 1.2 },
  sep: { height: spacing.md },
});
