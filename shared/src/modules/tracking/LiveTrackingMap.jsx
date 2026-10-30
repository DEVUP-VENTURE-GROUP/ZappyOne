import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { AlertCircle, LocateFixed, MapPin } from 'lucide-react';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const ROUTE_COOLDOWN = 8000;
const LERP_DURATION = 2400;
const DRAW_DURATION = 900;
// A pan or zoom by the viewer pauses following for this long; Re-centre resumes it at once.
const USER_HOLD_MS = 15000;
// Closer than this, the camera frames the door itself, not the two pins.
const NEAR_M = 150;

const BRAND = '#1F4FD8';
const INK = '#101828';

function ensureStyles() {
  if (document.getElementById('lt3-styles')) return;
  const s = document.createElement('style');
  s.id = 'lt3-styles';
  s.textContent = `
    @keyframes lt3-pulse { 0% { transform:scale(1); opacity:.35; } 100% { transform:scale(2.6); opacity:0; } }
    .lt3-pro-arrow { transition: transform 1s cubic-bezier(.25,.46,.45,.94); }
  `;
  document.head.appendChild(s);
}

const chip = (text, bg, fg) => `<div style="margin-top:4px;background:${bg};color:${fg};border-radius:6px;padding:2px 8px;font:600 11px/16px Figtree,system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(16,24,40,.18)">${text}</div>`;

// The door: a solid brand pin with a white centre and a plain label.
function makeDoorEl(label) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  wrap.innerHTML = `
    <svg width="34" height="44" viewBox="0 0 34 44" fill="none" style="filter:drop-shadow(0 2px 3px rgba(16,24,40,.25))">
      <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 27 17 27s17-14.3 17-27C34 7.6 26.4 0 17 0Z" fill="${INK}"/>
      <circle cx="17" cy="17" r="6.5" fill="#fff"/>
    </svg>
    ${label ? chip(label, '#fff', INK) : ''}`;
  return wrap;
}

// The pro: a white disc with a brand arrow that turns to their heading, and one soft pulse so it reads as live.
function makeProEl(label) {
  ensureStyles();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
  wrap.innerHTML = `
    <div style="position:relative;width:36px;height:36px">
      <div style="position:absolute;inset:0;border-radius:50%;background:${BRAND};animation:lt3-pulse 2.4s ease-out infinite"></div>
      <div style="position:absolute;inset:0;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(16,24,40,.3);display:flex;align-items:center;justify-content:center">
        <svg class="lt3-pro-arrow" width="20" height="20" viewBox="0 0 24 24"><path d="M12 2 20 21 12 16.5 4 21Z" fill="${BRAND}"/></svg>
      </div>
    </div>
    ${label ? chip(label, BRAND, '#fff') : ''}`;
  wrap._setBearing = (b) => {
    const el = wrap.querySelector('.lt3-pro-arrow');
    if (el) el.style.transform = `rotate(${b}deg)`;
  };
  return wrap;
}

