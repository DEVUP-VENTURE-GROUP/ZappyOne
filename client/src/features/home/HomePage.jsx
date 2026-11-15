import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
import { selectAuth, selectIsAuthed } from '@shared/modules/auth/authSlice';
import { setLocation } from '@shared/store/locationSlice';
import { useGetServiceabilityQuery, useLiveCatalogQuery, useGetEventCategoriesQuery, useLensStatusQuery, useSaveRecentLocationMutation } from '@shared/services/api';
import useSeason from './useSeason';
import { useGeolocation, loadGeoLocation, tooRough, roughLocationMessage } from '@shared/hooks/useGeolocation';
import { saveGeoLocation } from '@shared/utils/geoCache';
import { reverseGeocode } from '@shared/utils/reverseGeocode';
import SEO, { HOME_SCHEMA, BASE_URL } from '@shared/components/SEO';
import NotInYourArea from '../catalog/serviceability/NotInYourArea';
import { backAt } from '@shared/customer/opening';
import ComingSoonRow from './ComingSoonRow';
import HeroCarousel from './HeroCarousel';
import { artFor } from '@shared/components/home/serviceArt';
import Footer from '../../components/layout/Footer';
import SpotlightSearch from '../catalog/SpotlightSearch';
import LensModal from '../catalog/LensModal';
import { useMyJobs } from '@shared/customer/useMyJobs';
import { trackSearch } from '@shared/hooks/useTelemetry';
import HomeHeader, { SearchBar } from './HomeHeader';
import LocationSheet from './LocationSheet';
import { ServiceGrid, ProblemChips } from './ServiceGrid';
import {
  ModeSwitch, ZappyOnePromo, PopularServices, CampaignBanners, LocalStores,
  OffersDeals, BookAgain, RecentActivity,
} from './HomeRails';
import HomeMarketplace from './HomeMarketplace';
import { useHomeAds } from './useHomeAds';
import { pickPopular } from '@shared/config/homepageContent';
import { eventPhoto } from '../events/eventPhotos';
import ContinueBookingCard from './ContinueBookingCard';
import FestiveHero from '@shared/components/home/festive/FestiveHero';
import FestiveDivider from '@shared/components/home/festive/FestiveDivider';
import useFestiveLook from '@shared/customer/useFestiveLook';
import { reducedMotion } from '../../lib/animations';

// Home — what a customer can get done, right where they are.

/** The picture for a past booking, from the characters already shipped. */
function jobArt(job) {
  const raw = job.raw || {};
  if (job.kind === 'repair') return artFor(raw.vertical)?.still || null;
  if (job.kind === 'pet') return artFor(null, 'pet_services')?.still || null;
  if (job.kind === 'helping') return artFor(null, 'helping_services')?.still || null;
  return null;
}

/** Whatever is happening right now comes first — it is why most people open the app. */
function ActiveJobCard({ job, onOpen }) {
  const needsYou = job.needsYou;
  // State is a labelled chip and the action names itself; no coloured stripe.
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5 text-left transition-colors duration-150 active:bg-canvas">
      <span className="min-w-0 flex-1">
        <span className={`chip ${needsYou ? 'bg-amber-50 text-amber-800' : 'bg-zappy-50 text-zappy-700'}`}>
          {needsYou ? 'Needs your approval' : 'In progress'}
        </span>
        <span className="mt-1.5 block truncate text-[15px] font-semibold capitalize text-ink-900">{job.title}</span>
        <span className="block truncate text-[13px] text-ink-500">{job.stage}</span>
      </span>
      <span className={needsYou ? 'btn-primary min-h-[40px] shrink-0 px-4 text-[14px]' : 'flex shrink-0 items-center text-[14px] font-semibold text-zappy-600'}>
        {needsYou ? 'Review' : <>Track <ChevronRight size={16} /></>}
      </span>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <span className="aspect-square w-full animate-pulse rounded-card bg-sunken" />
          <span className="h-3 w-3/4 animate-pulse rounded bg-sunken" />
        </div>
      ))}
    </div>
  );
}

