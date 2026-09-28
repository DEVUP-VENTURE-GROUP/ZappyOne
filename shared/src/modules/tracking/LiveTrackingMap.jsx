import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { AlertCircle, MapPin, Navigation } from 'lucide-react';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const ROUTE_COOLDOWN = 8000;
const LERP_DURATION = 2400;
const TRAIL_MAX = 14;
const DRAW_DURATION = 1200;

/* ─── Gen-Z neon service palette ───────────────────────────────── */
const SVC_COLORS = {
  electrical: '#FFE66D',
  plumbing: '#4ECDC4',
  ac_repair: '#45B7D1',
  carpenter: '#FF9F43',
  helper: '#48DBFB',
  puncture: '#FF6B6B',
  bike_wash: '#26de81',
  bike_chain_issue: '#fd9644',
  bike_brake_issue: '#fc5c65',
  bike_battery_issue: '#45aaf2',
  car_wash: '#2bcbba',
  car_puncture: '#FF6B6B',
  battery_jump_start: '#FFD32A',
  cleaning: '#C77DFF',
  painting: '#FF85A1',
  screen_replacement: '#5352ed',
  battery_replacement: '#eccc68',
  software_issue: '#70a1ff',
  water_damage: '#1e90ff',
};

const DEFAULT_COLOR = '#FF6B6B';

function svcColor(service) {
  return SVC_COLORS[service] || DEFAULT_COLOR;
}

/* ─── CSS keyframes (injected once) ────────────────────────────── */
function ensureStyles() {
  if (document.getElementById('lt2-styles')) return;
  const s = document.createElement('style');
  s.id = 'lt2-styles';
  s.textContent = `
    @keyframes lt2-pulse-a {
      0%   { transform:scale(1);   opacity:.65; }
      100% { transform:scale(2.9); opacity:0;   }
    }
    @keyframes lt2-pulse-b {
      0%   { transform:scale(1);   opacity:.35; }
      100% { transform:scale(4.0); opacity:0;   }
    }
    @keyframes lt2-glow {
      0%,100% { filter:drop-shadow(0 0 6px var(--wc,#FF6B6B)) drop-shadow(0 0 14px var(--wc,#FF6B6B)88); }
      50%      { filter:drop-shadow(0 0 10px var(--wc,#FF6B6B)) drop-shadow(0 0 26px var(--wc,#FF6B6B)cc); }
    }
    @keyframes lt2-skeleton {
      0%,100% { opacity:.4; }
      50%      { opacity:.75; }
    }
    @keyframes lt2-arrived-ring {
      0%   { transform:scale(1);   opacity:.8; }
      100% { transform:scale(2.2); opacity:0;  }
    }
    .lt2-skeleton { animation:lt2-skeleton 1.6s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

/* ─── Top-down bike SVG (Rapido style) ─────────────────────────── */
function getBikeSvg(color) {
  return `<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- front wheel -->
    <ellipse cx="15" cy="4.5" rx="2.8" ry="4" fill="#0f172a"/>
    <!-- rear wheel -->
    <ellipse cx="15" cy="25.5" rx="2.8" ry="4" fill="#0f172a"/>
    <!-- frame -->
    <rect x="12.2" y="7.5" width="5.6" height="15" rx="2.8" fill="#1e293b"/>
    <!-- rider helmet (top view) -->
    <circle cx="15" cy="13.5" r="5" fill="${color}"/>
    <circle cx="15" cy="13.5" r="2.4" fill="rgba(255,255,255,0.55)"/>
    <!-- handlebar line -->
    <path d="M8 9 C10.5 7.5 12.5 7 15 7 C17.5 7 19.5 7.5 22 9" stroke="#334155" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <!-- speed accent dots -->
    <circle cx="11" cy="20" r="1" fill="${color}" opacity="0.5"/>
    <circle cx="19" cy="20" r="1" fill="${color}" opacity="0.5"/>
  </svg>`;
}

/* ─── Destination pin (red — customer's location) ───────────────────── */
function makePickupEl(label = '📍 Go Here') {
  ensureStyles();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;';
  wrap.innerHTML = `
    <!-- pulsing halo behind pin -->
    <div style="position:relative;width:48px;height:60px;filter:drop-shadow(0 6px 20px rgba(239,68,68,.85))">
      <div style="
        position:absolute;left:50%;top:50%;transform:translate(-50%,-60%);
        width:56px;height:56px;border-radius:50%;
        background:rgba(239,68,68,0.25);
        animation:lt2-pulse-a 1.8s ease-out infinite;
      "></div>
      <svg width="48" height="60" viewBox="0 0 48 60" fill="none" style="position:relative;z-index:2">
        <defs>
          <radialGradient id="pgr2" cx="40%" cy="25%" r="70%">
            <stop offset="0%" stop-color="#FF6B6B"/>
            <stop offset="100%" stop-color="#DC2626"/>
          </radialGradient>
        </defs>
        <path d="M24 0C10.745 0 0 10.745 0 24C0 42 24 60 24 60C24 60 48 42 48 24C48 10.745 37.255 0 24 0Z" fill="url(#pgr2)"/>
        <circle cx="24" cy="24" r="11" fill="white" opacity="0.95"/>
        <circle cx="24" cy="24" r="5.5" fill="#EF4444"/>
      </svg>
    </div>
    <!-- label chip -->
    <div style="
      background:rgba(220,38,38,0.92);
      backdrop-filter:blur(8px);
      border-radius:20px;
      padding:3px 10px;
      font-size:10px;font-weight:900;
      color:#fff;
      white-space:nowrap;
      letter-spacing:0.03em;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      border:1px solid rgba(255,255,255,0.2);
    ">${label}</div>`;
  return wrap;
}