function calcBearing(from, to) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function metresBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function animateMarkerTo(marker, from, to) {
  const moved = metresBetween(from, to) > 3;
  if (moved) marker.getElement()._setBearing?.(to.hdg ?? calcBearing(from, to));
  let startTs = null;
  function frame(now) {
    if (!startTs) startTs = now;
    const t = Math.min((now - startTs) / LERP_DURATION, 1);
    const ease = 1 - (1 - t) ** 3;
    marker.setLngLat([from.lng + (to.lng - from.lng) * ease, from.lat + (to.lat - from.lat) * ease]);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Follow camera: both pins in view, zooming in by itself as the pro gets closer; at the door, the door.
function follow(map, door, pro) {
  if (!door) return;
  if (!pro || metresBetween(door, pro) < NEAR_M) {
    map.easeTo({ center: [door.lng, door.lat], zoom: 17.2, duration: 900 });
    return;
  }
  const bounds = new mapboxgl.LngLatBounds().extend([door.lng, door.lat]).extend([pro.lng, pro.lat]);
  map.fitBounds(bounds, {
    padding: { top: 70, bottom: 90, left: 50, right: 50 },
    maxZoom: 17.5,
    duration: 1200,
    easing: (t) => 1 - (1 - t) ** 3,
  });
}

function drawRoute(map, st, coords) {
  if (st.routeAnimFrame) cancelAnimationFrame(st.routeAnimFrame);
  if (coords.length < 2) return;
  let startTs = null;
  function frame(now) {
    if (!startTs) startTs = now;
    const t = Math.min((now - startTs) / DRAW_DURATION, 1);
    const count = Math.max(2, Math.round((1 - (1 - t) ** 2) * coords.length));
    map.getSource('route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, count) } });
    st.routeAnimFrame = t < 1 ? requestAnimationFrame(frame) : null;
  }
  st.routeAnimFrame = requestAnimationFrame(frame);
}

// Road route, Mapbox Directions; a failure leaves the pins without a line, never a broken map.
async function fetchRoute(map, st, from, to) {
  const now = Date.now();
  if (st.lastRoute && now - st.lastRoute < ROUTE_COOLDOWN) return;
  st.lastRoute = now;
  if (!TOKEN) return;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?access_token=${TOKEN}&geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) return;
    const coords = (await res.json()).routes?.[0]?.geometry?.coordinates;
    if (coords && st.map === map) drawRoute(map, st, coords);
  } catch { /* the pins still show */ }
}

// Live map of a pro heading to a door: follows them, zooms in as they near, and gives the camera back to the viewer when they move it.
export default function LiveTrackingMap({ pickup, workerLocation, status, height = '60vh', pickupLabel = 'Your location', workerLabel = 'Your pro' }) {
  const containerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [held, setHeld] = useState(false);

  const sr = useRef({
    map: null, ready: false, doorMarker: null, proMarker: null, prevPro: null, lastRoute: 0,
    pendingDoor: null, pendingPro: null, routeAnimFrame: null, drFrame: null, drAnchor: null, heldUntil: 0, holdTimer: null,
  });

  const following = () => Date.now() >= sr.current.heldUntil;
  const recentre = () => {
    const st = sr.current;
    st.heldUntil = 0;
    setHeld(false);
    if (st.map && st.ready) follow(st.map, st.pendingDoor, st.pendingPro);
  };

  useEffect(() => {
    if (!containerRef.current || !TOKEN) return undefined;
    const st = sr.current;
    mapboxgl.accessToken = TOKEN;
    const start = st.pendingPro || st.pendingDoor || { lng: 78.486671, lat: 17.385044 };
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [start.lng, start.lat],
      zoom: 15,
      attributionControl: false,
      logoPosition: 'bottom-left',
    });
    st.map = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    // A pan, pinch or scroll by the viewer (not our own camera moves) pauses following.
    const hold = (e) => {
      if (!e.originalEvent) return;
      st.heldUntil = Date.now() + USER_HOLD_MS;
      setHeld(true);
      clearTimeout(st.holdTimer);
      st.holdTimer = setTimeout(() => { setHeld(false); if (st.map && st.ready) follow(st.map, st.pendingDoor, st.pendingPro); }, USER_HOLD_MS);
    };
    map.on('dragstart', hold);
    map.on('zoomstart', hold);

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-width': 9, 'line-color': '#ffffff' } });
      map.addLayer({ id: 'route-core', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-width': 5, 'line-color': BRAND } });

      st.ready = true;
      setMapReady(true);
      const d = st.pendingDoor;
      const p = st.pendingPro;
      if (d) st.doorMarker = new mapboxgl.Marker({ element: makeDoorEl(pickupLabel), anchor: 'bottom' }).setLngLat([d.lng, d.lat]).addTo(map);
      if (p) {
        st.proMarker = new mapboxgl.Marker({ element: makeProEl(workerLabel), anchor: 'top', offset: [0, -18] }).setLngLat([p.lng, p.lat]).addTo(map);
        st.prevPro = p;
      }
      follow(map, d, p);
      if (d && p) fetchRoute(map, st, p, d);
    });

    map.on('error', (e) => { if (e.error?.status === 401) setMapError(true); });

    return () => {
      if (st.routeAnimFrame) cancelAnimationFrame(st.routeAnimFrame);
      if (st.drFrame) cancelAnimationFrame(st.drFrame);
      clearTimeout(st.holdTimer);
      Object.assign(st, { ready: false, map: null, doorMarker: null, proMarker: null, prevPro: null, drAnchor: null });
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = sr.current;
    st.pendingDoor = pickup || null;
    if (!st.map || !st.ready || !pickup) return;
    if (st.doorMarker) st.doorMarker.setLngLat([pickup.lng, pickup.lat]);
    else st.doorMarker = new mapboxgl.Marker({ element: makeDoorEl(pickupLabel), anchor: 'bottom' }).setLngLat([pickup.lng, pickup.lat]).addTo(st.map);
    if (following()) follow(st.map, pickup, st.pendingPro);
  }, [pickup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = sr.current;
    st.pendingPro = workerLocation || null;
    if (!st.map || !st.ready || !workerLocation) return;
    if (st.proMarker) animateMarkerTo(st.proMarker, st.prevPro || workerLocation, workerLocation);
    else st.proMarker = new mapboxgl.Marker({ element: makeProEl(workerLabel), anchor: 'top', offset: [0, -18] }).setLngLat([workerLocation.lng, workerLocation.lat]).addTo(st.map);
    st.prevPro = workerLocation;

    const d = st.pendingDoor;
    if (d) {
      if (following()) follow(st.map, d, workerLocation);
      fetchRoute(st.map, st, workerLocation, d);
    }

    // Between pings the marker glides along their heading at their speed, for at most 10 s or 300 m.
    if (st.drFrame) cancelAnimationFrame(st.drFrame);
    const { hdg, spd } = workerLocation;
    if (!hdg || !spd || spd < 0.5) return;
    st.drAnchor = { lat: workerLocation.lat, lng: workerLocation.lng, hdgRad: (hdg * Math.PI) / 180, spd, anchoredAt: performance.now() + LERP_DURATION };
    const R = 6371000;
    function drStep(now) {
      if (!st.proMarker || !st.drAnchor) return;
      const elapsed = (now - st.drAnchor.anchoredAt) / 1000;
      if (elapsed < 0) { st.drFrame = requestAnimationFrame(drStep); return; }
      const dist = st.drAnchor.spd * elapsed;
      if (elapsed > 10 || dist > 300) return;
      const { lat: aLat, lng: aLng, hdgRad } = st.drAnchor;
      const dLat = ((dist * Math.cos(hdgRad)) / R) * (180 / Math.PI);
      const dLng = ((dist * Math.sin(hdgRad)) / (R * Math.cos((aLat * Math.PI) / 180))) * (180 / Math.PI);
      st.proMarker.setLngLat([aLng + dLng, aLat + dLat]);
      st.drFrame = requestAnimationFrame(drStep);
    }
    st.drFrame = requestAnimationFrame(drStep);
  }, [workerLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!TOKEN || mapError) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center gap-2 rounded-card border border-line bg-sunken">
        <AlertCircle size={20} className="text-ink-400" />
        <span className="text-[13px] font-medium text-ink-500">{!TOKEN ? 'Map is not set up yet' : 'Map temporarily unavailable'}</span>
      </div>
    );
  }

  const arrived = status === 'arrived';
  return (
    <div style={{ height }} className="relative overflow-hidden rounded-card border border-line bg-sunken">
      {!mapReady && <div className="absolute inset-0 z-10 animate-pulse bg-sunken" />}
      <div ref={containerRef} className="h-full w-full" style={{ opacity: mapReady ? 1 : 0, transition: 'opacity .4s ease' }} />

      {mapReady && held && workerLocation && (
        <button type="button" onClick={recentre}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-btn border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink-900 shadow-float">
          <LocateFixed size={15} className="text-brand-600" /> Re-centre
        </button>
      )}
      {mapReady && arrived && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-btn bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white">
          <MapPin size={14} /> Your pro is at the door
        </div>
      )}
    </div>
  );
}
