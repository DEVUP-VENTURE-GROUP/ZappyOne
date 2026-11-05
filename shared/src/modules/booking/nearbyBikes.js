// Pros near a point on a Mapbox map, ride-app style: the ZappyOne motorbike (customer/mapArt), gliding to each new spot and turning toward it.
import mapboxgl from 'mapbox-gl';
import { bearingOf, scooterSvg } from '../../customer/mapArt';

export function makeBikeEl(size = 38) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${size}px;height:${size}px;pointer-events:none;`;
  wrap.innerHTML = `<div style="width:${size}px;height:${size}px;transition:transform 1.2s ease;filter:drop-shadow(0 2px 3px rgba(15,23,42,.35))">${scooterSvg(size)}</div>`;
  return wrap;
}

/** Puts this poll's pros on the map: new ones appear, known ones glide over 1.6 s, gone ones leave. Returns the markers to keep. */
export function syncBikes(map, markers, workers, size = 38) {
  const seen = new Set();
  const next = [...markers];
  workers.forEach((w, i) => {
    const key = w.key || `i${i}`;
    seen.add(key);
    const known = next.find((m) => m.key === key);
    if (!known) {
      const el = makeBikeEl(size);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([w.lng, w.lat]).addTo(map);
      el.firstElementChild.style.transform = `rotate(${(i * 67) % 360}deg)`;
      next.push({ key, marker, el, at: { lng: w.lng, lat: w.lat } });
      return;
    }
    const from = known.at; const to = { lng: w.lng, lat: w.lat };
    if (from.lng === to.lng && from.lat === to.lat) return;
    known.el.firstElementChild.style.transform = `rotate(${bearingOf(from, to)}deg)`;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 1600);
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      known.marker.setLngLat([from.lng + (to.lng - from.lng) * e, from.lat + (to.lat - from.lat) * e]);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    known.at = to;
  });
  return next.filter((m) => {
    if (seen.has(m.key)) return true;
    m.marker.remove();
    return false;
  });
}
