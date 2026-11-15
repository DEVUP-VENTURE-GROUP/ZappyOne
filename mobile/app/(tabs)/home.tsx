/**
 * Home — the landing tab, built to the reference design.
 * ----------------------------------------------------------------------------
 *   header · search · Book a Service / Shop from Stores · live booking ·
 *   hero banners · explore services (areas + More) · discover stores ·
 *   popular · campaign banners · local stores · offers · book again ·
 *   recent activity
 *
 * ── DATA (all existing endpoints, read-only) ───────────────────────────────
 *   live catalogue   GET /provider/onboarding/catalog — what can be booked;
 *                    a tap opens `/service/{code}` exactly as before.
 *   banners          Bundled artwork (assets/banners) leads the hero and
 *                    campaign carousels; GET /ads/placement/home_banner (admin
 *                    Homepage → Banners) adds hero / campaign / offer slides.
 *   stores           GET /shops/nearby — verified shops within 10 km of the
 *                    device (only if permission is ALREADY granted; Home never
 *                    prompts) or else of the default saved address.
 *   offers           offer banners + GET /promos/available
 *   book again /     GET /orders/mine — this app books through orders, so the
 *   recent activity  customer's own orders drive both. Rebook goes through
 *                    `POST /orders/{id}/rebook`, unchanged (see handleRebook).
 *
 * Nothing on this screen is a number the API did not return.
 * ----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PackageSearch } from 'lucide-react-native';
import { EmptyState, ErrorState, LIQUID_GLASS, Skeleton } from '../../components/ui';
import { humanizeCode } from '../../components/catalog/categoryIcons';
import {
  BannerCard, BannerCarousel, BookAgainList, CAMPAIGN_BANNERS, FloatingGlassHeader, HERO_BANNERS, HOME_BG, HomeTopBar, ModeSwitch,
  OffersRail, PopularServices, RecentActivity, SearchTrigger, ServiceGrid, StoresRail, ZappyOnePromo,
  openBannerLink, pickPopular,
  type ActivityItem, type HomeService, type LocalBanner, type NearbyShop,
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
import { brand } from '../../theme/brand';
import { useTabBarSpace } from '../../hooks/useTabBarSpace';
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

const PAD = 16;

/** "Tomorrow, 10:00 AM" / "Today, 4:30 PM" / "12 Jan, 9:00 AM". */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const date = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday'
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}
const seenBanners = new Set<string>(); // impressions once per app session

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
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
          // "Narsingi, Hyderabad, Telangana" — locality, city, state.
          // `name` is often just a house number ("1600"), which is not a locality.
          const named = place?.name && /[a-z]/i.test(place.name) ? place.name : null;
          const parts = place ? [place.district ?? named ?? place.street, place.city, place.region] : [];
          label = parts.filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || null;
        } catch { /* coordinates are still useful without a name */ }
        if (!cancelled) setGps({ label, lat, lng });
      } catch {
        // Location is a nicety here; the saved address covers the header.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const preferredAddress = useMemo(() => {
    const list = savedAddresses?.addresses ?? [];
    return list.find((a) => a.isDefault) ?? list[0] ?? null;
  }, [savedAddresses]);

  const locationLabel = useMemo(() => {
    if (gps?.label) return gps.label;
    if (!preferredAddress) return null;
    // A full street address is too long for the header: keep locality, city,
    // state — "…, Narsingi, Hyderabad, Telangana 500075, India" → the last three
    // parts once the country and PIN code are dropped.
    const parts = (preferredAddress.address || '').split(',')
      .map((x) => x.replace(/\b\d{6}\b/g, '').trim())
      .filter((x) => x && !/^india$/i.test(x));
    return parts.length ? parts.slice(-3).join(', ') : preferredAddress.label || null;
  }, [gps, preferredAddress]);

  // Stores near the device, or else near the default saved address.
  const storeCoords = gps ?? (preferredAddress && Number.isFinite(preferredAddress.lat) && Number.isFinite(preferredAddress.lng)
    && (preferredAddress.lat !== 0 || preferredAddress.lng !== 0)
    ? { lat: preferredAddress.lat, lng: preferredAddress.lng } : null);
  const shopsQuery = useNearbyShopsQuery(
    storeCoords ? { lat: storeCoords.lat, lng: storeCoords.lng, radiusKm: 10 } : ({} as never),
    { skip: !storeCoords },
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

  /* Scroll target for the "Explore Offers" banner. */
  const scrollRef = useRef<ScrollView>(null);
  const offersY = useRef<number | null>(null);

  /* iOS 26: the compact glass header floats in once the top bar scrolls away. */
  const [floatHeader, setFloatHeader] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y > 64;
    setFloatHeader((was) => (was === past ? was : past));
  }, []);
  const openLocalBanner = useCallback((b: LocalBanner) => {
    if (b.link === '#offers') {
      if (offersY.current != null) scrollRef.current?.scrollTo({ y: Math.max(0, offersY.current - 12), animated: true });
      else push('/(tabs)/services?category=all');
      return;
    }
    push(b.link);
  }, [push]);

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
      code: o.service,
      subtitle: [STATUS_LABEL[o.status] ?? humanizeCode(o.status),
        o.scheduledAt ? whenLabel(o.scheduledAt)
          : o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '']
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
    if (storeCoords) shopsQuery.refetch();
  }, [orders, catalog, banners, storeCoords, shopsQuery]);

  const unread = notifData?.unread ?? 0;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10, paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}
        onScroll={LIQUID_GLASS ? onScroll : undefined}
        scrollEventThrottle={LIQUID_GLASS ? 16 : undefined}
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

          <View style={styles.gapMd}><SearchTrigger onPress={() => push('/(tabs)/services?category=all')} /></View>
          <View style={styles.gapMd}><ModeSwitch onStores={() => push('/shops')} /></View>

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
            <BannerCarousel label="Featured" local={HERO_BANNERS} ads={hero} adVariant="hero" width={contentWidth}
              onOpenLocal={openLocalBanner} onOpenAd={openBanner} onImageError={onBannerImageError} />
          </View>

          <View style={styles.gapLg}>
            {catalog.isLoading ? (
              <View style={styles.skelGrid} accessibilityLabel="Loading services" accessibilityRole="progressbar">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} width={Math.floor((contentWidth - 30) / 4)} height={Math.floor((contentWidth - 30) / 4 * 1.25)} borderRadius={12} />)}
              </View>
            ) : catalog.isError ? (
              <ErrorState message={getApiErrorMessage(catalog.error)} onRetry={catalog.refetch} />
            ) : domains.length === 0 ? (
              <EmptyState
                icon={<PackageSearch size={26} color={brand[600]} />}
                title="No services available yet"
                message="Services appear here as soon as we have verified providers for them."
              />
            ) : (
              <ServiceGrid
                domains={domains}
                width={contentWidth}
                onOpenArea={(d) => push(`/(tabs)/services?category=${d.code}`)}
                onMore={() => push('/(tabs)/services?category=all')}
              />
            )}
          </View>

          <View style={styles.gapLg}><ZappyOnePromo onExplore={() => push('/shops')} /></View>

          {popular.length ? (
            <View style={styles.gapLg}><PopularServices services={popular} onOpen={openService} onViewAll={() => push('/(tabs)/services?category=all')} /></View>
          ) : null}

          <View style={styles.gapLg}>
            <BannerCarousel label="Campaigns" local={CAMPAIGN_BANNERS} ads={campaign} adVariant="campaign" width={contentWidth}
              onOpenLocal={openLocalBanner} onOpenAd={openBanner} onImageError={onBannerImageError} />
          </View>

          {!shopsQuery.isError ? (
            <View style={styles.gapLg}>
              <StoresRail shops={shops} loading={shopsQuery.isLoading} hasLocation={Boolean(storeCoords)}
                onOpenShop={(id) => push(`/shops/${id}`)} onViewAll={() => push('/shops')} onSetLocation={() => push('/location/picker')} />
            </View>
          ) : null}

          {offer.length || promos.length ? (
            <View style={styles.gapLg}>
              <OffersRail ads={offer} promos={promos} width={contentWidth} onOpenAd={openBanner} onImageError={onBannerImageError}
                onLayout={(y) => { offersY.current = y; }}
                onCopy={(code) => Alert.alert(`Code ${code}`, 'Enter this code at checkout to apply the offer.')} />
            </View>
          ) : null}

          {completed.length ? (
            <View style={styles.gapLg}>
              <BookAgainList
                items={completed.map((o) => ({ id: o._id, title: humanizeCode(o.service), date: o.createdAt, code: o.service }))}
                width={contentWidth}
                busyId={rebookingId}
                onRebook={handleRebook}
                onViewAll={() => push('/(tabs)/bookings')}
              />
            </View>
          ) : null}

          {activity.length ? (
            <View style={styles.gapLg}><RecentActivity items={activity} onViewAll={() => push('/(tabs)/bookings')} /></View>
          ) : null}
        </View>
      </ScrollView>
      {LIQUID_GLASS ? (
        <FloatingGlassHeader
          shown={floatHeader}
          top={insets.top + 4}
          location={locationLabel}
          unread={unread}
          onPickLocation={() => push('/location/picker')}
          onBell={() => push('/notifications')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HOME_BG },
  content: { paddingHorizontal: PAD, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 - PAD * 2 },
  gapMd: { marginTop: 16 },
  gap: { marginTop: 22 },
  gapLg: { marginTop: 26 },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
