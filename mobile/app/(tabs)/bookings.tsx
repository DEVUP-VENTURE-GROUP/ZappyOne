/**
 * Bookings — order history.
 * ----------------------------------------------------------------------------
 * Active bookings float to the top in their own section, because the one thing
 * someone opening this tab most often wants is the job happening right now.
 * Everything below is history, newest first, exactly as the server returned it.
 *
 * ── DATA ───────────────────────────────────────────────────────────────────
 * One source: `GET /orders/mine?page=N` via the existing `useListOrdersQuery`.
 * `ACTIVE_ORDER_STATUSES` (shared with the rest of the app) does the splitting.
 * No client-side sorting is applied — the server already returns newest first,
 * and re-sorting here would silently disagree with its pagination.
 *
 * ── PAGINATION ─────────────────────────────────────────────────────────────
 * `totalPages` comes from the server. Pages accumulate as the customer reaches
 * the end rather than replacing the list, so scrolling back up still works.
 * A page is only appended once — `loadedPages` guards against the duplicate
 * rows that an `onEndReached` firing twice would otherwise produce.
 *
 * Tapping any booking opens `/tracking/order/[id]`, the existing route, which
 * already renders the right thing for every status: searching, live tracking,
 * cancelled and failed.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, Sparkles } from 'lucide-react-native';
import {
  Appear,
  EmptyState,
  ErrorState,
  SectionTitle,
  SkeletonList,
  Text,
} from '../../components/ui';
import { BookingCard } from '../../components/bookings/BookingCard';
import { useListOrdersQuery, useRebookOrderMutation } from '../../services/api/ordersApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { colors } from '../../theme/colors';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../types/api';

/** A section header, or a booking. Keeps one FlatList instead of two lists. */
type Row =
  | { kind: 'header'; id: string; title: string; count: number }
  | { kind: 'order'; id: string; order: Order };

export default function BookingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<Order[]>([]);
  const loadedPages = useRef(new Set<number>());

  const { data, isLoading, isFetching, error, refetch } = useListOrdersQuery(page);
  const [rebookOrder, { isLoading: rebooking }] = useRebookOrderMutation();

  // Append each page exactly once. `onEndReached` can fire more than once for
  // the same offset, and RTK Query re-delivers the same page on refocus — both
  // would duplicate rows without the `loadedPages` guard and the id filter.
  //
  // This runs in an effect rather than during render on purpose: mutating a ref
  // mid-render is impure, and StrictMode's double invocation makes the ordering
  // of the guard and the state update genuinely hard to reason about.
  const pageOrders = data?.orders;
  useEffect(() => {
    if (!pageOrders || loadedPages.current.has(page)) return;
    loadedPages.current.add(page);
    setAccumulated((prev) => {
      const seen = new Set(prev.map((o) => o._id));
      return [...prev, ...pageOrders.filter((o) => !seen.has(o._id))];
    });
  }, [pageOrders, page]);

  const orders = accumulated.length > 0 ? accumulated : (pageOrders ?? []);
  const totalPages = data?.totalPages ?? 1;
  const hasMore = page < totalPages;

  const rows = useMemo<Row[]>(() => {
    const active = orders.filter((o) =>
      (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status),
    );
    const past = orders.filter(
      (o) => !(ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status),
    );

    const out: Row[] = [];
    if (active.length > 0) {
      out.push({ kind: 'header', id: 'h-active', title: 'Active', count: active.length });
      active.forEach((o) => out.push({ kind: 'order', id: o._id, order: o }));
    }
    if (past.length > 0) {
      out.push({ kind: 'header', id: 'h-past', title: 'Past bookings', count: past.length });
      past.forEach((o) => out.push({ kind: 'order', id: o._id, order: o }));
    }
    return out;
  }, [orders]);

  const openOrder = useCallback(
    (order: Order) => router.push(`/tracking/order/${order._id}`),
    [router],
  );

  const handleRebook = useCallback(
    async (order: Order) => {
      try {
        const next = await rebookOrder(order._id).unwrap();
        router.push(`/tracking/order/${next._id}`);
      } catch {
        /* The list stays put; the tracking screen surfaces failures in context. */
      }
    },
    [rebookOrder, router],
  );

  const reload = useCallback(() => {
    loadedPages.current.clear();
    setAccumulated([]);
    setPage(1);
    refetch();
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (hasMore && !isFetching) setPage((p) => p + 1);
  }, [hasMore, isFetching]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <SectionTitle style={styles.sectionTitle}>{item.title}</SectionTitle>
            <Text variant="caption" color={colors.textMuted}>
              {item.count}
            </Text>
          </View>
        );
      }
      return (
        <BookingCard
          order={item.order}
          onPress={openOrder}
          onRebook={handleRebook}
          rebooking={rebooking}
        />
      );
    },
    [openOrder, handleRebook, rebooking],
  );

  // ── Loading — first page only; later pages keep the list on screen ───────
  if (isLoading && accumulated.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text variant="pageTitle">My bookings</Text>
          <Text variant="muted">Everything you&apos;ve booked with Zappy</Text>
        </View>
        <View style={styles.listPad}>
          <SkeletonList count={4} />
        </View>
      </View>
    );
  }

  // ── Error — only when there is nothing to show ──────────────────────────
  if (error && orders.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text variant="pageTitle">My bookings</Text>
        </View>
        <ErrorState
          message={getApiErrorMessage(error, "We couldn't load your bookings.")}
          onRetry={reload}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text variant="pageTitle">My bookings</Text>
        <Text variant="muted">Everything you&apos;ve booked with Zappy</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: bottomNavClearance + insets.bottom },
          rows.length === 0 ? styles.listEmpty : null,
        ]}
        ItemSeparatorComponent={Separator}
        refreshing={isFetching && accumulated.length === 0}
        onRefresh={reload}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          <Appear>
            <EmptyState
              icon={<CalendarClock size={28} color={colors.textMuted} />}
              title="No bookings yet"
              message="When you book a service, it'll appear here — with its status, price and everything you need to track it."
              actionLabel="Browse services"
              onAction={() => router.push('/(tabs)/services')}
            />
          </Appear>
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.footer}>
              <Text variant="caption" color={colors.textMuted}>
                {isFetching ? 'Loading more…' : 'Scroll for older bookings'}
              </Text>
            </View>
          ) : orders.length > 0 ? (
            <View style={styles.footer}>
              <Sparkles size={14} color={colors.textMuted} />
              <Text variant="caption" color={colors.textMuted}>
                That&apos;s everything
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: { paddingHorizontal: screenPadding, gap: spacing.xxs, marginBottom: spacing.base },

  list: { paddingHorizontal: screenPadding, flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  listPad: { paddingHorizontal: screenPadding },
  separator: { height: spacing.md },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionTitle: { marginBottom: 0 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
});
