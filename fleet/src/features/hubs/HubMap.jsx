import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Pentagon, Undo2, Trash2, Circle, Hash } from 'lucide-react';
import { baseLayer } from '@admin/ui/map/tiles';
import PlaceSearch from './PlaceSearch';
import AreaPicker from './AreaPicker';
import CoverageBar from './CoverageBar';
import { areaKm2, distanceKm, eastOf, fmtKm, fmtKm2 } from './geo';

const HYDERABAD = [17.4239, 78.4738];
const BRAND = '#1F4FD8';
const toLatLng = ([lng, lat]) => [lat, lng];

// A hub on the map: its meeting point and check-in ring, and the area it serves (drawn, pincodes, or its radius); other hubs shown faintly.
export default function HubMap({ lat, lng, radiusM, serviceKm, area, places = [], placeName = '', search = false, travel = null, others = [], onPick, onArea, onPlaces, onServiceKm }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const modeRef = useRef('point');
  const [mode, setMode] = useState('point');
  const areaRef = useRef(area);
  areaRef.current = area;
  const radius = useRef({ circle: null, handle: null });
  const [liveKm, setLiveKm] = useState(null);
  const byRadius = lat != null && (area || []).length < 3 && !places.length;

  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const m = L.map(box.current, { center: lat != null ? [lat, lng] : HYDERABAD, zoom: lat != null ? 12 : 11, zoomSnap: 0.25, attributionControl: false });
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
    for (const p of places) {
      const ring = p.area?.coordinates?.[0];
      if (ring) L.polygon(ring.map(toLatLng), { color: '#0891B2', weight: 1.5, fillOpacity: 0.12 }).bindTooltip(p.kind === 'pincode' ? `${p.key} ${p.name || ''}` : p.name, { sticky: true }).addTo(g);
    }
    const pts = area || [];
    if (pts.length >= 3) L.polygon(pts.map(toLatLng), { color: BRAND, weight: 2, fillOpacity: 0.1 }).addTo(g);
    else if (pts.length) L.polyline(pts.map(toLatLng), { color: BRAND, weight: 2, dashArray: '6 4' }).addTo(g);
    if (mode === 'area') pts.forEach((p) => L.circleMarker(toLatLng(p), { radius: 4, color: BRAND, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g));
    if (lat != null) {
      L.circle([lat, lng], { radius: radiusM || 200, color: BRAND, weight: 1, fillOpacity: 0.15 }).addTo(g);
      L.circleMarker([lat, lng], { radius: 8, color: BRAND, weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(g);
    }
  }, [lat, lng, radiusM, serviceKm, area, places, others, mode]);

  // The service radius as a circle with a handle on its edge: drag it and the km shows live; let go and it is set (half-km steps).
  useEffect(() => {
    const m = map.current;
    const r = radius.current;
    if (!m) return;
    if (!byRadius) {
      r.circle?.remove(); r.handle?.remove(); r.circle = null; r.handle = null;
      return;
    }
    const km = Number(serviceKm) || 1;
    if (!r.circle) {
      r.circle = L.circle([lat, lng], { radius: km * 1000, color: BRAND, weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false }).addTo(m);
      const icon = L.divIcon({ className: '', html: '<div style="width:18px;height:18px;border-radius:9px;background:#fff;border:3px solid #1F4FD8;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:ew-resize"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      r.handle = L.marker([lat, lng], { icon, draggable: true, keyboard: false }).addTo(m);
      r.handle.bindTooltip('', { permanent: true, direction: 'top', offset: [0, -12] });
      r.handle.on('drag', () => {
        const c = r.circle.getLatLng();
        const d = Math.min(50, Math.max(1, m.distance(c, r.handle.getLatLng()) / 1000));
        r.circle.setRadius(d * 1000);
        r.handle.setTooltipContent(`${fmtKm(d)} km`);
        setLiveKm(d);
      });
      r.handle.on('dragend', () => {
        const d = Math.min(50, Math.max(1, Math.round((m.distance(r.circle.getLatLng(), r.handle.getLatLng()) / 1000) * 2) / 2));
        setLiveKm(null);
        onServiceKm(d);
      });
    }
    r.circle.setLatLng([lat, lng]).setRadius(km * 1000);
    const at = eastOf({ lat, lng }, km);
    r.handle.setLatLng([at.lat, at.lng]).setTooltipContent(`${fmtKm(km)} km`);
  }, [byRadius, lat, lng, serviceKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show the whole area served when the radius changes or a drawn area is finished.
  useEffect(() => {
    const m = map.current;
    if (!m || lat == null || mode === 'area') return;
    const pts = [...(area || []), ...places.flatMap((p) => p.area?.coordinates?.[0] || [])];
    const bounds = pts.length >= 3 ? L.latLngBounds(pts.map(toLatLng)) : L.latLng(lat, lng).toBounds((serviceKm || 1) * 2000);
    m.fitBounds(bounds, { padding: [16, 16], maxZoom: 15 });
  }, [lat, lng, serviceKm, mode, places]); // eslint-disable-line react-hooks/exhaustive-deps

  // A searched place: go there; while placing the meeting point, it becomes the meeting point.
  function goTo(place) {
    map.current?.setView([place.lat, place.lng], 14);
    if (modeRef.current === 'point' || lat == null) onPick({ lat: Number(place.lat.toFixed(6)), lng: Number(place.lng.toFixed(6)), address: place.label });
  }

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
          {tab('area', Pentagon, 'Draw area')}
          {search && tab('places', Hash, 'Pincodes & areas')}
        </div>
        {mode === 'area' && (
          <>
            <button type="button" disabled={!pts.length} onClick={() => onArea(pts.slice(0, -1))} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Undo2 size={13} /> Undo</button>
            <button type="button" disabled={!pts.length} onClick={() => onArea([])} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Trash2 size={13} /> Clear</button>
            <button type="button" onClick={() => setMode('point')} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Done</button>
          </>
        )}
        {search && <div className="sm:ml-auto"><PlaceSearch near={lat != null ? { lat, lng } : null} onPlace={goTo} /></div>}
      </div>
      {mode === 'places' && <AreaPicker places={places} near={lat != null ? { lat, lng } : null} onChange={onPlaces} />}
      <div ref={box} className="h-80 w-full overflow-hidden rounded-xl border border-slate-200" aria-label="Map of the hub" />
      {mode !== 'area' && <CoverageBar center={lat != null ? { lat, lng } : null} place={placeName} serviceKm={serviceKm} liveKm={liveKm} area={area || []} places={places} travel={travel} onServiceKm={onServiceKm} />}
      <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
        {mode === 'area'
          ? `Click the map to add corners of the area this hub serves. ${pts.length} corner${pts.length === 1 ? '' : 's'}${pts.length && pts.length < 3 ? ', at least 3 needed' : pts.length >= 3 ? `, about ${fmtKm2(areaKm2(pts))} km²${lat != null ? `, farthest ${fmtKm(Math.max(...pts.map(([x, y]) => distanceKm({ lat, lng }, { lat: y, lng: x }))))} km from the meeting point` : ''}` : ''}.`
          : mode === 'places'
            ? 'Type pincodes or area names. Each is shown as the box the map service gives it, so edges are approximate; draw an area too for exact edges.'
          : pts.length >= 3 || places.length
            ? `Orders inside the ${[pts.length >= 3 && 'drawn area', places.length && `${places.length} pincode${places.length === 1 ? '' : 's'} or area${places.length === 1 ? '' : 's'}`].filter(Boolean).join(' or ')} go to this hub’s staff. Grey dashed shapes are your other hubs.`
            : <><Circle size={11} /> Orders within this distance of the meeting point go to this hub’s staff. For exact edges, draw an area or add pincodes.</>}
      </p>
    </div>
  );
}
