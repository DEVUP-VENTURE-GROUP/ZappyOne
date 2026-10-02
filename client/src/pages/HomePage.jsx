import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
import { selectAuth, selectIsAuthed } from '@shared/modules/auth/authSlice';
import { useGetServiceabilityQuery, useLiveCatalogQuery } from '@shared/services/api';
import { useGeolocation, loadGeoLocation } from '@shared/hooks/useGeolocation';
import { saveGeoLocation } from '@shared/utils/geoCache';
import { reverseGeocode } from '@shared/utils/reverseGeocode';
import SEO, { HOME_SCHEMA, BASE_URL } from '@shared/components/SEO';
import NotInYourArea from '../components/serviceability/NotInYourArea';
import ClosedNowBanner from '../components/serviceability/ClosedNowBanner';
import ComingSoonSheet from '../components/serviceability/ComingSoonSheet';
import HeroCarousel from './home/HeroCarousel';
import ServiceShowcase from './home/ServiceShowcase';
import { foldIntoHub } from '@shared/components/home/serviceArt';
import AdBanner from '../components/common/AdBanner';
import Footer from '../components/layout/Footer';
import SpotlightSearch from '../components/search/SpotlightSearch';
import LensModal from '../components/lens/LensModal';
import { useMyJobs } from '../hooks/useMyJobs';
import { trackSearch } from '../hooks/useTelemetry';
import HomeHeader, { SearchBar } from './home/HomeHeader';
import LocationSheet from './home/LocationSheet';
import { ServiceGrid, ProblemChips } from './home/ServiceGrid';
import { OffersRail, BookAgainRail, EventsRail, NearbyShopsLink } from './home/HomeRails';

/**
 * Home — what a customer can get done, right where they are.
 *
 *   location + live status → search → anything in progress
 *   → every live service → common problems → offers → book again → shops, events
 *
 * What each service covers in detail lives one tap in (the service and All
 * Services pages) — repeating it here made Home five screens of the same list.
 *
 * One layout from a small phone to a wide desktop; nothing here is a claim
 * the data doesn't back (services, offers, events and counts are all live).
 */

