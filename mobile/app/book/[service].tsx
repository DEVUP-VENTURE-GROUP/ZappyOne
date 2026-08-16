/**
 * Booking — service → location → quote → confirm → searching.
 * ----------------------------------------------------------------------------
 * One screen, progressive disclosure. Uber and Urban Company both keep booking
 * on a single surface with a sheet for the address rather than a wizard, and
 * that suits this flow: everything except the address is a one-tap choice, so
 * splitting it across routes would cost taps and lose context.
 *
 * ── WHO OWNS THE PRICE ─────────────────────────────────────────────────────
 * The server does. `GET /orders/quote` is the only source of a price here and
 * nothing on this screen recomputes one. Two client-side arithmetic operations
 * survive, both required by the server's own contract:
 *
 *   1. The tier multiplier. `/orders/quote` accepts no tier, so the server
 *      cannot price a tier in advance. It applies the multiplier itself at
 *      order creation and — per the comment on `quotedTotalRupees` in
 *      `order.routes.js` — expects the client to send the TIER-ADJUSTED total
 *      so its surge guard compares like with like. Sending the un-tiered total
 *      would make every priority (+20%) and express (+40%) booking fail the
 *      10% tolerance and 409 with PRICE_CHANGED.
 *   2. Adding the tip, which the server also applies before that guard.
 *
 * The promo discount is deliberately NOT subtracted from `quotedTotalRupees`.
 * The server applies promos AFTER the surge check, so a discounted figure makes
 * the fresh total look inflated by exactly the discount and the booking is
 * rejected. The previous version of this screen sent the discounted total and
 * would 409 on any promo worth more than 10% of the bill.
 *
 * ── STATES ────────────────────────────────────────────────────────────────
 * Location: unset · locating · resolved · permission denied
 * Quote:    idle (no location) · loading · loaded · error
 * Submit:   idle · creating · paying · failed (with a reason per error code)
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  MapPin,
  Pencil,
  SearchX,
  Tag,
  X,
  Zap,
} from 'lucide-react-native';
import {
  Appear,
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Heading,
  IconButton,
  Input,
  SectionTitle,
  Skeleton,
  Text,
  formatRupees,
} from '../../components/ui';
import { QuoteCard } from '../../components/booking/QuoteCard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  locationDraftCleared,
  locationSeeded,
  type DraftLocation,
} from '../../store/locationDraftSlice';
import {
  normalizeQuote,
  quotedTotalForGuard,
  TIER_MULTIPLIERS,
  type BookingTierKey,
} from '../../components/booking/quote';
import {
  humanizeCode,
  resolveServiceIcon,
} from '../../components/catalog/categoryIcons';
import { categoryForService } from '../../components/catalog/matchCategory';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import {
  useCreateOrderMutation,
  useLazyGetQuoteQuery,
} from '../../services/api/ordersApi';
import { useValidatePromoMutation } from '../../services/api/promosApi';
import {
  useCreatePaymentOrderMutation,
  useVerifyPaymentMutation,
} from '../../services/api/paymentsApi';
import {
  useGetAddressesQuery,
  useSaveRecentLocationMutation,
} from '../../services/api/authApi';
import { getApiErrorMessage } from '../../services/api/apiSlice';
import {
  openCashfreeCheckout,
  parseReturnUrl,
  paymentReturnUrl,
} from '../../services/payments/cashfreeCheckout';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { screenPadding, spacing } from '../../theme/spacing';
import { shadows } from '../../theme/shadows';
import type { PaymentMethod } from '../../types/api';

const TIERS: { key: BookingTierKey; label: string; hint: string }[] = [
  { key: 'standard', label: 'Standard', hint: 'Best value' },
  { key: 'priority', label: 'Priority', hint: 'Faster match' },
  { key: 'express', label: 'Express', hint: 'Fastest match' },
];

/** Boost amounts. The server caps `tipAmount` at ₹500 (`order.routes.js`). */
const BOOSTS = [0, 20, 50, 100];

