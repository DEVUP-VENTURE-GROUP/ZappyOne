import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, CreditCard, LocateFixed, Star } from 'lucide-react-native';
import {
  useGetOrderQuery, useCancelOrderMutation, useRateOrderMutation,
  useGetCancelPreviewQuery, useRebookOrderMutation,
} from '../../../services/api/ordersApi';
import { SearchingState } from '../../../components/tracking/SearchingState';
import {
  BookingCancelled,
  BookingFailed,
  WorkerFound,
} from '../../../components/tracking/DispatchOutcome';
import {
  BottomSheet,
  Button,
  Card,
  IconButton,
  LoadingState,
  ScreenHeader,
} from '../../../components/ui';
import { TrackingCard } from '../../../components/tracking/TrackingCard';
import { shadows } from '../../../theme/shadows';
import { fontFamily } from '../../../theme/typography';
import { colors } from '../../../theme/colors';
import { useCreatePaymentOrderMutation, useVerifyPaymentMutation } from '../../../services/api/paymentsApi';
import { openCashfreeCheckout, parseReturnUrl, paymentReturnUrl } from '../../../services/payments/cashfreeCheckout';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { LiveTrackingMap } from '../../../components/maps/LiveTrackingMap';
import { useSocket } from '../../../hooks/useSocket';
import type { OrderStatus } from '../../../types/api';
import type { OrderDispatchUpdateEvent, OrderEtaEvent } from '../../../services/socket/events';