/** Whatever is happening right now comes first — it is why most people open the app. */
function ActiveJobCard({ job, onOpen }) {
  const needsYou = job.needsYou;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl border-l-4 bg-white px-4 py-3.5 text-left ${
        needsYou ? 'border-amber-500' : 'border-zappy-600'}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[12px] font-semibold ${needsYou ? 'text-amber-700' : 'text-zappy-700'}`}>
          {needsYou ? 'Waiting for your approval' : 'In progress'}
        </span>
        <span className="block truncate text-[15px] font-semibold capitalize text-navy">{job.title}</span>
        <span className="block truncate text-[13px] text-slate-500">{job.stage}</span>
      </span>
      <span className="flex shrink-0 items-center text-[13px] font-semibold text-zappy-600">
        {needsYou ? 'Review' : 'Track'} <ChevronRight size={16} />
      </span>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <span className="aspect-square w-full animate-pulse rounded-2xl bg-slate-200/70" />
          <span className="h-3 w-3/4 animate-pulse rounded bg-slate-200/70" />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const nav = useNavigate();
  const { profile } = useSelector(selectAuth);
  const isAuthed = useSelector(selectIsAuthed);
  const [spotOpen, setSpotOpen] = useState(false);
  const [spotQuery, setSpotQuery] = useState('');
  const [lensOpen, setLensOpen] = useState(false);
  const [locSheet, setLocSheet] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);

  /* Location: trusted cache first, then GPS; ask only when neither works. */
  const { getCurrent } = useGeolocation();
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
      })
      .catch(() => {
        setLoc({ primary: 'Set your location', secondary: null, loading: false });
        setLocSheet(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function detectCurrentLocation() {
    setLocDetecting(true);
    try {
      const { lat, lng } = await getCurrent();
      const { primary, secondary } = await reverseGeocode(lat, lng);
      setLoc({ primary, secondary, loading: false, lat, lng });
      setLocSheet(false);
    } catch {
      toast.error('Couldn’t get your location — search for it instead');
    } finally {
      setLocDetecting(false);
    }
  }

  function pickLocation({ lat, lng, primary, secondary }) {
    saveGeoLocation({ lat, lng, accuracy: 0 }); // a chosen place is trusted; don't re-ask next visit
    setLoc({ primary, secondary, loading: false, lat, lng });
    setLocSheet(false);
  }

  /* What we serve here. */
  const { data: svc } = useGetServiceabilityQuery({ lat: loc.lat, lng: loc.lng }, { skip: loc.lat == null });
  const { data: catalog, isLoading: loadingCatalog } = useLiveCatalogQuery();
  // Every service shows; whether it can be booked HERE is serviceability's answer.
  // Unknown location → treated as bookable (the flow asks for an address).
  const liveCodes = useMemo(() => (svc ? new Set(svc.lines.map((l) => l.code)) : null), [svc]);
  const allDomains = useMemo(() => (catalog?.domains || [])
    .map((d) => ({
      ...d,
      services: d.services.map((s) => ({ ...s, domainCode: d.code, available: liveCodes ? liveCodes.has(s.code) : undefined })),
    }))
    .filter((d) => d.services.length), [catalog, liveCodes]);
  // The quick grid folds a section with its own page (pet care) into one tile.
  const domains = useMemo(() => allDomains.map(foldIntoHub), [allDomains]);
  const [soonService, setSoonService] = useState(null);
  const services = useMemo(() => allDomains.flatMap((d) => d.services), [allDomains]);
  const searchTerms = useMemo(() => {
    const problems = services.flatMap((s) => (s.highlights || []).map((h) => h.name));
    return [...new Set(problems.length ? problems : services.map((s) => s.name))].slice(0, 8);
  }, [services]);

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

  function openService(s) {
    // Every tap is demand — served, or wanted where nobody is verified yet.
    const wanted = s.available === false;
    trackSearch({ category: s.code, lat: loc.lat, lng: loc.lng, result: wanted ? 'no_service' : 'served', userType: 'user' });
    if (wanted) setSoonService(s);
    else nav(s.path);
  }

  /* The customer's own jobs. */
  const { current: activeJob, past: pastJobs } = useMyJobs({ skip: !isAuthed });
  // Anything they've had done before, of any kind, reopens its booking flow.
  const quickRebooks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const j of pastJobs) {
      if (j.outcome !== 'completed' || !j.rebookHref || seen.has(j.rebookHref)) continue;
      seen.add(j.rebookHref);
      out.push({ key: j.rebookHref, title: j.title, href: j.rebookHref, date: j.raw.completedAt || j.createdAt });
      if (out.length === 3) break;
    }
    return out;
  }, [pastJobs]);

  const notHere = svc?.status === 'not_here';

  return (
    <>
      <SEO
        title="ZappyOne — Verified pros near you, on demand"
        description="Book verified professionals near you on ZappyOne — phone and laptop repair and more, with upfront prices and live tracking."
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

      <div className="min-h-screen w-full overflow-x-hidden bg-[#F4F7FB]">
        <HomeHeader
          loc={loc}
          svc={svc}
          isAuthed={isAuthed}
          avatar={profile?.avatar}
          onPickLocation={() => setLocSheet(true)}
        />

        {/* Search stays pinned while the rest scrolls. */}
        <div className="sticky top-0 z-30 bg-zappy-600 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.6)]">
          <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6">
            <SearchBar
              terms={searchTerms}
              onOpen={() => setSpotOpen(true)}
              onVoice={(text) => { setSpotQuery(text); setSpotOpen(true); }}
              onLens={() => setLensOpen(true)}
            />
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-10 pt-5 sm:gap-10 sm:px-6 sm:pt-7">
          {activeJob && <ActiveJobCard job={activeJob} onOpen={() => nav(activeJob.href)} />}

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
              {svc?.status === 'closed_now' && <ClosedNowBanner nextOpening={svc.nextOpening} />}

              {loadingCatalog || (loc.lat != null && !svc)
                ? <SkeletonGrid />
                : (
                  <>
                    <HeroCarousel domains={domains} onBook={openService} onSoon={openService} />
                    <ServiceGrid domains={domains} onOpen={openService} />
                  </>
                )}

              <ProblemChips services={services.filter((x) => x.available !== false)} />
              {!loadingCatalog && <ServiceShowcase domains={allDomains} onOpen={openService} />}
              <OffersRail isAuthed={isAuthed} />
              <BookAgainRail items={quickRebooks} onOpen={nav} />
              <AdBanner />
              <NearbyShopsLink />
              <EventsRail />
            </>
          )}
        </main>

        <Footer services={services} areas={svc?.areas || []} />
      </div>

      <ComingSoonSheet
        service={soonService}
        place={loc.primary}
        lat={loc.lat}
        lng={loc.lng}
        onClose={() => setSoonService(null)}
        onChangeLocation={() => { setSoonService(null); setLocSheet(true); }}
      />
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
