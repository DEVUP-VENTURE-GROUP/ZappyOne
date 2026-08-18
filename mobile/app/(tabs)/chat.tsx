/**
 * Chats.
 * ----------------------------------------------------------------------------
 * A chat exists only for an order with a worker on it — there is no standalone
 * conversation model on the backend. So this is the list of bookings you can
 * currently message about, and it empties itself when they finish.
 *
 * `ACTIVE_ORDER_STATUSES` minus `searching`/`created`: those have no worker
 * yet, so there is nobody on the other end.
 * ----------------------------------------------------------------------------
 */

import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, MessageSquare } from 'lucide-react-native';
import {
  Appear,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  SkeletonList,
  StatusBadge,
  Text,
} from '../../components/ui';
import { useListOrdersQuery } from '../../services/api/ordersApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { bottomNavClearance, screenPadding, spacing } from '../../theme/spacing';
import type { OrderStatus } from '../../types/api';

/** Statuses where a worker is assigned and reachable. */
const CHATTABLE: OrderStatus[] = ['assigned', 'on_the_way', 'arrived', 'in_progress'];

export default function ChatListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch } = useListOrdersQuery(1);

  const chats = useMemo(
    () => (data?.orders ?? []).filter((o) => CHATTABLE.includes(o.status) && o.workerId),
    [data],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Heading level={1}>Chats</Heading>
        <Text variant="muted">Message the pro handling your booking</Text>
      </View>

      {isLoading ? (
        <View style={styles.padded}>
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your chats.")}
            onRetry={refetch}
          />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon={<MessageSquare size={28} color={colors.textMuted} />}
            title="No chats yet"
            message="Once a pro is assigned to your booking, you can message them here."
            actionLabel="Book a service"
            onAction={() => router.push('/(tabs)/services')}
          />
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomNavClearance + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Appear delay={index * 40}>
              <Card
                variant="outline"
                onPress={() => router.push(`/chat/${item._id}`)}
                accessibilityLabel={`Chat about ${item.workerName ?? 'your booking'}`}
              >
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <MessageSquare size={17} color={colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                      {item.workerName || 'Your pro'}
                    </Text>
                    <Text
                      variant="caption"
                      color={colors.textMuted}
                      numberOfLines={1}
                      style={styles.service}
                    >
                      {String(item.service ?? '').replace(/_/g, ' ')}
                    </Text>
                    <View style={styles.badgeRow}>
                      <StatusBadge status={item.status} />
                    </View>
                  </View>
                  <ChevronRight size={17} color={colors.textMuted} />
                </View>
              </Card>
            </Appear>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: screenPadding,
    gap: spacing.xxs,
    marginBottom: spacing.base,
  },
  padded: { paddingHorizontal: screenPadding },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: screenPadding },
  list: { paddingHorizontal: screenPadding, gap: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  service: { marginTop: spacing.xxs, textTransform: 'capitalize' },
  badgeRow: { marginTop: spacing.sm, flexDirection: 'row' },
});
