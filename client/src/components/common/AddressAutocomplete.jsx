import { useEffect, useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/**
 * AddressAutocomplete — lightweight address search with a suggestion dropdown.
 *
 * Debounced Mapbox forward-geocode (India), renders up to 5 suggestions, and
 * calls `onSelect(feature)` with the raw Mapbox feature so the parent can pull
 * whatever it needs (feature.center is [lng, lat]; feature.place_name / .text /
 * .context carry the labels). Controlled: parent owns `value`/`onChange` so it
 * can clear the box on select and coordinate with its own form state.
 *
 * This is the shared core of the inline address entry used on the Profile
 * address form. (The Home location sheet and the full-screen booking
 * LocationPicker have their own richer UIs and are intentionally not routed
 * through here.)
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search area, street, landmark…',
  autoFocus = false,
  inputClassName = 'input text-sm !pl-9',
}) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = (value || '').trim();
    if (q.length < 3 || !MAPBOX_TOKEN) { setResults([]); return; }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${MAPBOX_TOKEN}&language=en&country=IN&types=address,neighborhood,locality,place&limit=5`,
        { signal: ctrl.signal },
      )
        .then((r) => r.json())
        .then((d) => { setResults(d.features || []); setSearching(false); })
        .catch(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  function handleSelect(feat) {
    setResults([]);
    onSelect(feat);
  }

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        autoFocus={autoFocus}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {searching && (
        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />
      )}
      {results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-slate-100 shadow-lg overflow-hidden divide-y divide-slate-50">
          {results.map((feat) => (
            <button
              key={feat.id}
              type="button"
              onClick={() => handleSelect(feat)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition"
            >
              <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0F172A] truncate">{feat.text}</p>
                <p className="text-[11px] text-slate-400 truncate">{feat.place_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
