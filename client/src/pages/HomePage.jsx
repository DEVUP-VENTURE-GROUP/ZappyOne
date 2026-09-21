/**
 * The customer home page.
 * ----------------------------------------------------------------------------
 * ── ONE COMPOSITION, NOT TWO ───────────────────────────────────────────────
 * This file used to branch on `isMobile` into two entirely separate layouts,
 * and they had drifted: one led with a banner and a trust bar, the other with a
 * greeting and a "48 workers live" badge. Two layouts meant two places to fix
 * anything and two chances for them to disagree. There is now one tree that
 * adapts with breakpoints.
 *
 * ── ORDER ──────────────────────────────────────────────────────────────────
 *   header → search → hero (+ trust) → anything in flight → discovery →
 *   promotion → nearby shops → book again → offers → events → footer
 *
 * Discovery before promotion. The live catalog used to sit fourth, beneath a
 * carousel, an offers strip and an ad banner, so the one section that says what
 * Zappy does today was under three marketing blocks — on a phone you scrolled
 * past all of them before reaching anything bookable.
 *
 * ── WHAT IS NOT HERE ANY MORE ──────────────────────────────────────────────
 *   · `LiveBadge` — "{n} workers live" from `useState(47)` plus a setInterval
 *     nudging n by ±1 every six seconds, wrapped in a pulsing green dot to read
 *     as telemetry. There is no worker-count API, so nothing replaces it.
 *   · "4.8 Rated" — a hardcoded string with no rating source behind it.
 *   · `SERVICE_PRICE_FALLBACK` — hardcoded prices whose own docstring called
 *     them a snapshot. A stale price is a promise we would break.
 *   · `HeroCarousel` — four slides of local copy tagged "Trending" and "Highly
 *     Rated", which are popularity and rating claims we cannot support. The
 *     promotional slot is now the real `/ads/active` feed, which renders
 *     nothing when there is no campaign.
 *   · `IntroSplash` — a 5.5-second blocking overlay built from twenty hotlinked
 *     Unsplash URLs, shown before a first-time visitor ever saw the product.
 *   · The deep catalog. Home renders the discovery layer; /services renders the
 *     depth. Rendering both put the entire catalog on the landing page twice.
 *   · The duplicated mobile/desktop search markup, and the trust strip that sat
 *     at the very bottom of the page — the one place a trust signal cannot work.
 *
 * Every remaining factual element traces to an endpoint: location to GPS and
 * Mapbox, the bell to /notifications, the service count and every service card
 * to the live catalog, the promotion to /ads/active, offers to
 * /promos/available, shops to /shops/nearby, Book Again to the customer's own
 * completed orders. Nothing on this page asserts a number we cannot show you
 * the source of.
 * ----------------------------------------------------------------------------
 */

import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
  Bell, Search, ChevronRight, ChevronDown, Wrench, Loader2, MapPin,
  Repeat2, ArrowRight, X,
} from 'lucide-react';
import { selectAuth, selectIsAuthed } from '../modules/auth/authSlice';
import toast from 'react-hot-toast';
import { useT } from '../i18n/I18nProvider';
import { serviceNameKey } from '../i18n/translations';
import {
  useRebookOrderMutation,
  useListNotificationsQuery,
  useLiveCatalogQuery,
  useListServicesQuery,
} from '../services/api';
import { useMyJobs } from '../hooks/useMyJobs';
import { useGeolocation, loadGeoLocation } from '../hooks/useGeolocation';
import { saveGeoLocation } from '../utils/geoCache';
import { reverseGeocode } from '../utils/reverseGeocode';
import { serviceLabel } from '../constants/services';
import GaneshFestiveHeader from '../components/home/GaneshFestiveHeader';
import FestiveCategories from '../components/home/FestiveCategories';
import Footer from '../components/layout/Footer';
import SpotlightSearch from '../components/search/SpotlightSearch';
import LensModal from '../components/lens/LensModal';
import AdBanner from '../components/common/AdBanner';
import HomeHero from '../components/home/HomeHero';
import HomeSearch from '../components/home/HomeSearch';
import ServiceRails from '../components/home/ServiceRails';
import NearbyShopsRail from '../components/home/NearbyShopsRail';
import OffersSection from '../components/home/OffersSection';
import SEO, { HOME_SCHEMA, BASE_URL } from '../components/SEO';

