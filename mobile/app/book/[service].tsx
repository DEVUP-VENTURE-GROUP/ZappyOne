import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Location from 'expo-location';
import { MapPin, ChevronLeft, Zap, Wallet, CreditCard, Tag, Check } from 'lucide-react-native';
import { useLazyGetQuoteQuery, useCreateOrderMutation } from '../../services/api/ordersApi';
import { useValidatePromoMutation } from '../../services/api/promosApi';
import { useCreatePaymentOrderMutation, useVerifyPaymentMutation } from '../../services/api/paymentsApi';
import { useSaveRecentLocationMutation } from '../../services/api/authApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import { openCashfreeCheckout, parseReturnUrl, paymentReturnUrl } from '../../services/payments/cashfreeCheckout';
import type { BookingTier, PaymentMethod } from '../../types/api';

const TIERS: { key: BookingTier; label: string; hint: string }[] = [
  { key: 'standard', label: 'Standard', hint: 'Best value' },
  { key: 'priority', label: 'Priority', hint: '+20% · faster match' },
  { key: 'express', label: 'Express', hint: '+40% · fastest match' },
];

export default function BookServiceScreen() {
  const { service } = useLocalSearchParams<{ service: string }>();
  const router = useRouter();

  // ── Location ────────────────────────────────────────────────────────────
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [locating, setLocating] = useState(true);

  // ── Booking options ─────────────────────────────────────────────────────
  const [tier, setTier] = useState<BookingTier>('standard');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountPaise: number } | null>(null);
  const [description, setDescription] = useState('');

  const [fetchQuote, { data: quote, isFetching: quoting }] = useLazyGetQuoteQuery();
  const [validatePromo, { isLoading: validatingPromo }] = useValidatePromoMutation();
  const [createOrder, { isLoading: creatingOrder }] = useCreateOrderMutation();
  const [createPaymentOrder] = useCreatePaymentOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [saveRecentLocation] = useSaveRecentLocationMutation();
  const [payingOnline, setPayingOnline] = useState(false);

  // Get current GPS on mount + reverse-geocode for a readable address.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocating(false); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setLoc({ lat, lng });
        try {
          const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (a) setAddress([a.name, a.street, a.city, a.region].filter(Boolean).join(', '));
        } catch { /* reverse geocode is a convenience — user can still type the address */ }
        fetchQuote({ service: String(service), pickupLat: lat, pickupLng: lng });
      } catch {
        Alert.alert('Location error', 'Could not get your location. Enable GPS and try again.');
      } finally {
        setLocating(false);
      }
    })();
  }, [service]);

  const basePrice = quote?.total ?? 0;
  const tierMultiplier = tier === 'priority' ? 1.2 : tier === 'express' ? 1.4 : 1.0;
  const tieredPrice = basePrice * tierMultiplier;
  const discount = appliedPromo ? appliedPromo.discountPaise / 100 : 0;
  const finalPrice = Math.max(0, tieredPrice - discount);

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      const res = await validatePromo({
        code: promoCode.trim(),
        service: String(service),
        totalPaise: Math.round(tieredPrice * 100),
      }).unwrap();
      if (res.valid) {
        setAppliedPromo({ code: res.code || promoCode.trim(), discountPaise: res.discountPaise || 0 });
      } else {
        Alert.alert('Promo code', res.message || 'This code is not valid for this booking.');
      }
    } catch (err) {
      Alert.alert('Promo code', getApiErrorMessage(err, 'Could not apply this code.'));
    }
  };

  const confirm = async () => {
    if (!loc) { Alert.alert('Location needed', 'We need your location to find a nearby pro.'); return; }
    if (!address.trim()) { Alert.alert('Address needed', 'Please enter your address.'); return; }

    try {
      const order = await createOrder({
        service: String(service),
        pickupLocation: {
          lat: loc.lat,
          lng: loc.lng,
          address: address.trim(),
          ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
          ...(flatNumber.trim() ? { flatNumber: flatNumber.trim() } : {}),
        },
        ...(description.trim() ? { description: description.trim() } : {}),
        paymentMethod,
        tier,
        ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        ...(finalPrice ? { quotedTotalRupees: Math.round(finalPrice) } : {}),
      }).unwrap();

      // Best-effort — speeds up the address picker on the next booking. Never
      // blocks the flow if it fails.
      saveRecentLocation({ lat: loc.lat, lng: loc.lng, address: address.trim() }).catch(() => {});

      if (paymentMethod === 'cash') {
        router.replace(`/tracking/order/${order._id}`);
        return;
      }

      // Online payment: the order is already created and dispatch has already
      // started (matches how the server works — payment never blocks
      // matching). We just try to collect payment now for a better UX; if it
      // fails or is cancelled, the booking is still live and payment can be
      // completed later from the tracking screen.
      setPayingOnline(true);
      try {
        const paymentOrder = await createPaymentOrder({
          purpose: 'order_payment',
          orderId: order._id,
          returnUrl: paymentReturnUrl(),
        }).unwrap();

        const outcome = await openCashfreeCheckout(paymentOrder.paymentSessionId, paymentOrder.cashfreeEnv);
        if (outcome.kind === 'returned') {
          const { cfOrderId, cfPaymentId } = parseReturnUrl(outcome.url);
          if (cfOrderId && cfPaymentId) {
            await verifyPayment({ cfOrderId, cfPaymentId }).unwrap().catch(() => {
              // Non-fatal — the Cashfree webhook is the source of truth and
              // will settle the order's payment status server-side regardless.
            });
          }
        }
      } catch (payErr) {
        Alert.alert(
          'Payment not completed',
          'Your booking is confirmed — you can pay online again from the tracking screen, or pay cash on completion.',
        );
      } finally {
        setPayingOnline(false);
      }

      router.replace(`/tracking/order/${order._id}`);
    } catch (e) {
      const code = (e as { data?: { code?: string } })?.data?.code;
      if (code === 'NO_WORKERS_IN_AREA') {
        Alert.alert("We're not in your area yet", 'No workers available here right now — we are expanding fast!');
      } else if (code === 'PRICE_CHANGED') {
        Alert.alert('Price changed', 'The price changed since your quote. Refreshing…');
        if (loc) fetchQuote({ service: String(service), pickupLat: loc.lat, pickupLng: loc.lng });
      } else if (code === 'ACTIVE_ORDER_EXISTS') {
        Alert.alert('You have an active booking', 'Complete or cancel it before placing a new one.');
      } else {
        Alert.alert('Booking failed', getApiErrorMessage(e, 'Please try again.'));
      }
    }
  };

  const title = String(service || '').replace(/_/g, ' ');
  const busy = creatingOrder || payingOnline;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center">
          <ChevronLeft size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-navy ml-3 capitalize">{title}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {/* Location */}
          <Text className="text-sm font-bold text-gray-400 uppercase mt-4 mb-2">Service location</Text>
          <View className="bg-gray-50 rounded-2xl p-4 flex-row items-start gap-3">
            <MapPin size={18} color="#2563EB" />
            <View className="flex-1">
              {locating ? (
                <Text className="text-gray-400">Getting your location…</Text>
              ) : loc ? (
                <Text className="text-xs text-gray-400">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</Text>
              ) : (
                <Text className="text-red-500 text-xs">Location unavailable — enable GPS</Text>
              )}
            </View>
          </View>

          <TextInput
            className="border border-gray-200 rounded-xl p-3 text-base mt-3"
            placeholder="House / flat, area, landmark"
            value={address}
            onChangeText={setAddress}
            multiline
          />
          <View className="flex-row gap-3 mt-3">
            <TextInput
              className="flex-1 border border-gray-200 rounded-xl p-3 text-sm"
              placeholder="Flat / house no. (optional)"
              value={flatNumber}
              onChangeText={setFlatNumber}
            />
            <TextInput
              className="flex-1 border border-gray-200 rounded-xl p-3 text-sm"
              placeholder="Landmark (optional)"
              value={landmark}
              onChangeText={setLandmark}
            />
          </View>

          {/* Issue description */}
          <Text className="text-sm font-bold text-gray-400 uppercase mt-5 mb-2">Tell us more (optional)</Text>
          <TextInput
            className="border border-gray-200 rounded-xl p-3 text-base"
            placeholder="What's the issue? Any details help your pro prepare."
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* Tier */}
          <Text className="text-sm font-bold text-gray-400 uppercase mt-5 mb-2">Speed</Text>
          <View className="flex-row gap-2">
            {TIERS.map((t) => {
              const on = tier === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTier(t.key)}
                  className={`flex-1 rounded-xl border p-3 ${on ? 'bg-primary border-primary' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`text-sm font-bold ${on ? 'text-white' : 'text-navy'}`}>{t.label}</Text>
                  <Text className={`text-[11px] mt-0.5 ${on ? 'text-blue-100' : 'text-gray-400'}`}>{t.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Payment method */}
          <Text className="text-sm font-bold text-gray-400 uppercase mt-5 mb-2">Payment</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setPaymentMethod('cash')}
              className={`flex-1 flex-row items-center gap-2 rounded-xl border p-3 ${paymentMethod === 'cash' ? 'bg-primary/5 border-primary' : 'border-gray-200'}`}
            >
              <Wallet size={16} color={paymentMethod === 'cash' ? '#2563EB' : '#64748B'} />
              <Text className={`text-sm font-semibold ${paymentMethod === 'cash' ? 'text-primary' : 'text-navy'}`}>Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPaymentMethod('upi')}
              className={`flex-1 flex-row items-center gap-2 rounded-xl border p-3 ${paymentMethod !== 'cash' ? 'bg-primary/5 border-primary' : 'border-gray-200'}`}
            >
              <CreditCard size={16} color={paymentMethod !== 'cash' ? '#2563EB' : '#64748B'} />
              <Text className={`text-sm font-semibold ${paymentMethod !== 'cash' ? 'text-primary' : 'text-navy'}`}>Pay online</Text>
            </TouchableOpacity>
          </View>

          {/* Promo code */}
          <Text className="text-sm font-bold text-gray-400 uppercase mt-5 mb-2">Promo code</Text>
          {appliedPromo ? (
            <View className="flex-row items-center justify-between bg-emerald-50 rounded-xl p-3">
              <View className="flex-row items-center gap-2">
                <Check size={16} color="#16A34A" />
                <Text className="text-sm font-bold text-emerald-700">{appliedPromo.code} applied</Text>
              </View>
              <TouchableOpacity onPress={() => { setAppliedPromo(null); setPromoCode(''); }}>
                <Text className="text-xs font-semibold text-emerald-700">Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <View className="flex-1 flex-row items-center border border-gray-200 rounded-xl px-3">
                <Tag size={16} color="#94A3B8" />
                <TextInput
                  className="flex-1 p-3 text-sm"
                  placeholder="Enter code"
                  autoCapitalize="characters"
                  value={promoCode}
                  onChangeText={setPromoCode}
                />
              </View>
              <TouchableOpacity
                onPress={handleApplyPromo}
                disabled={!promoCode.trim() || validatingPromo}
                className="bg-navy rounded-xl px-5 items-center justify-center"
              >
                {validatingPromo ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-bold text-sm">Apply</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Price breakdown */}
          <Text className="text-sm font-bold text-gray-400 uppercase mt-5 mb-2">Price</Text>
          <View className="bg-primary/5 rounded-2xl p-4">
            {quoting ? (
              <ActivityIndicator color="#2563EB" />
            ) : basePrice ? (
              <>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-sm text-gray-500">Fare{tier !== 'standard' ? ` (${tier})` : ''}</Text>
                  <Text className="text-sm text-navy font-semibold">₹{Math.round(tieredPrice)}</Text>
                </View>
                {discount > 0 ? (
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-sm text-emerald-600">Promo discount</Text>
                    <Text className="text-sm text-emerald-600 font-semibold">-₹{Math.round(discount)}</Text>
                  </View>
                ) : null}
                <View className="flex-row justify-between mt-2 pt-2 border-t border-primary/10">
                  <Text className="text-base font-bold text-navy">Total</Text>
                  <Text className="text-2xl font-extrabold text-navy">₹{Math.round(finalPrice)}</Text>
                </View>
                {quote?.surgeMultiplier && quote.surgeMultiplier > 1 ? (
                  <Text className="text-xs text-accent mt-1">{quote.surgeMultiplier}× surge in effect</Text>
                ) : null}
              </>
            ) : (
              <Text className="text-gray-400">Quote will appear after location is set</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-3 bg-white border-t border-gray-100">
        <TouchableOpacity
          className="bg-primary rounded-2xl p-4 items-center flex-row justify-center gap-2"
          onPress={confirm}
          disabled={busy || locating}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Zap size={18} color="#fff" />}
          <Text className="text-white text-lg font-bold">
            {payingOnline ? 'Waiting for payment…' : creatingOrder ? 'Booking…' : 'Confirm Booking'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