export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = String(id);
  const router = useRouter();

  const { data: order, isLoading, refetch } = useGetOrderQuery(orderId, { pollingInterval: 15000 });
  const [cancelOrder, { isLoading: cancelling }] = useCancelOrderMutation();
  const [rateOrder, { isLoading: rating }] = useRateOrderMutation();
  const [createPaymentOrder, { isLoading: startingPayment }] = useCreatePaymentOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  // Whether cancelling is allowed — and what it costs — is the server's call,
  // never this screen's. Skipped once the order is terminal.
  const isTerminal = ['completed', 'cancelled', 'failed'].includes(order?.status ?? '');
  const { data: cancelPreview } = useGetCancelPreviewQuery(orderId, {
    skip: !order || isTerminal,
  });
  const [rebookOrder, { isLoading: rebooking }] = useRebookOrderMutation();

  // The moment the search resolves is worth its own beat — someone who has been
  // watching a pulse for two minutes should be told plainly that it worked,
  // not silently dropped onto a map. Shown only on the searching → assigned
  // transition, and dismissed by the customer rather than a timer.
  const [showAssigned, setShowAssigned] = useState(false);
  const prevStatus = useRef<OrderStatus | undefined>(undefined);

  const insets = useSafeAreaInsets();

  // Camera ownership. Auto-framing is handed to the customer the moment they
  // pan, and only given back when they ask for it — a map that keeps snapping
  // back while you are trying to look around is worse than no map.
  const [followWorker, setFollowWorker] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  const [dispatchUpdate, setDispatchUpdate] = useState<OrderDispatchUpdateEvent | null>(null);
  const [eta, setEta] = useState<OrderEtaEvent | null>(null);
  const [ratingValue, setRatingValue] = useState(0);

  const socketClient = useSocket(orderId);

  /**
   * Only the FOCUSED tracking screen may act on order-room events.
   *
   * `order.dispatch_update` and `order.eta` carry no order id — they are
   * room-scoped only (dispatch.worker.js / eta.service.js). Expo Router keeps
   * pushed screens mounted, so opening tracking for a second order leaves the
   * first one subscribed as well, and its "Still searching…" message and ETA
   * would be written onto the other order's screen. Nothing distinguishes them
   * in the payload, so the screen has to distinguish itself.
   */
  // `useFocusEffect` subscribes on focus and tears down on blur, which is
  // exactly the lifetime wanted here — no extra state, and a blurred screen
  // holds no listeners at all.
  useFocusEffect(
    useCallback(() => {
    const onStatus = () => refetch();
    const onDispatch = (payload: OrderDispatchUpdateEvent) => setDispatchUpdate(payload);
    const onEta = (payload: OrderEtaEvent) => setEta(payload);
    const onCancelled = () => refetch();
    // `order.assigned` fires the moment a pro takes the job — ahead of the
    // `order.status` transition — so it is the earliest point the search can
    // stop. Refetching here is what ends the dispatch UI promptly instead of
    // waiting up to 15s for the poll.
    const onAssigned = () => refetch();
    // Dispatch gave up. `order.status` follows, but this carries the reason
    // and arrives first.
    const onFailed = () => refetch();

    socketClient.on('order.status', onStatus);
    socketClient.on('order.assigned', onAssigned);
    socketClient.on('order.failed', onFailed);
    socketClient.on('order.dispatch_update', onDispatch);
    socketClient.on('order.eta', onEta);
    socketClient.on('order.cancelled', onCancelled);
    socketClient.on('order.worker_cancelled', onCancelled);

    return () => {
      socketClient.off('order.status', onStatus);
      socketClient.off('order.assigned', onAssigned);
      socketClient.off('order.failed', onFailed);
      socketClient.off('order.dispatch_update', onDispatch);
      socketClient.off('order.eta', onEta);
      socketClient.off('order.cancelled', onCancelled);
      socketClient.off('order.worker_cancelled', onCancelled);
    };
    }, [socketClient, refetch]),
  );

  useEffect(() => {
    const next = order?.status;
    const previous = prevStatus.current;
    if (next === 'assigned' && (previous === 'searching' || previous === 'created')) {
      setShowAssigned(true);
    }
    prevStatus.current = next;
  }, [order?.status]);

  const pickup = order?.pickupLocation?.coordinates
    ? { lat: order.pickupLocation.coordinates[1], lng: order.pickupLocation.coordinates[0] }
    : null;

  const status = order?.status;

  const payNow = async () => {
    try {
      const paymentOrder = await createPaymentOrder({
        purpose: 'order_payment',
        orderId,
        returnUrl: paymentReturnUrl(),
      }).unwrap();
      const outcome = await openCashfreeCheckout(paymentOrder.paymentSessionId, paymentOrder.cashfreeEnv);
      if (outcome.kind === 'returned') {
        const { cfOrderId, cfPaymentId } = parseReturnUrl(outcome.url);
        if (cfOrderId && cfPaymentId) {
          await verifyPayment({ cfOrderId, cfPaymentId }).unwrap().catch(() => {});
        }
      }
      refetch();
    } catch (e) {
      Alert.alert('Payment failed', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  const submitRating = async () => {
    if (!ratingValue) return;
    try {
      await rateOrder({ id: orderId, rating: ratingValue }).unwrap();
    } catch (e) {
      Alert.alert('Failed', getApiErrorMessage(e, 'Could not submit your rating.'));
    }
  };

  if (isLoading || !order) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingState label="Loading your booking…" />
      </View>
    );
  }

  // ── Dispatch states take over the whole screen ──────────────────────────
  // While dispatch is still running there is no worker, no position and no ETA,
  // so the map and the stage list below would be empty chrome around a blank.
  // These render instead, and yield to the tracking UI the moment the server
  // says `assigned`.
  const doRebook = async () => {
    try {
      const next = await rebookOrder(orderId).unwrap();
      router.replace(`/tracking/order/${next._id}`);
    } catch (e) {
      Alert.alert('Could not rebook', getApiErrorMessage(e, 'Please try again.'));
    }
  };

  if (status === 'created' || status === 'searching') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Finding your pro" onBack={() => router.back()} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <SearchingState
            order={order}
            dispatchUpdate={dispatchUpdate}
            cancelPreview={cancelPreview}
            cancelling={cancelling}
            onCancel={(reason) => {
              cancelOrder({ id: orderId, reason }).unwrap().catch((e) => {
                Alert.alert('Could not cancel', getApiErrorMessage(e, 'Please try again.'));
              });
            }}
          />
        </ScrollView>
      </View>
    );
  }

  if (status === 'assigned' && showAssigned) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <WorkerFound order={order} />
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Button label="Track your pro" onPress={() => setShowAssigned(false)} fullWidth />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (status === 'cancelled' || status === 'failed') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Booking" onBack={() => router.back()} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {status === 'cancelled' ? (
            <BookingCancelled
              onRebook={rebooking ? undefined : doRebook}
              onDone={() => router.replace('/(tabs)/home')}
            />
          ) : (
            <BookingFailed
              order={order}
              onRebook={rebooking ? undefined : doRebook}
              onDone={() => router.replace('/(tabs)/home')}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Live tracking ───────────────────────────────────────────────────────
  // Map fills the screen, card floats over it. Only presentation changed here:
  // the socket contract, the tracking APIs and the location hooks are as they
  // were — LiveTrackingMap still owns the `worker.location` subscription and
  // this screen still owns `order.status`, `order.eta` and the dispatch feed.
  const needsPayment =
    order.payment?.method !== 'cash' && order.payment?.status === 'pending';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Map — full bleed behind everything. */}
      <View style={styles.mapLayer}>
        {pickup ? (
          <LiveTrackingMap
            orderId={orderId}
            pickupLat={pickup.lat}
            pickupLng={pickup.lng}
            initialWorkerLocation={order.workerCurrentLocation ?? null}
            followWorker={followWorker}
            onUserPan={() => setFollowWorker(false)}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Text style={{ color: colors.textMuted }}>Map unavailable for this booking</Text>
          </View>
        )}
      </View>

      {/* Floating controls over the map. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, pointerEvents: 'box-none' }]}>
        <IconButton
          icon={<ChevronLeft size={20} color={colors.textHeading} />}
          onPress={() => router.back()}
          variant="surface"
          accessibilityLabel="Go back"
          style={styles.floatingControl}
        />
        {/* Recentre appears only once the customer has taken control of the
            camera — offering it before then would be a no-op button. */}
        {!followWorker && order.workerCurrentLocation ? (
          <IconButton
            icon={<LocateFixed size={19} color={colors.primary} />}
            onPress={() => setFollowWorker(true)}
            variant="surface"
            accessibilityLabel="Recentre the map"
            style={styles.floatingControl}
          />
        ) : null}
      </View>

      {/* Bottom sheet. */}
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {needsPayment ? (
          <Card
            variant="outline"
            onPress={startingPayment ? undefined : payNow}
            style={styles.payBanner}
          >
            <View style={styles.payRow}>
              <CreditCard size={16} color={colors.accentDark} />
              <Text style={styles.payText}>Payment pending</Text>
              {startingPayment ? (
                <ActivityIndicator size="small" color={colors.accentDark} />
              ) : (
                <Text style={styles.payAction}>Pay now</Text>
              )}
            </View>
          </Card>
        ) : null}

        <TrackingCard
          order={order}
          eta={eta}
          cancelPreview={cancelPreview}
          onChat={() => router.push(`/chat/${orderId}`)}
          onCancel={() => setCancelOpen(true)}
          onRate={() => setRateOpen(true)}
        />
      </ScrollView>

      {/* Cancel — gated on the server's own canCancel, wording from its preview. */}
      <BottomSheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
      >
        {cancelPreview?.message ? (
          <View
            style={[
              styles.feeNotice,
              { backgroundColor: cancelPreview.isFree ? colors.successTint : colors.warningTint },
            ]}
          >
            <Text
              style={{
                color: cancelPreview.isFree ? colors.successDark : colors.accentDark,
                fontFamily: fontFamily.semibold,
              }}
            >
              {cancelPreview.message}
            </Text>
          </View>
        ) : null}
        <Button
          label="Yes, cancel booking"
          variant="danger"
          onPress={() => {
            setCancelOpen(false);
            cancelOrder({ id: orderId, reason: 'user_cancelled' }).unwrap().catch((e) => {
              Alert.alert('Could not cancel', getApiErrorMessage(e, 'Please try again.'));
            });
          }}
          loading={cancelling}
          fullWidth
          style={{ marginTop: 16 }}
        />
        <Button
          label="Keep my booking"
          variant="secondary"
          onPress={() => setCancelOpen(false)}
          fullWidth
          style={{ marginTop: 8 }}
        />
      </BottomSheet>

      {/* Rating — completed orders only, and only until one is submitted. */}
      <BottomSheet visible={rateOpen} onClose={() => setRateOpen(false)} title="Rate your experience">
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <IconButton
              key={n}
              icon={
                <Star
                  size={30}
                  color={colors.accent}
                  fill={n <= ratingValue ? colors.accent : 'transparent'}
                />
              }
              onPress={() => setRatingValue(n)}
              variant="plain"
              accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            />
          ))}
        </View>
        <Button
          label="Submit rating"
          onPress={async () => {
            await submitRating();
            setRateOpen(false);
          }}
          disabled={!ratingValue}
          loading={rating}
          fullWidth
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTertiary,
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  floatingControl: { backgroundColor: colors.surface, ...shadows.soft },

  // The sheet sits at the bottom; the scroll view above it is transparent so
  // the map stays visible and pannable through the gap.
  sheetScroll: { flex: 1 },
  sheetContent: { flexGrow: 1, justifyContent: 'flex-end', gap: 10 },

  payBanner: {
    marginHorizontal: 20,
    backgroundColor: colors.warningTint,
    borderColor: colors.warningTint,
  },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payText: { flex: 1, color: colors.accentDark, fontFamily: fontFamily.semibold, fontSize: 14 },
  payAction: { color: colors.accentDark, fontFamily: fontFamily.bold, fontSize: 13 },

  feeNotice: { borderRadius: 8, padding: 12, marginTop: 12 },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 20 },
});
