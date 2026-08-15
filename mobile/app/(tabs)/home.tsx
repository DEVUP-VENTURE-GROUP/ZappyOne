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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronRight, MapPin, Search } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import {
  Badge,
  Card,
  Heading,
  IconButton,
  ScalePressable,
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
import { useGetCategoriesQuery, useGetServicesQuery } from '../../services/api/catalogApi';
import { useListOrdersQuery } from '../../services/api/ordersApi';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import type { RootState } from '../../store';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing, screenPadding, bottomNavClearance } from '../../theme/spacing';
import { useLayout } from '../../theme/dimensions';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../types/api';

const STATUS_LABEL: Record<string, string> = {
  created: 'Booking placed',
  searching: 'Finding a pro…',
  assigned: 'Pro assigned',
  on_the_way: 'On the way',
  arrived: 'Pro has arrived',
  in_progress: 'Service in progress',
};

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

  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  // Best-effort location label. A denied permission just leaves the prompt.
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
          setLocationLabel(
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

  const recentCompleted = useMemo(
    () => orders.filter((o) => o.status === 'completed').slice(0, 3),
    [orders],
  );

  const unreadCount = notifData?.unreadCount ?? notifData?.notifications?.length ?? 0;

  // Actual pixel width of one grid slot, so long labels wrap on word boundaries.
  const categorySlot = Math.floor((width - screenPadding * 2) / categoryColumns);

  const openCategory = useCallback(
    (key: string) => router.push({ pathname: '/(tabs)/services', params: { category: key } }),
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
            accessibilityLabel={
              locationLabel ? `Current location: ${locationLabel}` : 'Set your location'
            }
          >
            <Text variant="label" numberOfLines={1}>
              Service location
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
          <Text variant="body" color={colors.textMuted}>
            Search for a service
          </Text>
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
        ) : (
          <Card variant="hero" style={styles.section}>
            <Text variant="heading2" color={colors.textInverse}>
              Need help right now?
            </Text>
            <Text variant="body" color="rgba(255,255,255,0.85)" style={styles.heroBody}>
              Verified professionals, at your door in minutes.
            </Text>
            <ScalePressable
              style={styles.heroButton}
              onPress={() => router.push('/(tabs)/services')}
              accessibilityRole="button"
              accessibilityLabel="Explore all services"
            >
              <Text variant="buttonSmall" color={zappy[600]}>
                Explore services
              </Text>
              <ChevronRight size={16} color={zappy[600]} />
            </ScalePressable>
          </Card>
        )}

        {/* ── Categories (data-driven) ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionTitle>Browse by category</SectionTitle>
          <View style={styles.categoryGrid}>
            {catsLoading
              ? Array.from({ length: 8 }, (_, i) => (
                  <View key={i} style={[styles.categorySlot, { width: categorySlot }]}>
                    <Skeleton width={56} height={56} borderRadius={radius.medium} />
                    <Skeleton width={52} height={10} style={{ marginTop: spacing.sm }} />
                  </View>
                ))
              : categories.map((category) => {
                  const Icon = resolveCategoryIcon(category.icon, category.key);
                  const tint = category.theme?.tint ?? zappy[50];
                  const accent = category.theme?.accent ?? zappy[600];
                  return (
                    <ScalePressable
                      key={category._id ?? category.key}
                      style={[styles.categorySlot, { width: categorySlot }]}
                      onPress={() => openCategory(category.key)}
                      accessibilityRole="button"
                      accessibilityLabel={category.customerLabel}
                    >
                      <View style={[styles.categoryIcon, { backgroundColor: tint }]}>
                        <Icon size={26} strokeWidth={1.75} color={accent} />
                      </View>
                      <Text
                        variant="bodySmall"
                        weight="semibold"
                        align="center"
                        color={colors.textPrimary}
                        numberOfLines={2}
                      >
                        {category.customerLabel}
                      </Text>
                    </ScalePressable>
                  );
                })}
          </View>
        </View>

        {/* ── Popular services ─────────────────────────────────────────── */}
        {servicesLoading || featuredServices.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionTitle style={styles.flex}>Popular services</SectionTitle>
              <ScalePressable
                onPress={() => router.push('/(tabs)/services')}
                accessibilityRole="button"
                accessibilityLabel="See all services"
              >
                <Text variant="bodySmall" weight="semibold" color={colors.primary}>
                  See all
                </Text>
              </ScalePressable>
            </View>

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
                : featuredServices.map((service) => {
                    const Icon = resolveServiceIcon(service.icon, service.code);
                    const price = paiseToRupees(
                      service.servicePricePaise || service.priceRangeMinPaise,
                    );
                    return (
                      <ScalePressable
                        key={service.code}
                        style={styles.tile}
                        onPress={() => router.push(`/service/${service.code}` as never)}
                        accessibilityRole="button"
                        accessibilityLabel={`${service.name}${
                          price > 0 ? `, from ${formatRupees(price)}` : ''
                        }`}
                      >
                        <View style={styles.tileArt}>
                          <Icon size={30} strokeWidth={1.6} color={zappy[600]} />
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
                  })}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Book again ───────────────────────────────────────────────── */}
        {recentCompleted.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionTitle style={styles.flex}>Book again</SectionTitle>
              <ScalePressable
                onPress={() => router.push('/(tabs)/bookings')}
                accessibilityRole="button"
                accessibilityLabel="See all bookings"
              >
                <Text variant="bodySmall" weight="semibold" color={colors.primary}>
                  See all
                </Text>
              </ScalePressable>
            </View>

            <View style={styles.stack}>
              {recentCompleted.map((order) => {
                const Icon = resolveServiceIcon(null, order.service);
                return (
                  <Card
                    key={order._id}
                    padding={spacing.md}
                    onPress={() => router.push(`/book/${order.service}` as never)}
                    accessibilityLabel={`Book ${humanizeCode(order.service)} again`}
                  >
                    <View style={styles.rebookRow}>
                      <View style={styles.rebookIcon}>
                        <Icon size={20} strokeWidth={1.75} color={zappy[600]} />
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
