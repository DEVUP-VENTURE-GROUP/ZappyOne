import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ChevronLeft, MessageSquare, X, Star, CreditCard } from 'lucide-react-native';
import {
  useGetOrderQuery, useCancelOrderMutation, useRateOrderMutation,
} from '../../../services/api/ordersApi';
import { useCreatePaymentOrderMutation, useVerifyPaymentMutation } from '../../../services/api/paymentsApi';
import { openCashfreeCheckout, parseReturnUrl, paymentReturnUrl } from '../../../services/payments/cashfreeCheckout';
import { getApiErrorMessage } from '../../../services/api/apiSlice';
import { LiveTrackingMap } from '../../../components/maps/LiveTrackingMap';
import { useSocket } from '../../../hooks/useSocket';
import type { OrderStatus } from '../../../types/api';
import type { OrderDispatchUpdateEvent, OrderEtaEvent } from '../../../services/socket/events';

const STAGES: OrderStatus[] = ['searching', 'assigned', 'on_the_way', 'arrived', 'in_progress', 'completed'];
const LABEL: Record<string, string> = {
  created: 'Booking placed',
  searching: 'Finding a professional…',
  assigned: 'Professional assigned',
  on_the_way: 'On the way to you',
  arrived: 'Arrived at your location',
  in_progress: 'Service in progress',
  completed: 'Service completed',
  cancelled: 'Booking cancelled',
  failed: 'Booking failed',
};
const CANCELLABLE: OrderStatus[] = ['created', 'searching', 'assigned', 'on_the_way'];

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = String(id);
  const router = useRouter();

  const { data: order, isLoading, refetch } = useGetOrderQuery(orderId, { pollingInterval: 15000 });
  const [cancelOrder, { isLoading: cancelling }] = useCancelOrderMutation();
  const [rateOrder, { isLoading: rating }] = useRateOrderMutation();
  const [createPaymentOrder, { isLoading: startingPayment }] = useCreatePaymentOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();

  const [dispatchUpdate, setDispatchUpdate] = useState<OrderDispatchUpdateEvent | null>(null);
  const [eta, setEta] = useState<OrderEtaEvent | null>(null);
  const [ratingValue, setRatingValue] = useState(0);

  const socketClient = useSocket(orderId);

  useEffect(() => {
    const onStatus = () => refetch();
    const onDispatch = (payload: OrderDispatchUpdateEvent) => setDispatchUpdate(payload);
    const onEta = (payload: OrderEtaEvent) => setEta(payload);
    const onCancelled = () => refetch();

    socketClient.on('order.status', onStatus);
    socketClient.on('order.dispatch_update', onDispatch);
    socketClient.on('order.eta', onEta);
    socketClient.on('order.cancelled', onCancelled);
    socketClient.on('order.worker_cancelled', onCancelled);

    return () => {
      socketClient.off('order.status', onStatus);
      socketClient.off('order.dispatch_update', onDispatch);
      socketClient.off('order.eta', onEta);
      socketClient.off('order.cancelled', onCancelled);
      socketClient.off('order.worker_cancelled', onCancelled);
    };
  }, [socketClient, refetch]);

  const pickup = order?.pickupLocation?.coordinates
    ? { lat: order.pickupLocation.coordinates[1], lng: order.pickupLocation.coordinates[0] }
    : null;

  const status = order?.status;
  const stageIdx = status ? STAGES.indexOf(status) : -1;

  const doCancel = () => {
    Alert.alert('Cancel booking', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel', style: 'destructive', onPress: async () => {
          try { await cancelOrder({ id: orderId }).unwrap(); }
          catch (e) { Alert.alert('Failed', getApiErrorMessage(e, 'Please try again.')); }
        },
      },
    ]);
  };

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
    return <SafeAreaView className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#2563EB" /></SafeAreaView>;
  }

  const needsPayment = order.payment?.method !== 'cash' && order.payment?.status === 'pending' && status !== 'cancelled';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-3 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3">Track Booking</Text>
      </View>

      {/* Map */}
      <View style={{ height: 280 }}>
        {pickup ? (
          <LiveTrackingMap
            orderId={orderId}
            pickupLat={pickup.lat}
            pickupLng={pickup.lng}
            initialWorkerLocation={order.workerCurrentLocation ?? null}
          />
        ) : (
          <View className="flex-1 bg-gray-100 items-center justify-center"><Text className="text-gray-400">Map unavailable</Text></View>
        )}
      </View>

      <ScrollView className="flex-1 px-5">
        {/* Status */}
        <View className="bg-primary/5 rounded-2xl p-4 mt-4">
          <Text className="text-lg font-bold text-navy">{LABEL[status ?? ''] || status}</Text>
          <Text className="text-xs text-gray-500 mt-0.5 capitalize">
            {String(order.service || '').replace(/_/g, ' ')} · ₹{order.pricing?.total ?? '—'}
          </Text>
          {dispatchUpdate?.message && status === 'searching' ? (
            <Text className="text-xs text-primary font-semibold mt-2">{dispatchUpdate.message}</Text>
          ) : null}
          {eta?.etaMinutes != null && status === 'on_the_way' ? (
            <Text className="text-xs text-primary font-semibold mt-2">Arriving in ~{Math.round(eta.etaMinutes)} min</Text>
          ) : null}
        </View>

        {/* Payment pending */}
        {needsPayment ? (
          <TouchableOpacity
            className="flex-row items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-3"
            onPress={payNow}
            disabled={startingPayment}
          >
            <View className="flex-row items-center gap-2">
              <CreditCard size={16} color="#B45309" />
              <Text className="text-sm font-bold text-amber-800">Payment pending</Text>
            </View>
            {startingPayment ? <ActivityIndicator size="small" color="#B45309" /> : <Text className="text-xs font-bold text-amber-800">Pay now</Text>}
          </TouchableOpacity>
        ) : null}

        {/* Progress */}
        {status !== 'cancelled' && status !== 'failed' ? (
          <View className="mt-5">
            {STAGES.slice(0, 5).map((s) => {
              const done = stageIdx >= STAGES.indexOf(s);
              return (
                <View key={s} className="flex-row items-center mb-3">
                  <View className={`w-3 h-3 rounded-full ${done ? 'bg-primary' : 'bg-gray-200'}`} />
                  <Text className={`ml-3 ${done ? 'text-navy font-semibold' : 'text-gray-400'}`}>{LABEL[s]}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Start-service OTP */}
        {order.otp && ['assigned', 'on_the_way', 'arrived'].includes(status ?? '') ? (
          <View className="bg-accent/10 rounded-2xl p-4 mt-3">
            <Text className="text-xs font-bold text-accent uppercase">Start OTP</Text>
            <Text className="text-2xl font-extrabold text-navy tracking-widest mt-1">{order.otp}</Text>
            <Text className="text-xs text-gray-500 mt-1">Share this with the professional to start the service</Text>
          </View>
        ) : null}

        {/* Worker info + chat */}
        {order.workerId ? (
          <View className="mt-4">
            {order.workerName ? (
              <View className="flex-row items-center justify-between mb-3">
                <Text className="font-bold text-navy">{order.workerName}</Text>
                {order.workerRating != null ? (
                  <View className="flex-row items-center gap-1">
                    <Star size={13} color="#F59E0B" fill="#F59E0B" />
                    <Text className="text-xs font-semibold text-gray-500">{order.workerRating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-2 border border-gray-200 rounded-xl p-3"
              onPress={() => router.push(`/chat/${orderId}`)}
            >
              <MessageSquare size={16} color="#2563EB" /><Text className="font-semibold text-navy">Chat</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Rating (completed, not yet rated) */}
        {status === 'completed' && order.userRating == null ? (
          <View className="bg-gray-50 rounded-2xl p-4 mt-4">
            <Text className="font-bold text-navy mb-3">Rate your experience</Text>
            <View className="flex-row gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setRatingValue(n)}>
                  <Star size={30} color="#F59E0B" fill={n <= ratingValue ? '#F59E0B' : 'transparent'} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              className={`rounded-xl p-3 items-center ${ratingValue ? 'bg-primary' : 'bg-gray-300'}`}
              onPress={submitRating}
              disabled={!ratingValue || rating}
            >
              {rating ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Submit rating</Text>}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Cancel */}
        {status && CANCELLABLE.includes(status) ? (
          <TouchableOpacity className="flex-row items-center justify-center gap-2 mt-5 mb-10" onPress={doCancel} disabled={cancelling}>
            <X size={16} color="#EF4444" /><Text className="text-red-500 font-semibold">Cancel booking</Text>
          </TouchableOpacity>
        ) : (
          <View className="mb-10" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
