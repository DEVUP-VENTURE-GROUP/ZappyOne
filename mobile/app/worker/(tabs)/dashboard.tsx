/**
 * Worker dashboard — Zappy for Professionals.
 * ----------------------------------------------------------------------------
 * Rebuilt on the customer app's design system so a pro is using the same
 * product, not a separate one: same Card, Button, tokens and type scale. The
 * only shift in emphasis is that earnings lead, because that is what this
 * screen is opened for.
 *
 * ── LOGIC ──────────────────────────────────────────────────────────────────
 * Every API call and lifecycle handler is carried over unchanged. The one
 * structural change is WHERE offer events are handled: `new_job_request`,
 * `offer.cancelled` and `offer.boosted` now feed `offersSlice` via
 * `useJobOffers` in the worker tab layout, so an offer arriving while the pro
 * is on another tab is still captured — previously it landed in this
 * component's local state and was lost if the dashboard wasn't mounted. The
 * events, payloads and dispatch behaviour are untouched; only the listener
 * moved. These behaviours are load-bearing and were kept:
 *
 *   · Accept only PUBLISHES an accept signal. The dispatch worker holds the
 *     atomic lock and picks between everyone who tapped at once. A 200 does
 *     not mean this worker won — the outcome arrives as `job.assigned` /
 *     `offer.cancelled`, or by the job appearing in the next refetch. 410 and
 *     404 are swallowed for that reason: they mean someone else was faster,
 *     which is not an error worth interrupting the pro over.
 *   · The offer countdown is derived from the payload's `expiresAt`, not from
 *     a timer started when the card rendered.
 *   · Start-trip and arrive send GPS when they can and let the server fall
 *     back to the last Redis ping when they can't.
 *   · `useLocationTracker(isOnline, activeOrder)` keeps the live feed running.
 *
 * ── NO INVENTED METRICS ────────────────────────────────────────────────────
 * Every figure comes from `/workers/me` or `/workers/earnings`. The one new
 * data source is `worker.currentOrderId`, which the API already returned and
 * this screen previously ignored in favour of scanning the orders list — the
 * server's own pointer is used first now, with the scan as a fallback.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { BellRing, ChevronRight, ShieldAlert } from 'lucide-react-native';
import {
  Appear,
  Avatar,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Input,
  SectionTitle,
  Skeleton,
  Text,
} from '../../../components/ui';
import { EarningsSummary, OnlineHero } from '../../../components/worker/WorkerUI';
import { ActiveJobCard, OfferCard } from '../../../components/worker/JobCards';
import {
  useGetWorkerMeQuery,
  useGetWorkerOrdersQuery,
  useGetEarningsQuery,
  useGoOnlineMutation,
  useGoOfflineMutation,
  useWorkerAcceptMutation,
  useWorkerRejectMutation,
  useWorkerStartTripMutation,
  useWorkerArriveMutation,
  useWorkerStartServiceMutation,
  useWorkerCompleteMutation,
} from '../../../services/api/workerApi';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { useSocket } from '../../../hooks/useSocket';
import { useLocationTracker } from '../../../hooks/useLocationTracker';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../../types/api';
import type { JobAssignedEvent, KycRejectedEvent } from '../../../services/socket/events';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { offerRemoved, offersCleared } from '../../../store/offersSlice';
import { colors } from '../../../theme/colors';
import { bottomNavClearance, screenPadding, spacing } from '../../../theme/spacing';

/** Copy per KYC state. Statuses come from `worker.kyc.status`. */
const KYC_MESSAGE: Record<string, { title: string; body: string; canRetry: boolean }> = {
  not_submitted: {
    title: 'Complete your KYC',
    body: 'Submit your documents to start receiving jobs.',
    canRetry: true,
  },
  pending_review: {
    title: 'KYC under review',
    body: "We're verifying your documents — usually within 24 hours.",
    canRetry: false,
  },
  rejected: {
    title: 'KYC needs attention',
    body: 'Your documents were rejected. Please resubmit.',
    canRetry: true,
  },
  suspended: {
    title: 'Account suspended',
    body: 'Contact support to resolve this.',
    canRetry: false,
  },
};

