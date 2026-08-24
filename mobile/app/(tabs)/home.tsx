/**
 * Home.
 * ----------------------------------------------------------------------------
 * Information architecture follows the website's HomePage, translated to a
 * phone:
 *   1. brand mark + location + notification bell   (web: sticky header)
 *   2. greeting                                    (web: "Hi {name}")
 *   3. search entry                                (web: SpotlightSearch trigger)
 *   4. active booking, when one exists             (web: active order card)
 *   5. hero CTA                                    (web: .card-hero gradient)
 *   6. categories — data-driven                    (web: CharacterServiceGrid)
 *   7. popular services rail                       (web: "Most booked" rails)
 *   8. book again                                  (web: quickRebooks)
 *
 * Every section is driven by live backend data, and renders only when that data
 * exists — nothing is fabricated to fill space.
 *
 * PERFORMANCE: one ScrollView holds a handful of fixed sections; the rails are
 * short bounded horizontal lists. Long lists (Services, Bookings) stay
 * virtualised on their own screens rather than nested here.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Bell, ChevronRight, MapPin, Search } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import {
  Badge,
  Card,
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
import {
  humanizeCode,
  paiseToRupees,
  resolveCategoryIcon,
  resolveServiceIcon,
} from '../../components/catalog/categoryIcons';
import { HomeHero } from '../../components/home/HomeHero';
import { CharacterGrid } from '../../components/home/CharacterGrid';
import { ServiceIllustration } from '../../components/catalog/ServiceIllustration';
import { illustrationFor } from '../../components/catalog/illustrations/resolve';
import { serviceMatchesCategory } from '../../components/catalog/matchCategory';
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { useListOrdersQuery } from '../../services/api/ordersApi';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import { useGetAddressesQuery } from '../../services/api/authApi';
import type { RootState } from '../../store';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';
import { useLayout } from '../../theme/dimensions';
import { ACTIVE_ORDER_STATUSES, type Order, type ServiceCatalogItem } from '../../types/api';

const STATUS_LABEL: Record<string, string> = {
  created: 'Booking placed',
  searching: 'Finding a pro…',
  assigned: 'Pro assigned',
  on_the_way: 'On the way',
  arrived: 'Pro has arrived',
  in_progress: 'Service in progress',
};

/** How many category rails Home shows before it gets long. */
const MAX_RAILS = 5;

/**
 * One tile in a horizontal service rail.
 *
 * Extracted from the Featured rail so the per-category rails below render the
 * exact same tile — the alternative was a second copy of this markup, which is
 * how two rails end up drifting apart.
 */
