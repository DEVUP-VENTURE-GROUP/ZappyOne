/**
 * Location picker.
 * ----------------------------------------------------------------------------
 * Choose location → search → map → selected address → confirm.
 *
 * Full-bleed map with a floating search field above it and a sheet-styled panel
 * anchored at the bottom. That is the Uber / Urban Company arrangement, and it
 * is here for a practical reason rather than a stylistic one: the pin and the
 * address text have to be visible at the same moment the customer commits, or
 * they cannot tell that the two agree.
 *
 * ── ONE SOURCE OF TRUTH ────────────────────────────────────────────────────
 * `pin` is the only authority for where the booking goes. Everything that can
 * move it — GPS, a search result, a saved address, a recent, a marker drag, a
 * map tap — writes to `pin`, and a single effect reverse-geocodes whatever
 * `pin` currently is. Nothing writes the address text independently, so the
 * label under the map can never describe a different place from the marker.
 *
 * The one deliberate exception: `addressOverride`. When a customer picks a
 * saved address, their own wording ("Mum's place, gate 2") is better than the
 * geocoder's, so it is kept until the pin moves again.
 *
 * ── HOW THE RESULT GETS BACK ───────────────────────────────────────────────
 * Through `locationDraft` in Redux, not router params — see that slice for why.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  AlertTriangle,
  Briefcase,
  ChevronLeft,
  Clock,
  Crosshair,
  House,
  MapPin,
  Navigation,
  Search,
  SearchX,
  X,
  ArrowRight,
  Lock,
} from 'lucide-react-native';
import {
  Appear,
  Button,
  Card,
  IconButton,
  Input,
  SectionTitle,
  Skeleton,
  Text,
} from '../../components/ui';
import { PickerMap } from '../../components/location/PickerMap';
import {
  describeCoordinates,
  joinAddress,
  searchAddress,
  type GeoResult,
} from '../../components/location/geocode';
import { useGetAddressesQuery } from '../../services/api/authApi';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { categoryForService } from '../../components/catalog/matchCategory';
import { ServiceIllustration } from '../../components/catalog/ServiceIllustration';
import { illustrationFor } from '../../components/catalog/illustrations/resolve';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { locationPicked, type DraftLocation } from '../../store/locationDraftSlice';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { screenPadding, spacing } from '../../theme/spacing';
import type { RecentLocation, SavedAddress } from '../../types/api';

/** Falls back to Hyderabad's centre only until a real fix or pick arrives. */
const FALLBACK_PIN = { lat: 17.385, lng: 78.4867 };

/** Long enough that a fast typist isn't firing a geocode per keystroke. */
const SEARCH_DEBOUNCE_MS = 450;

