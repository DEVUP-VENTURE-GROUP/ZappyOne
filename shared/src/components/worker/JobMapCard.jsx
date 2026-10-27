import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigation, MapPin, Loader2 } from 'lucide-react';
import { useGeolocation } from '../../hooks/useGeolocation';

// The map library is large: loaded only when a job screen shows a map.
const LiveTrackingMap = lazy(() => import('../../modules/tracking/LiveTrackingMap'));

/** A stored GeoJSON point ({ coordinates: [lng, lat], address }) as { lat, lng, address }. */
export { pointOf } from '../../provider/jobFlows';

const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/**
 * Where the provider is going, on a live map: the customer's pin, the
 * provider's own position, how far, and one tap into turn-by-turn navigation.
 * Every worker job screen (repair, pet, helping) uses this one card.
 */
export default function JobMapCard({ to, label = 'Customer location', live = true }) {
  const { watch } = useGeolocation();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!live) return undefined;
    return watch((pos) => setMe({ lat: pos.lat, lng: pos.lng }), () => {});
  }, [live, watch]);

  if (!to) return null;
  const distance = me ? km(me, to) : null;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="relative h-[220px] sm:h-[280px] lg:h-[320px]">
        <Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-50"><Loader2 size={20} className="animate-spin text-slate-400" /></div>}>
          <LiveTrackingMap pickup={to} workerLocation={me} status="on_the_way" height="100%" pickupLabel={label} workerLabel="You" />
        </Suspense>
      </div>
      <div className="flex items-center gap-3 p-3">
        <MapPin size={18} className="shrink-0 text-zappy-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}{distance != null && `, ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} away`}</p>
          <p className="truncate text-sm font-semibold text-[#0F172A]">{to.address || `${to.lat.toFixed(5)}, ${to.lng.toFixed(5)}`}</p>
        </div>
        <a href={directions} target="_blank" rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-zappy-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-zappy-700">
          <Navigation size={14} /> Navigate
        </a>
      </div>
    </div>
  );
}
