import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useLazyAdminFleetPlacesQuery } from '@shared/services/api';

// Search a place or address; picking one hands its location back (server workforce/places, Mapbox).
export default function PlaceSearch({ near, onPlace }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [find, { data, isFetching }] = useLazyAdminFleetPlacesQuery();
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) return undefined;
    timer.current = setTimeout(() => find({ q: q.trim(), ...(near || {}) }, true), 300);
    return () => clearTimeout(timer.current);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(p) {
    setOpen(false);
    setQ(p.name);
    onPlace(p);
  }

  const places = q.trim().length >= 2 ? data?.places || [] : [];
  return (
    <div className="relative w-full sm:w-72">
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-blue-500">
        {isFetching ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <Search size={14} className="text-slate-400" />}
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (places[0]) pick(places[0]); } }}
          placeholder="Search a place or address" aria-label="Search a place" className="w-full bg-transparent py-2 text-sm outline-none" />
      </label>
      {open && places.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox">
          {places.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
                <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
