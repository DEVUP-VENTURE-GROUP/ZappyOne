import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Pentagon, Undo2, Trash2, Circle } from 'lucide-react';
import { baseLayer } from '@admin/ui/map/tiles';

const HYDERABAD = [17.4239, 78.4738];
const BRAND = '#1F4FD8';
const toLatLng = ([lng, lat]) => [lat, lng];

// A hub on the map: its meeting point and check-in ring, and the area it serves (drawn, or its radius); other hubs shown faintly.
export default function HubMap({ lat, lng, radiusM, serviceKm, area, others = [], onPick, onArea }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const modeRef = useRef('point');
  const [mode, setMode] = useState('point');
  const areaRef = useRef(area);
  areaRef.current = area;

  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const m = L.map(box.current, { center: lat != null ? [lat, lng] : HYDERABAD, zoom: lat != null ? 12 : 11, attributionControl: false });
    baseLayer('light').addTo(m);
    layers.current = L.layerGroup().addTo(m);
    m.on('click', (e) => {
      const p = { lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) };
      if (modeRef.current === 'area') onArea([...(areaRef.current || []), [p.lng, p.lat]]);
      else onPick(p);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { modeRef.current = mode; if (box.current) box.current.style.cursor = mode === 'area' ? 'crosshair' : ''; }, [mode]);

  useEffect(() => {
    const g = layers.current;
    if (!g) return;
    g.clearLayers();
    for (const h of others) {
      const ring = h.area?.coordinates?.[0];
      const c = h.meetingPoint?.location?.coordinates;
      const shape = ring?.length >= 4
        ? L.polygon(ring.map(toLatLng), { color: '#64748B', weight: 1, dashArray: '4 4', fillOpacity: 0.05 })
        : c && L.circle(toLatLng(c), { radius: (h.serviceKm || 0) * 1000, color: '#64748B', weight: 1, dashArray: '4 4', fillOpacity: 0.04 });
      shape?.bindTooltip(h.name, { sticky: true }).addTo(g);
    }
    const pts = area || [];
    if (pts.length >= 3) L.polygon(pts.map(toLatLng), { color: BRAND, weight: 2, fillOpacity: 0.1 }).addTo(g);
    else if (pts.length) L.polyline(pts.map(toLatLng), { color: BRAND, weight: 2, dashArray: '6 4' }).addTo(g);
    if (mode === 'area') pts.forEach((p) => L.circleMarker(toLatLng(p), { radius: 4, color: BRAND, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g));
    if (lat != null) {
      if (pts.length < 3) L.circle([lat, lng], { radius: (serviceKm || 0) * 1000, color: BRAND, weight: 1.5, dashArray: '6 6', fillOpacity: 0.05 }).addTo(g);
      L.circle([lat, lng], { radius: radiusM || 200, color: BRAND, weight: 1, fillOpacity: 0.15 }).addTo(g);
      L.circleMarker([lat, lng], { radius: 8, color: BRAND, weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(g);
    }
  }, [lat, lng, radiusM, serviceKm, area, others, mode]);

  // Show the whole area served when the radius changes or a drawn area is finished.
  useEffect(() => {
    const m = map.current;
    if (!m || lat == null || mode === 'area') return;
    const pts = area || [];
    const bounds = pts.length >= 3 ? L.latLngBounds(pts.map(toLatLng)) : L.latLng(lat, lng).toBounds((serviceKm || 1) * 2000);
    m.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [lat, lng, serviceKm, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pts = area || [];
  const tab = (id, Icon, label) => (
    <button type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${mode === id ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {tab('point', MapPin, 'Meeting point')}
          {tab('area', Pentagon, 'Draw service area')}
        </div>
        {mode === 'area' && (
          <>
            <button type="button" disabled={!pts.length} onClick={() => onArea(pts.slice(0, -1))} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Undo2 size={13} /> Undo</button>
            <button type="button" disabled={!pts.length} onClick={() => onArea([])} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Trash2 size={13} /> Clear</button>
            <button type="button" onClick={() => setMode('point')} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Done</button>
          </>
        )}
      </div>
      <div ref={box} className="h-80 w-full overflow-hidden rounded-xl border border-slate-200" aria-label="Map of the hub" />
      <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
        {mode === 'area'
          ? `Click the map to add corners of the area this hub serves. ${pts.length} corner${pts.length === 1 ? '' : 's'}${pts.length && pts.length < 3 ? ', at least 3 needed' : ''}.`
          : pts.length >= 3
            ? 'Orders inside the drawn area go to this hub’s staff. Grey dashed shapes are your other hubs.'
            : <><Circle size={11} /> No area drawn: orders within {serviceKm || 0} km of the meeting point go to this hub’s staff. Draw an area to set it exactly.</>}
      </p>
    </div>
  );
}
