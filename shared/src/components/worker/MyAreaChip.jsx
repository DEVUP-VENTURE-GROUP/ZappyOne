import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { reverseGeocode } from '../../utils/reverseGeocode';

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
  return (
    <span
      title={text}
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
        live ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'
      } ${className}`}
    >
      <MapPin size={12} className={`shrink-0 ${live ? 'text-emerald-600' : 'text-slate-400'}`} />
      <span className="truncate">{text}</span>
    </span>
  );
}
