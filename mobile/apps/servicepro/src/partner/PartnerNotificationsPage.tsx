/** Everything ZappyOne told the partner (the events website's NotificationPanel): all or unread, a tap marks one read. */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useMarkAllPartnerNotificationsReadMutation, useMarkPartnerNotificationReadMutation, usePartnerNotificationsQuery } from '@zappy/core/api';
import { Button, Chip, EmptyState, ErrorState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';

interface Note { _id: string; title: string; body?: string; readAt?: string; createdAt: string }

function timeAgo(date: string) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

export function PartnerNotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usePartnerNotificationsQuery({ page, unreadOnly });
  const [markRead] = useMarkPartnerNotificationReadMutation();
  const [markAll, { isLoading: marking }] = useMarkAllPartnerNotificationsReadMutation();
  const rows: Note[] = data?.items || [];
  const unread: number = data?.unread || 0;

  return (
    <View style={styles.page}>
      <ScreenHeader title="Notifications" subtitle={unread ? `${unread} unread` : undefined} safeArea
        right={unread ? <Button label="Mark all read" size="small" variant="ghost" loading={marking} onPress={() => markAll(undefined)} /> : undefined} />
      <View style={styles.tabs}>
        {[false, true].map((v) => <Chip key={String(v)} label={v ? 'Unread' : 'All'} selected={unreadOnly === v} onPress={() => { setUnreadOnly(v); setPage(1); }} />)}
      </View>
      {isError ? <ErrorState onRetry={refetch} /> : isLoading ? <LoadingState /> : (
        <FlatList data={rows} keyExtractor={(n) => n._id} onRefresh={refetch} refreshing={isFetching} contentContainerStyle={styles.list}
          renderItem={({ item: n }) => (
            <Pressable onPress={() => !n.readAt && markRead(n._id)} android_ripple={RIPPLE} accessibilityRole="button" style={[styles.row, !n.readAt && styles.unread]}>
              <View style={[styles.dot, { backgroundColor: n.readAt ? 'transparent' : zappy[600] }]} />
              <View style={styles.flex}>
                <Text variant="bodySmall" weight={n.readAt ? 'regular' : 'semibold'}>{n.title}</Text>
                {n.body ? <Text variant="caption" color={ink[500]}>{n.body}</Text> : null}
                <Text variant="caption" color={ink[400]}>{timeAgo(n.createdAt)}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon={<Bell size={40} color={slate[300]} />} title={unreadOnly ? 'Nothing unread' : 'No notifications yet'} />}
          ListFooterComponent={(data?.pages || 0) > 1 ? (
            <View style={styles.pager}>
              <Button label="Newer" variant="outline" size="small" disabled={page <= 1} onPress={() => setPage(page - 1)} />
              <Button label="Older" variant="outline" size="small" disabled={page >= data.pages} onPress={() => setPage(page + 1)} />
            </View>
          ) : null} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  unread: { backgroundColor: zappy[50] },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  flex: { flex: 1, gap: 2 },
  pager: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, padding: spacing.base },
});
