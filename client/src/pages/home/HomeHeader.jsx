import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, ChevronDown, Loader2, MapPin, ScanLine, Search, UserRound } from 'lucide-react';
import { useListNotificationsQuery } from '@shared/services/api';
import { ZappyWordmark, ZAPPY_MARK } from '@shared/components/common/ZappyLogo';
import VoiceSearchButton from '../../components/common/VoiceSearchButton';
import { prefetchRoute } from '../../lib/routePrefetch';

/**
 * The top of Home, the way people already read Blinkit, Zepto and Swiggy:
 * where the pro will come to (bold, tappable), what is live there, and search.
 *
 *   phone    a light header that scrolls away; search stays pinned below it
 *   desktop  one sticky white bar — logo, location, wide search, links, account
 *
 * Every word is derived from real state (serviceability, catalog, notifications);
 * nothing claims an arrival time the data cannot back.
 */


function useUnread(isAuthed) {
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !isAuthed, pollingInterval: 60000 });
  return data?.unread ?? data?.notifications?.length ?? 0;
}

function IconButton({ label, onClick, children, badge = 0 }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-btn border border-zappy-100 bg-white text-zappy-700 transition-colors duration-150 hover:border-zappy-200">
      {children}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function Avatar({ isAuthed, avatar, compact = false }) {
  const nav = useNavigate();
  if (!isAuthed) {
    return (
      <button type="button" onClick={() => nav('/login')}
        className={`shrink-0 rounded-btn bg-zappy-600 font-semibold text-white transition-colors duration-150 hover:bg-zappy-700 ${
          compact ? 'h-9 px-3 text-[13px]' : 'h-10 px-4 text-[14px]'}`}>
        Sign in
      </button>
    );
  }
  return (
    <button type="button" onClick={() => nav('/profile')} aria-label="Your profile"
      className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zappy-100 bg-white transition-colors duration-150 hover:border-zappy-200">
      {avatar
        ? <img src={avatar} alt="" className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-navy"><UserRound size={18} /></span>}
    </button>
  );
}

/** Where the pro comes to — the one thing on the header you tap most. */
function LocationBlock({ loc, onPickLocation, compact = false, align = 'left', dropPin = false }) {
  const right = align === 'right';
  return (
    <button type="button" onClick={onPickLocation} className={`group min-w-0 max-w-full ${right ? 'text-right' : 'text-left'}`}
      aria-label={`Service location: ${loc.primary}. Change location`}>
      <span className={`flex min-w-0 items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {loc.loading
          ? <Loader2 size={15} className="shrink-0 animate-spin text-zappy-600" />
          : dropPin
            ? (
              <motion.span className="flex shrink-0" initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 14, delay: 0.15 }}>
                <MapPin size={18} strokeWidth={2.4} className="text-amber-500" />
              </motion.span>
            )
            : <MapPin size={16} strokeWidth={2.4} className="shrink-0 text-amber-500" />}
        <span className={`truncate font-extrabold leading-tight tracking-[-0.01em] text-zappy-700 ${compact ? 'text-[15px]' : 'text-[21px]'}`}>
          {loc.loading ? 'Finding you…' : loc.primary}
        </span>
        <ChevronDown size={16} strokeWidth={2.6} className="shrink-0 text-zappy-600 transition group-hover:translate-y-0.5" />
      </span>
      {!loc.loading && loc.secondary && (
        <span className={`block truncate text-[12px] text-ink-500 ${compact && !right ? 'max-w-[220px]' : ''}`}>{loc.secondary}</span>
      )}
    </button>
  );
}

/** Rotating hint made of real, bookable problems — never a service we don't offer. */
function SearchHint({ terms }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (terms.length < 2) return undefined;
    const id = setInterval(() => setI((x) => (x + 1) % terms.length), 2600);
    return () => clearInterval(id);
  }, [terms.length]);
  const term = terms[i % Math.max(terms.length, 1)];
  return (
    <span className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.span
          key={term || 'default'}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 truncate text-[14px] text-slate-500 sm:text-[15px]"
        >
          {term ? <>Search <span className="font-semibold text-navy">“{term}”</span></> : 'Search for a service or problem'}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function SearchBar({ terms, onOpen, onVoice, onLens }) {
  return (
    <div className="flex h-12 w-full items-center gap-2 rounded-btn border border-zappy-100 bg-white pl-3.5 pr-1.5 transition-colors duration-150 hover:border-zappy-200 focus-within:border-zappy-600">
      <button type="button" onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-3 text-left" aria-label="Search services">
        <Search size={18} strokeWidth={2.4} className="shrink-0 text-slate-500" />
        <SearchHint terms={terms} />
      </button>
      <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
      <VoiceSearchButton onResult={onVoice} />
      <button type="button" onClick={onLens} aria-label="Scan a photo to find the right service"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-ink-500 transition hover:bg-sunken hover:text-ink-900">
        <ScanLine size={17} />
      </button>
    </div>
  );
}

/**
 * Phone: the brand and the place share one slot and take turns, sliding up
 * every few seconds. Tapping the brand shows the place at once; tapping the
 * place opens the picker. With reduced motion they simply sit side by side.
 */
const FLIP_MS = 5000;

function BrandOrPlace({ loc, onPickLocation }) {
  const reduce = useReducedMotion();
  const [face, setFace] = useState('brand');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduce) return undefined;
    const id = setTimeout(() => setFace((f) => (f === 'brand' ? 'place' : 'brand')), FLIP_MS);
    return () => clearTimeout(id);
  }, [face, tick, reduce]);

  if (reduce) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ZappyWordmark size={26} />
        <div className="flex min-w-0 flex-1 justify-end"><LocationBlock loc={loc} onPickLocation={onPickLocation} compact align="right" /></div>
      </div>
    );
  }

  return (
    <div className="relative h-12 min-w-0 flex-1 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={face}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center"
        >
          {face === 'brand' ? (
            <button type="button" onClick={() => { setFace('place'); setTick((t) => t + 1); }}
              aria-label="ZappyOne. Show your service location" className="flex items-center gap-2">
              {/* The runner sprints in, then the name follows. */}
              <motion.img src={ZAPPY_MARK} alt="" style={{ height: 34, width: 'auto' }}
                initial={{ x: -48, skewX: -12, opacity: 0 }} animate={{ x: 0, skewX: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }} />
              <motion.span className="text-[23px] font-extrabold leading-none tracking-[-0.02em]"
                initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.18, ease: 'easeOut' }}>
                <span className="text-zappy-600">Zappy</span><span className="text-amber-500">One</span>
              </motion.span>
            </button>
          ) : (
            <LocationBlock loc={loc} onPickLocation={onPickLocation} dropPin />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const LINKS = [
  { to: '/orders', label: 'Bookings' },
  { to: '/track', label: 'Track' },
];

export default function HomeHeader({ loc, isAuthed, avatar, onPickLocation, search }) {
  const nav = useNavigate();
  const unread = useUnread(isAuthed);

  return (
    <>
      {/* Desktop: one sticky bar. (DesktopNav steps aside on Home.) */}
      <header className="sticky top-0 z-40 hidden border-b border-zappy-100 bg-zappy-50 md:block">
        <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center gap-5 px-6">
          <NavLink to="/" aria-label="ZappyOne home" className="flex shrink-0 items-center">
            <ZappyWordmark size={30} />
          </NavLink>
          <span className="h-9 w-px bg-zappy-100" aria-hidden="true" />
          <div className="w-[210px] shrink-0"><LocationBlock loc={loc} onPickLocation={onPickLocation} compact /></div>
          {/* Inline from laptop width; on a tablet it takes its own row below. */}
          <div className="hidden min-w-0 flex-1 lg:block">{search}</div>
          <div className="flex-1 lg:hidden" aria-hidden="true" />
          <nav className="flex shrink-0 items-center" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} onMouseEnter={() => prefetchRoute(l.to)}
                className="rounded-btn px-2.5 py-2 text-[14px] font-medium text-zappy-700 transition hover:bg-white lg:px-3">
                {l.label}
              </NavLink>
            ))}
          </nav>
          <IconButton label={unread ? `${unread} unread notifications` : 'Notifications'} onClick={() => nav('/notifications')} badge={unread}>
            <Bell size={17} />
          </IconButton>
          <Avatar isAuthed={isAuthed} avatar={avatar} />
        </div>
        <div className="mx-auto w-full max-w-6xl px-6 pb-3 lg:hidden">{search}</div>
      </header>

      {/* Phone: light header, scrolls away; search is pinned by the page below it. */}
      <div className="bg-zappy-100 md:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* Brand and place take turns in one slot. Profile lives in the bottom
            bar, so the phone header keeps the bell (signed in) or Sign in. */}
        <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-4">
          <BrandOrPlace loc={loc} onPickLocation={onPickLocation} />
          {isAuthed ? (
            <IconButton label={unread ? `${unread} unread notifications` : 'Notifications'} onClick={() => nav('/notifications')} badge={unread}>
              <Bell size={17} />
            </IconButton>
          ) : <Avatar isAuthed={false} avatar={avatar} compact />}
        </div>
      </div>
    </>
  );
}
