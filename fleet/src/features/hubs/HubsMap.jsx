import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { baseLayer } from '@admin/ui/map/tiles';

const COLORS = ['#1F4FD8', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777'];
const toLatLng = ([lng, lat]) => [lat, lng];

// Every hub and the area it serves on one map, to see coverage and where to expand; click one to edit it.
export default function HubsMap({ hubs, onOpen }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);

  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const m = L.map(box.current, { center: [17.4239, 78.4738], zoom: 10, attributionControl: false });
    baseLayer('light').addTo(m);
    layers.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layers.current;
    if (!g) return;
    g.clearLayers();
    const all = [];
    hubs.forEach((h, i) => {
      const color = h.isActive ? COLORS[i % COLORS.length] : '#94A3B8';
      const ring = h.area?.coordinates?.[0];
      const c = h.meetingPoint?.location?.coordinates;
      const shape = ring?.length >= 4
        ? L.polygon(ring.map(toLatLng), { color, weight: 2, fillOpacity: 0.12 })
        : c && L.circle(toLatLng(c), { radius: (h.serviceKm || 0) * 1000, color, weight: 2, dashArray: '6 6', fillOpacity: 0.08 });
      if (!shape) return;
      shape.bindTooltip(`${h.name}: ${h.staff} staff${h.isActive ? '' : ', closed'}`, { sticky: true }).on('click', () => onOpen(h)).addTo(g);
      if (c) L.circleMarker(toLatLng(c), { radius: 5, color, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g);
      all.push(shape.getBounds());
    });
    if (all.length && map.current) map.current.fitBounds(all.reduce((b, x) => b.extend(x), L.latLngBounds(all[0].getSouthWest(), all[0].getNorthEast())), { padding: [24, 24], maxZoom: 13 });
  }, [hubs, onOpen]);

  return (
    <div className="space-y-1">
      <div ref={box} className="h-72 w-full overflow-hidden rounded-xl border border-slate-200" aria-label="Map of every hub and the area it serves" />
      <p className="text-[12px] text-slate-500">Solid shapes are drawn areas, dashed circles are radius areas. Gaps between them are where no hub serves yet.</p>
    </div>
  );
}