/* ─── Book Again helpers ───────────────────────────────────────────────── */
// Emoji for the rebook card's icon tile, chosen from the service code keyword.
function serviceEmoji(code = '') {
  const c = code.toLowerCase();
  if (c.includes('puncture') || c.includes('tyre')) return '🛞';
  if (c.includes('bike')) return '🏍️';
  if (c.includes('car') || c.includes('fuel') || c.includes('breakdown') || c.includes('jump')) return '🚗';
  if (c.includes('laptop')) return '💻';
  if (c.includes('screen') || c.includes('battery') || c.includes('charging') || c.includes('phone') || c.includes('camera') || c.includes('software') || c.includes('water') || c.includes('data')) return '📱';
  if (c.includes('tv')) return '📺';
  if (c.includes('cctv')) return '📷';
  if (c.includes('router') || c.includes('wifi')) return '📶';
  if (c.includes('lock') || c.includes('automation')) return '🔐';
  if (c.includes('electric') || c.includes('fan') || c.includes('light') || c.includes('switch')) return '💡';
  if (c.includes('plumb') || c.includes('pipe') || c.includes('tap')) return '🚿';
  if (c.includes('pet') || c.includes('dog') || c.includes('groom')) return '🐾';
  if (c.includes('event') || c.includes('birthday') || c.includes('decor')) return '🎉';
  if (c.includes('elder') || c.includes('medicine') || c.includes('hospital') || c.includes('grocery')) return '🧓';
  return '🔧';
}