export default function WorkerDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: worker, isLoading, refetch: refetchWorker } = useGetWorkerMeQuery();
  const { data: ordersPage, refetch: refetchOrders } = useGetWorkerOrdersQuery(1);
  const { data: earnings } = useGetEarningsQuery('today');

  const [goOnline, { isLoading: goingOnline }] = useGoOnlineMutation();
  const [goOffline, { isLoading: goingOffline }] = useGoOfflineMutation();
  const [workerAccept, { isLoading: accepting }] = useWorkerAcceptMutation();
  const [workerReject] = useWorkerRejectMutation();
  const [workerStartTrip, { isLoading: startingTrip }] = useWorkerStartTripMutation();
  const [workerArrive, { isLoading: arriving }] = useWorkerArriveMutation();
  const [workerStartService, { isLoading: startingService }] =
    useWorkerStartServiceMutation();
  const [workerComplete, { isLoading: completing }] = useWorkerCompleteMutation();

  const [otpInput, setOtpInput] = useState('');
  const [otpSheetOpen, setOtpSheetOpen] = useState(false);
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketClient = useSocket();
  const dispatch = useAppDispatch();

  // Offers are shared state now — the subscription lives in the worker tab
  // layout so one arriving on another tab is still captured. The dashboard
  // shows the newest.
  const offers = useAppSelector((state) => state.offers.items);
  const offer = offers[0] ?? null;
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(0);

  const kycStatus = worker?.kyc?.status ?? 'not_submitted';
  const kycApproved = kycStatus === 'approved';
  const isOnline = worker?.isOnline ?? false;

  const orders = ordersPage?.orders ?? [];

  /**
   * The server tells us which job is held via `currentOrderId`; prefer that,
   * and fall back to scanning for an active status when it isn't populated.
   */
  const activeOrder: Order | undefined = useMemo(() => {
    if (worker?.currentOrderId) {
      const byId = orders.find((o) => o._id === worker.currentOrderId);
      if (byId) return byId;
    }
    return orders.find((o) =>
      (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status),
    );
  }, [orders, worker?.currentOrderId]);

  // Live GPS while online — unchanged.
  useLocationTracker(isOnline, activeOrder?._id);

  // ── Sockets ──────────────────────────────────────────────────────────────
  // Offer events (new_job_request / offer.cancelled / offer.boosted) are owned
  // by `useJobOffers` in the tab layout. What remains here is what only the
  // dashboard cares about: refetching after an assignment or status change,
  // and surfacing a KYC rejection.
  useEffect(() => {
    const onJobAssigned = (_payload: JobAssignedEvent) => {
      refetchOrders();
      refetchWorker();
    };
    const onKycRejected = (payload: KycRejectedEvent) => {
      refetchWorker();
      setError(payload.reason || 'Your KYC was rejected. Check your KYC status.');
    };
    const onJobPulled = () => refetchOrders();

    socketClient.on('job.assigned', onJobAssigned);
    socketClient.on('kyc.rejected', onKycRejected);
    socketClient.on('job.pulled', onJobPulled);
    socketClient.on('order.status', onJobPulled);

    return () => {
      socketClient.off('job.assigned', onJobAssigned);
      socketClient.off('kyc.rejected', onKycRejected);
      socketClient.off('job.pulled', onJobPulled);
      socketClient.off('order.status', onJobPulled);
    };
  }, [socketClient, refetchOrders, refetchWorker]);

  // Countdown driven by the payload's own expiry.
  useEffect(() => {
    if (!offer) {
      setOfferSecondsLeft(0);
      return;
    }
    const tick = () => {
      setOfferSecondsLeft(
        Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const toggleOnline = useCallback(
    async (next: boolean) => {
      setError(null);
      if (!kycApproved && next) {
        setError('Complete KYC verification before going online.');
        return;
      }
      if (!next) {
        try {
          await goOffline().unwrap();
          // Offline means no longer eligible — held offers are dead.
          dispatch(offersCleared());
        } catch (e) {
          setError(getApiErrorMessage(e, "We couldn't take you offline."));
        }
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Enable location access to go online.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await goOnline({ lat: pos.coords.latitude, lng: pos.coords.longitude }).unwrap();
      } catch (e) {
        setError(getApiErrorMessage(e, "We couldn't take you online."));
      }
    },
    [kycApproved, goOffline, goOnline, dispatch],
  );

  const handleAccept = useCallback(async () => {
    if (!offer) return;
    // See the header: this only publishes a signal. Dismiss optimistically so
    // the card doesn't sit there while dispatch decides.
    const id = offer._id;
    dispatch(offerRemoved(id));
    try {
      await workerAccept(id).unwrap();
      refetchOrders();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      // 410/404 mean another pro won it — expected, not an error.
      if (status !== 410 && status !== 404) {
        setError(getApiErrorMessage(e, 'This job may have been taken.'));
      }
    }
  }, [offer, workerAccept, refetchOrders, dispatch]);

  const handleReject = useCallback(() => {
    if (!offer) return;
    const id = offer._id;
    dispatch(offerRemoved(id));
    workerReject(id).catch(() => {});
  }, [offer, workerReject, dispatch]);

  /** Best-effort GPS; the server falls back to the last Redis ping. */
  const currentCoords = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return undefined;
    }
  }, []);

  const handleStartTrip = useCallback(async () => {
    if (!activeOrder) return;
    setError(null);
    try {
      await workerStartTrip({ id: activeOrder._id, ...(await currentCoords()) }).unwrap();
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't start the trip."));
    }
  }, [activeOrder, workerStartTrip, currentCoords]);

  const handleArrive = useCallback(async () => {
    if (!activeOrder) return;
    setError(null);
    try {
      await workerArrive({ id: activeOrder._id, ...(await currentCoords()) }).unwrap();
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't mark you as arrived."));
    }
  }, [activeOrder, workerArrive, currentCoords]);

  const handleStartService = useCallback(async () => {
    if (!activeOrder || otpInput.length < 4) return;
    setError(null);
    try {
      await workerStartService({ id: activeOrder._id, otp: otpInput }).unwrap();
      setOtpSheetOpen(false);
      setOtpInput('');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Ask the customer for the correct code.'));
    }
  }, [activeOrder, otpInput, workerStartService]);

  const handleComplete = useCallback(async () => {
    if (!activeOrder) return;
    setError(null);
    try {
      await workerComplete({ id: activeOrder._id }).unwrap();
      setCompleteSheetOpen(false);
      refetchOrders();
      refetchWorker();
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't complete this job."));
    }
  }, [activeOrder, workerComplete, refetchOrders, refetchWorker]);

  /** The single next lifecycle step for the held job. */
  const jobAction = useMemo(() => {
    if (!activeOrder) return null;
    switch (activeOrder.status) {
      case 'assigned':
        return { label: 'Start trip', run: handleStartTrip, busy: startingTrip };
      case 'on_the_way':
        return { label: "I've arrived", run: handleArrive, busy: arriving };
      case 'arrived':
        return {
          label: 'Enter start code',
          run: () => setOtpSheetOpen(true),
          busy: startingService,
        };
      case 'in_progress':
        return {
          label: 'Complete job',
          run: () => setCompleteSheetOpen(true),
          busy: completing,
        };
      default:
        return null;
    }
  }, [
    activeOrder,
    handleStartTrip,
    handleArrive,
    startingTrip,
    arriving,
    startingService,
    completing,
  ]);

  const kycMsg = KYC_MESSAGE[kycStatus];

  if (isLoading || !worker) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.pad}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="100%" height={180} style={{ marginTop: spacing.lg }} />
          <Skeleton width="100%" height={140} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomNavClearance + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Avatar name={worker.name} uri={worker.avatarUrl} size={44} />
          <View style={styles.flex}>
            <Text variant="caption" color={colors.textMuted}>
              Zappy for Professionals
            </Text>
            <Text variant="heading3" numberOfLines={1}>
              {worker.name}
            </Text>
          </View>
        </View>

        {/* ── KYC gate ─────────────────────────────────────────────────── */}
        {!kycApproved && kycMsg ? (
          <Appear>
            <Card variant="outline" style={styles.kycCard}>
              <View style={styles.kycRow}>
                <View style={styles.kycIcon}>
                  <ShieldAlert size={18} color={colors.accentDark} />
                </View>
                <View style={styles.flex}>
                  <Text variant="body" weight="semibold">
                    {kycMsg.title}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {kycMsg.body}
                  </Text>
                </View>
              </View>
              {kycMsg.canRetry ? (
                <Button
                  label="Go to KYC"
                  variant="secondary"
                  size="small"
                  onPress={() => router.push('/worker/kyc')}
                  style={styles.kycButton}
                />
              ) : null}
            </Card>
          </Appear>
        ) : null}

        {/* ── Online status ────────────────────────────────────────────── */}
        <Appear delay={40}>
          <OnlineHero
            online={isOnline}
            onlineSince={worker.onlineSince}
            canGoOnline={kycApproved}
            busy={goingOnline || goingOffline}
            onToggle={toggleOnline}
          />
        </Appear>

        {error ? (
          <Card variant="outline" style={styles.errorCard}>
            <Text variant="bodySmall" color={colors.errorDark}>
              {error}
            </Text>
          </Card>
        ) : null}

        {/* ── Live offer ───────────────────────────────────────────────── */}
        {offer ? (
          <Appear offsetY={8}>
            <OfferCard
              offer={offer}
              secondsLeft={offerSecondsLeft}
              accepting={accepting}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          </Appear>
        ) : null}

        {/* ── Current job ──────────────────────────────────────────────── */}
        {activeOrder ? (
          <Appear delay={80}>
            <ActiveJobCard
              order={activeOrder}
              busy={jobAction?.busy}
              actionLabel={jobAction?.label}
              onAction={jobAction?.run}
              onChat={() => router.push(`/chat/${activeOrder._id}`)}
            />
          </Appear>
        ) : isOnline && !offer ? (
          <Appear delay={80}>
            <Card variant="outline" style={styles.waitingCard}>
              <BellRing size={20} color={colors.textMuted} />
              <Text variant="bodySmall" weight="semibold">
                Waiting for job requests
              </Text>
              <Text variant="caption" color={colors.textSecondary} align="center">
                You&apos;ll get a notification the moment something comes in near you.
              </Text>
            </Card>
          </Appear>
        ) : null}

        {/* ── Earnings ─────────────────────────────────────────────────── */}
        <Appear delay={120}>
          <EarningsSummary
            earningsRupees={earnings?.earningsRupees}
            jobs={earnings?.jobs}
            avgPerJobRupees={earnings?.avgEarningPerJobRupees}
            cashJobs={earnings?.cashJobs}
            onlineJobs={earnings?.onlineJobs}
            lifetimeRupees={worker.wallet?.totalEarnings}
            onPress={() => router.push('/worker/(tabs)/earnings')}
          />
        </Appear>

        {/* ── Today's activity ─────────────────────────────────────────── */}
        <Appear delay={160}>
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <SectionTitle style={styles.blockTitle}>Recent jobs</SectionTitle>
              <Button
                label="See all"
                variant="ghost"
                size="small"
                iconRight={<ChevronRight size={14} color={colors.primary} />}
                onPress={() => router.push('/worker/(tabs)/offers')}
              />
            </View>

            {orders.length === 0 ? (
              <EmptyState
                title="No jobs yet"
                message={
                  kycApproved
                    ? 'Go online and your first request will show up here.'
                    : 'Finish KYC to start receiving job requests.'
                }
              />
            ) : (
              orders.slice(0, 3).map((order) => (
                <Card
                  key={order._id}
                  variant="outline"
                  onPress={() => router.push('/worker/(tabs)/offers')}
                  padding={spacing.md}
                >
                  <View style={styles.recentRow}>
                    <View style={styles.flex}>
                      <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                        {order.service.replace(/_/g, ' ')}
                      </Text>
                      <Text variant="caption" color={colors.textSecondary}>
                        {order.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    {typeof order.pricing?.total === 'number' ? (
                      <Text variant="bodySmall" weight="semibold">
                        ₹{order.pricing.total}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              ))
            )}
          </View>
        </Appear>
      </ScrollView>

      {/* ── Start code ───────────────────────────────────────────────────── */}
      <BottomSheet
        visible={otpSheetOpen}
        onClose={() => setOtpSheetOpen(false)}
        title="Enter the start code"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          Ask the customer for the 4-digit code shown in their app.
        </Text>
        <Input
          placeholder="0000"
          value={otpInput}
          onChangeText={setOtpInput}
          keyboardType="number-pad"
          maxLength={6}
          containerStyle={styles.otpInput}
        />
        <Button
          label="Start service"
          onPress={handleStartService}
          disabled={otpInput.length < 4}
          loading={startingService}
          fullWidth
        />
      </BottomSheet>

      {/* ── Completion ───────────────────────────────────────────────────── */}
      <BottomSheet
        visible={completeSheetOpen}
        onClose={() => setCompleteSheetOpen(false)}
        title="Complete this job?"
      >
        <Text variant="bodySmall" color={colors.textSecondary}>
          Mark the work as finished. The customer is asked to rate you afterwards.
        </Text>
        <Button
          label="Yes, complete"
          variant="success"
          onPress={handleComplete}
          loading={completing}
          fullWidth
          style={styles.sheetPrimary}
        />
        <Button
          label="Not yet"
          variant="secondary"
          onPress={() => setCompleteSheetOpen(false)}
          fullWidth
          style={styles.sheetSecondary}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pad: { paddingHorizontal: screenPadding },
  scroll: { paddingHorizontal: screenPadding, gap: spacing.lg },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  kycCard: { backgroundColor: colors.warningTint, borderColor: colors.warningTint, gap: spacing.md },
  kycRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kycIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycButton: { alignSelf: 'flex-start' },

  errorCard: { backgroundColor: colors.errorTint, borderColor: colors.errorTint },

  waitingCard: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },

  block: { gap: spacing.sm },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockTitle: { marginBottom: 0 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  otpInput: { marginTop: spacing.base, marginBottom: spacing.lg },
  sheetPrimary: { marginTop: spacing.lg },
  sheetSecondary: { marginTop: spacing.sm },
});
