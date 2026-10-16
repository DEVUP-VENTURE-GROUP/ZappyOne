import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { baseLayer } from '../../ui/map/tiles';

const toLatLng = ([lng, lat]) => [lat, lng];

// Demand cells coloured by who serves them, your hubs' areas, and the recommended sites with their promise radius.
export default function NextLaunchMap({ cells, hubs, sites, focus }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);

  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const m = L.map(box.current, { center: [17.42, 78.45], zoom: 11, zoomSnap: 0.25, attributionControl: false });
    baseLayer('light').addTo(m);
    layers.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layers.current;
    if (!g) return;
    g.clearLayers();
    const top = Math.max(1, ...cells.map((c) => c.w));
    for (const h of hubs) {
      const ring = h.area?.coordinates?.[0];
      (ring?.length >= 4 ? L.polygon(ring.map(toLatLng), { color: '#16A34A', weight: 1.5, fillOpacity: 0.06 }) : L.circle([h.lat, h.lng], { radius: h.serviceKm * 1000, color: '#16A34A', weight: 1.5, fillOpacity: 0.06 }))
        .bindTooltip(`Hub: ${h.name}`, { sticky: true }).addTo(g);
    }
    for (const c of cells) {
      const color = c.hub ? '#16A34A' : c.partner ? '#D97706' : '#DC2626';
      L.circleMarker([c.lat, c.lng], { radius: 3 + 9 * Math.sqrt(c.w / top), color, weight: 0, fillColor: color, fillOpacity: 0.55 })
        .bindTooltip(`${c.w} demand signals, ${c.hub ? 'inside a hub' : c.partner ? 'partners only' : 'nobody serves it'}`).addTo(g);
    }
    const bounds = [];
    sites.forEach((s) => {
      const ring = L.circle([s.lat, s.lng], { radius: s.radiusKm * 1000, color: '#1F4FD8', weight: 2, dashArray: '6 6', fillOpacity: 0.05 }).addTo(g);
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div style="width:26px;height:26px;border-radius:13px;background:#1F4FD8;color:#fff;font:700 13px/26px system-ui;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35)">${s.rank}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindTooltip(`#${s.rank} ${s.area}: about ${s.jobsPerMonth} jobs a month`).addTo(g);
      bounds.push(ring.getBounds());
    });
    const all = [...bounds, ...cells.map((c) => L.latLngBounds([[c.lat, c.lng], [c.lat, c.lng]]))];
    if (all.length && map.current) map.current.fitBounds(all.reduce((b, x) => b.extend(x), L.latLngBounds(all[0].getSouthWest(), all[0].getNorthEast())), { padding: [24, 24], maxZoom: 13 });
  }, [cells, hubs, sites]);

  useEffect(() => { if (focus && map.current) map.current.setView([focus.lat, focus.lng], 13.5); }, [focus]);

  return <div ref={box} className="h-[420px] w-full overflow-hidden rounded-xl border border-slate-200" aria-label="Map of demand and recommended sites" />;
}