/* ─── Bike marker (worker) with direction rotation ──────────────── */
function makeWorkerEl(service, bearing = 0) {
  ensureStyles();
  const color = svcColor(service);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;';

  wrap.innerHTML = `
    <div style="position:relative;width:56px;height:56px;">
      <!-- outer bloom ring -->
      <div style="
        position:absolute;inset:-14px;border-radius:50%;
        background:${color}35;z-index:1;
        animation:lt2-pulse-a 2.2s ease-out infinite;
      "></div>
      <!-- wider softer ring -->
      <div style="
        position:absolute;inset:-22px;border-radius:50%;
        background:${color}18;z-index:0;
        animation:lt2-pulse-b 2.4s ease-out infinite .65s;
      "></div>
      <!-- bike icon -->
      <div class="lt2-bike-rot" style="
        --wc:${color};
        position:absolute;inset:0;z-index:3;
        display:flex;align-items:center;justify-content:center;
        transform:rotate(${bearing}deg);
        transition:transform 1.1s cubic-bezier(.25,.46,.45,.94);
        animation:lt2-glow 2.2s ease-in-out infinite;
      ">
        ${getBikeSvg(color)}
      </div>
    </div>
    <!-- "You" label chip -->
    <div style="
      background:rgba(15,23,42,0.88);
      backdrop-filter:blur(8px);
      border-radius:20px;
      padding:2px 9px;
      font-size:10px;font-weight:900;
      color:${color};
      white-space:nowrap;
      letter-spacing:0.04em;
      border:1px solid ${color}55;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    ">You</div>`;

  wrap._setBearing = (b) => {
    const el = wrap.querySelector('.lt2-bike-rot');
    if (el) el.style.transform = `rotate(${b}deg)`;
  };
  // expose for Marker anchor offset — outer wrap is now taller due to label
  wrap._bikeHeight = 56;

  return wrap;
}

/* ─── Arrived marker (pulsing ring at pickup, no white bg) ─────── */
function makeArrivedEl(service) {
  ensureStyles();
  const color = svcColor(service);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:60px;height:60px;';
  wrap.innerHTML = `
    <div style="
      position:absolute;inset:-10px;border-radius:50%;
      border:2.5px solid ${color};opacity:.65;
      animation:lt2-arrived-ring 1.6s ease-out infinite;
    "></div>
    <div style="
      position:absolute;inset:-18px;border-radius:50%;
      border:2px solid ${color};opacity:.35;
      animation:lt2-arrived-ring 1.6s ease-out infinite .5s;
    "></div>
    <div style="
      position:absolute;inset:0;z-index:3;
      display:flex;align-items:center;justify-content:center;
      filter:drop-shadow(0 0 10px ${color}cc) drop-shadow(0 0 22px ${color}66);
    ">
      ${getBikeSvg(color)}
    </div>`;
  return wrap;
}