type PermissionState = 'checking' | 'granted' | 'denied' | 'servicesOff';
type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; results: GeoResult[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export default function LocationPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  // Opened with wherever the caller already stood, so the map doesn't jump.
  // Read once from the store — router params would put the address in the URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seed = useRef(useAppSelector((state) => state.locationDraft.seed)).current;

  const initialPin = useMemo(
    () =>
      seed && Number.isFinite(seed.lat) && Number.isFinite(seed.lng)
        ? { lat: seed.lat, lng: seed.lng }
        : null,
    [seed],
  );

  const [pin, setPin] = useState<{ lat: number; lng: number }>(initialPin ?? FALLBACK_PIN);
  const [hasPin, setHasPin] = useState(Boolean(initialPin));
  const [source, setSource] = useState<DraftLocation['source']>(seed?.source ?? 'map');
  const [savedLabel, setSavedLabel] = useState<string | undefined>(seed?.savedLabel);

  /** Customer's own wording, kept over the geocoder's until the pin moves. */
  const [addressOverride, setAddressOverride] = useState<string | null>(
    seed?.address ?? null,
  );
  const [resolved, setResolved] = useState<{ title: string; subtitle: string } | null>(null);
  const [resolving, setResolving] = useState(false);

  const [flatNumber, setFlatNumber] = useState(seed?.flatNumber ?? '');
  const [landmark, setLandmark] = useState(seed?.landmark ?? '');

  const [permission, setPermission] = useState<PermissionState>('checking');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number } | null>(null);

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });

  const { data: saved, isLoading: savedLoading } = useGetAddressesQuery();

  /**
   * Real header height, measured.
   *
   * The permission notice floats below the header and used to sit at a
   * hardcoded `insets.top + 116` — tuned to the header as it was. Adding the
   * service row and the step line made the header taller and the notice
   * overlapped the search field by 11px. Measuring means the notice cannot
   * drift out of place again the next time the header changes.
   */
  const [headerHeight, setHeaderHeight] = useState(0);

  /**
   * Booking context. `service` is the catalog CODE, passed by the booking
   * screen so this header can name what is being booked the way the website
   * does. Absent when the picker is reached any other way, in which case the
   * plain "Choose location" title renders instead.
   */
  const { service: serviceParam } = useLocalSearchParams<{ service?: string }>();
  const { data: catalogServices = [] } = useGetServicesQuery();
  const { data: catalogCategories = [] } = useGetCategoriesQuery();

  const bookingService = useMemo(
    () => (serviceParam ? catalogServices.find((s) => s.code === serviceParam) ?? null : null),
    [catalogServices, serviceParam],
  );
  const serviceName = bookingService?.name ?? null;
  const serviceCategory = useMemo(
    () => (bookingService ? categoryForService(bookingService, catalogCategories) : null),
    [bookingService, catalogCategories],
  );
  const serviceAccent = serviceCategory?.theme?.accent ?? colors.primary;
  const serviceDrawing = bookingService
    ? illustrationFor(bookingService, bookingService.category)
    : 'tools';
  const savedAddresses = saved?.addresses ?? [];
  const recentLocations = saved?.recentLocations ?? [];

  // ── Move the pin ──────────────────────────────────────────────────────────
  const movePin = useCallback(
    (lat: number, lng: number, nextSource: DraftLocation['source'], label?: string) => {
      setPin({ lat, lng });
      setHasPin(true);
      setSource(nextSource);
      setSavedLabel(label);
      // Any move invalidates a hand-written label — except when the move IS the
      // pick of a labelled place, which passes its own text in separately.
      if (nextSource === 'map' || nextSource === 'gps') setAddressOverride(null);
    },
    [],
  );

  // ── GPS ───────────────────────────────────────────────────────────────────
  const locate = useCallback(
    async (isInitial: boolean) => {
      setGpsBusy(true);
      try {
        const servicesOn = await Location.hasServicesEnabledAsync();
        if (!servicesOn) {
          setPermission('servicesOff');
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setPermission('denied');
          return;
        }
        setPermission('granted');

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsFix(fix);

        // On first open, only take over the map if the caller gave us nothing.
        // Overriding an address the customer already chose would be rude.
        if (!isInitial || !initialPin) {
          movePin(fix.lat, fix.lng, 'gps');
        }
      } catch {
        setPermission((prev) => (prev === 'checking' ? 'denied' : prev));
      } finally {
        setGpsBusy(false);
      }
    },
    [initialPin, movePin],
  );

  useEffect(() => {
    locate(true);
    // Deliberately once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // With no GPS and nothing pre-selected, the customer's saved and recent
  // places are the only way to make progress — and on web they are the ONLY
  // way, since there is no drag gesture. Surface them rather than leaving an
  // empty map behind a search field they have to think to tap.
  const shortcutsShown = useRef(false);
  useEffect(() => {
    if (shortcutsShown.current || hasPin) return;
    if (permission !== 'denied' && permission !== 'servicesOff') return;
    if (savedAddresses.length === 0 && recentLocations.length === 0) return;
    shortcutsShown.current = true;
    setSearchOpen(true);
  }, [permission, hasPin, savedAddresses.length, recentLocations.length]);

  // ── Reverse-geocode whatever the pin currently is ─────────────────────────
  useEffect(() => {
    if (!hasPin) return;
    let cancelled = false;
    setResolving(true);
    describeCoordinates(pin.lat, pin.lng)
      .then((place) => {
        if (cancelled) return;
        setResolved(
          place
            ? { title: place.title, subtitle: place.subtitle }
            : { title: `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`, subtitle: '' },
        );
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pin.lat, pin.lng, hasPin]);

  // ── Debounced address search ──────────────────────────────────────────────
  const searchSeq = useRef(0);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setSearch({ kind: 'idle' });
      return;
    }
    setSearch({ kind: 'searching' });
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      const outcome = await searchAddress(text);
      // A slower earlier request must not overwrite a newer one's results.
      if (seq !== searchSeq.current) return;
      if (outcome.kind === 'results') setSearch({ kind: 'results', results: outcome.results });
      else if (outcome.kind === 'empty') setSearch({ kind: 'empty' });
      else setSearch({ kind: 'error', message: outcome.message });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setQuery('');
    setSearch({ kind: 'idle' });
  }, []);

  const pickSearchResult = useCallback(
    (result: GeoResult) => {
      movePin(result.lat, result.lng, 'search');
      setAddressOverride(result.full);
      closeSearch();
    },
    [movePin, closeSearch],
  );

  const pickSaved = useCallback(
    (address: SavedAddress) => {
      movePin(address.lat, address.lng, 'saved', address.label || address.tag);
      setAddressOverride(address.address);
      setFlatNumber(address.flatNumber ?? '');
      setLandmark(address.landmark ?? '');
      closeSearch();
    },
    [movePin, closeSearch],
  );

  const pickRecent = useCallback(
    (recent: RecentLocation) => {
      movePin(recent.lat, recent.lng, 'recent');
      setAddressOverride(recent.address);
      closeSearch();
    },
    [movePin, closeSearch],
  );

  // ── Confirm ───────────────────────────────────────────────────────────────
  const addressLine =
    addressOverride ?? (resolved ? joinAddress(resolved.title, resolved.subtitle) : '');

  const confirm = useCallback(() => {
    if (!hasPin || !addressLine) return;
    dispatch(
      locationPicked({
        lat: pin.lat,
        lng: pin.lng,
        address: addressLine,
        flatNumber: flatNumber.trim() || undefined,
        landmark: landmark.trim() || undefined,
        source,
        savedLabel,
      }),
    );
    router.back();
  }, [
    hasPin,
    addressLine,
    dispatch,
    pin.lat,
    pin.lng,
    flatNumber,
    landmark,
    source,
    savedLabel,
    router,
  ]);

  const canConfirm = hasPin && Boolean(addressLine) && !resolving;

  // Gate the overlay on the QUERY as well as focus. Focus alone leaves a
  // reachable state where the customer has typed something, the field has lost
  // focus, and their results are hidden behind a screen they cannot see.
  const overlayVisible = searchOpen || query.trim().length > 0;
  const showShortcuts = savedAddresses.length > 0 || recentLocations.length > 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Map ────────────────────────────────────────────────────────── */}
      <View style={styles.mapLayer}>
        <PickerMap
          lat={pin.lat}
          lng={pin.lng}
          hasPin={hasPin}
          onMove={(lat, lng) => movePin(lat, lng, 'map')}
          onRecenter={gpsFix ? () => movePin(gpsFix.lat, gpsFix.lng, 'gps') : undefined}
          busy={gpsBusy}
        />
      </View>

      {/* ── Search overlay ─────────────────────────────────────────────── */}
      {overlayVisible ? (
        <View style={[styles.overlay, { paddingTop: insets.top + 116 }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.overlayScroll}
            showsVerticalScrollIndicator={false}
          >
            {search.kind === 'searching' ? (
              <View style={styles.overlayBlock}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.resultRow}>
                    <Skeleton width={34} height={34} borderRadius={radius.small} />
                    <View style={styles.flex}>
                      <Skeleton width="60%" height={13} />
                      <Skeleton width="85%" height={10} style={{ marginTop: spacing.xs }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {search.kind === 'results' ? (
              <Appear style={styles.overlayBlock}>
                <SectionTitle>Search results</SectionTitle>
                {search.results.map((result) => (
                  <Card
                    key={result.id}
                    variant="flat"
                    onPress={() => pickSearchResult(result)}
                    padding={spacing.md}
                    accessibilityLabel={`Use ${result.full}`}
                  >
                    <View style={styles.resultRow}>
                      <View style={styles.resultIcon}>
                        <MapPin size={16} color={colors.primary} />
                      </View>
                      <View style={styles.flex}>
                        <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                          {result.title}
                        </Text>
                        {result.subtitle ? (
                          <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                            {result.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Card>
                ))}
              </Appear>
            ) : null}

            {search.kind === 'empty' && query.trim().length >= 3 ? (
              <Appear style={styles.stateBlock}>
                <SearchX size={26} color={colors.textMuted} />
                <Text variant="body" weight="semibold">
                  No matches
                </Text>
                <Text variant="bodySmall" color={colors.textSecondary} align="center">
                  Nothing found for “{query.trim()}”. Try adding the city, or drop the
                  pin on the map instead.
                </Text>
                <Button label="Pick on the map" variant="secondary" size="small" onPress={closeSearch} />
              </Appear>
            ) : null}

            {search.kind === 'error' ? (
              <Appear style={styles.stateBlock}>
                <AlertTriangle size={26} color={colors.error} />
                <Text variant="body" weight="semibold">
                  Search unavailable
                </Text>
                <Text variant="bodySmall" color={colors.textSecondary} align="center">
                  {search.message}
                </Text>
                <Button label="Pick on the map" variant="secondary" size="small" onPress={closeSearch} />
              </Appear>
            ) : null}

            {/* Idle overlay is the fastest path for most people: their own places. */}
            {search.kind === 'idle' ? (
              savedLoading ? (
                <View style={styles.overlayBlock}>
                  <Skeleton width="100%" height={56} borderRadius={radius.medium} />
                  <Skeleton width="100%" height={56} borderRadius={radius.medium} />
                </View>
              ) : showShortcuts ? (
                <View style={styles.overlayBlock}>
                  {savedAddresses.length > 0 ? (
                    <>
                      <SectionTitle>Saved addresses</SectionTitle>
                      {savedAddresses.map((address) => {
                        const Icon =
                          address.tag === 'home'
                            ? House
                            : address.tag === 'work'
                              ? Briefcase
                              : MapPin;
                        return (
                          <Card
                            key={address._id}
                            variant="flat"
                            onPress={() => pickSaved(address)}
                            padding={spacing.md}
                            accessibilityLabel={`Use ${address.label || 'saved'} address`}
                          >
                            <View style={styles.resultRow}>
                              <View style={styles.resultIcon}>
                                <Icon size={16} color={colors.primary} />
                              </View>
                              <View style={styles.flex}>
                                <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                                  {address.label || address.tag || 'Saved address'}
                                </Text>
                                <Text
                                  variant="caption"
                                  color={colors.textSecondary}
                                  numberOfLines={2}
                                >
                                  {address.address}
                                </Text>
                              </View>
                            </View>
                          </Card>
                        );
                      })}
                    </>
                  ) : null}

                  {recentLocations.length > 0 ? (
                    <>
                      <SectionTitle style={styles.recentTitle}>Recent</SectionTitle>
                      {recentLocations.map((recent) => (
                        <Card
                          key={`${recent.address}-${recent.usedAt ?? ''}`}
                          variant="flat"
                          onPress={() => pickRecent(recent)}
                          padding={spacing.md}
                          accessibilityLabel={`Use recent location ${recent.address}`}
                        >
                          <View style={styles.resultRow}>
                            <View style={[styles.resultIcon, styles.recentIcon]}>
                              <Clock size={16} color={colors.textSecondary} />
                            </View>
                            <Text
                              variant="bodySmall"
                              style={styles.flex}
                              numberOfLines={2}
                            >
                              {recent.address}
                            </Text>
                          </View>
                        </Card>
                      ))}
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={styles.stateBlock}>
                  <Search size={26} color={colors.textMuted} />
                  <Text variant="bodySmall" color={colors.textSecondary} align="center">
                    Type at least 3 characters to search, or close this and drag the
                    pin to where you need the pro.
                  </Text>
                </View>
              )
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {/*
        ── Header + search ──────────────────────────────────────────────────
        The website opens its location step behind a dark navy bar carrying the
        SERVICE being booked — "Where do you need help? · Car Wash" — plus two
        step pills, then a blue "Step 1 of 2 · Choose location" line above the
        search field. Without that context the picker reads as a detached map
        screen rather than the first half of a booking.

        The service name is resolved from the catalog via the `service` param,
        so it is real catalog data; when the picker is opened outside a booking
        there is no param and it falls back to the plain title.
      */}
      <View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeaderHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
        }}
        style={[
          styles.header,
          serviceName ? styles.headerDark : null,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        <View style={styles.headerRow}>
          <IconButton
            icon={
              <ChevronLeft
                size={20}
                color={serviceName ? colors.textInverse : colors.textHeading}
              />
            }
            onPress={() => (overlayVisible ? closeSearch() : router.back())}
            variant={serviceName ? 'plain' : 'surface'}
            accessibilityLabel={overlayVisible ? 'Close search' : 'Go back'}
            style={serviceName ? styles.headerButtonOnDark : styles.headerButton}
          />

          {serviceName ? (
            <>
              <View style={styles.flex}>
                <Text variant="eyebrow" color="rgba(255,255,255,0.45)">
                  Where do you need help?
                </Text>
                <View style={styles.headerTitleRow}>
                  <View style={[styles.headerChip, { backgroundColor: serviceAccent }]}>
                    <ServiceIllustration
                      name={serviceDrawing}
                      size={13}
                      onColor
                      spotlight={false}
                    />
                  </View>
                  <Text
                    variant="body"
                    weight="extrabold"
                    color={colors.textInverse}
                    numberOfLines={1}
                    style={styles.flex}
                  >
                    {serviceName}
                  </Text>
                </View>
              </View>
              {/* Step pills — this screen is step 1 of the website's two. */}
              <View style={styles.steps}>
                <View style={[styles.step, styles.stepActive]} />
                <View style={[styles.step, styles.stepIdle]} />
              </View>
            </>
          ) : (
            <Text variant="heading3" style={styles.flex} numberOfLines={1}>
              Choose location
            </Text>
          )}
        </View>

        {serviceName ? (
          <View style={styles.stepLine}>
            <MapPin size={12} color={colors.primaryLight} />
            <Text variant="eyebrow" color={colors.primaryLight}>
              Step 1 of 2 · Choose location
            </Text>
          </View>
        ) : null}

        <Input
          placeholder="Search for area, street or landmark"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchOpen(true)}
          leadingIcon={<Search size={16} color={colors.textMuted} />}
          trailingIcon={
            query ? (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={8}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            ) : undefined
          }
          returnKeyType="search"
          autoCorrect={false}
          containerStyle={styles.search}
        />
      </View>

      {/* ── Permission / GPS notices ───────────────────────────────────── */}
      {!overlayVisible && (permission === 'denied' || permission === 'servicesOff') ? (
        <Appear
          style={[styles.notice, { top: headerHeight + spacing.md }]}
          offsetY={-6}
        >
          <Card variant="elevated" padding={spacing.md}>
            <View style={styles.noticeRow}>
              <View style={styles.noticeIcon}>
                <Navigation size={16} color={colors.warning} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="semibold">
                  {permission === 'servicesOff'
                    ? 'Location services are off'
                    : 'Location access is off'}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {permission === 'servicesOff'
                    ? 'Turn on GPS in your device settings, or set the pin yourself.'
                    : 'Allow location to centre the map on you, or set the pin yourself.'}
                </Text>
              </View>
            </View>
          </Card>
        </Appear>
      ) : null}

      {/* ── Address panel ──────────────────────────────────────────────── */}
      {!overlayVisible ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.panelWrap, styles.passThrough]}
        >
          <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.base }]}>
            <View style={styles.handle} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.panelScroll}
              // Keeps the sheet compact so the map stays the hero, but lets the
              // detail fields scroll into view when the keyboard is up.
              style={styles.panelScrollView}
            >
              <View style={styles.selectedRow}>
                <View style={styles.selectedIcon}>
                  <MapPin size={18} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <SectionTitle style={styles.selectedLabel}>
                    {permission === 'checking' && !hasPin
                      ? 'Finding you'
                      : savedLabel
                        ? savedLabel
                        : 'Selected location'}
                  </SectionTitle>

                  {permission === 'checking' && !hasPin ? (
                    <>
                      <Skeleton width="70%" height={15} />
                      <Skeleton width="90%" height={11} style={{ marginTop: spacing.xs }} />
                    </>
                  ) : resolving && !addressOverride ? (
                    <View style={styles.resolvingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text variant="bodySmall" color={colors.textSecondary}>
                        Reading the map…
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text variant="body" weight="semibold" numberOfLines={2}>
                        {addressOverride ?? resolved?.title ?? 'Move the pin to choose'}
                      </Text>
                      {!addressOverride && resolved?.subtitle ? (
                        <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>
                          {resolved.subtitle}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>

                <IconButton
                  icon={<Crosshair size={17} color={colors.primary} />}
                  onPress={() => locate(false)}
                  variant="surface"
                  disabled={gpsBusy}
                  accessibilityLabel="Use my current location"
                />
              </View>

              <View style={styles.detailRow}>
                <Input
                  label="Flat / house"
                  placeholder="Optional"
                  value={flatNumber}
                  onChangeText={setFlatNumber}
                  containerStyle={styles.flex}
                />
                <Input
                  label="Landmark"
                  placeholder="Optional"
                  value={landmark}
                  onChangeText={setLandmark}
                  containerStyle={styles.flex}
                />
              </View>
            </ScrollView>

            {/* The website's CTA reads "Confirm This Location →" and is
                followed by a reassurance line. Both are reproduced. */}
            <Button
              label="Confirm this location"
              iconRight={<ArrowRight size={17} color={colors.textInverse} />}
              onPress={confirm}
              disabled={!canConfirm}
              loading={permission === 'checking' && !hasPin}
              fullWidth
              size="large"
            />
            <View style={styles.secureRow}>
              <Lock size={11} color={colors.textMuted} />
              <Text variant="caption" color={colors.textMuted}>
                Your location is secure and encrypted
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** RN 0.85 deprecates the pointerEvents PROP; it belongs in style now. */
  passThrough: { pointerEvents: 'box-none' },
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  header: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.large,
    borderBottomRightRadius: radius.large,
    ...shadows.soft,
  },
  // The website's booking header — `linear-gradient(135deg,#0B1120,#0E1526)`
  // with a rounded bottom so the content below sits in a card.
  headerDark: { backgroundColor: '#0B1120' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerButtonOnDark: { backgroundColor: 'rgba(255,255,255,0.10)' },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  headerChip: {
    width: 24,
    height: 24,
    borderRadius: radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  step: { width: 24, height: 6, borderRadius: radius.pill },
  stepActive: { backgroundColor: colors.primary },
  stepIdle: { backgroundColor: 'rgba(255,255,255,0.20)' },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  stepLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
  },
  headerButton: { backgroundColor: colors.surfaceTertiary },
  search: { marginTop: spacing.md },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
  overlayScroll: { padding: screenPadding, paddingTop: spacing.base, gap: spacing.sm },
  overlayBlock: { gap: spacing.sm },
  recentTitle: { marginTop: spacing.base },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.small,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentIcon: { backgroundColor: colors.surfaceTertiary },

  stateBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },

  notice: { position: 'absolute', left: screenPadding, right: screenPadding },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noticeIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.small,
    backgroundColor: colors.warningTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  panelWrap: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.extraLarge,
    borderTopRightRadius: radius.extraLarge,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.base,
    ...shadows.softLarge,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  panelScrollView: { maxHeight: 260 },
  panelScroll: { gap: spacing.base, paddingBottom: spacing.xs },

  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectedIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.medium,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedLabel: { marginBottom: 2 },
  resolvingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  detailRow: { flexDirection: 'row', gap: spacing.md },
});
