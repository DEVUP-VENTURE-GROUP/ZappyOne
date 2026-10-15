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
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  useCurrentSeasonQuery, useGetEventCategoriesQuery, useGetServiceabilityQuery, useLiveCatalogQuery, useSaveRecentLocationMutation,
} from '@zappy/core/api';
import { getBestPosition } from '@zappy/core/hooks/useBestPosition';
import { loadGeoLocation, saveGeoLocation, tooRough } from '@zappy/core/lib/geoCache';
import { trackSearch } from '@zappy/core/lib/telemetry';
import { useMyJobs } from '@zappy/core/shared/useMyJobs';
import { useAppSelector } from '@zappy/core/store/hooks';
import { toast } from '@zappy/ui/components/Toast';
import { describeCoordinates } from '@zappy/ui/location/geocode';
import { colors, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { AdBanner } from '../../components/marketing/AdBanner';
import { SpotlightSearch } from '../catalog/SpotlightSearch';
import { ClosedNowBanner } from '../catalog/serviceability/ClosedNowBanner';
import { NotInYourArea } from '../catalog/serviceability/NotInYourArea';
import { ActiveJobCard } from './ActiveJobCard';
import { ContinueBookingCard } from './ContinueBookingCard';
import { FestiveHero } from './festive/FestiveHero';
import { FestiveDivider } from './festive/FestiveDivider';
import { themeOf } from '@zappy/core/shared/season';
import { HeroCarousel } from './HeroCarousel';
import { HomeHeader, SearchBar, type HomeLocation } from './HomeHeader';
import { BookAgainRail, NearbyShopsLink, OffersRail } from './HomeRails';
import { LocationSheet, type PickedArea } from './LocationSheet';
import { ProblemChips } from './ProblemChips';
import { ServiceGrid } from './ServiceGrid';
import { ServiceShowcase } from './ServiceShowcase';
import { buildDomains, gridDomains, quickRebooks, searchTerms, type HomeDomain, type HomeService } from './homeCatalog';

let remembered = false;   // a precise fix is saved on the customer's record once per app session

function SkeletonGrid() {
  return <View style={styles.skelGrid}>{Array.from({ length: 6 }).map((_, i) => <View key={i} style={styles.skel} />)}</View>;
}

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
  const { data: eventCats } = useGetEventCategoriesQuery();
  const liveCodes = useMemo(() => (svc ? new Set<string>(svc.lines.map((l: { code: string }) => l.code)) : null), [svc]);
  const allDomains: HomeDomain[] = useMemo(() => buildDomains(catalog?.domains || [], liveCodes, eventCats?.categories || []), [catalog, liveCodes, eventCats]);
  const domains = useMemo(() => gridDomains(allDomains), [allDomains]);
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

  const { current: activeJob, past: pastJobs, refetch: refetchJobs } = useMyJobs({ skip: !isAuthed });
  const rebooks = useMemo(() => quickRebooks(pastJobs), [pastJobs]);
  const notHere = svc?.status === 'not_here';
  // A festival running (Admin → Festive home): its own top on home; light ones also tint the header.
  const { data: seasonData, refetch: refetchSeason } = useCurrentSeasonQuery(undefined);
  const season = !notHere && !loadingCatalog ? seasonData?.season : null;
  const theme = season ? themeOf(season.theme) : null;
  const tint = theme && !theme.dark ? theme.top : null;
  const rise = (i: number) => (theme ? FadeInDown.delay(250 + i * 110).duration(600) : undefined);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchCatalog(), refetchSeason(), loc.lat != null ? refetchArea() : null, isAuthed ? refetchJobs?.() : null].filter(Boolean));
    setRefreshing(false);
  }

  return (
    <View style={[styles.page, theme ? { backgroundColor: theme.wash } : null]}>
      <HomeHeader loc={loc} isAuthed={isAuthed} onPickLocation={() => setLocSheet(true)} tint={tint} />
      {/* Search stays pinned while the rest scrolls. */}
      <View style={[styles.searchWrap, tint ? { backgroundColor: tint, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null]}><SearchBar terms={terms} onOpen={() => setSpotOpen(true)} /></View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {season ? <View style={styles.festive}><FestiveHero season={season} theme={theme} services={services} onOpen={(s) => openService(s)} /></View> : null}
        {activeJob ? <ActiveJobCard job={activeJob} onOpen={() => router.push(activeJob.href as never)} /> : null}
        {/* A booking started and left: back to where they stopped (jobs/checkout-draft). */}
        <ContinueBookingCard isAuthed={isAuthed} />
        {notHere ? (
          <NotInYourArea place={loc.primary} lat={loc.lat} lng={loc.lng} address={[loc.primary, loc.secondary].filter(Boolean).join(', ')}
            areas={svc.areas} onChangeLocation={() => setLocSheet(true)} />
        ) : (
          <>
            {svc?.status === 'closed_now' ? <ClosedNowBanner nextOpening={svc.nextOpening} /> : null}
            {!loadingCatalog ? <HeroCarousel domains={allDomains} onOpen={openService} /> : null}
            {/* During a festival each section rises in after the last. */}
            <Animated.View entering={rise(0)}><ProblemChips services={services} /></Animated.View>
            {loadingCatalog || (loc.lat != null && !svc && checkingArea) ? <SkeletonGrid /> : <Animated.View entering={rise(1)}><ServiceGrid domains={domains} onOpen={openService} /></Animated.View>}
            {theme ? <FestiveDivider accent={theme.accent} /> : null}
            <Animated.View entering={rise(2)}><BookAgainRail items={rebooks} /></Animated.View>
            <Animated.View entering={rise(3)}><OffersRail isAuthed={isAuthed} /></Animated.View>
            {!loadingCatalog ? <Animated.View entering={rise(4)}><ServiceShowcase domains={allDomains} onOpen={openService} /></Animated.View> : null}
            {theme ? <FestiveDivider accent={theme.accent} /> : null}
            <AdBanner isAuthed={isAuthed} />
            <NearbyShopsLink />
          </>
        )}
      </ScrollView>
      <SpotlightSearch open={spotOpen} onClose={() => setSpotOpen(false)} lat={loc.lat} lng={loc.lng} />
      <LocationSheet open={locSheet} onClose={() => setLocSheet(false)} onUseCurrent={useCurrent} detecting={detecting} onPick={pick} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: spacing.base, paddingBottom: spacing.base, paddingTop: 4, backgroundColor: zappy[100], borderBottomLeftRadius: radius.extraLarge, borderBottomRightRadius: radius.extraLarge },
  // Edge to edge, flush under the search: undoes the body's padding.
  festive: { marginHorizontal: -spacing.base, marginTop: -spacing.base },
  body: { padding: spacing.base, gap: spacing.xl, paddingBottom: spacing.xxxl },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: '3.5%', rowGap: spacing.base },
  skel: { width: '31%', aspectRatio: 1, borderRadius: radius.large, backgroundColor: slate[100] },
});