export default function BookServiceScreen() {
  const { service } = useLocalSearchParams<{ service: string }>();
  const serviceCode = String(service);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── Selection state ───────────────────────────────────────────────────────
  const [location, setLocation] = useState<DraftLocation | null>(null);
  const [tier, setTier] = useState<BookingTierKey>('standard');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [boost, setBoost] = useState(0);
  const [description, setDescription] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [payingOnline, setPayingOnline] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: services = [], isLoading: catalogLoading } = useGetServicesQuery();
  const { data: categories = [] } = useGetCategoriesQuery();
  const { data: savedLocations, isLoading: addressesLoading } = useGetAddressesQuery();
  const savedAddresses = savedLocations?.addresses ?? [];

  const [fetchQuote, quoteState] = useLazyGetQuoteQuery();
  const [validatePromo, { isLoading: validatingPromo }] = useValidatePromoMutation();
  const [createOrder, { isLoading: creatingOrder }] = useCreateOrderMutation();
  const [createPaymentOrder] = useCreatePaymentOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [saveRecentLocation] = useSaveRecentLocationMutation();

  const catalogService = useMemo(
    () => services.find((s) => s.code === serviceCode) ?? null,
    [services, serviceCode],
  );
  const category = useMemo(
    () => (catalogService ? categoryForService(catalogService, categories) : null),
    [catalogService, categories],
  );

  const quote = useMemo(() => normalizeQuote(quoteState.data), [quoteState.data]);

  // ── Location picker hand-off ──────────────────────────────────────────────
  // The picker is its own screen, so it returns through the locationDraft slice
  // rather than a callback. `requestId` is tracked so a result is applied once
  // and not re-applied on every subsequent render of this screen.
  const dispatch = useAppDispatch();
  const draft = useAppSelector((state) => state.locationDraft);
  const consumedRequestId = useRef(0);

  useEffect(() => {
    if (!draft.picked || draft.requestId === consumedRequestId.current) return;
    consumedRequestId.current = draft.requestId;
    setLocation(draft.picked);
    setSubmitError(null);
    dispatch(locationDraftCleared());
  }, [draft, dispatch]);

  const openLocationPicker = useCallback(() => {
    // Seeds the map where the booking already stands so it doesn't jump. Goes
    // through the store, not router params — the address is personal data and
    // params end up in the URL. See locationDraftSlice.
    dispatch(locationSeeded(location));
    router.push('/location/picker');
  }, [dispatch, router, location]);
  const quoteError = quoteState.error
    ? getApiErrorMessage(quoteState.error, 'Pricing is unavailable right now.')
    : null;

  // Default to the saved address marked default, so the common case is zero
  // taps. Only seeds once, and never overrides an explicit choice.
  useEffect(() => {
    if (location || savedAddresses.length === 0) return;
    const preferred = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
    if (!preferred) return;
    setLocation({
      lat: preferred.lat,
      lng: preferred.lng,
      address: preferred.address,
      landmark: preferred.landmark,
      flatNumber: preferred.flatNumber,
      source: 'saved',
      savedLabel: preferred.label || preferred.tag,
    });
  }, [savedAddresses, location]);

  /** Re-quote whenever the pin moves. Price depends on pickup, nothing else. */
  useEffect(() => {
    if (!location) return;
    fetchQuote({
      service: serviceCode,
      pickupLat: location.lat,
      pickupLng: location.lng,
    });
  }, [location?.lat, location?.lng, serviceCode, fetchQuote]);

  const retryQuote = useCallback(() => {
    if (!location) return;
    fetchQuote(
      { service: serviceCode, pickupLat: location.lat, pickupLng: location.lng },
      false,
    );
  }, [location, serviceCode, fetchQuote]);

  // ── Promo ─────────────────────────────────────────────────────────────────
  const applyPromo = useCallback(async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code || !quote) return;
    setPromoError(null);
    try {
      const result = await validatePromo({
        code,
        service: serviceCode,
        // Validation is checked against the tier-adjusted, pre-discount total —
        // the same figure the order carries.
        totalPaise: quotedTotalForGuard(quote.total, tier, boost) * 100,
      }).unwrap();

      if (result.valid) {
        setAppliedPromo(result.code || code);
        setPromoInput('');
      } else {
        setPromoError(result.message || 'This code is not valid for this booking.');
      }
    } catch (err) {
      setPromoError(getApiErrorMessage(err, 'Could not check this code.'));
    }
  }, [promoInput, quote, serviceCode, tier, boost, validatePromo]);

  // ── Confirm ───────────────────────────────────────────────────────────────
  const confirm = useCallback(async () => {
    if (!location || !quote) return;
    setSubmitError(null);

    try {
      const order = await createOrder({
        service: serviceCode,
        pickupLocation: {
          lat: location.lat,
          lng: location.lng,
          address: location.address,
          ...(location.landmark ? { landmark: location.landmark } : {}),
          ...(location.flatNumber ? { flatNumber: location.flatNumber } : {}),
        },
        ...(description.trim() ? { description: description.trim() } : {}),
        paymentMethod,
        tier,
        ...(boost > 0 ? { tipAmount: boost } : {}),
        ...(appliedPromo ? { promoCode: appliedPromo } : {}),
        // Pre-discount on purpose — see the header note.
        quotedTotalRupees: quotedTotalForGuard(quote.total, tier, boost),
      }).unwrap();

      // Best effort: speeds up the address picker next time. Never blocks.
      saveRecentLocation({
        lat: location.lat,
        lng: location.lng,
        address: location.address,
      }).catch(() => {});

      if (paymentMethod === 'cash') {
        router.replace(`/tracking/order/${order._id}`);
        return;
      }

      // Online payment. The order already exists and dispatch has already
      // started — payment never blocks matching on this backend — so a failed
      // or abandoned checkout still leaves a live booking.
      setPayingOnline(true);
      try {
        const paymentOrder = await createPaymentOrder({
          purpose: 'order_payment',
          orderId: order._id,
          returnUrl: paymentReturnUrl(),
        }).unwrap();

        const outcome = await openCashfreeCheckout(
          paymentOrder.paymentSessionId,
          paymentOrder.cashfreeEnv,
        );
        if (outcome.kind === 'returned') {
          const { cfOrderId, cfPaymentId } = parseReturnUrl(outcome.url);
          if (cfOrderId && cfPaymentId) {
            // Non-fatal: the Cashfree webhook is the source of truth and
            // settles payment status server-side either way.
            await verifyPayment({ cfOrderId, cfPaymentId }).unwrap().catch(() => {});
          }
        }
      } catch {
        /* Booking is live; tracking screen offers payment again. */
      } finally {
        setPayingOnline(false);
      }

      router.replace(`/tracking/order/${order._id}`);
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === 'NO_WORKERS_IN_AREA') {
        setSubmitError(
          "We're not live in your area yet — no pros are covering this location right now.",
        );
      } else if (code === 'PRICE_CHANGED') {
        setSubmitError('The price changed while you were booking. Refreshing your quote…');
        retryQuote();
      } else if (code === 'ACTIVE_ORDER_EXISTS') {
        setSubmitError(
          'You already have a booking in progress. Finish or cancel it before starting another.',
        );
      } else {
        setSubmitError(getApiErrorMessage(err, 'We could not place this booking.'));
      }
    }
  }, [
    location,
    quote,
    serviceCode,
    description,
    paymentMethod,
    tier,
    boost,
    appliedPromo,
    createOrder,
    saveRecentLocation,
    router,
    createPaymentOrder,
    verifyPayment,
    retryQuote,
  ]);

  // ── Derived presentation ──────────────────────────────────────────────────
  const accent = category?.theme?.accent ?? zappy[600];
  const Icon = resolveServiceIcon(catalogService?.icon, serviceCode);
  const name = catalogService?.name || humanizeCode(serviceCode);
  const duration = catalogService?.estimatedDurationMinutes;

  const payable = quote ? quotedTotalForGuard(quote.total, tier, boost) : 0;
  const busy = creatingOrder || payingOnline;
  const canConfirm = Boolean(location) && Boolean(quote) && !busy;

  // Service isn't in the catalog — a stale deep link or a retired code.
  if (!catalogLoading && !catalogService) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.plainBar}>
          <IconButton
            icon={<ChevronLeft size={20} color={colors.textHeading} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <EmptyState
          icon={<SearchX size={28} color={colors.textMuted} />}
          title="Service unavailable"
          message="This service is no longer available to book."
          actionLabel="Browse services"
          onAction={() => router.replace('/(tabs)/services')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton
          icon={<ChevronLeft size={20} color={colors.textHeading} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <View style={styles.flex}>
          <Text variant="caption" color={colors.textMuted}>
            Confirm your booking
          </Text>
          <Heading level={3} numberOfLines={1}>
            {catalogLoading ? 'Loading…' : name}
          </Heading>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 150 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── 1. Service ───────────────────────────────────────────── */}
          <Appear>
            <SectionTitle>Service</SectionTitle>
            {catalogLoading ? (
              <Skeleton width="100%" height={78} borderRadius={radius.large} />
            ) : (
              <Card variant="outline">
                <View style={styles.serviceRow}>
                  <View style={[styles.serviceIcon, { backgroundColor: `${accent}14` }]}>
                    <Icon size={22} strokeWidth={1.9} color={accent} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="body" weight="semibold" numberOfLines={1}>
                      {name}
                    </Text>
                    <View style={styles.serviceMeta}>
                      {category ? (
                        <Text variant="caption" color={colors.textSecondary}>
                          {category.customerLabel}
                        </Text>
                      ) : null}
                      {duration ? (
                        <>
                          <View style={styles.dot} />
                          <Clock size={11} color={colors.textMuted} />
                          <Text variant="caption" color={colors.textSecondary}>
                            {duration} min
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Card>
            )}
          </Appear>

          {/* ── 2. Location ──────────────────────────────────────────── */}
          <Appear delay={40}>
            <SectionTitle>Where</SectionTitle>
            <Card
              variant="outline"
              onPress={openLocationPicker}
              accessibilityLabel={
                location ? 'Change service location' : 'Set service location'
              }
            >
              <View style={styles.serviceRow}>
                <View
                  style={[
                    styles.serviceIcon,
                    {
                      backgroundColor: location ? colors.primaryTint : colors.surfaceTertiary,
                    },
                  ]}
                >
                  <MapPin size={20} color={location ? colors.primary : colors.textMuted} />
                </View>
                <View style={styles.flex}>
                  {location ? (
                    <>
                      <Text variant="body" weight="semibold" numberOfLines={1}>
                        {location.savedLabel
                          ? location.savedLabel
                          : location.source === 'gps'
                            ? 'Current location'
                            : 'Service address'}
                      </Text>
                      <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                        {[location.flatNumber, location.address, location.landmark]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    </>
                  ) : addressesLoading ? (
                    <>
                      <Skeleton width="55%" height={14} />
                      <Skeleton width="85%" height={11} style={{ marginTop: spacing.xs }} />
                    </>
                  ) : (
                    <>
                      <Text variant="body" weight="semibold">
                        Add your address
                      </Text>
                      <Text variant="caption" color={colors.textSecondary}>
                        We need it to price the job and find nearby pros.
                      </Text>
                    </>
                  )}
                </View>
                {location ? (
                  <Pencil size={16} color={colors.textMuted} />
                ) : (
                  <ChevronRight size={18} color={colors.textMuted} />
                )}
              </View>
            </Card>
          </Appear>

          {/* ── 3. Quote ─────────────────────────────────────────────── */}
          <Appear delay={80}>
            <SectionTitle>Price</SectionTitle>
            <QuoteCard
              quote={quote}
              loading={quoteState.isFetching}
              errorMessage={quoteError}
              hasLocation={Boolean(location)}
              tier={tier}
              tipRupees={boost}
              promoCode={appliedPromo}
              onRetry={retryQuote}
              onEditLocation={openLocationPicker}
            />
          </Appear>

          {/* ── 4. Speed ─────────────────────────────────────────────── */}
          <Appear delay={120}>
            <SectionTitle>How soon</SectionTitle>
            <View style={styles.tierRow}>
              {TIERS.map((option) => {
                const selected = tier === option.key;
                const uplift = Math.round((TIER_MULTIPLIERS[option.key] - 1) * 100);
                return (
                  <Card
                    key={option.key}
                    variant={selected ? 'default' : 'outline'}
                    onPress={() => setTier(option.key)}
                    padding={spacing.md}
                    style={[styles.tierCard, selected ? styles.tierCardActive : null]}
                    accessibilityLabel={`${option.label}, ${option.hint}`}
                  >
                    <Text
                      variant="bodySmall"
                      weight="semibold"
                      color={selected ? colors.primary : colors.textHeading}
                    >
                      {option.label}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary}>
                      {option.hint}
                    </Text>
                    {uplift > 0 ? (
                      <Text variant="caption" color={colors.accentDark}>
                        +{uplift}%
                      </Text>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </Appear>

          {/* ── 5. Payment ───────────────────────────────────────────── */}
          <Appear delay={160}>
            <SectionTitle>Payment</SectionTitle>
            <View style={styles.payRow}>
              <Card
                variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                onPress={() => setPaymentMethod('cash')}
                padding={spacing.md}
                style={[
                  styles.payCard,
                  paymentMethod === 'cash' ? styles.tierCardActive : null,
                ]}
                accessibilityLabel="Pay cash after the job"
              >
                <Banknote
                  size={18}
                  color={paymentMethod === 'cash' ? colors.primary : colors.textSecondary}
                />
                <Text
                  variant="bodySmall"
                  weight="semibold"
                  color={paymentMethod === 'cash' ? colors.primary : colors.textHeading}
                >
                  Cash
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Pay after the job
                </Text>
              </Card>
              <Card
                variant={paymentMethod !== 'cash' ? 'default' : 'outline'}
                onPress={() => setPaymentMethod('upi')}
                padding={spacing.md}
                style={[
                  styles.payCard,
                  paymentMethod !== 'cash' ? styles.tierCardActive : null,
                ]}
                accessibilityLabel="Pay online now"
              >
                <CreditCard
                  size={18}
                  color={paymentMethod !== 'cash' ? colors.primary : colors.textSecondary}
                />
                <Text
                  variant="bodySmall"
                  weight="semibold"
                  color={paymentMethod !== 'cash' ? colors.primary : colors.textHeading}
                >
                  Pay online
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  UPI, card, wallet
                </Text>
              </Card>
            </View>
          </Appear>

          {/* ── 6. Extras ────────────────────────────────────────────── */}
          <Appear delay={200}>
            <SectionTitle>Booking details</SectionTitle>
            <Card variant="outline" padding={0} style={styles.extrasCard}>
              <Card
                variant="flat"
                onPress={() => setDetailsSheetOpen(true)}
                padding={spacing.base}
                style={styles.extrasRow}
                accessibilityLabel="Add a note for your pro"
              >
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="semibold">
                    Note for your pro
                  </Text>
                  <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {description.trim() || 'Optional — what should they know?'}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </Card>

              <Divider style={styles.flushDivider} />

              {/* Boost is a real server field (`tipAmount`, capped at ₹500) and
                  goes 100% to the worker. */}
              <View style={styles.boostBlock}>
                <Text variant="bodySmall" weight="semibold">
                  Boost for your pro
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Added to the fare — 100% goes to the pro who takes the job.
                </Text>
                <View style={styles.boostRow}>
                  {BOOSTS.map((amount) => (
                    <Chip
                      key={amount}
                      label={amount === 0 ? 'None' : `+${formatRupees(amount)}`}
                      selected={boost === amount}
                      tone={boost === amount ? 'blue' : 'neutral'}
                      onPress={() => setBoost(amount)}
                    />
                  ))}
                </View>
              </View>

              <Divider style={styles.flushDivider} />

              <View style={styles.boostBlock}>
                <Text variant="bodySmall" weight="semibold">
                  Promo code
                </Text>
                {appliedPromo ? (
                  <View style={styles.promoApplied}>
                    <Check size={15} color={colors.successDark} />
                    <Text variant="bodySmall" color={colors.successDark} style={styles.flex}>
                      {appliedPromo} applied
                    </Text>
                    <IconButton
                      icon={<X size={15} color={colors.textSecondary} />}
                      onPress={() => {
                        setAppliedPromo(null);
                        setPromoError(null);
                      }}
                      variant="surface"
                      accessibilityLabel="Remove promo code"
                    />
                  </View>
                ) : (
                  <View style={styles.promoRow}>
                    <Input
                      placeholder="Enter code"
                      value={promoInput}
                      onChangeText={(next) => {
                        setPromoInput(next);
                        setPromoError(null);
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      leadingIcon={<Tag size={15} color={colors.textMuted} />}
                      containerStyle={styles.flex}
                      error={promoError}
                    />
                    <Button
                      label="Apply"
                      variant="secondary"
                      onPress={applyPromo}
                      loading={validatingPromo}
                      disabled={!promoInput.trim() || !quote}
                      style={styles.promoButton}
                    />
                  </View>
                )}
              </View>
            </Card>
          </Appear>

          {/* ── Submit failure ───────────────────────────────────────── */}
          {submitError ? (
            <Appear>
              <Card variant="outline" style={styles.submitError}>
                <Text variant="bodySmall" color={colors.errorDark}>
                  {submitError}
                </Text>
              </Card>
            </Appear>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Floating CTA ───────────────────────────────────────────────── */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.base }]}>
        <View style={styles.ctaTop}>
          {quote ? (
            <View style={styles.flex}>
              <Text variant="caption" color={colors.textMuted}>
                Estimated total
              </Text>
              <Text variant="heading2">{formatRupees(payable)}</Text>
            </View>
          ) : (
            <Text
              variant="caption"
              color={quoteError ? colors.errorDark : colors.textSecondary}
              style={styles.flex}
            >
              {!location
                ? 'Add an address to see your price'
                : quoteError
                  ? 'No price yet — retry above to continue'
                  : 'Working out your price…'}
            </Text>
          )}
        </View>
        <Button
          label={
            payingOnline
              ? 'Waiting for payment…'
              : creatingOrder
                ? 'Placing your booking…'
                : !location
                  ? 'Add your address'
                  : 'Confirm booking'
          }
          icon={busy ? undefined : <Zap size={17} color={colors.textInverse} />}
          onPress={location ? confirm : openLocationPicker}
          loading={busy}
          disabled={Boolean(location) && !canConfirm}
          fullWidth
          size="large"
        />
      </View>

      <BottomSheet
        visible={detailsSheetOpen}
        onClose={() => setDetailsSheetOpen(false)}
        title="Note for your pro"
      >
        <Input
          placeholder="What's the issue? Any detail helps them arrive prepared."
          value={description}
          onChangeText={setDescription}
          multiline
          multilineHeight={120}
          maxLength={500}
          helper={`${description.length}/500`}
        />
        <Button
          label="Done"
          onPress={() => setDetailsSheetOpen(false)}
          fullWidth
          style={styles.sheetDone}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  plainBar: { paddingHorizontal: screenPadding, paddingVertical: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  scroll: { paddingHorizontal: screenPadding, paddingTop: spacing.lg, gap: spacing.lg },

  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted },

  tierRow: { flexDirection: 'row', gap: spacing.sm },
  tierCard: { flex: 1, gap: 1 },
  tierCardActive: { borderWidth: 1.5, borderColor: colors.primary },

  payRow: { flexDirection: 'row', gap: spacing.sm },
  payCard: { flex: 1, gap: spacing.xxs },

  extrasCard: { overflow: 'hidden' },
  extrasRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 0 },
  flushDivider: { marginVertical: 0 },
  boostBlock: { padding: spacing.base, gap: spacing.xxs },
  boostRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },

  promoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.sm },
  promoButton: { marginTop: 0 },
  promoApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },

  submitError: { backgroundColor: colors.errorTint, borderColor: colors.errorTint },

  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
    ...shadows.softLarge,
  },
  ctaTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  sheetDone: { marginTop: spacing.base },
});
