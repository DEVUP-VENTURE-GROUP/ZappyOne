/**
 * Home: what a customer can get done, right where they are (the website's
 * HomePage).
 *
 *   location + live status → search → anything in progress → the services
 *   → common problems → book again → offers → every service in detail → ads → shops
 *
 * Location: the remembered place first, then GPS; when neither gives a precise
 * fix, it asks. Nothing here is a claim the data doesn't back.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { runOnJS, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import {
  useCurrentSeasonQuery, useGetEventCategoriesQuery, useGetServiceabilityQuery, useLiveCatalogQuery, useSaveRecentLocationMutation,
  useGetAvailablePromosQuery,
} from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { loadGeoLocation, saveGeoLocation, tooRough } from '@zappy/core/lib/geoCache';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { useMyJobs } from '@zappy/core/shared/useMyJobs';
import { useAppSelector } from '@zappy/core/store/hooks';
import { toast } from '@zappy/ui/components/Toast';
import { describeCoordinates } from '@zappy/ui/location/geocode';
import { colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { useTabBarSpace } from '@zappy/ui/lib/useTabBarSpace';
import { SpotlightSearch } from '../catalog/SpotlightSearch';
import { backAt } from '@zappy/core/shared/opening';
import { NotInYourArea } from '../catalog/serviceability/NotInYourArea';
import { ActiveJobCard } from './ActiveJobCard';
import { ContinueBookingCard } from './ContinueBookingCard';
import { FestiveHero } from './festive/FestiveHero';
import { FestiveDivider } from './festive/FestiveDivider';
import { HomeScrollY, Reveal } from './festive/ScrollReveal';
import { SafeSection } from '@zappy/ui/components/common/SafeSection';
import useFestiveLook from '@zappy/core/shared/useFestiveLook';
import { useReducedMotion } from '@zappy/core/hooks/useReducedMotion';
import { HeroCarousel } from './HeroCarousel';
import { FloatingGlassHeader, HomeHeader, SearchBar, type HomeLocation } from './HomeHeader';
import { BookAgain, CampaignBanners, LocalStores, ModeSwitch, OffersDeals, PopularServices, RecentActivity, ZappyOnePromo } from './HomeRails';
import { useHomeAds } from './useHomeAds';
import { ART_RATIO, type HomeAd } from './PromoBanner';
import { bestOfferPct, localBanners, pickPopular } from '@zappy/core/shared/homepageContent';
import { Skeleton, Text } from '@zappy/ui/components';
import { ComingSoonRow } from './ComingSoonRow';
import { HomeFooter } from './HomeFooter';
import { HomeMarketplace } from './HomeMarketplace';
import { LocationSheet, type PickedArea } from './LocationSheet';
import { ProblemChips } from './ProblemChips';
import { ServiceGrid } from './ServiceGrid';
import { buildDomains, comingSoonOf, quickRebooks, searchTerms, type HomeDomain, type HomeService } from './homeCatalog';

let remembered = false;   // a precise fix is saved on the customer's record once per app session

// The same shape as Explore services (two rows of four tiles with their names), so nothing jumps when it loads.
function SkeletonGrid() {
  return (
    <View style={styles.skelSection}>
      <View style={styles.skelTitle} />
      <View style={styles.skelGrid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.skelTile}><View style={styles.skel} /><View style={styles.skelLabel} /></View>
        ))}
      </View>
    </View>
  );
}

// Events run on their own module, not in All services: its tile opens Events, every other area its chip in All services.
const areaPath = (d: HomeDomain) => (d.code === 'events' ? '/events' : `/services?category=${d.code}`);

export function HomePage() {
  const router = useRouter();
  const isAuthed = useAppSelector((s) => s.auth.isAuthenticated && s.auth.role === 'user');
  const [spotOpen, setSpotOpen] = useState(false);
  const [locSheet, setLocSheet] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loc, setLoc] = useState<HomeLocation>({ primary: 'Finding your location…', secondary: null, loading: true });
  const [saveRecent] = useSaveRecentLocationMutation();
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  function remember(lat: number, lng: number, primary: string, secondary: string | null, accuracy?: number | null) {
    if (!isAuthed || remembered || (accuracy && accuracy > 150)) return;
    remembered = true;
    saveRecent({ address: [primary, secondary].filter(Boolean).join(', '), lat, lng }).unwrap().catch(() => {});
  }
  async function label(lat: number, lng: number) {
    const found = await describeCoordinates(lat, lng);
    return { primary: found?.title || 'Your location', secondary: found?.subtitle || null };
  }

  /* Location: the remembered place first, then GPS; ask only when neither works. */
  useEffect(() => {
    (async () => {
      const cached = await loadGeoLocation();
      if (cached) {
        const l = await label(cached.lat, cached.lng);
        if (mounted.current) setLoc({ ...l, loading: false, lat: cached.lat, lng: cached.lng });
        return;
      }
      try {
        const pos = await getBestPosition();
        // A guess from the network, not a place to send a pro to: ask instead.
        if (tooRough(pos.accuracy)) { if (mounted.current) { setLoc({ primary: 'Set your location', secondary: null, loading: false }); setLocSheet(true); } return; }
        const l = await label(pos.lat, pos.lng);
        saveGeoLocation({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, address: [l.primary, l.secondary].filter(Boolean).join(', ') });
        if (mounted.current) setLoc({ ...l, loading: false, lat: pos.lat, lng: pos.lng });
        remember(pos.lat, pos.lng, l.primary, l.secondary, pos.accuracy);
      } catch {
        if (mounted.current) { setLoc({ primary: 'Set your location', secondary: null, loading: false }); setLocSheet(true); }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function useCurrent() {
    setDetecting(true);
    try {
      const pos = await getBestPosition();
      if (tooRough(pos.accuracy)) { toast.error('This phone could only guess your location. Search your area instead.', { duration: 6000 }); return; }
      const l = await label(pos.lat, pos.lng);
      saveGeoLocation({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, address: [l.primary, l.secondary].filter(Boolean).join(', ') });
      setLoc({ ...l, loading: false, lat: pos.lat, lng: pos.lng });
      remember(pos.lat, pos.lng, l.primary, l.secondary, pos.accuracy);
      setLocSheet(false);
    } catch { toast.error('Couldn’t get your location. Search for it instead.'); }
    finally { setDetecting(false); }
  }
  function pick({ lat, lng, primary, secondary }: PickedArea) {
    // A chosen place is trusted; don't re-ask next time.
    saveGeoLocation({ lat, lng, accuracy: 0, address: [primary, secondary].filter(Boolean).join(', ') });
    setLoc({ primary, secondary, loading: false, lat, lng });
    remember(lat, lng, primary, secondary, 0);
    setLocSheet(false);
  }

  /* What we serve here. A failed check never holds the grid in skeletons. */
  const { data: svc, isFetching: checkingArea, refetch: refetchArea } = useGetServiceabilityQuery({ lat: loc.lat, lng: loc.lng }, { skip: loc.lat == null });
  const { data: catalog, isLoading: loadingCatalog, refetch: refetchCatalog } = useLiveCatalogQuery();
  // Back on Home: what is bookable here may have changed (a pro joined, went offline). One check, at most every 30 s.
  const lastCheck = useRef(Date.now());
  useFocusEffect(useCallback(() => {
    if (Date.now() - lastCheck.current < 30000) return;
    lastCheck.current = Date.now();
    refetchCatalog();
    if (loc.lat != null) refetchArea();
  }, [loc.lat, refetchArea, refetchCatalog]));
  // Only what someone covers at this address is shown; the rest waits in "Coming to your area".
  const liveCodes = useMemo(() => (svc && svc.status !== 'not_here' ? new Set<string>(svc.lines.map((l: { code: string }) => l.code)) : null), [svc]);
  const comingSoon = useMemo(() => comingSoonOf(catalog?.domains || [], liveCodes), [catalog, liveCodes]);
  const nothingLive = !!liveCodes && liveCodes.size === 0;
  // Events only where an approved partner has a package in this city (svc.events); unknown location shows them, as with every service.
  const eventsHere = !liveCodes || Boolean(svc?.events);
  const { data: eventCats } = useGetEventCategoriesQuery(svc?.zone?.city ? { city: svc.zone.city } : {}, { skip: !eventsHere });
  const allDomains: HomeDomain[] = useMemo(() => buildDomains(catalog?.domains || [], liveCodes, eventsHere ? eventCats?.categories || [] : []), [catalog, liveCodes, eventCats, eventsHere]);
  const services = useMemo(() => allDomains.flatMap((d) => d.services), [allDomains]);
  const terms = useMemo(() => searchTerms(services), [services]);

  // Demand signal for Insights: once per area per app session, whether we serve it.
  const seenArea = useRef(new Set<string>());
  useEffect(() => {
    if (!svc?.status || loc.lat == null || loc.lng == null) return;
    const key = `${loc.lat.toFixed(2)}:${loc.lng.toFixed(2)}`;
    if (seenArea.current.has(key)) return;
    seenArea.current.add(key);
    trackSearch({ category: 'all_services', lat: loc.lat, lng: loc.lng, result: svc.status === 'not_here' ? 'no_service' : 'served', userType: 'user' });
  }, [svc?.status, loc.lat, loc.lng]);

  function openService(s: HomeService, path?: string) {
    // Every tap is demand; whether someone can come is answered at the booking step.
    trackSearch({ category: s.code, lat: loc.lat, lng: loc.lng, result: s.available === false ? 'no_service' : 'served', userType: 'user' });
    router.push((path || s.path) as never);
  }

  const { jobs, current: activeJob, past: pastJobs, refetch: refetchJobs } = useMyJobs({ skip: !isAuthed });
  const rebooks = useMemo(() => quickRebooks(pastJobs), [pastJobs]);
  // The latest few, live ones first; the live one already has its own card above.
  const recent = useMemo(() => [...jobs.filter((j) => j.active), ...jobs.filter((j) => !j.active)].filter((j) => j !== activeJob).slice(0, 3), [jobs, activeJob]);
  /* Admin banners (hero, campaign, offer) and the popular rail. */
  const { hero: heroBanners, campaign: campaignBanners, offer: offerBanners, open: openBanner, onImageError: onBannerImageError } = useHomeAds();
  const popular = useMemo(() => pickPopular(services) as HomeService[], [services]);
  const { data: promoData } = useGetAvailablePromosQuery(undefined, { skip: !isAuthed });
  // Admin banners first; the bundled ones only where they are true for this address and customer.
  // Worked out only when the areas, offers or admin banners change, so the carousel isn't handed a new list on every render.
  const { heroList, campaignList } = useMemo(() => {
    const opts = { liveAreas: new Set(allDomains.map((d) => d.code)), bestOfferPct: bestOfferPct(promoData?.promos), link: ({ area, offers }: { area?: string; offers?: boolean }) => (offers ? '/promos' : area ? `/services?category=${area}` : '/services') };
    return {
      heroList: (heroBanners.length ? heroBanners : localBanners('hero', opts)) as HomeAd[],
      campaignList: [...campaignBanners, ...(localBanners('campaign', opts) as HomeAd[])],
    };
  }, [allDomains, promoData, heroBanners, campaignBanners]);
  const { width: screen } = useWindowDimensions();
  const tabSpace = useTabBarSpace();
  const goStores = () => router.push('/nearby-shops' as never);
  const notHere = svc?.status === 'not_here';
  // A festival running (Admin → Festive home): its own top on home; light ones also tint the header.
  const { data: seasonData, isLoading: loadingSeason, refetch: refetchSeason } = useCurrentSeasonQuery(undefined);
  // The layout is chosen once both are known, so the plain look never flashes before a festive one.
  const settling = loadingCatalog || loadingSeason;
  const season = !notHere && !settling ? seasonData?.season : null;
  // Each festival has a few looks; home moves to the next every 30 s.
  const theme = useFestiveLook(season?.theme, useReducedMotion());
  const tint = theme ? theme.top : null;
  // The scroll position, so festive sections and dividers play as they come up the screen.
  const scrollY = useSharedValue(0);
  // Past the top bar, the floating glass header takes over (iOS 26).
  const [pastTop, setPastTop] = useState(false);
  const pastFlag = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    const past = e.contentOffset.y > 120;
    if (past !== pastFlag.value) { pastFlag.value = past; runOnJS(setPastTop)(past); }
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchCatalog(), refetchSeason(), loc.lat != null ? refetchArea() : null, isAuthed ? refetchJobs?.() : null].filter(Boolean));
    setRefreshing(false);
  }

  return (
    <View style={[styles.page, theme ? { backgroundColor: theme.wash } : null]}>
      <HomeHeader loc={loc} isAuthed={isAuthed} onPickLocation={() => setLocSheet(true)} tint={tint} festive={theme} greeting={season?.greeting || ''} eta={svc?.fastestMin != null && svc.fastestMin <= 60 ? svc.fastestMin : null} closed={svc?.status === 'closed_now' ? backAt(svc.nextOpening) : null} />
      {/* Search stays pinned while the rest scrolls. */}
      <View style={[styles.searchWrap, tint ? { backgroundColor: tint } : null]}><SearchBar terms={terms} onOpen={() => setSpotOpen(true)} /></View>
      <HomeScrollY.Provider value={scrollY}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={[styles.body, { paddingBottom: tabSpace }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {season ? <SafeSection name="festive-hero"><View style={styles.festive}><FestiveHero season={season} theme={theme} services={services} onOpen={(s) => openService(s)} /></View></SafeSection> : null}
        <ModeSwitch onStores={goStores} />
        {activeJob ? <ActiveJobCard job={activeJob} onOpen={() => router.push(activeJob.href as never)} /> : null}
        {/* A booking started and left: back to where they stopped (jobs/checkout-draft). */}
        <ContinueBookingCard isAuthed={isAuthed} />
        {notHere ? (
          <NotInYourArea place={loc.primary} lat={loc.lat} lng={loc.lng} address={[loc.primary, loc.secondary].filter(Boolean).join(', ')}
            areas={svc.areas} onChangeLocation={() => setLocSheet(true)} />
        ) : (
          <>
            {nothingLive ? (
              <NotInYourArea soon place={loc.primary} lat={loc.lat ?? undefined} lng={loc.lng ?? undefined} address={[loc.primary, loc.secondary].filter(Boolean).join(', ')}
                areas={svc?.areas || []} onChangeLocation={() => setLocSheet(true)} />
            ) : null}
            {nothingLive && !loadingCatalog ? <ComingSoonRow groups={comingSoon} loc={loc} /> : null}
            {settling ? <Skeleton height={Math.round((screen - spacing.base * 2) / ART_RATIO)} style={styles.heroSkel} /> : null}
            {!settling && !nothingLive && !season ? <HeroCarousel banners={heroList} domains={allDomains} onOpen={openService} onOpenBanner={openBanner} onImageError={onBannerImageError} /> : null}
            {/* During a festival each section rises in after the last. */}
            {settling || (loc.lat != null && !svc && checkingArea) ? <SkeletonGrid /> : <Reveal on={!!theme}><ServiceGrid domains={allDomains} onOpenArea={(d) => router.push(areaPath(d) as never)} onMore={() => router.push('/services' as never)} /></Reveal>}
            <Reveal on={!!theme}><ProblemChips services={services} /></Reveal>
            {theme ? <SafeSection name="festive-divider"><FestiveDivider accent={theme.accent} strip={theme.dark ? theme.accent : theme.paint[4] || theme.accent} /></SafeSection> : null}
            <ZappyOnePromo onExplore={goStores} />
            {!loadingCatalog ? <PopularServices services={popular} onOpen={openService} onViewAll={() => router.push('/services' as never)} /> : null}
            <CampaignBanners ads={campaignList} width={screen - spacing.base * 2} onOpen={openBanner} onImageError={onBannerImageError} />
            <LocalStores lat={loc.lat} lng={loc.lng} enabled={isAuthed} onOpenShop={(id) => router.push(`/shops/${id}` as never)} onViewAll={goStores} />
            <OffersDeals ads={offerBanners} isAuthed={isAuthed} onOpenAd={openBanner} onViewAll={() => router.push('/promos' as never)} onImageError={onBannerImageError} />
            {/* Personal and real only: the customer's own bookings. */}
            <BookAgain items={rebooks} onViewAll={() => router.push('/orders' as never)} />
            <RecentActivity jobs={recent} onViewAll={() => router.push('/orders' as never)} />
            {isAuthed ? <HomeMarketplace loc={loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng, address: [loc.primary, loc.secondary].filter(Boolean).join(', ') } : null} /> : null}
            {/* Only live services show above; the rest waits here, by category. */}
            {!loadingCatalog && !nothingLive ? <ComingSoonRow groups={comingSoon} loc={loc} /> : null}
            <HomeFooter areas={svc?.areas || []} />
          </>
        )}
      </Animated.ScrollView>
      </HomeScrollY.Provider>
      <FloatingGlassHeader shown={pastTop} loc={loc} isAuthed={isAuthed} onPickLocation={() => setLocSheet(true)} />
      <SpotlightSearch open={spotOpen} onClose={() => setSpotOpen(false)} lat={loc.lat} lng={loc.lng} />
      <LocationSheet open={locSheet} onClose={() => setLocSheet(false)} onUseCurrent={useCurrent} detecting={detecting} onPick={pick} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Same box as the carousel: the body already pads the sides.
  heroSkel: { borderRadius: radius.large },
  page: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: spacing.base, paddingBottom: spacing.md, paddingTop: 4, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  // Edge to edge, flush under the search: undoes the body's padding.
  festive: { marginHorizontal: -spacing.base, marginTop: -spacing.base },
  body: { padding: spacing.base, gap: spacing.xl, paddingBottom: spacing.xxxl },
  skelSection: { gap: spacing.md },
  skelTitle: { width: 140, height: 20, borderRadius: 6, backgroundColor: slate[100] },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.base, columnGap: '2.66%' },
  skelTile: { width: '23%', alignItems: 'center', gap: spacing.sm },
  skel: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: slate[100] },
  skelLabel: { width: '80%', height: 10, borderRadius: 5, backgroundColor: slate[100] },
});
