import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, Loader2, MapPin, ScanLine, Search, UserRound } from 'lucide-react';
import { useListNotificationsQuery } from '@shared/services/api';
import VoiceSearchButton from '../../components/common/VoiceSearchButton';

/**
 * The top of Home: where you are, whether we serve it right now, and search.
 *
 * The blue band scrolls away; the search bar stays pinned, the way people use
 * Blinkit and Zepto — they come back to search far more than to the location.
 * Every line of text here is derived from real state (serviceability, the live
 * catalog, notifications); nothing is a marketing claim the data can't back.
 */

function statusLine(svc) {
  if (!svc) return { tone: 'muted', text: 'Checking what’s available here…' };
  if (svc.status === 'not_here') return { tone: 'muted', text: 'We’re not in this area yet' };
  if (svc.status === 'closed_now') return { tone: 'amber', text: 'Pros are offline right now' };
  const n = svc.lines?.length || 0;
  return { tone: 'live', text: `${n} ${n === 1 ? 'service' : 'services'} live near you` };
}

function NotifBell({ isAuthed }) {
  const nav = useNavigate();
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !isAuthed, pollingInterval: 60000 });
  const count = data?.unread ?? data?.notifications?.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => nav('/notifications')}
      aria-label={count ? `${count} unread notifications` : 'Notifications'}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-95"
    >
      <Bell size={18} strokeWidth={2} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-zappy-600">
          {count > 9 ? '9+' : count}
        </span>
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
          className="absolute inset-x-0 truncate text-[14px] font-medium text-slate-400 sm:text-[15px]"
        >
          {term ? `Search “${term}”` : 'Search for a service or problem'}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function SearchBar({ terms, onOpen, onVoice, onLens }) {
  return (
    <div className="flex h-12 w-full items-center gap-2 rounded-xl bg-white pl-3.5 pr-1.5 sm:h-[50px]">
      <button type="button" onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-3 text-left" aria-label="Search services">
        <Search size={18} strokeWidth={2.4} className="shrink-0 text-slate-500" />
        <SearchHint terms={terms} />
      </button>
      <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
      <VoiceSearchButton onResult={onVoice} />
      <button
        type="button"
        onClick={onLens}
        aria-label="Scan a photo to find the right service"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-navy"
      >
        <ScanLine size={17} />
      </button>
    </div>
  );
}

export default function HomeHeader({ loc, svc, isAuthed, avatar, onPickLocation }) {
  const nav = useNavigate();
  const status = statusLine(svc);
  const dot = { live: 'bg-emerald-400', amber: 'bg-amber-300', muted: 'bg-white/50' }[status.tone];

  return (
    <div className="bg-zappy-600 text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 pb-4 pt-3 sm:px-6 sm:pt-4">
        <button
          type="button"
          onClick={onPickLocation}
          className="group min-w-0 flex-1 text-left"
          aria-label={`Service location: ${loc.primary}. Change location`}
        >
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/80">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
            {status.text}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1">
            {loc.loading
              ? <Loader2 size={16} className="shrink-0 animate-spin" />
              : <MapPin size={17} strokeWidth={2.4} className="shrink-0" />}
            <span className="truncate text-[18px] font-bold leading-tight sm:text-[20px]">
              {loc.loading ? 'Finding your location…' : loc.primary}
            </span>
            <ChevronDown size={18} strokeWidth={2.6} className="shrink-0 transition group-hover:translate-y-0.5" />
          </span>
          {!loc.loading && loc.secondary && (
            <span className="block truncate text-[12px] text-white/70">{loc.secondary}</span>
          )}
        </button>

        {/* From tablet up these live in the top bar. */}
        <span className="contents md:hidden"><NotifBell isAuthed={isAuthed} /></span>
        <button
          type="button"
          onClick={() => nav(isAuthed ? '/profile' : '/login')}
          aria-label={isAuthed ? 'Your profile' : 'Sign in'}
          className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/15 ring-2 ring-white/30 transition hover:ring-white/60 md:hidden"
        >
          {avatar
            ? <img src={avatar} alt="" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center"><UserRound size={19} strokeWidth={2} /></span>}
        </button>
      </div>
    </div>
  );
}
