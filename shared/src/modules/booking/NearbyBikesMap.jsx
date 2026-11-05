import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLazyGetNearbyWorkersQuery } from '../../services/api';
import { syncBikes } from './nearbyBikes';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Before booking, ride-app style: the customer's pin, how soon the chosen pro arrives, and live pros moving around it (worker/nearby, every 8 s).
export default function NearbyBikesMap({ lat, lng, vertical, etaMinutes = null, height = 190 }) {
  const box = useRef(null);
  const map = useRef(null);
  const bikes = useRef([]);
  const [fetchNearby] = useLazyGetNearbyWorkersQuery();

  useEffect(() => {
    if (!TOKEN || !box.current || typeof lat !== 'number') return undefined;
    mapboxgl.accessToken = TOKEN;
    const m = new mapboxgl.Map({ container: box.current, style: 'mapbox://styles/mapbox/streets-v12', center: [lng, lat], zoom: 14.2, interactive: false, attributionControl: false });
    map.current = m;
    const pin = document.createElement('div');
    pin.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid #1F4FD8;box-shadow:0 1px 4px rgba(16,24,40,.35)';
    new mapboxgl.Marker({ element: pin }).setLngLat([lng, lat]).addTo(m);
    let stopped = false;
    const load = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetchNearby({ lat, lng, ...(vertical && { vertical }) }).unwrap();
        if (!stopped) bikes.current = syncBikes(m, bikes.current, res?.workers || []);
      } catch { /* the map still shows the pin */ }
    };
    m.on('load', load);
    const t = setInterval(load, 8000);
    return () => { stopped = true; clearInterval(t); bikes.current = []; m.remove(); };
  }, [lat, lng, vertical]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!TOKEN || typeof lat !== 'number') return null;
  return (
    <div className="relative overflow-hidden rounded-card" style={{ height }} aria-label="Pros near you on the map" role="img">
      <div ref={box} className="absolute inset-0" />
      {etaMinutes != null && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg bg-ink-900 px-2.5 py-1 text-[13px] font-bold text-white shadow">
          {Math.max(1, Math.round(etaMinutes))} min
        </div>
      )}
    </div>
  );
}
