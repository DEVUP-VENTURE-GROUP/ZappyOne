/**
 * Worker offers.
 * ----------------------------------------------------------------------------
 * Two things live here, and the distinction matters:
 *
 *   LIVE OFFERS — socket-only, from `new_job_request`. There is no endpoint
 *   that lists them; if the app didn't receive the payload, it cannot ask for
 *   it. They expire on their own `expiresAt` and are pruned locally, because
 *   the server sends no expiry event.
 *
 *   YOUR JOBS — `GET /workers/orders`, the jobs already assigned to this pro.
 *   These are not offers and are not decidable; they are shown below so the
 *   screen is still useful when nothing is coming in.
 *
 * ── NOTHING IS FABRICATED ──────────────────────────────────────────────────
 * Every field on the offer card is from the payload: `price` (the boosted
 * total the worker is actually paid), `basePrice`, `distanceKm`, `etaMinutes`,
 * `expiresAt`, `pickupAddress`, `description`, `tier`. Distance and ETA render
 * only when the server sent them — `dispatch.worker.js` sets both to null when
 * pricing had no route, and a dash is honest where a guess would not be.
 *
 * The countdown exists ONLY because `expiresAt` is real. It is derived from
 * that timestamp on every tick, never from a duration assumed at render.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Inbox, WifiOff } from 'lucide-react-native';
import {
  Appear,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  SectionTitle,
  SkeletonList,
  StatusBadge,
  Text,
  formatRupees,
} from '../../../components/ui';
import { OfferCard } from '../../../components/worker/JobCards';
import {
  useGetWorkerMeQuery,
  useGetWorkerOrdersQuery,
  useWorkerAcceptMutation,
  useWorkerRejectMutation,
} from '../../../services/api/workerApi';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { offerRemoved } from '../../../store/offersSlice';
import { humanizeCode } from '../../../components/catalog/categoryIcons';
import { colors } from '../../../theme/colors';
import { bottomNavClearance, screenPadding, spacing } from '../../../theme/spacing';
import type { JobOffer } from '../../../types/api';

/** Seconds remaining for every live offer, recomputed each second. */
function useCountdowns(offers: JobOffer[]): Record<string, number> {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (offers.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [offers.length]);

  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const offer of offers) {
      out[offer._id] = Math.max(
        0,
        Math.round((new Date(offer.expiresAt).getTime() - now) / 1000),
      );
    }
    return out;
  }, [offers, now]);
}

export default function WorkerOffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const offers = useAppSelector((state) => state.offers.items);
  const countdowns = useCountdowns(offers);

  const { data: worker } = useGetWorkerMeQuery();
  const {
    data: ordersEnvelope,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetWorkerOrdersQuery(1);

  const [workerAccept, { isLoading: accepting }] = useWorkerAcceptMutation();
  const [workerReject] = useWorkerRejectMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const orders = ordersEnvelope?.orders ?? [];
  const isOnline = worker?.isOnline ?? false;

  const handleAccept = useCallback(
    async (offer: JobOffer) => {
      setActionError(null);
      // Accepting only PUBLISHES a signal — the dispatch worker holds the
      // atomic lock and decides who wins. Drop the card immediately so it
      // isn't tapped twice while that resolves.
      dispatch(offerRemoved(offer._id));
      try {
        await workerAccept(offer._id).unwrap();
        refetch();
      } catch (e) {
        const status = (e as { status?: number })?.status;
        // 410/404 mean another pro was faster. Expected, not a failure.
        if (status !== 410 && status !== 404) {
          setActionError(getApiErrorMessage(e, 'This job may have been taken.'));
        }
      }
    },
    [dispatch, workerAccept, refetch],
  );

  const handleReject = useCallback(
    (offer: JobOffer) => {
      dispatch(offerRemoved(offer._id));
      workerReject(offer._id).catch(() => {});
    },
    [dispatch, workerReject],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Heading level={1}>Jobs</Heading>
        <Text variant="muted">
          {isOnline ? 'New requests appear here instantly' : "You're offline"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomNavClearance + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        {actionError ? (
          <Card variant="outline" style={styles.errorCard}>
            <Text variant="bodySmall" color={colors.errorDark}>
              {actionError}
            </Text>
          </Card>
        ) : null}

        {/* ── Live offers ──────────────────────────────────────────────── */}
        {offers.length > 0 ? (
          <View style={styles.block}>
            <SectionTitle>
              Incoming {offers.length > 1 ? `· ${offers.length}` : ''}
            </SectionTitle>
            {offers.map((offer) => (
              <Appear key={offer._id} offsetY={8}>
                <OfferCard
                  offer={offer}
                  secondsLeft={countdowns[offer._id] ?? 0}
                  accepting={accepting}
                  onAccept={() => handleAccept(offer)}
                  onReject={() => handleReject(offer)}
                />
              </Appear>
            ))}
          </View>
        ) : (
          // Offline and "online but quiet" are different situations and get
          // different copy — the first is actionable, the second isn't.
          <Appear>
            <EmptyState
              icon={
                isOnline ? (
                  <Inbox size={26} color={colors.textMuted} />
                ) : (
                  <WifiOff size={26} color={colors.textMuted} />
                )
              }
              title={isOnline ? 'No requests right now' : "You're offline"}
              message={
                isOnline
                  ? 'Job requests near you will appear here the moment they come in. Keep the app open to catch them.'
                  : 'Go online from the dashboard to start receiving job requests.'
              }
              actionLabel={isOnline ? undefined : 'Go to dashboard'}
              onAction={
                isOnline ? undefined : () => router.push('/worker/(tabs)/dashboard')
              }
            />
          </Appear>
        )}

        {/* ── Assigned jobs ────────────────────────────────────────────── */}
        <View style={styles.block}>
          <SectionTitle>Your jobs</SectionTitle>

          {isLoading ? (
            <SkeletonList count={3} />
          ) : error ? (
            <ErrorState
              message={getApiErrorMessage(error, "We couldn't load your jobs.")}
              onRetry={refetch}
            />
          ) : orders.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              message="Jobs you accept will show up here with their current status."
            />
          ) : (
            orders.map((order) => (
              <Card
                key={order._id}
                variant="outline"
                padding={spacing.base}
                onPress={() => router.push('/worker/(tabs)/dashboard')}
                accessibilityLabel={`${humanizeCode(order.service)}, ${order.status}`}
              >
                <View style={styles.jobRow}>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                      {humanizeCode(order.service)}
                    </Text>
                    <Text
                      variant="caption"
                      color={colors.textSecondary}
                      numberOfLines={1}
                    >
                      {order.pickupLocation?.address}
                    </Text>
                  </View>
                  {typeof order.pricing?.total === 'number' ? (
                    <Text variant="bodySmall" weight="semibold">
                      {formatRupees(order.pricing.total)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.jobStatus}>
                  <StatusBadge status={order.status} />
                </View>
              </Card>
            ))
          )}

          {isFetching && !isLoading ? (
            <Text variant="caption" color={colors.textMuted} align="center">
              Refreshing…
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: { paddingHorizontal: screenPadding, gap: spacing.xxs, marginBottom: spacing.base },
  scroll: { paddingHorizontal: screenPadding, gap: spacing.lg, flexGrow: 1 },

  block: { gap: spacing.sm },
  errorCard: { backgroundColor: colors.errorTint, borderColor: colors.errorTint },

  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  jobStatus: { flexDirection: 'row', marginTop: spacing.sm },
});
