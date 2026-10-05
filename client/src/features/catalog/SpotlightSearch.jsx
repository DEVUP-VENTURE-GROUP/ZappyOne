import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Clock, Search, X, Wrench } from 'lucide-react';
import { problemPhoto, categoryPhoto, servicePhoto } from '@shared/components/home/problemArt';
import { useLazySmartSearchQuery, useSearchTrendingQuery } from '@shared/services/api';
import { getRecent, addRecent, clearRecent } from './recentSearches';
import VoiceSearchButton from '../../components/common/VoiceSearchButton';

/**
 * Full-screen search over the live catalog.
 *
 * Results are services, the problem headings inside them, and specific
 * problems ("Cracked screen") — each opening the real booking flow, with the
 * problem already chosen when there is one. Only what's live at the
 * customer's location appears; where we don't serve, it says so.
 */

const GROUP_LABEL = { problems: 'Problems we fix', services: 'Services', categories: 'Browse by type of problem' };

/** Enter opens the best match, in the order the results are shown. */
const topResult = (data) => data?.problems?.[0] || data?.services?.[0] || data?.categories?.[0] || null;

/** The result's own photo: the problem's, its heading's, else the service's. */
function photoOf(item) {
  return (item.problemCode && problemPhoto(item.vertical, { code: item.problemCode }))
    || (item.categoryCode && categoryPhoto(item.vertical, { code: item.categoryCode }))
    || servicePhoto(item.lineCode) || servicePhoto(item.vertical) || null;
}

/** The typed words in bold inside a title, so the customer sees why it matched. */
function Highlight({ text, words }) {
  if (!words.length) return text;
  const safe = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${safe.join('|')})`, 'ig');
  return String(text).split(re).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-navy">{part}</b> : part));
}

function ResultRow({ item, onOpen, words = [], showSubtitle = true }) {
  const photo = photoOf(item);
  return (
    <li>
      <button type="button" onClick={() => onOpen(item)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {photo
            ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <Wrench size={18} className="text-slate-400" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-slate-700"><Highlight text={item.title} words={words} /></span>
          {showSubtitle && item.subtitle && <span className="block truncate text-[12.5px] text-slate-500">{item.subtitle}</span>}
        </span>
        <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden="true" />
      </button>
    </li>
  );
}

function Group({ title, items, onOpen, words }) {
  if (!items?.length) return null;
  return (
    <section className="pt-3">
      <h3 className="px-4 pb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h3>
      <ul>{items.map((it) => <ResultRow key={`${it.type}:${it.code}`} item={it} onOpen={onOpen} words={words} />)}</ul>
    </section>
  );
}

/**
 * Problems grouped under the service they belong to ("2-Wheeler": Puncture,
 * Slow puncture), each group ending with a way into the whole service.
 */
function ProblemGroups({ problems, onOpen, words }) {
  if (!problems?.length) return null;
  const groups = [];
  for (const p of problems) {
    let g = groups.find((x) => x.lineCode === p.lineCode);
    if (!g) groups.push((g = { lineCode: p.lineCode, name: p.subtitle, path: p.path.split('?')[0], items: [] }));
    g.items.push(p);
  }
  return groups.map((g) => (
    <section key={g.lineCode} className="pt-3">
      <h3 className="px-4 pb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">{g.name}</h3>
      <ul>
        {g.items.map((it) => <ResultRow key={it.code} item={it} onOpen={onOpen} words={words} showSubtitle={false} />)}
        <li>
          <button type="button" onClick={() => onOpen({ path: g.path })}
            className="flex w-full items-center justify-between px-4 py-2.5 text-[13.5px] font-semibold text-zappy-600 hover:bg-slate-50">
            All {g.name} repairs <ChevronRight size={15} />
          </button>
        </li>
      </ul>
    </section>
  ));
}

export default function SpotlightSearch({ open, onClose, lat, lng, initialQuery = '' }) {
  const nav = useNavigate();
  const inputRef = useRef(null);
  const [q, setQ] = useState(initialQuery);
  const [recent, setRecent] = useState(getRecent());
  const [runSearch, searchState] = useLazySmartSearchQuery();
  const { data: trendData } = useSearchTrendingQuery({ lat, lng }, { skip: !open });

  useEffect(() => {
    if (!open) return undefined;
    setRecent(getRecent());
    if (initialQuery) setQ(initialQuery); // e.g. what the customer just said into the mic
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, onClose, initialQuery]);

  // Search as they type, after a short pause.
  useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    if (!term) return undefined;
    if (term.length < 2) return undefined;
    // Repeat queries come from the client cache (preferCacheValue), not the server.
    const id = setTimeout(() => runSearch({ q: term, lat, lng }, true), 220);
    return () => clearTimeout(id);
  }, [q, open, lat, lng, runSearch]);

  const openResult = useCallback((item) => {
    if (q.trim()) setRecent(addRecent(q.trim()));
    onClose?.();
    nav(item.path);
  }, [nav, onClose, q]);

  if (!open) return null;

  const term = q.trim();
  const data = term ? searchState.data : null;
  const loading = term && (searchState.isFetching || searchState.isUninitialized);
  const trending = trendData?.trending || [];
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 1);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Search">
      <div className="border-b border-slate-100" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-3 py-3">
          <button type="button" onClick={onClose} aria-label="Close search"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-slate-100 pl-3.5 pr-1.5">
            <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && topResult(data)) openResult(topResult(data)); }}
              placeholder="Search a service or what’s wrong"
              aria-label="Search a service or what’s wrong"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-navy outline-none placeholder:text-slate-400"
            />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200"><X size={16} /></button>}
            <VoiceSearchButton onResult={(text) => setQ(text)} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl pb-10">
          {!term && (
            <>
              {recent.length > 0 && (
                <section className="px-4 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Recent</h3>
                    <button type="button" onClick={() => setRecent(clearRecent())} className="text-[13px] font-medium text-slate-500 hover:text-navy">Clear</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recent.map((r) => (
                      <button key={r} type="button" onClick={() => setQ(r)}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[14px] text-slate-700 hover:bg-slate-200">
                        <Clock size={13} className="text-slate-400" /> {r}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {trending.length > 0 && <Group title="Popular near you" items={trending} onOpen={openResult} />}
            </>
          )}

          {loading && !data && (
            <div className="space-y-3 px-4 pt-4" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
            </div>
          )}

          {term && searchState.isError && !searchState.isFetching && (
            <div className="px-4 pt-6 text-center">
              <p className="text-[15px] text-slate-700">Search did not load.</p>
              <button type="button" onClick={() => runSearch({ q: term, lat, lng })} className="btn-outline mt-3 min-h-[40px] px-4 text-[14px]">Try again</button>
            </div>
          )}

          {data?.notHere && (
            <p className="px-4 pt-6 text-[15px] text-slate-600">We don’t serve this location yet, so there’s nothing to book here. Change your address on the home screen.</p>
          )}

          {data && !data.notHere && (
            <>
              {data.corrected && <p className="px-4 pt-3 text-[13px] text-slate-500">Showing results for “{data.corrected}”</p>}
              <Group title={GROUP_LABEL.services} items={data.services} onOpen={openResult} words={words} />
              <ProblemGroups problems={data.problems} onOpen={openResult} words={words} />
              <Group title={GROUP_LABEL.categories} items={data.categories} onOpen={openResult} words={words} />
              {data.empty && (
                <>
                  <p className="px-4 pt-5 text-[15px] text-slate-700">No match for “{term}”.</p>
                  <Group title="You can book these here" items={data.suggestions} onOpen={openResult} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
