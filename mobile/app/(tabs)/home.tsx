/**
 * Home — the landing tab.
 * ----------------------------------------------------------------------------
 * The catalog on this screen now speaks the SAME model as the Services tab,
 * the category screen and service detail:
 *
 *     DOMAIN → SERVICE → COVERAGE heading → PROBLEMS
 *
 * ── WHAT CHANGED AND WHY ───────────────────────────────────────────────────
 * Home used to render three catalog sections off `/catalog/services` and
 * `/catalog/categories`: a character grid, a "Featured services" rail, and
 * per-category rails assembled with a client-side matcher. All three produced
 * links in the OLD code namespace, so a tap from Home could land on a service
 * the rest of the app no longer knows about — that was the integration gap
 * left open at the end of the catalog rebuild.
 *
 * They are replaced by the live catalog, which is what the website's own home
 * page renders (`<LiveServices />` in `client/src/pages/HomePage.jsx` — the
 * very same component its services page uses). A service reaches this list
 * only when it is live AND some provider holds an approved enrolment, so
 * every link from Home now resolves in the same catalog the destination
 * screens read.
 *
 * No compatibility shim was left behind: there is no `ServiceCatalogItem`, no
 * static service list and no `matchCategory` lookup in this file any more.
 *
 * ── HOME IS A DIGEST, NOT THE WHOLE CATALOG ────────────────────────────────
 * The website renders every domain here. On a phone that is a very long
 * scroll in front of the rest of Home, so this shows the first
 * `HOME_DOMAINS` domains — in the server's own `displayOrder`, not a
 * curation of ours — and hands off to the Services tab for the rest. The
 * ordering decision stays server-side; the truncation is purely presentation.
 *
 * ── BOOKING BOUNDARY ───────────────────────────────────────────────────────
 * Two namespaces meet on this screen and they are NOT interchangeable:
 *
 *   catalog `service.code`  → a SERVICE LINE   (`mobile_repair`)
 *   `Order.service`         → a concrete JOB   (`screen_replacement`)
 *
 * The catalog sections above speak the first. "Book again" speaks the second,
 * and re-places the past order by ID so no translation is needed at all — see
 * `handleRebook`. Nothing here maps one onto the other, because the data model
 * does not contain that mapping.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight, Bell, ChevronRight, MapPin, PackageSearch, Search, Store,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  IconButton,
  ScalePressable,
  SectionHeader,
  SectionTitle,
  Skeleton,
  Text,
  ZappyLogo,
  formatRupees,
} from '../../components/ui';
import { humanizeCode } from '../../components/catalog/categoryIcons';
import { LiveServiceCard } from '../../components/catalog/LiveServiceCard';
import { allServices, iconFor } from '../../components/catalog/liveCatalog';
import { HomeHero } from '../../components/home/HomeHero';
import { ServiceIllustration } from '../../components/catalog/ServiceIllustration';
import { illustrationFor } from '../../components/catalog/illustrations/resolve';
import { useGetLiveCatalogQuery } from '../../services/api/catalogApi';
import { useListOrdersQuery, useRebookOrderMutation } from '../../services/api/ordersApi';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import { useGetAddressesQuery } from '../../services/api/authApi';
import { getApiErrorBody, getApiErrorMessage } from '../../services/api/apiSlice';
import type { RootState } from '../../store';
import { colors, indigo, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';
import {
  ACTIVE_ORDER_STATUSES,
  type LiveCatalogCategory,
  type LiveCatalogService,
  type Order,
} from '../../types/api';

const STATUS_LABEL: Record<string, string> = {
  created: 'Booking placed',
  searching: 'Finding a pro…',
  assigned: 'Pro assigned',
  on_the_way: 'On the way',
  arrived: 'Pro has arrived',
  in_progress: 'Service in progress',
};

/** Domains shown on Home before handing off to the Services tab. */
const HOME_DOMAINS = 2;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useSelector((state: RootState) => state.auth.user);

  const {
    data: domains,
    isLoading: catalogLoading,
    isError: catalogError,
    error: catalogErrorObj,
    refetch: refetchCatalog,
  } = useGetLiveCatalogQuery();

  const {
    data: ordersPage,
    isLoading: ordersLoading,
    refetch: refetchOrders,
    isFetching,
  } = useListOrdersQuery(1);
  const { data: notifData } = useListNotificationsQuery({ unreadOnly: true, page: 1 });
  const { data: savedAddresses } = useGetAddressesQuery();

  const [gpsLabel, setGpsLabel] = useState<string | null>(null);

  /**
   * What the header shows, in order of how well it reflects intent.
   *
   * GPS wins when we have it, but it must not be the ONLY source: a customer
   * who declined location, or simply has no last-known fix yet, still has a
   * saved default address that the rest of the app books against. The header
   * should not claim ignorance of a location the booking screen already uses.
   */
  const locationLabel = useMemo(() => {
    if (gpsLabel) return gpsLabel;
    const list = savedAddresses?.addresses ?? [];
    const preferred = list.find((a) => a.isDefault) ?? list[0];
    if (!preferred) return null;
    return preferred.label || preferred.address || null;
  }, [gpsLabel, savedAddresses]);

  // Best-effort location label. A denied permission just leaves the fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) return;
        const position = await Location.getLastKnownPositionAsync();
        if (!position || cancelled) return;
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (place && !cancelled) {
          setGpsLabel(
            [place.name, place.district ?? place.city].filter(Boolean).join(', ') || null,
          );
        }
      } catch {
        // Location is a nicety here; the saved address covers the real need.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orders = ordersPage?.orders ?? [];
  const activeOrder = useMemo(
    () => orders.find((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status)),
    [orders],
  );
  const recentCompleted = useMemo(
    () => orders.filter((o) => o.status === 'completed').slice(0, 3),
    [orders],
  );

  const unreadCount = notifData?.unread ?? 0;

  const catalog = domains ?? [];
  const shownDomains = catalog.slice(0, HOME_DOMAINS);
  // Real figure off the real catalog — not the old "50+" decoration, which was
  // counted against the retired endpoint and had stopped being true.
  const serviceCount = allServices(catalog).length;

  const openService = useCallback(
    (service: LiveCatalogService) => router.push(`/service/${service.code}` as never),
    [router],
  );

  // Heading codes are scoped per service — "display" exists for phones AND
  // laptops — so the owning service always travels with the link.
  const openCategory = useCallback(
    (category: LiveCatalogCategory, service: LiveCatalogService) =>
      router.push(`/category/${category.code}?service=${service.code}` as never),
    [router],
  );

  const refreshAll = useCallback(() => {
    refetchOrders();
    refetchCatalog();
  }, [refetchOrders, refetchCatalog]);

  /**
   * Book again — re-place a past order by its ID.
   *
   * ── WHY BY ID AND NOT BY SERVICE CODE ──────────────────────────────────
   * This used to push `/book/{order.service}`, which quietly assumed the
   * order's service code and the catalog's service code were the same thing.
   * They are not. `Order.service` is an enum of 79 concrete JOBS
   * (`screen_replacement`, `laptop_slow`); the live catalog's codes are
   * SERVICE LINES (`mobile_repair`, `laptop_repair`) — a line contains many
   * jobs. Only 3 of the 14 live line codes even appear in the order enum, and
   * those three (`pet_grooming`, `pet_transport`, `pet_vet_assist`) belong to
   * the pet booking pipeline, so treating them as order codes would create
   * the wrong KIND of booking while looking like it worked.
   *
   * `POST /orders/{id}/rebook` sidesteps the whole question: the server clones
   * the past order itself, so no code is ever re-derived or re-validated
   * against any catalog. This is the same approach the website takes, and the
   * same mutation this app already uses on the tracking screen.
   */
  const [rebookOrder] = useRebookOrderMutation();
  const [rebookingId, setRebookingId] = useState<string | null>(null);
  /**
   * Synchronous latch. RTK Query's `isLoading` only flips on the NEXT render,
   * so a fast double-tap fires two rebooks before it turns true — the same
   * trap the booking screen documents. A ref is updated immediately.
   */
  const rebooking = useRef(false);

  const handleRebook = useCallback(
    async (order: Order) => {
      if (rebooking.current) return;
      rebooking.current = true;
      setRebookingId(order._id);

      try {
        const next = await rebookOrder(order._id).unwrap();
        router.push(`/tracking/order/${next._id}` as never);
      } catch (err) {
        const message = getApiErrorMessage(err, 'Please try again.');
        // The server attaches `activeOrderId` to its 409 and the error
        // middleware spreads unknown fields into the body, so it reaches us —
        // it just isn't in the shared `ApiErrorBody` type, hence the narrow.
        const activeOrderId = (getApiErrorBody(err) as { activeOrderId?: string } | null)
          ?.activeOrderId;

        if (activeOrderId) {
          Alert.alert('You already have a booking', message);
          router.push(`/tracking/order/${activeOrderId}` as never);
        } else {
          // Same fallback as the website: drop the customer into the normal
          // booking flow for that service rather than stranding them.
          Alert.alert('Could not rebook', message);
          router.push(`/book/${order.service}` as never);
        }
      } finally {
        // Home stays mounted behind the pushed screen, so the latch has to be
        // released or a returning customer could never rebook again.
        rebooking.current = false;
        setRebookingId(null);
      }
    },
    [rebookOrder, router],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: bottomNavClearance + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !ordersLoading}
            onRefresh={refreshAll}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <ZappyLogo size={26} color={colors.textInverse} />
          </View>

          <ScalePressable
            style={styles.location}
            accessibilityRole="button"
            onPress={() => router.push('/location/picker' as never)}
            accessibilityLabel={
              locationLabel ? `Current location: ${locationLabel}` : 'Set your location'
            }
            accessibilityHint="Opens the location picker"
          >
            <Text variant="label" numberOfLines={1} color={colors.primary}>
              DELIVERING TO
            </Text>
            <View style={styles.locationRow}>
              <MapPin size={14} color={colors.primary} />
              <Text
                variant="bodySmall"
                weight="semibold"
                color={colors.textHeading}
                numberOfLines={1}
              >
                {locationLabel ?? 'Set location'}
              </Text>
            </View>
          </ScalePressable>

          <View>
            <IconButton
              icon={<Bell size={20} color={colors.textHeading} />}
              onPress={() => router.push('/notifications' as never)}
              variant="surface"
              accessibilityLabel={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
            />
            {unreadCount > 0 ? <Badge count={unreadCount} style={styles.bellBadge} /> : null}
          </View>
        </View>

        {/* ── Greeting ─────────────────────────────────────────────────── */}
        <View style={styles.greeting}>
          <Text variant="muted">Hi {user?.name?.split(' ')[0] ?? 'there'},</Text>
          <Heading level={1}>What do you need today?</Heading>
        </View>

        {/* ── Search entry ─────────────────────────────────────────────── */}
        <ScalePressable
          style={styles.searchTrigger}
          onPress={() => router.push('/(tabs)/services')}
          accessibilityRole="search"
          accessibilityLabel="Search for a service"
        >
          <Search size={18} color={colors.textMuted} />
          <Text variant="body" color={colors.textMuted} style={styles.flex}>
            Search for a service
          </Text>
          {serviceCount > 0 ? (
            <View style={styles.countPill}>
              <Text variant="caption" weight="bold" color={colors.primary}>
                {serviceCount}
              </Text>
            </View>
          ) : null}
        </ScalePressable>

        {/* ── Active booking ───────────────────────────────────────────── */}
        {activeOrder ? (
          <View style={styles.section}>
            <SectionTitle>Live booking</SectionTitle>
            <Card
              variant="hero"
              onPress={() => router.push(`/tracking/order/${activeOrder._id}`)}
              accessibilityLabel={`Live booking: ${humanizeCode(activeOrder.service)}, ${
                STATUS_LABEL[activeOrder.status] ?? activeOrder.status
              }`}
              accessibilityHint="Opens live tracking"
            >
              <View style={styles.liveRow}>
                <View style={styles.livePulse} />
                <Text variant="label" color="rgba(255,255,255,0.85)">
                  Live now
                </Text>
              </View>
              <Text variant="heading2" color={colors.textInverse} style={styles.liveTitle}>
                {humanizeCode(activeOrder.service)}
              </Text>
              <View style={styles.liveFooter}>
                <Text variant="bodySmall" color="rgba(255,255,255,0.85)">
                  {STATUS_LABEL[activeOrder.status] ?? activeOrder.status}
                </Text>
                <ChevronRight size={16} color="rgba(255,255,255,0.85)" />
              </View>
            </Card>
          </View>
        ) : null}

        {/* ── Hero banner ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <HomeHero />
        </View>

        {/* ── Live catalog ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="What we can do for you"
            onSeeAll={catalog.length ? () => router.push('/(tabs)/services') : undefined}
          />

          {catalogLoading ? (
            <HomeCatalogSkeleton />
          ) : catalogError ? (
            <ErrorState message={getApiErrorMessage(catalogErrorObj)} onRetry={refetchCatalog} />
          ) : catalog.length === 0 ? (
            <EmptyState
              icon={<PackageSearch size={26} color={colors.primary} />}
              title="No services available yet"
              message="Services appear here as soon as we have verified providers for them."
            />
          ) : (
            <>
              {shownDomains.map((domain) => {
                const Icon = iconFor(domain.icon);
                return (
                  <View key={domain.code} style={styles.domain}>
                    <View style={styles.domainHead}>
                      <View style={styles.domainIcon}>
                        <Icon size={17} strokeWidth={2} color={indigo[500]} />
                      </View>
                      <View style={styles.flex}>
                        <Text variant="heading3" weight="black" numberOfLines={2}>
                          {domain.name}
                        </Text>
                        {domain.description ? (
                          <Text variant="bodySmall" numberOfLines={1}>
                            {domain.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.services}>
                      {domain.services.map((service) => (
                        <LiveServiceCard
                          key={service.code}
                          service={service}
                          onPress={openService}
                          onPressCategory={openCategory}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}

              {catalog.length > HOME_DOMAINS ? (
                <ScalePressable
                  onPress={() => router.push('/(tabs)/services')}
                  accessibilityRole="button"
                  accessibilityLabel={`See all ${serviceCount} services`}
                  style={styles.seeAllCard}
                >
                  <Card variant="outline" padding={spacing.base}>
                    <View style={styles.seeAllRow}>
                      <Text variant="bodySmall" weight="bold" color={colors.primary}>
                        See all {serviceCount} services
                      </Text>
                      <ArrowRight size={15} color={colors.primary} />
                    </View>
                  </Card>
                </ScalePressable>
              ) : null}
            </>
          )}
        </View>

        {/* ── Nearby Shops ── verified local businesses, browse + Pick & Go ── */}
        <View style={styles.section}>
          <ScalePressable
            onPress={() => router.push('/shops' as never)}
            accessibilityRole="button"
            accessibilityLabel="Nearby Shops — verified local repair shops"
          >
            <Card style={styles.shopsPromo}>
              <View style={styles.shopsPromoRow}>
                <View style={styles.shopsPromoIcon}>
                  <Store size={22} color={colors.primary} strokeWidth={1.75} />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodySmall" weight="black">Nearby Shops</Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    Verified local repair shops — visit, or have their worker come to you
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.primaryLight} />
              </View>
            </Card>
          </ScalePressable>
        </View>

        {/* ── Book again ───────────────────────────────────────────────────
            Re-places the past order by ID via `POST /orders/{id}/rebook`.
            See `handleRebook` for why this cannot go through the catalog. */}
        {recentCompleted.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Book again"
              onSeeAll={() => router.push('/(tabs)/bookings')}
            />

            <View style={styles.stack}>
              {recentCompleted.map((order) => {
                const drawing = illustrationFor({ code: order.service }, null);
                const busy = rebookingId === order._id;
                return (
                  <Card
                    key={order._id}
                    padding={spacing.md}
                    // Disabled while any rebook is in flight, matching how the
                    // tracking screen withholds its own rebook handler.
                    onPress={rebookingId ? undefined : () => handleRebook(order)}
                    accessibilityLabel={
                      busy
                        ? `Rebooking ${humanizeCode(order.service)}`
                        : `Book ${humanizeCode(order.service)} again`
                    }
                  >
                    <View style={styles.rebookRow}>
                      <View style={styles.rebookIcon}>
                        <ServiceIllustration name={drawing} size={28} />
                      </View>
                      <View style={styles.flex}>
                        <Text variant="heading3" numberOfLines={1}>
                          {humanizeCode(order.service)}
                        </Text>
                        <Text variant="caption">
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })
                            : ''}
                        </Text>
                      </View>
                      {busy ? (
                        <Text variant="bodySmall" weight="bold" color={colors.primary}>
                          Rebooking…
                        </Text>
                      ) : order.pricing?.total != null ? (
                        <Text variant="body" weight="bold" color={colors.textHeading}>
                          {formatRupees(order.pricing.total)}
                        </Text>
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Shape-matched: an icon chip, two text lines and the coverage strip. */
function HomeCatalogSkeleton() {
  return (
    <View accessibilityLabel="Loading services" accessibilityRole="progressbar">
      {[0, 1].map((i) => (
        <View key={i} style={[styles.skelCard, i > 0 && { marginTop: spacing.md }]}>
          <View style={styles.skelRow}>
            <Skeleton width={48} height={48} borderRadius={radius.medium} />
            <View style={styles.flex}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="85%" height={11} style={{ marginTop: spacing.sm }} />
            </View>
          </View>
          <View style={styles.skelRail}>
            {[0, 1, 2].map((t) => (
              <Skeleton key={t} width={116} height={145} borderRadius={radius.medium} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPadding },
  flex: { flex: 1, minWidth: 0 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  location: { flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bellBadge: { position: 'absolute', top: -2, right: -2 },

  greeting: { marginTop: spacing.lg, gap: spacing.xxs },

  searchTrigger: {
    marginTop: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  countPill: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },

  section: { marginTop: spacing.xl },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveTitle: { marginTop: spacing.xs },
  liveFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },

  domain: { marginTop: spacing.lg },
  domainHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  domainIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  services: { marginTop: spacing.md, gap: spacing.md },
  seeAllCard: { marginTop: spacing.lg },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },

  shopsPromo: { backgroundColor: colors.primaryTint },
  shopsPromoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shopsPromoIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stack: { gap: spacing.md, marginTop: spacing.sm },
  rebookRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rebookIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.medium,
    backgroundColor: zappy[50],
    alignItems: 'center',
    justifyContent: 'center',
  },

  skelCard: {
    marginTop: spacing.md,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.base,
  },
  skelRail: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.base,
    paddingBottom: 14,
  },
});