// Short "time ago" label for the rebook card.
function timeAgo(date) {
  if (!date) return 'Booked before';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

// Event commerce tiles — local art we ship, navigating into the real /events
// module. Three of these used to hotlink Unsplash while the matching files sat
// unused in public/images/events.
const EVENT_TILES = [
  { key: 'birthday',     name: 'Birthday',     img: '/images/event_birthday.webp',             category: 'birthday'     },
  { key: 'anniversary',  name: 'Anniversary',  img: '/images/event_anniversary.webp',          category: 'anniversary'  },
  { key: 'baby-shower',  name: 'Baby Shower',  img: '/images/events/event_baby.webp',          category: 'baby-shower'  },
  { key: 'romantic',     name: 'Romantic',     img: '/images/events/event_romantic.webp',      category: 'romantic'     },
  { key: 'housewarming', name: 'Housewarming', img: '/images/events/event_housewarming.webp',  category: 'housewarming' },
];

/* ─── Notification bell with live unread count ─────────────────────────── */
// Reuses the same real notifications source the BottomNav and WorkerDashboard
// use. No hardcoded count — the dot reflects genuine unread notifications.
function NotifBell({ nav, isAuthed }) {
  const { data } = useListNotificationsQuery(
    { page: 1, unreadOnly: true },
    { skip: !isAuthed, pollingInterval: 60000 },
  );
  const count = data?.unread ?? data?.notifications?.length ?? 0;
  return (
    <motion.button
      onClick={() => nav('/notifications')}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-900/5 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:h-12 md:w-12"
      whileTap={{ scale: 0.88 }}
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
    >
      <Bell size={19} strokeWidth={1.9} className="text-slate-600" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </motion.button>
  );
}

/* ─── Section header ───────────────────────────────────────────────────── */
function SectionHeader({ title, sub, onSeeAll, seeAllLabel }) {
  const t = useT();
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-black leading-tight tracking-[-0.025em] text-[#0F172A] sm:text-[24px]">
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-[12px] font-medium text-slate-500 sm:text-[13.5px]">{sub}</p>}
      </div>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="group flex shrink-0 items-center gap-1 rounded-lg px-1 py-1 text-[13px] font-bold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {seeAllLabel || t('home.seeAll', 'See all')}
          <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

/* ─── Event tile ───────────────────────────────────────────────────────── */
function EventTile({ item, nav }) {
  const t = useT();
  return (
    <motion.button
      onClick={() => nav(`/events/browse?category=${item.category}`)}
      whileTap={{ scale: 0.975 }}
      className="group flex w-[132px] shrink-0 snap-start flex-col text-left focus-visible:outline-none sm:w-[156px] lg:w-auto"
    >
      <span className="mb-2 block aspect-[4/3] w-full overflow-hidden rounded-[16px] bg-slate-100">
        <img
          src={item.img}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </span>
      <span className="truncate text-[13px] font-bold leading-snug text-[#0F172A] sm:text-[14px]">
        {t(serviceNameKey(item.name), item.name)}
      </span>
    </motion.button>
  );
}

/* ─── Anything in flight, at the top ───────────────────────────────────── */
/**
 * Nothing on Home surfaced a job in progress. A customer who had just booked a
 * phone repair landed on a page that looked exactly as it had before they
 * booked, because this screen and Track only ever read the ORDERS collection —
 * repairs live in their own and were invisible to both. `useMyJobs` merges them
 * and already puts a job blocked on the customer ahead of one merely running.
 */
function ActiveJobCard({ job, onOpen }) {
  if (!job) return null;

  return (
    <motion.button
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        job.needsYou ? 'border-amber-300 bg-amber-50' : 'border-indigo-200 bg-indigo-50/70'
      }`}
    >
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white">
        <Wrench size={18} strokeWidth={2.2} className={job.needsYou ? 'text-amber-600' : 'text-indigo-600'} />
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            job.needsYou ? 'bg-amber-400' : 'bg-indigo-400'
          }`} />
          <span className={`relative inline-flex h-3 w-3 rounded-full ${
            job.needsYou ? 'bg-amber-500' : 'bg-indigo-500'
          }`} />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-black uppercase tracking-[0.1em] text-indigo-500">
          {job.needsYou ? 'Needs your approval' : 'Happening now'}
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-black capitalize text-[#0F172A]">{job.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] font-medium text-slate-500">{job.stage}</span>
      </span>

      <ChevronRight size={18} strokeWidth={2.5} className="shrink-0 text-indigo-400" />
    </motion.button>
  );
}

/* ─── Main component ───────────────────────────────────────────────────── */
export default function HomePage() {
  const nav = useNavigate();
  const tHome = useT();
  const [spotOpen, setSpotOpen] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);
  const { profile } = useSelector(selectAuth);
  const isAuthed = useSelector(selectIsAuthed);

  const { current: activeJob, past: pastJobs } = useMyJobs({ skip: !isAuthed });
  const [rebook, { isLoading: rebooking }] = useRebookOrderMutation();

  // The search pill said "50+ services" in both of its copies. This is the live
  // catalog's real total, hidden entirely at zero.
  const { data: liveCatalog } = useLiveCatalogQuery();
  const liveServiceCount = (liveCatalog?.domains || []).reduce((n, d) => n + d.services.length, 0);

  // Warms the RTK cache that the booking screens read, so a tap from a service
  // card does not land on a skeleton.
  useListServicesQuery();

  // One-click rebook: re-place a past order with fresh pricing and dispatch,
  // then jump to tracking. Falls back to the normal booking flow on any issue.
  const handleRebook = async (id, service) => {
    if (rebooking) return;
    try {
      const res = await rebook(id).unwrap();
      toast.success('Rebooked — finding you a pro');
      nav(`/orders/${res.order._id}`);
    } catch (err) {
      const msg = err?.data?.error;
      if (err?.data?.activeOrderId) {
        toast.error(msg || 'You already have an active order');
        nav(`/orders/${err.data.activeOrderId}`);
      } else {
        if (msg) toast.error(msg);
        nav(`/book/${service}`);
      }
    }
  };

  // Last 3 distinct services from completed orders, with the date.
  // Orders only — `rebookOrder` is an orders endpoint, and a repair is rebooked
  // by walking the repair flow again. Rebooking goes by order id, never by
  // reconstructing a booking from `order.service`.
  const quickRebooks = (() => {
    const seen = new Set();
    const result = [];
    for (const j of pastJobs) {
      const o = j.raw;
      if (j.kind !== 'order' || j.outcome !== 'completed' || seen.has(o.service)) continue;
      seen.add(o.service);
      result.push({ id: j.id, service: o.service, date: o.completedAt || o.createdAt });
      if (result.length === 3) break;
    }
    return result;
  })();

  /* ── Location ──────────────────────────────────────────────────────── */
  const { getCurrent } = useGeolocation();
  const [loc, setLoc] = useState(() => {
    const cached = loadGeoLocation();
    return cached
      ? { primary: 'Detecting location…', secondary: null, loading: true, lat: cached.lat, lng: cached.lng }
      : { primary: 'Detecting location…', secondary: null, loading: true };
  });

  const [locSheet, setLocSheet] = useState(false);
  const [locSearch, setLocSearch] = useState('');
  const [locResults, setLocResults] = useState([]);
  const [locSearching, setLocSearching] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);

  useEffect(() => {
    // A recent, trusted location (a GPS sample, or one the user picked last
    // visit) is shown without re-gating — just resolved in the background. This
    // is what stops the "Set your location" sheet re-appearing every reload.
    const cached = loadGeoLocation();
    if (cached) {
      reverseGeocode(cached.lat, cached.lng)
        .then(({ primary, secondary }) => setLoc({ primary, secondary, loading: false, lat: cached.lat, lng: cached.lng }))
        .catch(() => setLoc({ primary: 'Location set', secondary: null, loading: false, lat: cached.lat, lng: cached.lng }));
      return;
    }

    getCurrent()
      .then(async ({ lat, lng, accuracy }) => {
        // Worse than 500m is IP-based location on a laptop. Don't trust the
        // name it produces — open the sheet so the user can pin it exactly.
        if (accuracy && accuracy > 500) {
          setLoc({ primary: 'Set your location', secondary: 'Tap to choose', loading: false });
          setLocSheet(true);
          return;
        }
        const { primary, secondary } = await reverseGeocode(lat, lng);
        setLoc({ primary, secondary, loading: false, lat, lng });
      })
      .catch(() => {
        // No cache and GPS denied — the one case where we must ask.
        setLoc({ primary: 'Set your location', secondary: 'Tap to choose', loading: false });
        setLocSheet(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!locSearch.trim() || locSearch.length < 3) { setLocResults([]); return; }
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return;
    const ctrl = new AbortController();
    setLocSearching(true);
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locSearch)}.json` +
      `?access_token=${token}&language=en&country=IN&types=address,neighborhood,locality,place&limit=5`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((d) => { setLocResults(d.features || []); setLocSearching(false); })
      .catch(() => setLocSearching(false));
    return () => ctrl.abort();
  }, [locSearch]);

  async function detectCurrentLocation() {
    setLocDetecting(true);
    try {
      const { lat, lng } = await getCurrent();
      const { primary, secondary } = await reverseGeocode(lat, lng);
      setLoc({ primary, secondary, loading: false, lat, lng });
      setLocSheet(false);
    } catch {
      // ignore
    } finally {
      setLocDetecting(false);
    }
  }

  function pickLocResult(feat) {
    const [lng, lat] = feat.center;
    const ctx = feat.context || [];
    const get = (prefix) => ctx.find((c) => c.id?.startsWith(prefix))?.text ?? null;
    const primary = get('neighborhood') || get('locality') || feat.text;
    const secondary = [get('place') || get('locality'), get('region')].filter(Boolean).join(', ') || null;
    // Persist the manual pick (accuracy 0 = user-confirmed) so a reload finds it
    // in cache and does not re-open the sheet.
    saveGeoLocation({ lat, lng, accuracy: 0 });
    setLoc({ primary, secondary, loading: false, lat, lng });
    setLocSheet(false);
    setLocSearch('');
    setLocResults([]);
  }

  return (
    <>
      <SpotlightSearch open={spotOpen} onClose={() => setSpotOpen(false)} />
      <SEO
        title="Zappy — Book Verified Professionals Instantly | Home Services India"
        description="India's fastest on-demand home services app. Puncture repair, phone repair, laptop repair, electrician, plumber, bike mechanic, car wash, pet grooming — verified pros arrive in 30 minutes. Book in 60 seconds."
        canonical={BASE_URL}
        keywords="home services near me, on-demand services India, puncture repair, phone repair near me, laptop repair at home, electrician near me, plumber near me, bike mechanic near me, car wash at home, Zappy, instant services"
        jsonLd={HOME_SCHEMA}
      />

      {/* Warm neutral rather than cold white, so the white cards on top of it
          have something to sit against. */}
      <div className="min-h-screen w-full overflow-x-hidden bg-[#FAFAFB]">

        {/* ═══ Header ═══════════════════════════════════════════════════ */}
        <header
          className="sticky top-0 z-30 border-b border-slate-900/5 bg-white/85 backdrop-blur-xl"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="mx-auto flex h-[62px] w-full max-w-[1280px] items-center gap-3 px-4 md:h-[76px] md:gap-6 md:px-6">
            <button
              type="button"
              onClick={() => nav('/')}
              aria-label="Zappy — home"
              className="flex shrink-0 items-center rounded-xl transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <img
                src="/logo.png"
                alt="Zappy"
                width={60}
                height={60}
                /* Height-driven with object-contain, so the same file works
                   whether it is a square mark or a wider wordmark. */
                className="h-[38px] w-auto object-contain md:h-[48px]"
              />
            </button>

            {/* Location — real GPS, real reverse geocode, real saved pick.
                Long names truncate; the sub-line says what to do when there is
                no location rather than inventing one. */}
            <motion.button
              onClick={() => setLocSheet(true)}
              whileTap={{ scale: 0.98 }}
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[18px] px-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:h-14 md:max-w-[300px] md:flex-none md:gap-3 md:px-3"
            >
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <MapPin size={16} strokeWidth={2.5} className="relative z-10 text-indigo-600" />
                {loc.loading && (
                  <motion.span
                    className="absolute inset-0 rounded-full border border-indigo-400"
                    animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
              </span>

              <span className="flex min-w-0 flex-1 flex-col justify-center gap-[2px]">
                <span className="block truncate text-[9px] font-black uppercase leading-none tracking-[0.12em] text-indigo-400">
                  Delivering to
                </span>
                {loc.loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin text-indigo-400" />
                    <span className="text-[13px] font-semibold text-slate-400">Detecting…</span>
                  </span>
                ) : (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] font-black leading-tight text-slate-900 md:text-[14.5px]">
                      {loc.primary}
                    </span>
                    <span className="truncate text-[10px] font-medium leading-tight text-slate-400">
                      {loc.secondary || 'Tap to set exact location'}
                    </span>
                  </span>
                )}
              </span>
              <ChevronDown size={14} className="shrink-0 text-indigo-400" />
            </motion.button>

            <div className="flex shrink-0 items-center gap-2.5">
              <NotifBell nav={nav} isAuthed={isAuthed} />
              <motion.button
                onClick={() => nav('/profile')}
                whileTap={{ scale: 0.88 }}
                aria-label="Your profile"
                className="hidden h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-2 ring-indigo-500/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:flex"
              >
                <img
                  src={profile?.avatar || '/images/zappy_tower_avatar.webp'}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </motion.button>
            </div>
          </div>
        </header>

        {/* A div, not a <main>. The app layout already wraps every route in
            one, and nesting a second is invalid HTML and gives assistive tech
            two "main" landmarks to choose between. */}
        <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6">

          {/* ═══ Search — one component, every width ════════════════════ */}
          <div className="pb-1 pt-3 md:pt-5">
            <HomeSearch
              serviceCount={liveServiceCount}
              onOpenSpotlight={() => setSpotOpen(true)}
              onOpenLens={() => setLensOpen(true)}
              onVoiceResult={(text) => nav(`/services?q=${encodeURIComponent(text)}`)}
            />
          </div>

          {/* Seasonal, and date-gated: both of these return null outside the
              campaign window, so they cost nothing the rest of the year. */}
          <GaneshFestiveHeader />
          <FestiveCategories />

          {/* ═══ Hero — headline, figure, trust strip ═══════════════════ */}
          <div className="pt-3 md:pt-4">
            <HomeHero />
          </div>

          {/* ═══ Anything in flight ════════════════════════════════════ */}
          {activeJob && (
            <div className="pt-4">
              <ActiveJobCard job={activeJob} onOpen={() => nav(activeJob.href)} />
            </div>
          )}

          {/* ═══ Discovery ═════════════════════════════════════════════
              One panel per domain, straight from the live catalog. A domain
              appears when an operator sets it live and providers are verified
              for it — never before, because a tile leading to a flow we cannot
              fulfil is worse than no tile. */}
          <section className="pt-7 md:pt-9">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[24px] font-black leading-[1.1] tracking-[-0.03em] text-[#0F172A] sm:text-[28px] lg:text-[32px]">
                  {tHome('home.discover.title', 'What can we fix?')}
                </h2>
                <p className="mt-1 text-[12.5px] font-medium text-slate-500 sm:text-[14px]">
                  {tHome('home.discover.sub', 'Choose a service and book in minutes.')}
                </p>
              </div>
              <button
                onClick={() => nav('/services')}
                className="group flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2.5 text-[12.5px] font-bold text-indigo-600 ring-1 ring-indigo-100 transition hover:ring-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-4 sm:text-[13.5px]"
              >
                <span className="hidden sm:inline">{tHome('home.seeAllServices', 'See all services')}</span>
                <span className="sm:hidden">{tHome('home.seeAll', 'See all')}</span>
                <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <ServiceRails />
          </section>

          {/* ═══ Featured promotion ════════════════════════════════════
              The real `/ads/active` feed. No active campaign renders nothing —
              there is no fallback promotion, because a fallback promotion is an
              offer we invented. */}
          <div className="pt-8">
            <AdBanner variant="featured" />
          </div>

          {/* ═══ Nearby shops ══════════════════════════════════════════ */}
          <NearbyShopsRail />

          {/* ═══ Book Again ════════════════════════════════════════════
              Personal, so it sits under discovery: a first-time visitor has
              nothing here, and a returning one has already found what they came
              for by this point. */}
          {quickRebooks.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <Repeat2 size={16} className="text-indigo-500" />
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">Book again</span>
              </div>
              <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
                {quickRebooks.map(({ id, service, date }) => (
                  <motion.button
                    key={id || service}
                    onClick={() => handleRebook(id, service)}
                    disabled={rebooking}
                    whileTap={{ scale: 0.97 }}
                    className="group flex w-[210px] shrink-0 items-center justify-between rounded-[18px] bg-white p-3 ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:ring-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 lg:w-auto"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg">
                        {serviceEmoji(service)}
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="mb-0.5 block truncate text-[13.5px] font-bold leading-tight text-slate-900">
                          {serviceLabel(service)}
                        </span>
                        <span className="block text-[10.5px] font-medium text-indigo-500">
                          Tap to book again · {timeAgo(date)}
                        </span>
                      </span>
                    </span>
                    {rebooking ? (
                      <Loader2 size={14} className="shrink-0 animate-spin text-indigo-500" />
                    ) : (
                      <Repeat2 size={14} className="shrink-0 text-slate-400 transition-colors group-hover:text-indigo-500" />
                    )}
                  </motion.button>
                ))}
              </div>
            </section>
          )}

          {/* ═══ Secondary ═════════════════════════════════════════════
              Offers renders only real, in-date, per-customer promotions, and
              nothing at all when there are none. */}
          <OffersSection />

          {/* `PromoBannerEvents` used to sit here and is deliberately gone. Its
              desktop branch rendered `price="From ₹1499"` — a hardcoded price
              for event decoration, with no catalog behind it, in the same
              family as the `SERVICE_PRICE_FALLBACK` map this page already shed.
              It was also a SECOND hardcoded promotion competing with the real
              /ads slot above, and it branched on `isMobile` into two layouts.
              The Events section directly below already reaches /events, with
              art we ship and no price attached. */}

          {/* The tab bar is fixed and 64px tall plus the safe area, and nothing
              reserved room for it — the last section sat underneath it. The
              padding lifts with the bar at `lg`, where the bar is hidden. */}
          <section className="mt-8 pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-6">
            <SectionHeader
              title={tHome('home.sec.events', 'Event decorations')}
              sub={tHome('home.sec.events.sub', 'Book a theme for the occasion.')}
              onSeeAll={() => nav('/events')}
            />
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
              {EVENT_TILES.map((item) => (
                <EventTile key={item.key} item={item} nav={nav} />
              ))}
            </div>
          </section>
        </div>

        <Footer />
        <LensModal open={lensOpen} onClose={() => setLensOpen(false)} />
      </div>

      {/* ── Location sheet ──────────────────────────────────────────── */}
      <AnimatePresence>
        {locSheet && (
          <>
            <motion.div
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setLocSheet(false); setLocSearch(''); setLocResults([]); }}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-[110] rounded-t-3xl bg-white shadow-2xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <div className="flex justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-slate-200" />
              </div>

              <div className="px-5 pb-10 pt-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-900">Set your location</h2>
                  <button
                    onClick={() => { setLocSheet(false); setLocSearch(''); setLocResults([]); }}
                    aria-label="Close"
                    className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 active:scale-95"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="relative mb-4">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search area, street, landmark…"
                    value={locSearch}
                    onChange={(e) => setLocSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  {locSearching && (
                    <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-indigo-400" />
                  )}
                </div>

                <button
                  onClick={detectCurrentLocation}
                  disabled={locDetecting}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl border border-indigo-200/60 bg-indigo-50/70 px-4 py-3 text-left transition-colors hover:bg-indigo-50"
                >
                  {locDetecting
                    ? <Loader2 size={18} className="shrink-0 animate-spin text-indigo-500" />
                    : <MapPin size={18} className="shrink-0 text-indigo-500" />}
                  <span>
                    <span className="block text-sm font-bold text-indigo-700">Use current location</span>
                    <span className="block text-[11px] text-indigo-400">Detect via GPS</span>
                  </span>
                </button>

                {locResults.length > 0 && (
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                    {locResults.map((feat) => (
                      <button
                        key={feat.id}
                        onClick={() => pickLocResult(feat)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-800">{feat.text}</span>
                          <span className="block truncate text-[11px] text-slate-400">{feat.place_name}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
