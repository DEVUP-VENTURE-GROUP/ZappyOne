/**
 * Notifications.
 * ----------------------------------------------------------------------------
 * The in-app notification centre, backed by `GET /notifications` and the two
 * read mutations. Types, icons and routing all come from
 * `components/notifications/notificationMeta` — see the audit in that file.
 *
 * ── UNREAD ─────────────────────────────────────────────────────────────────
 * Unread is `readAt == null`, the server's own field. It is signalled three
 * ways, because colour alone is not enough and a tint alone is easy to miss on
 * a bright screen: a tinted surface, a filled dot, and a heavier title weight.
 *
 * Tapping marks read and navigates. Marking is optimistic in the sense that it
 * is fired and not awaited — the row's own appearance updates when the cache
 * invalidates — but navigation never waits on it, so a slow network can't make
 * the tap feel broken.
 *
 * New notifications arrive over the personal socket room; that subscription is
 * unchanged and simply refetches.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellOff, CheckCheck } from 'lucide-react-native';
import {
  Appear,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ScalePressable,
  ScreenHeader,
  SectionTitle,
  SkeletonList,
  Text,
} from '../components/ui';
import {
  formatRelative,
  metaForType,
  resolveRoute,
  type NotificationTone,
} from '../components/notifications/notificationMeta';
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '../services/api/notificationsApi';
import { getApiErrorMessage } from '../services/api/apiSlice';
import { useSocket } from '../hooks/useSocket';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { screenPadding, spacing } from '../theme/spacing';
import type { AppNotification } from '../types/api';

/** Tone → theme colours. Kept here so the meta module stays theme-agnostic. */
const TONE: Record<NotificationTone, { fg: string; bg: string }> = {
  info: { fg: colors.primary, bg: colors.primaryTint },
  success: { fg: colors.successDark, bg: colors.successTint },
  warning: { fg: colors.accentDark, bg: colors.warningTint },
  danger: { fg: colors.error, bg: colors.errorTint },
  neutral: { fg: colors.textSecondary, bg: colors.surfaceTertiary },
};

function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
}) {
  const unread = !item.readAt;
  const { icon: Icon, tone } = metaForType(item.type);
  const palette = TONE[tone];
  const routable = resolveRoute(item.deepLink) !== null;

  return (
    <ScalePressable
      onPress={() => onPress(item)}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.body ?? ''}`}
      accessibilityHint={routable ? 'Opens the related screen' : undefined}
    >
      {/* Card wraps its children in a single COLUMN view, so the row layout
          has to live inside it rather than on the Card's own style. */}
      <Card
        variant="outline"
        padding={spacing.base}
        style={unread ? styles.rowUnread : undefined}
      >
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: palette.bg }]}>
            <Icon size={18} color={palette.fg} />
          </View>

          <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text
              variant="bodySmall"
              weight={unread ? 'bold' : 'semibold'}
              style={styles.flex}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {unread ? <View style={styles.dot} /> : null}
          </View>

          {item.body ? (
            <Text variant="caption" color={colors.textSecondary} numberOfLines={3}>
              {item.body}
            </Text>
          ) : null}

            <Text variant="caption" color={colors.textMuted} style={styles.time}>
              {formatRelative(item.createdAt)}
            </Text>
          </View>
        </View>
      </Card>
    </ScalePressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const socketClient = useSocket();

  const { data, isLoading, isFetching, error, refetch } = useListNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  const notifications = data?.items ?? [];
  const unreadCount = data?.unread ?? 0;

  // Live arrivals push over the personal room — unchanged behaviour.
  useEffect(() => {
    const handler = () => refetch();
    socketClient.on('notification', handler);
    return () => socketClient.off('notification', handler);
  }, [socketClient, refetch]);

  /** New / Earlier, so a fresh alert isn't lost in a long history. */
  const sections = useMemo(() => {
    const unread = notifications.filter((n) => !n.readAt);
    const read = notifications.filter((n) => n.readAt);
    const out: { title: string; data: AppNotification[] }[] = [];
    if (unread.length > 0) out.push({ title: 'New', data: unread });
    if (read.length > 0) out.push({ title: 'Earlier', data: read });
    return out;
  }, [notifications]);

  const open = useCallback(
    (item: AppNotification) => {
      // Fire-and-forget: navigation must not wait on the read call.
      if (!item.readAt) markRead(item._id);

      const route = resolveRoute(item.deepLink);
      // No mobile equivalent — see resolveRoute. Better to stay put than to
      // push a route that doesn't exist.
      if (route) router.push(route as never);
    },
    [markRead, router],
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="Notifications"
          onBack={() => router.back()}
          right={
            unreadCount > 0 ? (
              <Button
                label="Mark all read"
                variant="ghost"
                size="small"
                icon={<CheckCheck size={14} color={colors.primary} />}
                onPress={() => markAllRead()}
                loading={markingAll}
              />
            ) : undefined
          }
        />
      </View>

      {isLoading ? (
        <View style={styles.pad}>
          <SkeletonList count={5} />
        </View>
      ) : error && notifications.length === 0 ? (
        <ErrorState
          message={getApiErrorMessage(error, "We couldn't load your notifications.")}
          onRetry={refetch}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <Appear offsetY={4}>
              <NotificationRow item={item} onPress={open} />
            </Appear>
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <SectionTitle style={styles.sectionTitle}>{section.title}</SectionTitle>
              <Text variant="caption" color={colors.textMuted}>
                {section.data.length}
              </Text>
            </View>
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xxl },
            sections.length === 0 ? styles.listEmpty : null,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <EmptyState
              icon={<BellOff size={26} color={colors.textMuted} />}
              title="Nothing here yet"
              message="Updates about your bookings, payments and rewards will show up here."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pad: { paddingHorizontal: screenPadding },

  list: { paddingHorizontal: screenPadding, flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  separator: { height: spacing.sm },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { marginBottom: 0 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  // Unread carries a tinted surface AND a dot AND a heavier title — colour on
  // its own is not a reliable signal.
  rowUnread: { backgroundColor: colors.primaryTint, borderColor: colors.primarySoft },

  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 5,
  },
  time: { marginTop: spacing.xs },
});