/* ─── Bearing (heading) calculation ─────────────────────────────── */
function calcBearing(from, to) {
  const toRad = d => d * Math.PI / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/* ─── Smooth position LERP + bearing update ─────────────────────── */
function animateMarkerTo(marker, from, to) {
  const bearing = calcBearing(from, to);
  const el = marker.getElement();
  el._setBearing?.(bearing);

  let startTs = null;
  function frame(now) {
    if (!startTs) startTs = now;
    const t = Math.min((now - startTs) / LERP_DURATION, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    marker.setLngLat([
      from.lng + (to.lng - from.lng) * ease,
      from.lat + (to.lat - from.lat) * ease,
    ]);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ─── Auto-fit bounds ────────────────────────────────────────────── */
function fitBounds(map, pickup, worker) {
  if (!pickup) return;
  if (!worker) {
    map.easeTo({ center: [pickup.lng, pickup.lat], zoom: 17, duration: 800 });
    return;
  }
  const bounds = new mapboxgl.LngLatBounds()
    .extend([pickup.lng, pickup.lat])
    .extend([worker.lng, worker.lat]);
  map.fitBounds(bounds, {
    // extra bottom padding keeps pins above the action-bar panel
    padding: { top: 100, bottom: 160, left: 80, right: 80 },
    maxZoom: 18,
    duration: 900,
    easing: t => 1 - Math.pow(1 - t, 4),
  });
}

/* ─── Animated route draw ────────────────────────────────────────── */
function animateRouteDraw(map, st, allCoords) {
  if (st.routeAnimFrame) cancelAnimationFrame(st.routeAnimFrame);
  const total = allCoords.length;
  if (total < 2) return;
  let startTs = null;
  function frame(now) {
    if (!startTs) startTs = now;
    const t = Math.min((now - startTs) / DRAW_DURATION, 1);
    const ease = 1 - Math.pow(1 - t, 2.5);
    const count = Math.max(2, Math.round(ease * total));
    const slice = allCoords.slice(0, count);
    if (map.getSource('route')) {
      map.getSource('route').setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: slice },
      });
    }
    if (t < 1) {
      st.routeAnimFrame = requestAnimationFrame(frame);
    } else {
      st.routeAnimFrame = null;
    }
  }
  st.routeAnimFrame = requestAnimationFrame(frame);
}

/* ─── Route fetch — Google Directions primary, Mapbox fallback ──── */
async function fetchRoute(map, st, from, to) {
  const now = Date.now();
  if (st.lastRoute !== 0 && now - st.lastRoute < ROUTE_COOLDOWN) return;
  st.lastRoute = now;

  // ── Google Directions via JS API (loaded globally by @react-google-maps/api)
  if (window.google?.maps?.DirectionsService) {
    try {
      const svc = new window.google.maps.DirectionsService();
      svc.route(
        {
          origin: { lat: from.lat, lng: from.lng },
          destination: { lat: to.lat, lng: to.lng },
          travelMode: window.google.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
          },
        },
        (result, status) => {
          if (status !== 'OK' || !result.routes?.[0]) return;
          // Overview path gives [[LatLng], ...] — convert to [[lng, lat]] for Mapbox
          const path = result.routes[0].overview_path;
          const coords = path.map((p) => [p.lng(), p.lat()]);
          if (coords.length) animateRouteDraw(map, st, coords);
        },
      );
      return; // callback handles drawing
    } catch { /* fall through to Mapbox */ }
  }

  // ── Mapbox Directions fallback ────────────────────────────────────
  if (!TOKEN) return;
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?access_token=${TOKEN}&geometries=geojson&overview=full`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (coords) animateRouteDraw(map, st, coords);
  } catch { /* non-critical */ }
}

/* ─── Speed trail ────────────────────────────────────────────────── */
function updateTrail(map, st, pos) {
  st.trailPositions.push({ ...pos, t: Date.now() });
  if (st.trailPositions.length > TRAIL_MAX) st.trailPositions.shift();
  if (!map.getSource('trail')) return;
  const features = st.trailPositions.map((p, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { age: i / (st.trailPositions.length - 1 || 1) },
  }));
  map.getSource('trail').setData({ type: 'FeatureCollection', features });
}

/* ════════════════════════════════════════════════════════════════
   Component
════════════════════════════════════════════════════════════════ */
export default function LiveTrackingMap({ pickup, workerLocation, service, status, height = '60vh', pickupLabel = '📍 Go Here' }) {
  const containerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const sr = useRef({
    map: null,
    ready: false,
    pickupMarker: null,
    workerMarker: null,
    workerService: service || null,
    prevWorkerPos: null,
    lastRoute: 0,
    pendingPickup: null,
    pendingWorker: null,
    trailPositions: [],
    routeAnimFrame: null,
    drFrame: null,   // dead reckoning rAF handle
    drAnchor: null,   // { lat, lng, hdg, spd, anchoredAt }
  });

  /* ── Init map ── */
  useEffect(() => {
    if (!containerRef.current || !TOKEN) return;
    const st = sr.current;

    mapboxgl.accessToken = TOKEN;

    const initCenter = st.pendingWorker
      ? [st.pendingWorker.lng, st.pendingWorker.lat]
      : st.pendingPickup
        ? [st.pendingPickup.lng, st.pendingPickup.lat]
        : [78.486671, 17.385044];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: initCenter,
      zoom: 16,
      attributionControl: false,
      logoPosition: 'bottom-left',
    });
    st.map = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      /* ── Route source (lineMetrics = gradient along length) ── */
      map.addSource('route', {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      });

      /* wide outer neon glow */
      map.addLayer({
        id: 'route-glow', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': 20, 'line-blur': 14, 'line-opacity': 0.45,
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, '#FF6B6B', 0.4, '#C77DFF', 0.7, '#4ECDC4', 1, '#45B7D1',
          ],
        },
      });
      /* white casing for contrast */
      map.addLayer({
        id: 'route-casing', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': 10, 'line-color': '#ffffff', 'line-opacity': 0.15 },
      });
      /* neon core */
      map.addLayer({
        id: 'route-core', type: 'line', source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': 5, 'line-opacity': 1,
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, '#FF6B6B', 0.4, '#C77DFF', 0.7, '#4ECDC4', 1, '#45B7D1',
          ],
        },
      });

      /* ── Speed trail dots ── */
      map.addSource('trail', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trail-dots', type: 'circle', source: 'trail',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'age'], 0, 2, 1, 6],
          'circle-color': svcColor(service),
          'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0, 0.5, 0.2, 1, 0.6],
          'circle-blur': 0.5,
        },
      });

      st.ready = true;
      setMapReady(true);

      const p = st.pendingPickup;
      const w = st.pendingWorker;
      if (p) {
        st.pickupMarker = new mapboxgl.Marker({ element: makePickupEl(pickupLabel), anchor: 'bottom' })
          .setLngLat([p.lng, p.lat]).addTo(map);
      }
      if (w) {
        const el = makeWorkerEl(st.workerService);
        st.workerMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([w.lng, w.lat]).addTo(map);
        st.prevWorkerPos = w;
      }
      fitBounds(map, p, w);
      if (p && w) fetchRoute(map, st, w, p);
    });

    map.on('error', (e) => {
      console.warn('[LiveTrackingMap]', e.error?.message);
      if (e.error?.status === 401) setMapError(true);
    });

    return () => {
      if (st.routeAnimFrame) cancelAnimationFrame(st.routeAnimFrame);
      if (st.drFrame) cancelAnimationFrame(st.drFrame);
      st.ready = false;
      st.map = null;
      st.pickupMarker = null;
      st.workerMarker = null;
      st.prevWorkerPos = null;
      st.drAnchor = null;
      st.trailPositions = [];
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Pickup prop ── */
  useEffect(() => {
    const st = sr.current;
    st.pendingPickup = pickup || null;
    if (!st.map || !st.ready || !pickup) return;
    if (st.pickupMarker) {
      st.pickupMarker.setLngLat([pickup.lng, pickup.lat]);
    } else {
      st.pickupMarker = new mapboxgl.Marker({ element: makePickupEl(pickupLabel), anchor: 'bottom' })
        .setLngLat([pickup.lng, pickup.lat]).addTo(st.map);
    }
    fitBounds(st.map, pickup, st.pendingWorker);
  }, [pickup]);

  /* ── Worker location prop — anchor + dead reckoning loop ── */
  useEffect(() => {
    const st = sr.current;
    st.pendingWorker = workerLocation || null;
    if (!st.map || !st.ready || !workerLocation) return;

    // Snap/lerp marker to actual GPS fix
    if (st.workerMarker) {
      const from = st.prevWorkerPos || workerLocation;
      animateMarkerTo(st.workerMarker, from, workerLocation);
    } else {
      const el = makeWorkerEl(st.workerService);
      st.workerMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([workerLocation.lng, workerLocation.lat]).addTo(st.map);
    }
    st.prevWorkerPos = workerLocation;
    updateTrail(st.map, st, workerLocation);

    const p = st.pendingPickup;
    if (p) {
      fitBounds(st.map, p, workerLocation);
      fetchRoute(st.map, st, workerLocation, p);
    }

    // Dead reckoning: glide marker between pings using heading + speed.
    // Stops after 10s or if speed unknown — prevents runaway drift.
    if (st.drFrame) cancelAnimationFrame(st.drFrame);
    const hdg = workerLocation.hdg;
    const spd = workerLocation.spd;   // m/s
    if (!hdg || !spd || spd < 0.5) return; // stationary or no heading — skip DR

    st.drAnchor = {
      lat: workerLocation.lat,
      lng: workerLocation.lng,
      hdgRad: hdg * Math.PI / 180,
      spd,
      anchoredAt: performance.now(),
    };

    const DR_MAX_MS = 10000; // stop extrapolating after 10s
    const R = 6371000;

    function drStep(now) {
      if (!st.workerMarker || !st.drAnchor) return;
      const elapsed = (now - st.drAnchor.anchoredAt) / 1000; // seconds
      if (elapsed > DR_MAX_MS / 1000) return;

      const { lat: aLat, lng: aLng, hdgRad, spd: aSpd } = st.drAnchor;
      const dist = aSpd * elapsed; // metres travelled since anchor
      if (dist > 300) return; // sanity cap — never extrapolate more than 300m

      const dLat = (dist * Math.cos(hdgRad)) / R * (180 / Math.PI);
      const dLng = (dist * Math.sin(hdgRad)) / (R * Math.cos(aLat * Math.PI / 180)) * (180 / Math.PI);

      st.workerMarker.setLngLat([aLng + dLng, aLat + dLat]);
      st.drFrame = requestAnimationFrame(drStep);
    }
    st.drFrame = requestAnimationFrame(drStep);
  }, [workerLocation]);

  /* ── Service colour change → rebuild worker marker ── */
  useEffect(() => {
    const st = sr.current;
    st.workerService = service || null;
    if (!st.workerMarker || !st.map || !st.ready) return;
    const pos = st.pendingWorker;
    if (!pos) return;
    st.workerMarker.remove();
    const el = makeWorkerEl(service);
    st.workerMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([pos.lng, pos.lat]).addTo(st.map);
    if (st.map.getLayer('trail-dots')) {
      st.map.setPaintProperty('trail-dots', 'circle-color', svcColor(service));
    }
  }, [service]);

  /* ── Render ── */
  if (!TOKEN || mapError) {
    return (
      <div style={{ height }} className="rounded-2xl bg-slate-900 ring-1 ring-slate-700 flex flex-col items-center justify-center gap-2">
        <AlertCircle size={20} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-400">
          {!TOKEN ? 'Map token not configured' : 'Map temporarily unavailable'}
        </span>
      </div>
    );
  }

  const isArrived = status === 'arrived';
  const isOnTheWay = status === 'on_the_way';
  const isSearching = !status || status === 'searching' || status === 'created';
  const color = svcColor(service);

  return (
    <div style={{ height }} className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 bg-slate-900">
      {/* Skeleton shimmer while map tiles load */}
      {!mapReady && (
        <div className="lt2-skeleton absolute inset-0 z-10 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#0f172a,#1e1b4b)' }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-white/10"
              style={{ background: `${color}25` }}>
              <div className="w-6 h-6 rounded-full" style={{ background: color }} />
            </div>
            <div className="w-32 h-2 rounded-full bg-white/10" />
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ opacity: mapReady ? 1 : 0, transition: 'opacity 0.5s ease' }}
      />

      {/* ── Bottom gradient fade (Rapido-style depth) ── */}
      {mapReady && (
        <div className="absolute bottom-0 inset-x-0 h-20 pointer-events-none z-10"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />
      )}

      {/* ── Status pill overlay ── */}
      {mapReady && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none whitespace-nowrap">
          {isArrived && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-xs font-extrabold shadow-2xl"
              style={{
                background: 'linear-gradient(135deg,#059669,#10b981)',
                boxShadow: '0 4px 20px rgba(16,185,129,.55), 0 0 0 1px rgba(255,255,255,.15)',
              }}
            >
              <MapPin size={13} strokeWidth={2.5} />
              Worker is at your location
            </div>
          )}
          {isOnTheWay && workerLocation && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-xs font-bold shadow-2xl"
              style={{
                background: 'rgba(15,23,42,0.85)',
                backdropFilter: 'blur(12px)',
                boxShadow: `0 4px 20px rgba(0,0,0,.4), 0 0 0 1px ${color}40`,
              }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />
              Live tracking · on the way
            </div>
          )}
          {isSearching && (
            <div
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white/75 text-xs font-semibold"
              style={{ background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(8px)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
              Your service location
            </div>
          )}
        </div>
      )}

      {/* ── Top-right service color badge (brand accent) ── */}
      {mapReady && workerLocation && (
        <div
          className="absolute top-3 right-12 z-20 w-2.5 h-2.5 rounded-full pointer-events-none"
          style={{ background: color, boxShadow: `0 0 8px 3px ${color}80` }}
        />
      )}
    </div>
  );
}
