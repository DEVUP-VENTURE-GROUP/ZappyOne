/**
 * My reported issues.
 * ----------------------------------------------------------------------------
 * Read-only entry into `GET /disputes/mine`. There is deliberately no "new
 * dispute" button here: a dispute must name an order, so it is raised from the
 * booking itself (see `RaiseDisputeSheet`, opened from the order screen).
 * Offering a blank form here would only lead to the 404 the service returns
 * when `orderId` misses.
 * ----------------------------------------------------------------------------
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Clock, MessageCircle } from 'lucide-react-native';
import {
  Appear,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ScalePressable,
  ScreenHeader,
  SkeletonList,
  Text,
} from '../../components/ui';
import { disputeStatusMeta, humanizeCategory } from '../../components/support/statusMeta';
import { useListMyDisputesQuery } from '../../services/api/disputesApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { screenPadding, spacing } from '../../theme/spacing';

export default function DisputesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: disputes = [], isLoading, error, refetch } = useListMyDisputesQuery();

  const sorted = useMemo(
    () =>
      [...disputes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [disputes],
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Reported issues" onBack={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <SkeletonList count={3} />
        ) : error ? (
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't load your reports.")}
            onRetry={refetch}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="Nothing reported"
            message="If something goes wrong with a booking, you can report it from that booking within 7 days of it finishing."
            actionLabel="View bookings"
            onAction={() => router.push('/(tabs)/bookings')}
          />
        ) : (
          sorted.map((dispute, index) => {
            const meta = disputeStatusMeta(dispute.status);
            const count = dispute.messages?.length ?? 0;
            const refund = dispute.resolution?.refundAmountPaise ?? 0;
            return (
              <Appear key={dispute._id} delay={index * 40}>
                <ScalePressable
                  onPress={() => router.push(`/disputes/${dispute._id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Report: ${humanizeCategory(dispute.category)}, ${meta.label}`}
                >
                  <Card>
                    <View style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.flex}>
                        <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                          {humanizeCategory(dispute.category)}
                        </Text>
                        <Text
                          variant="caption"
                          color={colors.textSecondary}
                          numberOfLines={2}
                        >
                          {dispute.description}
                        </Text>
                      </View>
                      <Chip label={meta.label} tone={meta.tone} />
                    </View>

                    {refund > 0 ? (
                      <Text variant="caption" weight="semibold" color={colors.successDark}>
                        Refunded ₹{Math.round(refund / 100)}
                      </Text>
                    ) : null}

                    <View style={styles.cardMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={11} color={colors.textMuted} />
                        <Text variant="caption" color={colors.textMuted}>
                          {new Date(dispute.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </View>
                      {count > 0 ? (
                        <View style={styles.metaItem}>
                          <MessageCircle size={11} color={colors.textMuted} />
                          <Text variant="caption" color={colors.textMuted}>
                            {count} {count === 1 ? 'message' : 'messages'}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.spacer} />
                      <ChevronRight size={15} color={colors.primary} />
                    </View>
                  </View>
                  </Card>
                </ScalePressable>
              </Appear>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: screenPadding, paddingTop: spacing.base, gap: spacing.md },
  flex: { flex: 1 },
  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spacer: { flex: 1 },
});
