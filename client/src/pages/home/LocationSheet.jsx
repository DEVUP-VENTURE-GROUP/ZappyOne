import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';

/** Countries the address search looks in. India first; add a code when a market opens. */
const SEARCH_COUNTRIES = 'IN';

/**
 * Set the service location: current GPS, or search an address.
 * A bottom sheet on phones, a centred dialog from `sm` up.
 */
export default function LocationSheet({ open, onClose, onUseCurrent, detecting, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (q.length < 3 || !token) { setResults([]); return undefined; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
        + `?access_token=${token}&language=en&country=${SEARCH_COUNTRIES}&types=address,neighborhood,locality,place&limit=6`,
        { signal: ctrl.signal },
      )
        .then((r) => r.json())
        .then((d) => setResults(d.features || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250); // wait for a pause in typing, not every keystroke
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  function pick(feat) {
    const [lng, lat] = feat.center;
    const ctx = feat.context || [];
    const get = (prefix) => ctx.find((c) => c.id?.startsWith(prefix))?.text ?? null;
    const primary = get('neighborhood') || get('locality') || feat.text;
    const secondary = [get('place') || get('locality'), get('region')].filter(Boolean).join(', ') || null;
    onPick({ lat, lng, primary, secondary });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[110] bg-ink-900/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Positioning lives on this wrapper: framer-motion owns the panel's transform. */}
          <div className="pointer-events-none fixed inset-0 z-[111] flex items-end justify-center sm:items-start sm:pt-24">
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="loc-title"
            className="pointer-events-auto max-h-[85vh] w-full overflow-y-auto rounded-t-sheet bg-white sm:w-[480px] sm:rounded-card"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex justify-center pt-3 sm:hidden"><span className="h-1 w-10 rounded-full bg-slate-200" /></div>
            <div className="px-5 pb-8 pt-3 sm:pt-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="loc-title" className="text-[18px] font-bold text-navy">Where do you need the service?</h2>
                <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="search"
                  placeholder="Search area, street or landmark"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-10 text-[15px] text-navy placeholder:text-slate-400 focus:border-zappy-400 focus:outline-none focus:ring-2 focus:ring-zappy-100"
                />
                {searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-zappy-500" />}
              </div>

              <button type="button" onClick={onUseCurrent} disabled={detecting}
                className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-zappy-50 disabled:opacity-60">
                {detecting ? <Loader2 size={18} className="animate-spin text-zappy-600" /> : <LocateFixed size={18} className="text-zappy-600" />}
                <span>
                  <span className="block text-[14px] font-semibold text-zappy-700">Use my current location</span>
                  <span className="block text-[12px] text-slate-500">Most accurate for sending a pro to you</span>
                </span>
              </button>

              {results.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-100">
                  {results.map((feat) => (
                    <li key={feat.id}>
                      <button type="button" onClick={() => pick(feat)} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-50">
                        <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium text-navy">{feat.text}</span>
                          <span className="block truncate text-[12px] text-slate-500">{feat.place_name}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