// Where the customer is: trusted cache first, then GPS; ask only when neither works.
function useHomeLocation(isAuthed) {
  const dispatch = useDispatch();
  const [locSheet, setLocSheet] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);

  /* Location: trusted cache first, then GPS; ask only when neither works. */
  const { getCurrent } = useGeolocation();
  // A fresh, accurate fix is kept on the customer's record once a visit (admin sees it; next booking offers it).
  const [saveRecent] = useSaveRecentLocationMutation();
  const remember = (lat, lng, primary, secondary, accuracy) => {
    if (!isAuthed || (accuracy && accuracy > 150)) return;
    try { if (sessionStorage.getItem('zappy:loc_saved')) return; sessionStorage.setItem('zappy:loc_saved', '1'); } catch { /* storage blocked */ }
    saveRecent({ address: [primary, secondary].filter(Boolean).join(', '), lat, lng }).catch(() => {});
  };
  const [loc, setLoc] = useState(() => {
    const cached = loadGeoLocation();
    return { primary: 'Finding your location…', secondary: null, loading: true, lat: cached?.lat, lng: cached?.lng };
  });

  useEffect(() => {
    const cached = loadGeoLocation();
    if (cached) {
      reverseGeocode(cached.lat, cached.lng)
        .then(({ primary, secondary }) => setLoc({ primary, secondary, loading: false, lat: cached.lat, lng: cached.lng }))
        .catch(() => setLoc({ primary: 'Your location', secondary: null, loading: false, lat: cached.lat, lng: cached.lng }));
      return;
    }
    getCurrent()
      .then(async ({ lat, lng, accuracy }) => {
        // Worse than 500 m is an IP guess (laptops): ask rather than send a pro to the wrong street.
        if (accuracy && accuracy > 500) {
          setLoc({ primary: 'Set your location', secondary: null, loading: false });
          setLocSheet(true);
          return;
        }
        const { primary, secondary } = await reverseGeocode(lat, lng);
        setLoc({ primary, secondary, loading: false, lat, lng });
        remember(lat, lng, primary, secondary, accuracy);
      })
      .catch(() => {
        setLoc({ primary: 'Set your location', secondary: null, loading: false });
        setLocSheet(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function detectCurrentLocation() {
    setLocDetecting(true);
    try {
      const { lat, lng, accuracy } = await getCurrent();
      // A laptop or desktop without GPS gives an internet-based guess that can be
      // in the next town: refuse it, the same as on first load, rather than show it.
      if (tooRough(accuracy)) { toast.error(roughLocationMessage(accuracy), { duration: 6000 }); return; }
      const { primary, secondary } = await reverseGeocode(lat, lng);
      setLoc({ primary, secondary, loading: false, lat, lng });
      remember(lat, lng, primary, secondary, accuracy);
      setLocSheet(false);
    } catch {
      toast.error('Couldn’t get your location. Search for it instead.');
    } finally {
      setLocDetecting(false);
    }
  }

  function pickLocation({ lat, lng, primary, secondary }) {
    saveGeoLocation({ lat, lng, accuracy: 0 }); // a chosen place is trusted; don't re-ask next visit
    setLoc({ primary, secondary, loading: false, lat, lng });
    remember(lat, lng, primary, secondary, 0);
    setLocSheet(false);
  }

  // One location for the whole app: Local stores and the booking flows read the
  // shared slice, which otherwise only hydrates on a full page load.
  useEffect(() => {
    if (loc.lat == null || loc.lng == null || loc.loading) return;
    dispatch(setLocation({ lat: loc.lat, lng: loc.lng, address: [loc.primary, loc.secondary].filter(Boolean).join(', ') }));
  }, [loc.lat, loc.lng, loc.loading, loc.primary, loc.secondary, dispatch]);

  return { loc, locSheet, setLocSheet, locDetecting, detectCurrentLocation, pickLocation };
}

// What can be booked here: only services a live pro covers at this address; the rest waits in "Coming to your area".
function useHomeCatalog(loc) {
  /* What we serve here. */
  // A failed check must not hold the grid in skeletons forever: once it has
  // answered (or failed), the catalog is shown as it is.
  const { data: svc, isFetching: checkingArea, refetch: refetchArea } = useGetServiceabilityQuery({ lat: loc.lat, lng: loc.lng }, { skip: loc.lat == null });
  const { data: catalog, isLoading: loadingCatalog, refetch: refetchCatalog } = useLiveCatalogQuery();
  // Back on the tab: what is bookable here may have changed (a pro joined, went offline). One check, at most every 30 s.
  useEffect(() => {
    let last = Date.now();
    const onShow = () => {
      if (document.hidden || Date.now() - last < 30000) return;
      last = Date.now();
      refetchCatalog();
      if (loc.lat != null) refetchArea();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [loc.lat, refetchArea, refetchCatalog]);
  // Only what someone covers at this address is shown; the rest waits in "Coming to your area".
  // Unknown location → everything shows (the flow asks for an address).
  const liveCodes = useMemo(() => (svc && svc.status !== 'not_here' ? new Set(svc.lines.map((l) => l.code)) : null), [svc]);
  // Events run on their own module; they join the catalog as a section here,
  // before pet services, with each celebration as a tile.
  // Only where an approved partner has a package in this city (svc.events); unknown location shows them, as with every service.
  const eventsHere = !liveCodes || Boolean(svc?.events);
  const { data: eventCats } = useGetEventCategoriesQuery(svc?.zone?.city ? { city: svc.zone.city } : {}, { skip: !eventsHere });
  const allDomains = useMemo(() => {
    const list = (catalog?.domains || [])
      .map((d) => ({
        ...d,
        services: d.services.map((s) => ({ ...s, domainCode: d.code, available: liveCodes ? liveCodes.has(s.code) : undefined })).filter((s) => s.available !== false),
      }))
      .filter((d) => d.services.length);
    const cats = eventsHere ? eventCats?.categories || [] : [];
    if (!cats.length) return list;
    const events = {
      code: 'events',
      name: 'Events',
      description: 'Decor and event partners for every occasion.',
      services: [{
        code: 'events', domainCode: 'events', name: 'Events & décor', icon: 'PartyPopper', path: '/events',
        tagline: 'Birthdays, baby showers, anniversaries and more', highlights: [], coverage: [],
        options: cats.map((c) => ({
          code: c.slug, name: c.name, icon: 'PartyPopper',
          imageUrl: eventPhoto(c) || undefined, path: `/events/browse?category=${c.slug}`,
        })),
      }],
    };
    const at = list.findIndex((d) => d.code === 'pet_services');
    return at < 0 ? [...list, events] : [...list.slice(0, at), events, ...list.slice(at)];
  }, [catalog, liveCodes, eventCats, eventsHere]);
  const services = useMemo(() => allDomains.flatMap((d) => d.services), [allDomains]);
  // Grouped by category, one row each, so the list reads like a menu rather than one long strip.
  const comingSoon = useMemo(() => (liveCodes
    ? (catalog?.domains || []).map((d) => ({ code: d.code, name: d.name, services: d.services.filter((s) => !liveCodes.has(s.code)).map((s) => ({ ...s, domainCode: d.code })) })).filter((g) => g.services.length)
    : []), [catalog, liveCodes]);
  const allServices = useMemo(() => (catalog?.domains || []).flatMap((d) => d.services), [catalog]);
  const searchTerms = useMemo(() => {
    const problems = services.flatMap((s) => (s.highlights || []).map((h) => h.name));
    return [...new Set(problems.length ? problems : services.map((s) => s.name))].slice(0, 8);
  }, [services]);

  return { svc, checkingArea, loadingCatalog, liveCodes, allDomains, services, comingSoon, allServices, searchTerms };
}

export default function HomePage() {
  const nav = useNavigate();
  const { profile } = useSelector(selectAuth);
  const isAuthed = useSelector(selectIsAuthed);
  const [spotOpen, setSpotOpen] = useState(false);
  const [spotQuery, setSpotQuery] = useState('');
  const [lensOpen, setLensOpen] = useState(false);
  const { data: lensStatus } = useLensStatusQuery();
  const lensReady = !!lensStatus?.enabled;
  const { loc, locSheet, setLocSheet, locDetecting, detectCurrentLocation, pickLocation } = useHomeLocation(isAuthed);
  const { svc, checkingArea, loadingCatalog, liveCodes, allDomains, services, comingSoon, allServices, searchTerms } = useHomeCatalog(loc);

  // Demand signal for Insights: once per session per ~1 km, whether we serve it.
  useEffect(() => {
    if (!svc?.status || loc.lat == null) return;
    const key = `zappy_area_seen:${loc.lat.toFixed(2)}:${loc.lng.toFixed(2)}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode: record anyway */ }
    trackSearch({
      category: 'all_services', lat: loc.lat, lng: loc.lng,
      result: svc.status === 'not_here' ? 'no_service' : 'served', userType: 'user',
    });
  }, [svc?.status, loc.lat, loc.lng]);

  function openService(s, path) {
    // Every tap is demand — served, or wanted where nobody is verified yet.
    // The customer always goes in; whether someone can come is answered at
    // the booking step (the "growing city by city" card), not on the tile.
    const wanted = s.available === false;
    trackSearch({ category: s.code, lat: loc.lat, lng: loc.lng, result: wanted ? 'no_service' : 'served', userType: 'user' });
    nav(path || s.path);
  }

  /* Admin banners (hero, campaign, offer). */
  const { hero: heroBanners, campaign: campaignBanners, offer: offerBanners, open: openBanner, onImageError: onBannerImageError } = useHomeAds();
  const popular = useMemo(() => pickPopular(services), [services]);

  /* The customer's own jobs. */
  const { jobs, current: activeJob, past: pastJobs } = useMyJobs({ skip: !isAuthed });
  // Anything they've had done before, of any kind, reopens its booking flow.
  const quickRebooks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const j of pastJobs) {
      if (j.outcome !== 'completed' || !j.rebookHref || seen.has(j.rebookHref)) continue;
      seen.add(j.rebookHref);
      out.push({ key: j.rebookHref, title: j.title, href: j.rebookHref, date: j.raw.completedAt || j.createdAt, art: jobArt(j) });
      if (out.length === 3) break;
    }
    return out;
  }, [pastJobs]);
  // The latest few, live ones first; the live one already has its own card above.
  const recent = useMemo(() => {
    const ordered = [...jobs.filter((j) => j.active), ...jobs.filter((j) => !j.active)];
    return ordered.filter((j) => j !== activeJob).slice(0, 3);
  }, [jobs, activeJob]);

  const notHere = svc?.status === 'not_here';
  // In the city, but no pro has joined at this address yet: say so honestly and lead with what is coming.
  const nothingLive = !!liveCodes && liveCodes.size === 0;
  // A festival running (Admin → Festive home): its own top on home; light ones also tint the header.
  const { season: seasonNow, loading: loadingSeason } = useSeason();
  // The layout is chosen once both are known, so the plain look never flashes before a festive one.
  const settling = loadingCatalog || loadingSeason;
  const season = !notHere && !settling ? seasonNow : null;
  // Each festival has a few looks; home moves to the next every 30 s. The colours do not wait for the catalog, so a refresh opens in the festival's look.
  const theme = useFestiveLook(!notHere ? seasonNow?.theme : null, reducedMotion);
  const tint = theme ? theme.top : null;
  const searchBar = (
    <SearchBar
      terms={searchTerms}
      onOpen={() => setSpotOpen(true)}
      onVoice={(text) => { setSpotQuery(text); setSpotOpen(true); }}
      // Only when photo search is set up on the server; never a button that fails.
      onLens={lensReady ? () => setLensOpen(true) : undefined}
    />
  );

  return (
    <>
      <SEO
        title="ZappyOne, Verified pros near you"
        description="Book verified professionals near you on ZappyOne: phone and laptop repair, vehicles, home, pet care and more, with prices before work starts and live tracking."
        canonical={BASE_URL}
        jsonLd={HOME_SCHEMA}
      />
      <SpotlightSearch
        open={spotOpen}
        onClose={() => { setSpotOpen(false); setSpotQuery(''); }}
        lat={loc.lat}
        lng={loc.lng}
        initialQuery={spotQuery}
      />

      {/* overflow-x-clip, not hidden: hidden makes this a scroll box and breaks the sticky header. */}
      <div className="fz-look min-h-screen w-full overflow-x-clip bg-[#F7F8FB]"
        // A festival carries all the way down in the page's own plain wash.
        style={theme ? { background: theme.wash } : undefined}>
        <HomeHeader
          loc={loc}
          isAuthed={isAuthed}
          avatar={profile?.avatar}
          onPickLocation={() => setLocSheet(true)}
          search={searchBar}
          tint={tint}
          festive={theme}
          greeting={(!notHere && seasonNow?.greeting) || ''}
          eta={svc?.fastestMin != null && svc.fastestMin <= 60 ? svc.fastestMin : null}
          closed={svc?.status === 'closed_now' ? backAt(svc.nextOpening) : null}
        />

        {/* Phone: search stays pinned while the rest scrolls (desktop has it in the bar). */}
        <div className="sticky top-0 z-30 bg-white pb-3 pt-1 shadow-[0_6px_12px_-10px_rgba(16,24,40,0.18)] md:hidden" style={tint ? { background: tint } : undefined}>
          <div className="px-4">{searchBar}</div>
        </div>

        {season && <FestiveHero season={season} theme={theme} services={services} onOpen={(s) => openService(s)} />}

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 pb-10 pt-4 sm:gap-10 sm:px-6 sm:pt-7">
          <ModeSwitch onStores={() => nav('/nearby-shops')} />

          {activeJob && <ActiveJobCard job={activeJob} onOpen={() => nav(activeJob.href)} />}
          {/* A booking started and left: back to where they stopped (jobs/checkout-draft). */}
          <ContinueBookingCard isAuthed={isAuthed} />

          {/* Inside Telangana every service shows; outside it, we say we are
              not there yet and record the demand. */}
          {notHere ? (
            <NotInYourArea
              place={loc.primary}
              lat={loc.lat}
              lng={loc.lng}
              address={[loc.primary, loc.secondary].filter(Boolean).join(', ')}
              areas={svc.areas}
              onChangeLocation={() => setLocSheet(true)}
            />
          ) : (
            <>
              {nothingLive && (
                <NotInYourArea soon place={loc.primary} lat={loc.lat} lng={loc.lng}
                  address={[loc.primary, loc.secondary].filter(Boolean).join(', ')} areas={svc?.areas || []} onChangeLocation={() => setLocSheet(true)} />
              )}
              {nothingLive && !loadingCatalog && <ComingSoonRow groups={comingSoon} loc={loc} />}

              {settling && <div className="h-[188px] animate-pulse rounded-[20px] bg-sunken sm:h-[300px] lg:h-[340px]" aria-hidden="true" />}
              {!settling && !nothingLive && !season && (
                <HeroCarousel banners={heroBanners} domains={allDomains} onOpen={openService} onOpenBanner={openBanner} onImageError={onBannerImageError} />
              )}

              {settling || (loc.lat != null && !svc && checkingArea)
                ? <SkeletonGrid />
                : <ServiceGrid domains={allDomains} onOpenArea={(d) => nav(`/services#domain-${d.code}`)} onMore={() => nav('/services')} />}
              {/* The problem in the customer's own words, straight into its flow. */}
              <ProblemChips services={services} />
              {season && <FestiveDivider theme={theme} />}

              <ZappyOnePromo onExplore={() => nav('/nearby-shops')} />

              {!loadingCatalog && <PopularServices services={popular} onOpen={openService} onViewAll={() => nav('/services')} />}

              <CampaignBanners ads={campaignBanners} onOpen={openBanner} onImageError={onBannerImageError} />

              <LocalStores lat={loc.lat} lng={loc.lng} enabled={isAuthed} onOpenShop={(id) => nav(`/shops/${id}`)} onViewAll={() => nav('/nearby-shops')} />

              <OffersDeals ads={offerBanners} isAuthed={isAuthed} onOpenAd={openBanner} onViewAll={() => nav('/promos')} onImageError={onBannerImageError} />

              {/* Personal and real only: the customer's own bookings. */}
              <BookAgain items={quickRebooks} onOpen={nav} onViewAll={() => nav('/orders')} />
              <RecentActivity jobs={recent} onOpen={nav} onViewAll={() => nav('/orders')} />

              {isAuthed && <HomeMarketplace />}
              {/* Only live services show above; the rest waits here, by category. */}
              {!loadingCatalog && !nothingLive && <ComingSoonRow groups={comingSoon} loc={loc} />}
            </>
          )}
        </main>

        <Footer services={allServices} areas={svc?.areas || []} season={season} theme={theme} />
      </div>

      <LensModal open={lensOpen} onClose={() => setLensOpen(false)} lat={loc.lat} lng={loc.lng} />
      <LocationSheet
        open={locSheet}
        onClose={() => setLocSheet(false)}
        onUseCurrent={detectCurrentLocation}
        detecting={locDetecting}
        onPick={pickLocation}
      />
    </>
  );
}
