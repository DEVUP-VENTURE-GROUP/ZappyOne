/**
 * Track — the live booking, straight from the tab bar.
 * ----------------------------------------------------------------------------
 * There is no standalone "track" endpoint or screen; tracking is always
 * tracking a SPECIFIC order (`/tracking/order/[id]`). So this tab resolves
 * which order that is, from the orders the API already returns, and forwards.
 *
 * `ACTIVE_ORDER_STATUSES` is the shared definition used by the bookings list
 * and the worker dashboard, so "active" means the same thing everywhere.
 *
 * When nothing is live it says so rather than forwarding to a dead route or
 * showing a permanently empty map. A tab that leads nowhere is worse than one
 * that explains why.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Navigation } from 'lucide-react-native';
import {
  EmptyState,
  ErrorState,
  Heading,
  SkeletonList,
  Text,
} from '../../components/ui';
import { useListOrdersQuery } from '../../services/api/ordersApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { bottomNavClearance, screenPadding, spacing } from '../../theme/spacing';
import { ACTIVE_ORDER_STATUSES } from '../../types/api';

export default function TrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, error, refetch } = useListOrdersQuery(1);

  const activeOrder = useMemo(
    () =>
      (data?.orders ?? []).find((o) =>
        (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status),
      ),
    [data],
  );

  // `replace`, not `push`: this tab is a redirector, so it should not sit in
  // the back stack between the tab bar and the tracking screen.
  useEffect(() => {
    if (activeOrder) router.replace(`/tracking/order/${activeOrder._id}`);
  }, [activeOrder, router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Heading level={1}>Track</Heading>
        <Text variant="muted">Follow your booking as it happens</Text>
      </View>

      <View
        style={[styles.body, { paddingBottom: bottomNavClearance + insets.bottom }]}
      >
        {isLoading ? (
          <SkeletonList count={2} />
        ) : error ? (
          <ErrorState
            message={getApiErrorMessage(error, "We couldn't check your bookings.")}
            onRetry={refetch}
          />
        ) : activeOrder ? (
          // Redirecting — the effect above owns it. A spinner would flash.
          <SkeletonList count={2} />
        ) : (
          <EmptyState
            icon={<Navigation size={28} color={colors.textMuted} />}
            title="Nothing to track right now"
            message="Once you book a service, you can follow your pro here in real time."
            actionLabel="Book a service"
            onAction={() => router.push('/(tabs)/services')}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: screenPadding, gap: spacing.xxs, marginBottom: spacing.base },
  body: { flex: 1, paddingHorizontal: screenPadding, justifyContent: 'center' },
});
