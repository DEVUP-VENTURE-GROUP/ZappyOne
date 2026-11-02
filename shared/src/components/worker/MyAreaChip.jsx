import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Loader2, MapPin, X } from 'lucide-react';
import { reverseGeocode } from '../../utils/reverseGeocode';

const LiveTrackingMap = lazy(() => import('../../modules/tracking/LiveTrackingMap'));

const named = new Map(); // "lat,lng" → area name, so every screen does not ask again

/**
 * Where the provider is, as an area name ("Kondapur, Hyderabad") — on every
 * screen size, in every provider panel. While online it is where jobs ring
 * from; for a shop it is the pinned address customers see.
 *
 * coordinates: [lng, lat]. label: shown as-is instead of looking it up.
 */
export default function MyAreaChip({ coordinates, label = null, live = false, className = '' }) {
  const [lng, lat] = coordinates?.length === 2 ? coordinates : [];
  const has = typeof lat === 'number' && typeof lng === 'number' && (lat || lng);
  const key = has ? `${lat.toFixed(3)},${lng.toFixed(3)}` : null;
  const [area, setArea] = useState(() => (key ? named.get(key) || null : null));
  const [open, setOpen] = useState(false);
  const still = useReducedMotion();
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  useEffect(() => {
    if (label || !key) return undefined;
    if (named.has(key)) { setArea(named.get(key)); return undefined; }
    let gone = false;
    reverseGeocode(lat, lng)
      .then(({ primary, secondary }) => {
        const name = secondary ? `${primary}, ${secondary.split(',')[0]}` : primary;
        named.set(key, name);
        if (!gone) setArea(name);
      })
      .catch(() => {});
    return () => { gone = true; };
  }, [key, label]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = label || area;
  if (!text) return null;
  const chipCls = `inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
    live ? 'border-zappy-200 bg-zappy-50 text-zappy-800' : 'border-slate-200 bg-white text-slate-600'
  } ${className}`;
  const inner = (
    <>
      <MapPin size={12} className={`shrink-0 ${live ? 'text-zappy-600' : 'text-slate-400'}`} />
      <span className="truncate">{text}</span>
    </>
  );
  if (!has) return <span title={text} className={chipCls}>{inner}</span>;
  return (
    <>
      <button type="button" title={`${text}, see on the map`} onClick={() => setOpen(true)} className={`group ${chipCls} pr-1.5 transition hover:shadow-sm active:scale-[0.98]`}>
        <motion.span className="flex shrink-0" animate={still ? undefined : { y: [0, -2.5, 0] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}>
          <MapPin size={12} className={live ? 'text-zappy-600' : 'text-slate-400'} />
        </motion.span>
        <span className="truncate">{text}</span>
        <span className={`ml-0.5 flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-bold ${live ? 'bg-zappy-100 text-zappy-800' : 'bg-slate-100 text-slate-600'}`}>
          Map <ChevronRight size={11} strokeWidth={3} className="transition group-hover:translate-x-0.5" />
        </span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
              <motion.div role="dialog" aria-label={`Your location, ${text}`} onClick={(e) => e.stopPropagation()}
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                className="w-full max-w-xl overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${live ? 'bg-zappy-50 text-zappy-600' : 'bg-slate-100 text-slate-500'}`}><MapPin size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-extrabold text-slate-900">{text}</p>
                    <p className="text-[11.5px] text-slate-500">{live ? 'Live now. Jobs near here come to you first.' : 'Your pinned location'}</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close map" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
                </div>
                <Suspense fallback={<div className="flex h-[55vh] items-center justify-center bg-slate-50"><Loader2 size={20} className="animate-spin text-slate-300" /></div>}>
                  <LiveTrackingMap workerLocation={{ lat, lng }} workerLabel="You" vehicle="bike" height="55vh" />
                </Suspense>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