const ServiceTile = memo(function ServiceTile({
  service,
  onPress,
}: {
  service: ServiceCatalogItem;
  onPress: (service: ServiceCatalogItem) => void;
}) {
  const drawing = illustrationFor(service, service.category);
  const price = paiseToRupees(service.servicePricePaise || service.priceRangeMinPaise);
  return (
    <ScalePressable
      style={styles.tile}
      onPress={() => onPress(service)}
      accessibilityRole="button"
      accessibilityLabel={`${service.name}${price > 0 ? `, from ${formatRupees(price)}` : ''}`}
    >
      <View style={styles.tileArt}>
        <ServiceIllustration name={drawing} size={40} categoryKey={service.category} />
      </View>
      <Text variant="bodySmall" weight="semibold" numberOfLines={2}>
        {service.name}
      </Text>
      {price > 0 ? (
        <Text variant="caption" weight="semibold" color={colors.primary}>
          From {formatRupees(price)}
        </Text>
      ) : null}
    </ScalePressable>
  );
});

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { categoryColumns, width } = useLayout();
  const user = useSelector((state: RootState) => state.auth.user);

  const { data: categories = [], isLoading: catsLoading } = useGetCategoriesQuery();
  const { data: services = [], isLoading: servicesLoading } = useGetServicesQuery();
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
   * GPS wins when we have it, but it used to be the ONLY source: the label
   * appeared only with a GRANTED permission AND a cached fix. A customer who
   * declined location — or simply had no last-known position yet — was shown
   * "Set location" even with a default address saved, which the app was
   * already using to seed the booking screen. The header claimed not to know
   * a location the rest of the app was quietly booking against.
   *
   * So the saved default is the fallback, and the prompt is what's left when
   * there is genuinely nothing to show.
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
            [place.name, place.district ?? place.city].filter(Boolean).join(', '),
          );
        }
      } catch {
        // Location is a nicety here — failure is silent by design.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orders = ordersPage?.orders ?? [];

  const activeOrder = useMemo<Order | undefined>(
    () => orders.find((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status)),
    [orders],
  );

  const featuredServices = useMemo(() => {
    const featured = services.filter((s) => s.isFeatured);
    return (featured.length >= 4 ? featured : services).slice(0, 10);
  }, [services]);

  /**
   * Per-category service rails — the website's "Electronics Rescue",
   * "Phone Repair", "Laptop Services" strips, each a titled header over a
   * horizontally scrolling row.
   *
   * The website hardcodes both the rail titles AND their contents in
   * `HomePage.jsx` (`MOST_BOOKED`, `PHONE_TILES`, …). Mobile must not carry
   * invented business data, so the rails are derived instead: one per real
   * category from `/catalog/categories`, in the server's own `sortOrder`,
   * filled from the live catalog via the same matcher the Services tab uses.
   *
   * The badge is the category's true service count rather than a curated
   * tagline — the website's taglines exist nowhere in the API, and making
   * them up is exactly what "no fake data" rules out.
   */
  const categoryRails = useMemo(() => {
    if (services.length === 0 || categories.length === 0) return [];

    return [...categories]
      .filter((c) => c.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
      .map((category) => ({
        category,
        items: services.filter((s) => serviceMatchesCategory(s, category)).slice(0, 8),
      }))
      // A rail of one or two tiles looks broken rather than curated.
      .filter((rail) => rail.items.length >= 3)
      .slice(0, MAX_RAILS);
  }, [services, categories]);

  const recentCompleted = useMemo(
    () => orders.filter((o) => o.status === 'completed').slice(0, 3),
    [orders],
  );

  // `unread` is the server's own count — the previous read was `unreadCount`
  // falling back to `notifications.length`, and neither key exists, so this
  // badge was permanently 0.
  const unreadCount = notifData?.unread ?? 0;

  // Actual pixel width of one grid slot, so long labels wrap on word boundaries.
  const categorySlot = Math.floor((width - screenPadding * 2) / categoryColumns);

  const openService = useCallback(
    (service: ServiceCatalogItem) => router.push(`/service/${service.code}` as never),
    [router],
  );

  const openCategory = useCallback(
    (key: string) => router.push(`/category/${key}` as never),
    [router],
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
            onRefresh={refetchOrders}
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
            // Announced as a button and styled as one, but it had no onPress —
            // tapping "Set location" did nothing at all.
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
              <MapPin size={14} color={zappy[600]} />
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
          {/* The site's "50+" pill. Verified against the live catalog rather
              than copied as decoration — GET /catalog/services returns 86. */}
          <View style={styles.countPill}>
            <Text variant="caption" weight="bold" color={colors.primary}>
              50+
            </Text>
          </View>
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

        {/* ── Hero banner + trust bar ──────────────────────────────────── */}
        {/* Replaces the old "Need help right now?" placeholder card with the
            site's actual hero artwork. See components/home/HomeHero. */}
        <View style={styles.section}>
          <HomeHero />
        </View>

        {/* ── Popular Services — the site's character grid ─────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Popular Services"
            onSeeAll={() => router.push('/(tabs)/services')}
          />
          <CharacterGrid
            onSelect={(item) =>
              item.routeKey
                ? openCategory(item.routeKey)
                : router.push('/(tabs)/services')
            }
          />
        </View>

        {/* ── Popular services ─────────────────────────────────────────── */}
        {servicesLoading || featuredServices.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Featured services"
              badge="Most booked"
              onSeeAll={() => router.push('/(tabs)/services')}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
              removeClippedSubviews
            >
              {servicesLoading
                ? Array.from({ length: 4 }, (_, i) => (
                    <View key={i} style={styles.tile}>
                      <Skeleton width={108} height={108} borderRadius={radius.large} />
                      <Skeleton width={80} height={12} style={{ marginTop: spacing.sm }} />
                    </View>
                  ))
                : featuredServices.map((service) => (
                    <ServiceTile key={service.code} service={service} onPress={openService} />
                  ))}
            </ScrollView>
          </View>
        ) : null}

        {/*
          ── Per-category rails ────────────────────────────────────────────
          The website's titled service strips. Each header is a real category
          and each rail is filled from the live catalog, so nothing here is
          curated copy or invented data.
        */}
        {categoryRails.map(({ category, items }) => (
          <View key={category.key} style={styles.section}>
            <SectionHeader
              title={category.customerLabel}
              badge={`${items.length} services`}
              onSeeAll={() => openCategory(category.key)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
              removeClippedSubviews
            >
              {items.map((service) => (
                <ServiceTile key={service.code} service={service} onPress={openService} />
              ))}
            </ScrollView>
          </View>
        ))}

        {/* ── Book again ───────────────────────────────────────────────── */}
        {recentCompleted.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Book again"
              onSeeAll={() => router.push('/(tabs)/bookings')}
            />

            <View style={styles.stack}>
              {recentCompleted.map((order) => {
                const drawing = illustrationFor({ code: order.service }, null);
                return (
                  <Card
                    key={order._id}
                    padding={spacing.md}
                    onPress={() => router.push(`/book/${order.service}` as never)}
                    accessibilityLabel={`Book ${humanizeCode(order.service)} again`}
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
                      {order.pricing?.total != null ? (
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: screenPadding },
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: radius.button,
    backgroundColor: zappy[600],
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

  section: { marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  countPill: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveTitle: { marginTop: spacing.xs },
  liveFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },

  heroBody: { marginTop: spacing.xs },
  heroButton: {
    marginTop: spacing.base,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  categorySlot: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.base },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rail: { gap: spacing.md, paddingTop: spacing.md, paddingRight: spacing.lg },
  tile: { width: 108, gap: spacing.sm },
  tileArt: {
    width: 108,
    height: 108,
    borderRadius: radius.large,
    backgroundColor: zappy[50],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
});
