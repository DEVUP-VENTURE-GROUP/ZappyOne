/**
 * Home — the landing tab, redesigned to match the website's Home.
 * ----------------------------------------------------------------------------
 *   header · search · Book a service / Local stores · live booking · hero ·
 *   services · ZappyOne stores · popular · campaigns · stores near you ·
 *   offers · book again · recent activity
 *
 * ── DATA (all existing endpoints, read-only) ───────────────────────────────
 *   live catalogue   GET /provider/onboarding/catalog — what can be booked;
 *                    a tap opens `/service/{code}` exactly as before.
 *   banners          GET /ads/placement/home_banner — admin Homepage → Banners
 *                    (hero / campaign / offer). No banners → the hero shows
 *                    one slide per live service area instead.
 *   stores           GET /shops/nearby — verified shops within 10 km. Only when
 *                    location permission is ALREADY granted; Home never prompts.
 *   offers           offer banners + GET /promos/available
 *   book again /     GET /orders/mine — this app books through orders, so the
 *   recent activity  customer's own orders drive both. Rebook goes through
 *                    `POST /orders/{id}/rebook`, unchanged (see handleRebook).
 *
 * Nothing on this screen is a number the API did not return.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageSearch } from 'lucide-react-native';
import { EmptyState, ErrorState, Skeleton, Text } from '../../components/ui';
import { humanizeCode } from '../../components/catalog/categoryIcons';
import {
  BannerCard, BookAgainList, CampaignBanners, HeroCarousel, HomeTopBar, ModeSwitch, OffersRail, PopularServices,
  RecentActivity, SearchTrigger, ServiceGrid, StoresRail, ZappyOnePromo, openBannerLink, pickPopular,
  type ActivityItem, type HomeService, type NearbyShop,
} from '../../components/home/HomeSections';
import { useGetLiveCatalogQuery } from '../../services/api/catalogApi';
import { useListOrdersQuery, useRebookOrderMutation } from '../../services/api/ordersApi';
import { useListNotificationsQuery } from '../../services/api/notificationsApi';
import { useGetAddressesQuery } from '../../services/api/authApi';
import { useNearbyShopsQuery } from '../../services/api/shopApi';
import {
  useGetAvailablePromosQuery, useGetHomeBannersQuery, useTrackBannerClickMutation, useTrackBannerImpressionMutation,
  type HomeBanner,
} from '../../services/api/homeApi';
import { getApiErrorBody, getApiErrorMessage } from '../../services/api/apiSlice';
import { brand, ink, surface } from '../../theme/brand';
import { bottomNavClearance } from '../../theme/spacing';
import { ACTIVE_ORDER_STATUSES, type Order } from '../../types/api';

const STATUS_LABEL: Record<string, string> = {
  created: 'Booking placed',
  searching: 'Finding a pro…',
  assigned: 'Pro assigned',
  on_the_way: 'On the way',
  arrived: 'Pro has arrived',
  in_progress: 'Service in progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Could not be completed',
};

const PAD = 20;
const seenBanners = new Set<string>(); // impressions once per app session

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, 720) - PAD * 2;
  const push = useCallback((href: string) => router.push(href as never), [router]);

  /* Data */
  const catalog = useGetLiveCatalogQuery();
  const orders = useListOrdersQuery(1);
  const { data: notifData } = useListNotificationsQuery({ unreadOnly: true, page: 1 });
  const { data: savedAddresses } = useGetAddressesQuery();
  const banners = useGetHomeBannersQuery();
  const { data: promos = [] } = useGetAvailablePromosQuery();
  const [trackImpression] = useTrackBannerImpressionMutation();
  const [trackClick] = useTrackBannerClickMutation();

  /* Location: label for the header, coordinates for nearby stores. */
  const [gps, setGps] = useState<{ label: string | null; lat: number; lng: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== Location.PermissionStatus.GRANTED) return;
        const position = await Location.getLastKnownPositionAsync();
        if (!position || cancelled) return;
        const { latitude: lat, longitude: lng } = position.coords;
        let label: string | null = null;
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          label = place ? [place.name, place.district ?? place.city].filter(Boolean).join(', ') || null : null;
        } catch { /* coordinates are still useful without a name */ }
        if (!cancelled) setGps({ label, lat, lng });
      } catch {
        // Location is a nicety here; the saved address covers the header.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const locationLabel = useMemo(() => {
    if (gps?.label) return gps.label;
    const list = savedAddresses?.addresses ?? [];
    const preferred = list.find((a) => a.isDefault) ?? list[0];
    return preferred ? preferred.label || preferred.address || null : null;
  }, [gps, savedAddresses]);

  const shopsQuery = useNearbyShopsQuery(
    gps ? { lat: gps.lat, lng: gps.lng, radiusKm: 10 } : ({} as never),
    { skip: !gps },
  );
  const shops = useMemo(() => ((shopsQuery.data ?? []) as unknown as NearbyShop[]).slice(0, 8), [shopsQuery.data]);

  /* Catalogue */
  const domains = catalog.data ?? [];
  const services: HomeService[] = useMemo(
    () => domains.flatMap((d) => d.services.map((svc) => ({ ...svc, domainCode: d.code }))),
    [domains],
  );
  const popular = useMemo(() => pickPopular(services), [services]);
  const openService = useCallback((svc: HomeService) => push(`/service/${svc.code}`), [push]);

  /* Banners */
  const { hero = [], campaign = [], offer = [] } = banners.data ?? {};
  useEffect(() => {
    for (const ad of [...hero, ...campaign, ...offer]) {
      if (seenBanners.has(ad._id)) continue;
      seenBanners.add(ad._id);
      trackImpression(ad._id);
    }
  }, [hero, campaign, offer, trackImpression]);
  // Uploaded images are signed links that last 6 hours; on a failed load, fetch
  // fresh links — at most once a minute.
  const lastBannerRefresh = useRef(0);
  const onBannerImageError = useCallback(() => {
    if (Date.now() - lastBannerRefresh.current < 60000) return;
    lastBannerRefresh.current = Date.now();
    banners.refetch();
  }, [banners]);

  const openBanner = useCallback((ad: HomeBanner) => {
    if (!ad.content.ctaLink) return;
    trackClick(ad._id);
    openBannerLink(push, ad.content.ctaLink);
  }, [push, trackClick]);

  /* The customer's own orders */
  const orderList = orders.data?.orders ?? [];
  const activeOrder = useMemo(
    () => orderList.find((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status)),
    [orderList],
  );
  const completed = useMemo(() => {
    const seen = new Set<string>();
    return orderList.filter((o) => o.status === 'completed' && !seen.has(o.service) && seen.add(o.service)).slice(0, 3);
  }, [orderList]);
  const activity: ActivityItem[] = useMemo(() => orderList
    .filter((o) => o !== activeOrder)
    .slice(0, 3)
    .map((o) => ({
      id: o._id,
      title: humanizeCode(o.service),
      subtitle: [STATUS_LABEL[o.status] ?? humanizeCode(o.status), o.createdAt
        ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '']
        .filter(Boolean).join(' · '),
      state: (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status) ? 'active'
        : o.status === 'completed' ? 'completed' : 'closed',
      onPress: () => push(`/tracking/order/${o._id}`),
    })), [orderList, activeOrder, push]);

  /**
   * Book again — re-place a past order by its ID.
   *
   * `Order.service` is a concrete JOB code (`screen_replacement`), not a
   * catalogue SERVICE LINE (`mobile_repair`), so this never re-derives a code:
   * `POST /orders/{id}/rebook` clones the past order on the server. Unchanged
   * from the previous Home; see the git history for the full rationale.
   */
  const [rebookOrder] = useRebookOrderMutation();
  const [rebookingId, setRebookingId] = useState<string | null>(null);
  const rebooking = useRef(false); // synchronous latch against a fast double-tap

  const handleRebook = useCallback(async (orderId: string) => {
    const order = orderList.find((o: Order) => o._id === orderId);
    if (!order || rebooking.current) return;
    rebooking.current = true;
    setRebookingId(order._id);
    try {
      const next = await rebookOrder(order._id).unwrap();
      push(`/tracking/order/${next._id}`);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Please try again.');
      const activeOrderId = (getApiErrorBody(err) as { activeOrderId?: string } | null)?.activeOrderId;
      if (activeOrderId) {
        Alert.alert('You already have a booking', message);
        push(`/tracking/order/${activeOrderId}`);
      } else {
        Alert.alert('Could not rebook', message);
        push(`/book/${order.service}`);
      }
    } finally {
      rebooking.current = false;
      setRebookingId(null);
    }
  }, [orderList, rebookOrder, push]);

  const refreshAll = useCallback(() => {
    orders.refetch();
    catalog.refetch();
    banners.refetch();
    if (gps) shopsQuery.refetch();
  }, [orders, catalog, banners, gps, shopsQuery]);

  const unread = notifData?.unread ?? 0;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottomNavClearance + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={orders.isFetching && !orders.isLoading} onRefresh={refreshAll} tintColor={brand[600]} />
        }
      >
        <View style={styles.column}>
          <HomeTopBar
            location={locationLabel}
            onPickLocation={() => push('/location/picker')}
            unread={unread}
            onBell={() => push('/notifications')}
            onProfile={() => push('/(tabs)/profile')}
          />

          <View style={styles.gapSm}><SearchTrigger onPress={() => push('/(tabs)/services')} /></View>
          <View style={styles.gapSm}><ModeSwitch onStores={() => push('/shops')} /></View>

          {activeOrder ? (
            <View style={styles.gap}>
              <BannerCard
                variant="campaign"
                width={contentWidth}
                onPress={() => push(`/tracking/order/${activeOrder._id}`)}
                ad={{
                  _id: activeOrder._id,
                  type: 'live',
                  content: {
                    badgeText: 'Live now',
                    headline: humanizeCode(activeOrder.service),
                    body: STATUS_LABEL[activeOrder.status] ?? activeOrder.status,
                    ctaText: 'Track',
                    ctaLink: `/tracking/order/${activeOrder._id}`,
                    backgroundColor: brand[700],
                  },
                }}
              />
            </View>
          ) : null}

          <View style={styles.gap}>
            {catalog.isLoading && banners.isLoading ? (
              <Skeleton width="100%" height={188} borderRadius={20} />
            ) : (
              <HeroCarousel banners={hero} services={services} width={contentWidth} onOpenBanner={openBanner} onOpenService={openService} onImageError={onBannerImageError} />
            )}
          </View>

          <View style={styles.gapLg}>
            {catalog.isLoading ? (
              <View style={styles.skelGrid} accessibilityLabel="Loading services" accessibilityRole="progressbar">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} width={72} height={72} borderRadius={18} />)}
              </View>
            ) : catalog.isError ? (
              <ErrorState message={getApiErrorMessage(catalog.error)} onRetry={catalog.refetch} />
            ) : services.length === 0 ? (
              <EmptyState
                icon={<PackageSearch size={26} color={brand[600]} />}
                title="No services available yet"
                message="Services appear here as soon as we have verified providers for them."
              />
            ) : (
              <ServiceGrid services={services} width={contentWidth} onOpen={openService} onViewAll={() => push('/(tabs)/services')} />
            )}
          </View>

          <View style={styles.gapLg}><ZappyOnePromo onExplore={() => push('/shops')} /></View>

          {popular.length ? (
            <View style={styles.gapLg}><PopularServices services={popular} onOpen={openService} onViewAll={() => push('/(tabs)/services')} /></View>
          ) : null}

          {campaign.length ? (
            <View style={styles.gapLg}><CampaignBanners ads={campaign} width={contentWidth} onOpen={openBanner} onImageError={onBannerImageError} /></View>
          ) : null}

          {gps && !shopsQuery.isError ? (
            <View style={styles.gapLg}>
              <StoresRail shops={shops} loading={shopsQuery.isLoading} onOpenShop={(id) => push(`/shops/${id}`)} onViewAll={() => push('/shops')} />
            </View>
          ) : null}

          {offer.length || promos.length ? (
            <View style={styles.gapLg}>
              <OffersRail ads={offer} promos={promos} onOpenAd={openBanner} onImageError={onBannerImageError}
                onCopy={(code) => Alert.alert(`Code ${code}`, 'Enter this code at checkout to apply the offer.')} />
            </View>
          ) : null}

          {completed.length ? (
            <View style={styles.gapLg}>
              <BookAgainList
                items={completed.map((o) => ({ id: o._id, title: humanizeCode(o.service), date: o.createdAt, code: o.service }))}
                busyId={rebookingId}
                onRebook={handleRebook}
                onViewAll={() => push('/(tabs)/bookings')}
              />
            </View>
          ) : null}

          {activity.length ? (
            <View style={styles.gapLg}><RecentActivity items={activity} onViewAll={() => push('/(tabs)/bookings')} /></View>
          ) : null}

          {!orders.isLoading && orderList.length === 0 ? (
            <View style={[styles.gapLg, styles.firstBooking]}>
              <Text variant="bodySmall" weight="semibold" color={ink[900]}>Your bookings will show here</Text>
              <Text variant="caption" color={ink[500]} style={styles.firstBookingBody}>
                Book a service above and track it live from this screen.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.page },
  content: { paddingHorizontal: PAD, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 - PAD * 2 },
  gapSm: { marginTop: 14 },
  gap: { marginTop: 18 },
  gapLg: { marginTop: 28 },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between' },
  firstBooking: {
    padding: 16, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: surface.line,
  },
  firstBookingBody: { marginTop: 2 },
});
