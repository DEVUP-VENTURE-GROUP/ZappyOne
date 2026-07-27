import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Home, Briefcase, Clock, Search,
  ChevronRight, ChevronDown, Loader2, X, Map, Crosshair,
  Star, Sparkles, CheckCircle, Pencil, Lock, ArrowRight,
  DoorOpen, Building2, ArrowDownToLine, Landmark,
} from 'lucide-react';
import {
  useGetAddressesQuery,
  useSaveRecentLocationMutation,
  useLazyGetNearbyWorkersQuery,
} from '../../services/api';
import { saveGeoLocation, loadGeoLocation } from '../../utils/geoCache';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useGoogleMaps, GOOGLE_MAPS_KEY } from '../../services/maps';
import { SERVICE_WORKER_EMOJI, SERVICE_COLORS } from '../../constants/services';
import { setLocation as setReduxLocation, selectLocation, selectHasLocation } from '../../store/locationSlice';

const TOKEN    = import.meta.env.VITE_MAPBOX_TOKEN;

const ACCURACY_GOOD_M = 50;
const ACCURACY_WARN_M = 150;

const TAG_META = {
  home:  { icon: Home,      bg: 'from-blue-500 to-blue-600',    ring: 'ring-blue-200'   },
  work:  { icon: Briefcase, bg: 'from-violet-500 to-purple-600', ring: 'ring-purple-200' },
  other: { icon: MapPin,    bg: 'from-slate-400 to-slate-500',   ring: 'ring-slate-200'  },
};

// Quick note chips for precise pin placement (§7/§8). Tapping prefixes the note.
const NOTE_CHIPS = [
  { label: 'Gate', prefix: 'Near Gate ' },
  { label: 'Flat / Door', prefix: 'Ring Flat ' },
  { label: 'Basement', prefix: 'Basement ' },
  { label: 'Landmark', prefix: 'Opposite ' },
];

// Haversine distance (km) between two lat/lng points.
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Real ETA/density from nearby workers: ~24 km/h city speed → 2.5 min/km + 3 min base.
function deriveNearbyInfo(pin, workers) {
  const count = workers.length;
  if (count === 0) return { count: 0, density: 'none' };
  const nearestKm = Math.min(...workers.map((w) => haversineKm(pin.lat, pin.lng, w.lat, w.lng)));
  const etaMin = Math.max(3, Math.round(3 + nearestKm * 2.5));
  const density = count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';
  return { count, nearestKm: Math.round(nearestKm * 10) / 10, etaMin, density };
}

const DENSITY_META = {
  high:   { dot: '#22c55e', label: 'High availability' },
  medium: { dot: '#eab308', label: 'Medium availability' },
  low:    { dot: '#f97316', label: 'Limited availability' },
  none:   { dot: '#f59e0b', label: 'No workers here yet' },
};

function ensureLocPickStyles() {
  if (document.getElementById('zlp-styles')) return;
  const s = document.createElement('style');
  s.id = 'zlp-styles';
  s.textContent = `
    @keyframes zlp-worker-pulse {
      0%   { transform:scale(1);   opacity:.65; }
      100% { transform:scale(2.6); opacity:0;   }
    }
    @keyframes zlp-loc-ring-a {
      0%   { transform:scale(1) translateX(-50%); opacity:.55; }
      100% { transform:scale(2.8) translateX(-17%); opacity:0;  }
    }
    @keyframes zlp-loc-ring-b {
      0%   { transform:scale(1) translateX(-50%); opacity:.3; }
      100% { transform:scale(3.5) translateX(-14%); opacity:0;  }
    }
    @keyframes zlp-loc-glow {
      0%,100% { box-shadow:0 0 0 3px rgba(37,99,235,.25); }
      50%      { box-shadow:0 0 0 6px rgba(37,99,235,.45); }
    }
    @keyframes zlp-gps-ring {
      0%   { transform:scale(1);   opacity:.6; }
      100% { transform:scale(3.5); opacity:0;  }
    }
    @keyframes zlp-pin-drop {
      0%   { transform:translateY(-22px) scale(0.85); opacity:0;  }
      55%  { transform:translateY(4px)  scale(1.06); opacity:1;  }
      75%  { transform:translateY(-6px) scale(0.97); opacity:1;  }
      90%  { transform:translateY(2px)  scale(1.02); opacity:1;  }
      100% { transform:translateY(0)   scale(1);    opacity:1;  }
    }
    @keyframes zlp-pin-pulse {
      0%,100% { filter:drop-shadow(0 6px 14px rgba(79,70,229,.65)) drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
      50%      { filter:drop-shadow(0 6px 22px rgba(79,70,229,.95)) drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
    }
    @keyframes zlp-wheel-spin {
      from { transform:rotate(0deg); }
      to   { transform:rotate(360deg); }
    }
    @keyframes zlp-bike-bounce {
      0%,100% { transform:translateY(0px)   rotate(-1.5deg); }
      30%      { transform:translateY(-5px)  rotate(1.5deg);  }
      60%      { transform:translateY(-2px)  rotate(2deg);    }
      80%      { transform:translateY(-6px)  rotate(-1deg);   }
    }
    @keyframes zlp-speed-line {
      0%   { transform:scaleX(1)   translateX(0);   opacity:.85; }
      60%  { transform:scaleX(0.4) translateX(6px); opacity:.3;  }
      100% { transform:scaleX(0)   translateX(10px);opacity:0;   }
    }
    @keyframes zlp-worker-shadow {
      0%,100% { transform:scaleX(1);   opacity:0.4; }
      50%      { transform:scaleX(0.6); opacity:0.2; }
    }
    @keyframes zlp-neon-pulse {
      0%,100% { opacity:.7; }
      50%      { opacity:1;  }
    }
  `;
  document.head.appendChild(s);
}

const VEHICLE_SERVICES = new Set([
  'puncture','bike_wash','car_wash','battery_jump_start','fuel_delivery','minor_roadside_repair',
]);

function makeWorkerDot(emoji = '👷', accentColor = '#22c55e', serviceSlug = '', animDelay = '0s') {
  ensureLocPickStyles();
  const isVehicle = VEHICLE_SERVICES.has(serviceSlug);
  const c = accentColor;
  const dur = isVehicle ? '1.1s' : '1.8s';

  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:relative;display:flex;flex-direction:column;align-items:center;
    cursor:default;user-select:none;transition:transform 0.35s ease;
  `;

  const bikeEl = document.createElement('div');
  bikeEl.style.cssText = `
    display:flex;flex-direction:column;align-items:center;
    animation:zlp-bike-bounce ${dur} ease-in-out infinite;
    animation-delay:${animDelay};transform-origin:center bottom;
  `;
  wrap._bikeEl = bikeEl;
  wrap.appendChild(bikeEl);

  if (isVehicle) {
    // ── SVG Bike with spinning wheels ─────────────────────────────
    const r = 10; // wheel radius
    const bikeW = 56, bikeH = 34;
    const wheelSpeedDur = isVehicle ? '0.55s' : '1.2s';
    const svgNs = 'http://www.w3.org/2000/svg';

    // Speed lines container (left of bike)
    const lines = document.createElement('div');
    lines.style.cssText = `
      position:absolute;left:-18px;top:50%;transform:translateY(-50%);
      display:flex;flex-direction:column;gap:3px;
    `;
    [1, 0.7, 0.45].forEach((op, i) => {
      const ln = document.createElement('div');
      ln.style.cssText = `
        width:${12 - i * 3}px;height:2px;border-radius:2px;
        background:${c};opacity:${op};
        animation:zlp-speed-line ${0.5 + i * 0.12}s ease-out infinite;
        animation-delay:${(i * 0.15 + parseFloat(animDelay))}s;
      `;
      lines.appendChild(ln);
    });
    bikeEl.appendChild(lines);

    // SVG bike
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', bikeW);
    svg.setAttribute('height', bikeH);
    svg.setAttribute('viewBox', `0 0 ${bikeW} ${bikeH}`);
    svg.style.cssText = `display:block;filter:drop-shadow(0 0 6px ${c}cc) drop-shadow(0 2px 8px rgba(0,0,0,0.8));`;

    const mk = (tag, attrs) => {
      const el = document.createElementNS(svgNs, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };

    // Wheel centres
    const lx = 11, rx = bikeW - 11, wy = bikeH - r - 1;

    // Defs for spinning wheel groups
    const defs = mk('defs', {});

    // Left wheel group (spinning)
    const gL = mk('g', { style: `transform-origin:${lx}px ${wy}px;animation:zlp-wheel-spin ${wheelSpeedDur} linear infinite;animation-delay:${animDelay};` });
    gL.appendChild(mk('circle', { cx: lx, cy: wy, r, stroke: c, 'stroke-width': '2.2', fill: 'none' }));
    // spokes
    [0,60,120].forEach(a => {
      const rad = a * Math.PI / 180;
      gL.appendChild(mk('line', {
        x1: lx, y1: wy,
        x2: lx + r * 0.85 * Math.cos(rad), y2: wy + r * 0.85 * Math.sin(rad),
        stroke: c, 'stroke-width': '1', opacity: '0.6',
      }));
    });
    gL.appendChild(mk('circle', { cx: lx, cy: wy, r: '2', fill: c }));

    // Right wheel group (spinning)
    const gR = mk('g', { style: `transform-origin:${rx}px ${wy}px;animation:zlp-wheel-spin ${wheelSpeedDur} linear infinite;animation-delay:${animDelay};` });
    gR.appendChild(mk('circle', { cx: rx, cy: wy, r, stroke: c, 'stroke-width': '2.2', fill: 'none' }));
    [0,60,120].forEach(a => {
      const rad = a * Math.PI / 180;
      gR.appendChild(mk('line', {
        x1: rx, y1: wy,
        x2: rx + r * 0.85 * Math.cos(rad), y2: wy + r * 0.85 * Math.sin(rad),
        stroke: c, 'stroke-width': '1', opacity: '0.6',
      }));
    });
    gR.appendChild(mk('circle', { cx: rx, cy: wy, r: '2', fill: c }));

    // Frame: seat-stay (seat→rear axle), chain-stay (BB→rear), down-tube, top-tube, fork
    const BB = { x: lx + 16, y: wy - 2 };  // bottom bracket
    const HT = { x: rx - 6,  y: 5 };        // head tube top
    const ST = { x: lx + 12, y: 6 };        // seat top

    const frameLines = [
      [BB.x, BB.y, lx, wy],          // chain-stay L
      [BB.x, BB.y, rx, wy],          // chain-stay R (drive side)
      [BB.x, BB.y, ST.x, ST.y],      // seat tube
      [ST.x, ST.y, HT.x, HT.y],     // top tube
      [BB.x, BB.y, HT.x + 2, HT.y + 8], // down tube
      [rx, wy, HT.x + 2, HT.y + 8], // fork
      [ST.x, ST.y, ST.x - 6, ST.y - 3], // saddle
    ];
    frameLines.forEach(([x1,y1,x2,y2]) => {
      svg.appendChild(mk('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': '2', 'stroke-linecap': 'round' }));
    });

    // Rider silhouette (simple: torso + helmet)
    svg.appendChild(mk('line', { x1: ST.x, y1: ST.y - 1, x2: HT.x - 2, y2: HT.y + 4, stroke: '#fff', 'stroke-width': '2.2', 'stroke-linecap': 'round', opacity: '0.85' }));
    svg.appendChild(mk('circle', { cx: HT.x - 3, cy: HT.y + 1, r: '4.5', fill: '#fff', opacity: '0.85' }));

    svg.appendChild(defs);
    svg.appendChild(gL);
    svg.appendChild(gR);
    bikeEl.appendChild(svg);

    // Neon glow ring under wheels
    const glow = document.createElement('div');
    glow.style.cssText = `
      width:${bikeW}px;height:6px;border-radius:50%;margin-top:-2px;
      background:radial-gradient(ellipse at center, ${c}88 0%, transparent 70%);
      animation:zlp-neon-pulse 1.1s ease-in-out infinite;
      animation-delay:${animDelay};
    `;
    bikeEl.appendChild(glow);

  } else {
    // Non-vehicle services: large emoji with glow
    const emojiSpan = document.createElement('span');
    emojiSpan.style.cssText = `
      font-size:28px;line-height:1;display:block;
      filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8)) drop-shadow(0 0 10px ${c}99);
    `;
    emojiSpan.textContent = emoji;
    bikeEl.appendChild(emojiSpan);
  }

  // Ground shadow
  const shadow = document.createElement('div');
  shadow.style.cssText = `
    width:28px;height:5px;border-radius:50%;
    background:rgba(0,0,0,0.5);filter:blur(3px);
    margin-top:1px;
    animation:zlp-worker-shadow ${dur} ease-in-out infinite;
    animation-delay:${animDelay};
  `;
  wrap.appendChild(shadow);
  return wrap;
}

function makeUserLocationEl() {
  ensureLocPickStyles();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:22px;height:22px;';
  wrap.innerHTML = `
    <!-- Outer pulse ring A -->
    <div style="
      position:absolute;inset:-10px;border-radius:50%;
      background:rgba(37,99,235,0.18);
      animation:zlp-loc-ring-a 2s ease-out infinite;
      z-index:0;
    "></div>
    <!-- Outer pulse ring B (delayed) -->
    <div style="
      position:absolute;inset:-10px;border-radius:50%;
      background:rgba(37,99,235,0.1);
      animation:zlp-loc-ring-b 2s ease-out infinite 0.65s;
      z-index:0;
    "></div>
    <!-- White border ring -->
    <div style="
      position:absolute;inset:0;border-radius:50%;
      background:#ffffff;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      z-index:1;
    "></div>
    <!-- Blue filled dot -->
    <div style="
      position:absolute;inset:3px;border-radius:50%;
      background:#2563EB;
      box-shadow:0 0 0 1px rgba(37,99,235,0.3);
      z-index:2;
      animation:zlp-loc-glow 2.8s ease-in-out infinite;
    "></div>`;
  return wrap;
}

function ensureWorkerDotStyles() { ensureLocPickStyles(); }

export default function LocationPicker({ onConfirm, onCancel, serviceLabel, service }) {
  const { getCurrent } = useGeolocation();
  const { isLoaded: gmapsLoaded } = useGoogleMaps();
  const dispatch    = useDispatch();
  const reduxLoc    = useSelector(selectLocation);
  const hasReduxLoc = useSelector(selectHasLocation);

  const [address,      setAddress]      = useState('');
  const [shortAddress, setShortAddress] = useState('');
  const [geocoding,    setGeocoding]    = useState(false);
  const [coords,       setCoords]       = useState(null);
  const [isDragging,  setDrag]        = useState(false);
  const [geoState,    setGeoState]    = useState('idle');
  const [geoError,    setGeoError]    = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [detectedLoc, setDetectedLoc] = useState(() => {
    // Prefer in-memory Redux location (survives route changes, no 30-min TTL).
    // Fall back to localStorage cache (survives page refresh for 30 min).
    if (reduxLoc.lat !== null) return { lat: reduxLoc.lat, lng: reduxLoc.lng, accuracy: reduxLoc.accuracy };
    return loadGeoLocation();
  });
  const [searchQ,     setSearchQ]     = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [nearbyCount, setNearbyCount] = useState(null);
  const [nearbyInfo,  setNearbyInfo]  = useState(null); // { count, nearestKm, etaMin, density }
  const [locNote,     setLocNote]     = useState('');   // precise-pin note (§8)
  const [activeChip,  setActiveChip]  = useState('');   // selected precise-pin chip label
  const [showSaved,   setShowSaved]   = useState(false); // saved-places drawer open
  const [mapReady,    setMapReady]    = useState(false);
  const [sheetH,      setSheetH]      = useState(300);   // measured bottom-sheet height
  const [sheetMinimized, setSheetMinimized] = useState(false); // interactive collapse/expand

  const sheetRef      = useRef(null);
  const sheetHRef     = useRef(300);                     // latest sheetH for map callbacks
  useEffect(() => { sheetHRef.current = sheetH; }, [sheetH]);
  // Force the GL canvas to re-measure once the layout has actually settled —
  // mapReady flipping and the sheet height being measured both happen after the
  // map is created, and are the moments the flex zone reaches its final size.
  useEffect(() => {
    if (mapReady) requestAnimationFrame(() => { try { mapRef.current?.resize(); } catch { /* map gone */ } });
  }, [mapReady, sheetH]);
  // Track the sheet's real height so the pin + reverse-geocode point stay
  // centred in the visible map band above it (sheet grows when chips/saved open).
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setSheetH(el.offsetHeight || 300);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mapRef        = useRef(null);
  const stateRef      = useRef({ pendingCenter: null, ready: false, userLocMarker: null });
  const workerMarkers = useRef([]);   // { marker, baseLng, baseLat }[]
  const revTimer      = useRef(null);
  const moveTimer     = useRef(null);
  const searchInputRef = useRef(null);
  const detectedLocRef = useRef(detectedLoc); // latest detected loc for async map callbacks
  useEffect(() => { detectedLocRef.current = detectedLoc; }, [detectedLoc]);

  const { data: addrData }  = useGetAddressesQuery();
  const [saveRecent]         = useSaveRecentLocationMutation();
  const [fetchNearby]        = useLazyGetNearbyWorkersQuery();

  const savedAddresses  = addrData?.addresses      || [];
  const recentLocations = addrData?.recentLocations || [];

  // On mount: resolve location using a 3-tier priority chain — no redundant GPS calls.
  // Tier 1: Redux store (in-memory, survives route navigation — fastest, zero latency).
  // Tier 2: localStorage cache via geoCache (survives page refresh, 30-min TTL).
  // Tier 3: Live GPS multi-sample (8-second window, fires only when no fresh location exists).
  useEffect(() => {
    if (hasReduxLoc) {
      // Already have location from this session — reuse immediately.
      setGeoState('done');
      return;
    }
    const cached = loadGeoLocation();
    if (cached) {
      setDetectedLoc(cached);
      setGpsAccuracy(cached.accuracy);
      setGeoState('done');
      // Hydrate Redux so subsequent navigations skip even the localStorage read.
      dispatch(setReduxLocation({ lat: cached.lat, lng: cached.lng, accuracy: cached.accuracy }));
      return;
    }
    // No location available — fire GPS detection (once per session).
    setGeoState('loading');
    getCurrent()
      .then((loc) => {
        setDetectedLoc(loc);
        setGpsAccuracy(loc.accuracy);
        setGeoState('done');
        dispatch(setReduxLocation({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }));
        _flyTo(loc); // recenter the always-mounted map on the fresh fix
      })
      .catch(() => {
        setGeoState(detectedLoc ? 'done' : 'error');
        setGeoError('Could not detect location. Enable GPS and try again.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!searchQ.trim() || searchQ.length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);

      // Mapbox geocoding — used as the fallback whenever Google Places is
      // unavailable OR returns a non-OK status (REQUEST_DENIED / quota / zero).
      // Previously a Google failure returned an empty list and NEVER fell back,
      // so typing an address found nothing (bug #12). Proximity-biased to the
      // user's area for more accurate, nearby results.
      const mapboxFallback = async () => {
        try {
          if (!TOKEN) { setResults([]); return; }
          const bias = coords || detectedLoc;
          const prox = bias ? `&proximity=${bias.lng},${bias.lat}` : '';
          const r = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQ)}.json` +
            `?access_token=${TOKEN}&country=IN&language=en&limit=8&autocomplete=true&fuzzyMatch=true` +
            `&types=poi,address,place,neighborhood,locality,region,district${prox}`,
          );
          const d = await r.json();
          setResults(d.features || []);
        } catch { setResults([]); }
        finally { setSearching(false); }
      };

      // ── Google Places Autocomplete (primary, if billing is enabled) ──────
      // Google gives the best Indian POI/landmark results, BUT if the GCP project
      // has no billing the SDK can return REQUEST_DENIED *or hang without ever
      // calling back*. A hard timeout guarantees we always fall back to Mapbox
      // (which is proven working) — so search NEVER shows "not found".
      if (gmapsLoaded && window.google?.maps?.places) {
        let settled = false;
        const finish = (fn) => { if (!settled) { settled = true; fn(); } };
        const guard = setTimeout(() => finish(mapboxFallback), 1200); // Google hung → Mapbox
        try {
          const svc = new window.google.maps.places.AutocompleteService();
          const bias = coords
            ? new window.google.maps.Circle({ center: { lat: coords.lat, lng: coords.lng }, radius: 50000 })
            : (detectedLoc
              ? new window.google.maps.Circle({ center: { lat: detectedLoc.lat, lng: detectedLoc.lng }, radius: 50000 })
              : null);

          svc.getPlacePredictions(
            { input: searchQ, componentRestrictions: { country: 'in' }, locationBias: bias },
            (predictions, status) => {
              clearTimeout(guard);
              if (status === 'OK' && predictions?.length) {
                finish(() => {
                  setResults(predictions.map((p) => ({
                    id          : p.place_id,
                    _isGoogle   : true,
                    _placeId    : p.place_id,
                    text        : p.structured_formatting?.main_text || p.description,
                    place_name  : p.description,
                    secondaryText: p.structured_formatting?.secondary_text || '',
                  })));
                  setSearching(false);
                });
              } else {
                finish(mapboxFallback); // denied/quota/zero → Mapbox
              }
            },
          );
        } catch { clearTimeout(guard); finish(mapboxFallback); }
        return;
      }

      // Google not available at all → Mapbox directly.
      await mapboxFallback();
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, gmapsLoaded, coords, detectedLoc]);

  useEffect(() => {
    if (!TOKEN || mapRef.current) return;

    setMapReady(false);

    // Defer init one tick so the container has real dimensions in the DOM. Use
    // a timeout (not requestAnimationFrame) so init still runs if the picker
    // mounts while the tab is backgrounded — rAF is paused for hidden tabs,
    // which would otherwise leave the map stuck on the loading state.
    const initTimer = setTimeout(() => {
      const container = document.getElementById('zappy-locpick-map');
      if (!container || mapRef.current) return;

      ensureWorkerDotStyles();
      mapboxgl.accessToken = TOKEN;

      const boot = detectedLocRef.current;
      const initCenter = stateRef.current.pendingCenter
        ?? (boot ? [boot.lng, boot.lat] : [77.5946, 12.9716]);
      const initZoom = (stateRef.current.pendingCenter || boot) ? 17 : 12;

      const map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: initCenter,
        zoom: initZoom,
        attributionControl: false,
        fadeDuration: 150,
      });
      mapRef.current = map;

      // The map lives in a flex-1 zone whose height only settles across a few
      // layout passes (top controls + bottom sheet measure, flex distributes).
      // Mapbox sizes its GL canvas once at init, so if the container wasn't at
      // its final height yet the canvas stays short and a white band shows above
      // the tiles. Kick a resize now, on a stagger, and on every container box
      // change so the canvas always fills the zone.
      const kickResize = () => { try { map.resize(); } catch { /* map gone */ } };
      kickResize();
      const resizeTimers = [60, 180, 360, 700, 1200].map((d) => setTimeout(kickResize, d));

      const ro = new ResizeObserver(kickResize);
      ro.observe(container);
      stateRef.current.ro = ro;
      map.once('idle', kickResize);

      map.on('load', () => {
        map.resize();
        setMapReady(true);
        stateRef.current.ready = true;

        const loc = detectedLocRef.current;
        if (loc) {
          stateRef.current.userLocMarker = new mapboxgl.Marker({ element: makeUserLocationEl(), anchor: 'center' })
            .setLngLat([loc.lng, loc.lat]).addTo(map);
          _loadNearbyWorkers(map, loc);
        }
        if (stateRef.current.pendingCenter) {
          // flyTo emits its own moveend → the centre gets reverse-geocoded there.
          map.flyTo({ center: stateRef.current.pendingCenter, zoom: 17, duration: 900 });
          stateRef.current.pendingCenter = null;
        } else {
          // Static initial centre — geocode it so the sheet + Confirm are ready
          // immediately without waiting for the first drag.
          setGeocoding(true);
          map.fire('moveend');
        }
      });

      // Fallback: if style errors, try light-v11
      map.on('error', (e) => {
        if (e.sourceId === undefined && !stateRef.current.ready) {
          map.setStyle('mapbox://styles/mapbox/light-v11');
        }
      });

    map.on('movestart', () => { setDrag(true); setGeocoding(false); });
    map.on('moveend', () => {
      setDrag(false);
      clearTimeout(revTimer.current);
      setGeocoding(true);
      revTimer.current = setTimeout(async () => {
        // The pin is fixed to the centre of the map area *above* the bottom
        // sheet — reverse-geocode that exact screen point, not the raw centre.
        const canvas = map.getCanvas();
        const cx = canvas.width  / window.devicePixelRatio / 2;
        const cy = (canvas.height / window.devicePixelRatio - sheetHRef.current) / 2;
        const { lat, lng } = map.unproject([cx, cy]);
        setCoords({ lat, lng });
        try {
          const r = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
            `?access_token=${TOKEN}&language=en&types=address,neighborhood,locality,place&limit=1`,
          );
          const d = await r.json();
          const feat = d.features?.[0];
          if (feat) {
            const ctx = feat.context || [];
            const get = (p) => ctx.find(c => c.id?.startsWith(p))?.text ?? null;
            // Short: street name or neighbourhood
            const short = feat.place_type?.[0] === 'address'
              ? feat.text
              : get('neighborhood') || get('locality') || feat.text;
            // Full: "Short, Area, City PIN"
            setShortAddress(short || feat.place_name.split(',')[0]);
            setAddress(feat.place_name);
          } else {
            setShortAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            setAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          }
        } catch {
          setShortAddress('Location selected');
          setAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
        setGeocoding(false);
      }, 420);
    });

      stateRef.current.resizeTimers = resizeTimers; // cleared on unmount
    }, 0); // end init timeout

    return () => {
      clearTimeout(initTimer);
      clearTimeout(revTimer.current);
      cancelAnimationFrame(moveTimer.current);
      (stateRef.current.resizeTimers || []).forEach(clearTimeout);
      stateRef.current.resizeTimers = null;
      stateRef.current.ro?.disconnect();
      stateRef.current.ro = null;
      workerMarkers.current.forEach((w) => w.marker?.remove?.() || w.remove?.());
      workerMarkers.current = [];
      stateRef.current.userLocMarker?.remove();
      stateRef.current.userLocMarker = null;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      stateRef.current.ready = false;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — map mounts once for the whole screen

  async function _loadNearbyWorkers(map, loc) {
    const workerEmoji = SERVICE_WORKER_EMOJI[service] ?? '👷';
    const workerColor = SERVICE_COLORS[service]       ?? '#22c55e';
    const serviceSlug = service ?? '';

    // Clear previous markers
    cancelAnimationFrame(moveTimer.current);
    moveTimer.current = null;
    workerMarkers.current.forEach((w) => w.marker.remove());
    workerMarkers.current = [];

    try {
      const res = await fetchNearby({ lat: loc.lat, lng: loc.lng }).unwrap();
      const workers = res?.workers || [];
      setNearbyCount(workers.length);
      setNearbyInfo(deriveNearbyInfo(loc, workers)); // real ETA + density (§10/§11)

      workers.forEach((w, i) => {
        const delay = `${(i * 0.22).toFixed(2)}s`;
        const el = makeWorkerDot(workerEmoji, workerColor, serviceSlug, delay);
        // Pin at worker's real last-known GPS position — no simulated drift
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([w.lng, w.lat])
          .addTo(map);
        workerMarkers.current.push({ marker });
      });

    } catch { /* non-critical */ }
  }

  // Recenter the (always-mounted) map on a location + refresh the blue "you" dot
  // and the nearby-worker pins. Falls back to a pending center if the map hasn't
  // finished loading yet (picked up in the map 'load' handler).
  function _flyTo(loc) {
    const map = mapRef.current;
    if (!map || !stateRef.current.ready) {
      stateRef.current.pendingCenter = [loc.lng, loc.lat];
      return;
    }
    map.flyTo({ center: [loc.lng, loc.lat], zoom: 16, duration: 800 });
    if (stateRef.current.userLocMarker) {
      stateRef.current.userLocMarker.setLngLat([loc.lng, loc.lat]);
    } else {
      stateRef.current.userLocMarker = new mapboxgl.Marker({ element: makeUserLocationEl(), anchor: 'center' })
        .setLngLat([loc.lng, loc.lat]).addTo(map);
    }
    _loadNearbyWorkers(map, loc);
  }

  function _goToMyLocation() {
    setGeoState('loading');
    getCurrent()
      .then((loc) => {
        saveGeoLocation(loc);
        setDetectedLoc(loc);
        setGpsAccuracy(loc.accuracy);
        setGeoState('done');
        _flyTo(loc);
      })
      .catch(() => {
        setGeoState('error');
        setGeoError('Location access denied. Enable GPS and try again.');
      });
  }

  // A location was chosen from search / saved / recent — fly the pin there and
  // let the map's moveend handler reverse-geocode the exact pin centre. The user
  // still reviews + taps Confirm (classic "drag map, pin stays centred" UX).
  function applyPicked(lat, lng) {
    setResults([]);
    setSearchQ('');
    setShowSaved(false);
    const map = mapRef.current;
    if (map && stateRef.current.ready) {
      map.flyTo({ center: [lng, lat], zoom: 17, duration: 800 });
      _loadNearbyWorkers(map, { lat, lng });
    } else {
      stateRef.current.pendingCenter = [lng, lat];
    }
  }

  function confirmLocation() {
    if (!coords || !address) return;
    const notes = locNote.trim() || undefined;
    saveRecent({ address, lat: coords.lat, lng: coords.lng }).catch(() => {});
    onConfirm({ address, lat: coords.lat, lng: coords.lng, notes });
  }

  function selectSaved(sa) {
    const [lng, lat] = sa.location.coordinates;
    applyPicked(lat, lng);
  }

  async function selectSearchResult(f) {
    if (f._isGoogle && f._placeId) {
      // Resolve Google Place ID → coordinates via geocoding REST API
      try {
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json` +
          `?place_id=${encodeURIComponent(f._placeId)}&key=${GOOGLE_MAPS_KEY}&language=en`,
        );
        const d = await r.json();
        const loc = d.results?.[0]?.geometry?.location;
        if (loc) {
          const { lat, lng } = loc;
          saveRecent({ address: f.place_name, lat, lng }).catch(() => {});
          applyPicked(lat, lng);
          return;
        }
      } catch { /* fall through to address-based geocode */ }

      // Fallback: geocode by description string
      try {
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json` +
          `?address=${encodeURIComponent(f.place_name)}&key=${GOOGLE_MAPS_KEY}&region=in&language=en`,
        );
        const d = await r.json();
        const loc = d.results?.[0]?.geometry?.location;
        if (loc) {
          saveRecent({ address: f.place_name, lat: loc.lat, lng: loc.lng }).catch(() => {});
          applyPicked(loc.lat, loc.lng);
          return;
        }
      } catch { /* ignored */ }
    }

    // Mapbox feature — has f.center = [lng, lat]
    if (f.center) {
      const [lng, lat] = f.center;
      saveRecent({ address: f.place_name, lat, lng }).catch(() => {});
      applyPicked(lat, lng);
    }
  }

  // Precise-pin chip toggle (Gate / Flat / Basement / Landmark).
  function toggleChip(chip) {
    setActiveChip((cur) => {
      if (cur === chip.label) { setLocNote(''); return ''; }
      setLocNote((n) => (n.trim() && !NOTE_CHIPS.some((c) => n.startsWith(c.prefix)) ? chip.prefix + n.trim() : chip.prefix));
      return chip.label;
    });
  }

  /* ════════════════════════════════════════════════════════════════
     SINGLE-SCREEN LOCATION PICKER (light) — Urban-Company style
     Search + GPS card float above an always-mounted map; a fixed centre
     pin + light bottom sheet let the user confirm the exact spot.
  ════════════════════════════════════════════════════════════════ */
  const acc        = gpsAccuracy ?? detectedLoc?.accuracy ?? null;
  const gpsReady   = geoState === 'done' && !!detectedLoc;
  const canConfirm = !!coords && !!address && !geocoding;
  const savedCount = savedAddresses.length + recentLocations.length;
  const CHIP_ICONS = { 'Gate': DoorOpen, 'Flat / Door': Building2, 'Basement': ArrowDownToLine, 'Landmark': Landmark };
  const density    = DENSITY_META[nearbyInfo?.density] || DENSITY_META.high;

  return (
    <div className="flex flex-col h-full bg-[#F3F6FB]">

      {/* ── Top controls: step label + search + current location ─────── */}
      <div className="shrink-0 w-full max-w-md lg:max-w-3xl mx-auto px-4 pt-3 pb-2.5 space-y-3">

        {/* Step label */}
        <div className="flex items-center gap-1.5">
          <MapPin size={13} strokeWidth={2.6} className="text-[#2563EB]" />
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#2563EB]">
            Step 1 of 2 • Choose location
          </p>
        </div>

        {/* Search bar */}
        <div className="relative">
          <div className="flex items-center gap-2.5 bg-white rounded-full pl-4 pr-1.5 py-1.5 ring-1 ring-slate-100"
            style={{ boxShadow: '0 6px 22px rgba(37,99,235,0.10)' }}>
            <Search size={18} strokeWidth={2.4} className="text-[#2563EB] shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search for area, landmark or full address"
              className="flex-1 min-w-0 bg-transparent py-2 text-[13.5px] font-medium text-slate-800 placeholder:text-slate-400 outline-none"
            />
            {searching ? (
              <Loader2 size={16} className="animate-spin text-blue-400 shrink-0 mr-2" />
            ) : searchQ ? (
              <button onClick={() => setSearchQ('')} aria-label="Clear"
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                <X size={15} className="text-slate-400" />
              </button>
            ) : (
              <button onClick={_goToMyLocation} aria-label="Use my location"
                className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 active:scale-95 transition">
                <Crosshair size={17} strokeWidth={2.4} className="text-[#2563EB]" />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          <AnimatePresence>
            {(results.length > 0 || (searchQ.length >= 3 && !searching)) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="absolute z-40 left-0 right-0 mt-2 bg-white rounded-2xl ring-1 ring-slate-100 overflow-hidden max-h-72 overflow-y-auto"
                style={{ boxShadow: '0 14px 44px rgba(15,23,42,0.18)' }}
              >
                {results.map((f) => (
                  <button key={f.id} onClick={() => selectSearchResult(f)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-blue-50/50 transition border-b border-slate-50 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={14} strokeWidth={2.2} className="text-[#2563EB]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-slate-800 truncate">{f.text || f.place_name.split(',')[0]}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{f.secondaryText || f.place_name}</p>
                    </div>
                  </button>
                ))}
                {results.length === 0 && searchQ.length >= 3 && !searching && (
                  <div className="px-4 py-5 text-center">
                    <p className="text-[13px] font-semibold text-slate-500">No results for “{searchQ}”</p>
                    <p className="text-[11px] text-slate-400 mt-1">Drag the map pin to set it manually</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Map zone ─────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 w-full max-w-md lg:max-w-3xl mx-auto overflow-hidden">
        {/* Map container */}
        <div id="zappy-locpick-map" className="absolute inset-0" style={{ width: '100%', height: '100%' }} />

        {!TOKEN && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-20">
            <p className="text-sm text-red-500 font-medium px-6 text-center">
              VITE_MAPBOX_TOKEN not set — add it to .env
            </p>
          </div>
        )}

        {/* Loading shimmer */}
        <AnimatePresence>
          {TOKEN && !mapReady && (
            <motion.div key="map-loading" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#EEF2F9]">
              <motion.div className="w-12 h-12 rounded-2xl bg-[#2563EB] flex items-center justify-center shadow-lg"
                animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                <MapPin size={22} strokeWidth={2} className="text-white" />
              </motion.div>
              <p className="text-[13px] font-bold text-slate-400">Loading map…</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Use my current location — floats over the top of the map so the
            map fills the space up to the search bar instead of being squeezed. */}
        <motion.button
          onClick={_goToMyLocation}
          whileTap={{ scale: 0.985 }}
          className="absolute top-3 left-3 right-3 z-20 flex items-center gap-3.5 bg-white rounded-2xl p-3 ring-1 ring-black/5 text-left"
          style={{ boxShadow: '0 6px 22px rgba(15,23,42,0.14)' }}
        >
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-2xl bg-[#2563EB] flex items-center justify-center shadow-sm">
              {geoState === 'loading'
                ? <Loader2 size={18} strokeWidth={2.4} className="text-white animate-spin" />
                : <Navigation size={18} strokeWidth={2.4} className="text-white" />}
            </div>
            {gpsReady && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#22C55E] rounded-full border-2 border-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-bold text-slate-900">Use my current location</p>
            {geoState === 'loading' ? (
              <p className="text-[12px] font-semibold text-[#2563EB] mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> GPS acquiring signal…
              </p>
            ) : geoState === 'error' ? (
              <p className="text-[12px] font-medium text-red-500 mt-0.5">{geoError}</p>
            ) : gpsReady ? (
              <p className="text-[12px] font-semibold text-[#16A34A] mt-0.5">
                GPS locked • ±{acc != null ? Math.round(acc) : '<50'}m accurate
              </p>
            ) : (
              <p className="text-[12px] font-medium text-slate-400 mt-0.5">Fastest &amp; most accurate</p>
            )}
          </div>
          <ChevronRight size={20} strokeWidth={2.2} className="text-slate-300 shrink-0" />
        </motion.button>

        {/* Coverage pill — floats just above the sheet (bottom-left), mirroring
            the recenter button, so it never collides with the location card. */}
        <AnimatePresence>
          {nearbyCount !== null && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="absolute left-3 z-20 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-black/5 max-w-[62%]"
              style={{ bottom: sheetH + 12, boxShadow: '0 4px 16px rgba(15,23,42,0.14)' }}>
              <span className="relative flex h-2.5 w-2.5 shrink-0 mt-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                  style={{ background: nearbyCount === 0 ? '#F59E0B' : density.dot }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5"
                  style={{ background: nearbyCount === 0 ? '#F59E0B' : density.dot }} />
              </span>
              <div className="leading-tight min-w-0">
                {nearbyCount === 0 ? (
                  <>
                    <p className="text-[12px] font-extrabold text-slate-800">No workers here yet</p>
                    <p className="text-[10.5px] font-medium text-slate-400">Try a nearby area</p>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] font-extrabold text-slate-800">Nearest pro ~{nearbyInfo?.etaMin ?? 5} min</p>
                    <p className="text-[10.5px] font-medium text-slate-400">{density.label}</p>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fixed pin — accuracy radius + centre dot (centre of the map area above the sheet) */}
        <div className="absolute left-1/2 z-[8] pointer-events-none" style={{ top: `calc(50% - ${sheetH / 2}px)`, transform: 'translate(-50%, -50%)' }}>
          <div className="relative flex items-center justify-center" style={{ width: 18, height: 18 }}>
            <span className="absolute rounded-full animate-ping" style={{ width: 72, height: 72, background: 'rgba(37,99,235,0.16)' }} />
            <span className="absolute rounded-full" style={{ width: 66, height: 66, background: 'rgba(37,99,235,0.10)' }} />
            <span className="absolute rounded-full" style={{ width: 32, height: 32, background: 'rgba(37,99,235,0.22)' }} />
            <span className="relative rounded-full" style={{ width: 18, height: 18, background: '#2563EB', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(37,99,235,0.55)' }} />
          </div>
        </div>

        {/* Fixed pin — Z badge floating above the tip */}
        <div className="absolute left-1/2 z-10 pointer-events-none flex flex-col items-center"
          style={{ top: `calc(50% - ${sheetH / 2}px)`, transform: 'translate(-50%, -100%)', marginTop: -4 }}>
          <motion.div
            animate={{ y: isDragging ? -10 : 0, scale: isDragging ? 1.06 : 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            className="flex flex-col items-center"
          >
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
              style={{ boxShadow: '0 6px 18px rgba(15,23,42,0.30)' }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900, fontSize: 17, lineHeight: 1, color: '#0F172A', letterSpacing: '-0.04em' }}>Z</span>
            </div>
            <div style={{ width: 2.5, height: 13, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', marginTop: -1, borderRadius: 2 }} />
          </motion.div>
        </div>

        {/* Recenter — sits just above the bottom sheet */}
        <motion.button onClick={_goToMyLocation} whileTap={{ scale: 0.9 }}
          className="absolute right-3 z-20 w-11 h-11 rounded-full bg-white flex items-center justify-center ring-1 ring-black/5"
          style={{ bottom: sheetH + 12, boxShadow: '0 4px 16px rgba(15,23,42,0.16)' }} aria-label="Recenter map">
          {geoState === 'loading'
            ? <Loader2 size={18} className="animate-spin text-[#2563EB]" />
            : <Crosshair size={18} strokeWidth={2.2} className="text-slate-700" />}
        </motion.button>

        {/* ── Bottom sheet — overlays the bottom of the map ────────────── */}
        <div ref={sheetRef} className="absolute bottom-0 left-0 right-0 z-30 max-h-[82vh] max-h-[82dvh] flex flex-col justify-end pointer-events-auto select-none">
          <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(15,23,42,0.12)] border-t border-slate-100/80 flex flex-col max-h-[82vh] max-h-[82dvh] transition-all duration-300">

            {/* Interactive Drag Handle — Click or swipe to collapse/expand sheet */}
            <div
              onClick={() => setSheetMinimized((m) => !m)}
              className="w-full py-2.5 flex flex-col items-center justify-center cursor-pointer active:bg-slate-50 rounded-t-3xl shrink-0 touch-none"
              aria-label={sheetMinimized ? "Expand sheet" : "Collapse sheet"}
            >
              <div className="w-12 h-1.5 rounded-full bg-slate-300/80 hover:bg-slate-400 transition-colors" />
            </div>

            {/* Scrollable sheet body — overscroll isolated so window never scrolls.
                On desktop the map spans wide, but the address/confirm content stays a
                readable centred width. */}
            <div className="px-5 pb-5 overflow-y-auto overscroll-contain touch-pan-y flex-1 min-h-0 w-full lg:max-w-lg lg:mx-auto">

              {/* Label + edit */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#2563EB]">Service Location</p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSheetMinimized((m) => !m)}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition"
                  >
                    {sheetMinimized ? 'Expand' : 'Collapse'}
                  </button>
                  <button onClick={() => searchInputRef.current?.focus()} aria-label="Edit address"
                    className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center active:scale-95 transition">
                    <Pencil size={14} strokeWidth={2.2} className="text-[#2563EB]" />
                  </button>
                </div>
              </div>

              {/* Address row */}
              <div className="flex items-start gap-3 cursor-pointer" onClick={() => sheetMinimized && setSheetMinimized(false)}>
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-2xl bg-[#2563EB] flex items-center justify-center shadow-sm">
                    {geocoding ? <Loader2 size={16} className="text-white animate-spin" /> : <Map size={17} strokeWidth={2.2} className="text-white" />}
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#2563EB] border-2 border-white" />
                </div>
                <div className="min-w-0 flex-1">
                  {isDragging ? (
                    <p className="text-[15px] font-bold text-slate-400 italic pt-1">Move map to pin location…</p>
                  ) : geocoding ? (
                    <p className="text-[15px] font-bold text-slate-400 flex items-center gap-1.5 pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Looking up address…
                    </p>
                  ) : address ? (
                    <>
                      <p className="text-[16px] font-extrabold text-slate-900 leading-snug truncate">{shortAddress || address.split(',')[0]}</p>
                      <p className="text-[12.5px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{address}</p>
                    </>
                  ) : (
                    <p className="text-[15px] font-semibold text-slate-400 pt-1">Drag the map to pin your location</p>
                  )}
                </div>
              </div>

              {/* Expanded details — hidden when sheet is minimized */}
              <AnimatePresence initial={false}>
                {!sheetMinimized && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Precise-pin chips */}
                    <div className="flex flex-wrap gap-2 mt-3.5">
                      {NOTE_CHIPS.map((c) => {
                        const Icon = CHIP_ICONS[c.label] || MapPin;
                        const on   = activeChip === c.label;
                        return (
                          <button key={c.label} onClick={() => toggleChip(c)}
                            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold border transition-colors ${on ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'bg-white border-blue-100 text-[#2563EB]'}`}>
                            <Icon size={14} strokeWidth={2.2} /> {c.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Optional note input when a chip is active */}
                    <AnimatePresence initial={false}>
                      {activeChip && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <input
                            value={locNote}
                            onChange={(e) => setLocNote(e.target.value.slice(0, 140))}
                            placeholder={`Add ${activeChip.toLowerCase()} details — number, floor, landmark…`}
                            className="w-full mt-2.5 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-300"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Saved places */}
                    <button onClick={() => setShowSaved((s) => !s)}
                      className="w-full flex items-center gap-2.5 mt-3.5 rounded-xl bg-slate-50 px-4 py-3 text-left">
                      <Clock size={15} strokeWidth={2.2} className="text-slate-500 shrink-0" />
                      <span className="flex-1 text-[13.5px] font-semibold text-slate-700">Saved places{savedCount ? ` (${savedCount})` : ''}</span>
                      <ChevronDown size={17} className={`text-slate-400 transition-transform ${showSaved ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {showSaved && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {savedAddresses.map((sa) => {
                              const m = TAG_META[sa.tag] || TAG_META.other; const Icon = m.icon;
                              return (
                                <button key={sa._id} onClick={() => selectSaved(sa)}
                                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-blue-50/60 transition">
                                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${m.bg} flex items-center justify-center shrink-0`}>
                                    <Icon size={14} className="text-white" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{sa.label || sa.tag}</p>
                                    <p className="text-[13px] font-semibold text-slate-800 truncate">{sa.address}</p>
                                  </div>
                                </button>
                              );
                            })}
                            {recentLocations.map((r, i) => (
                              <button key={`recent-${i}`} onClick={() => applyPicked(r.lat, r.lng)}
                                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-blue-50/60 transition">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                  <Clock size={13} className="text-slate-500" />
                                </div>
                                <p className="text-[13px] font-medium text-slate-700 truncate flex-1">{r.address}</p>
                              </button>
                            ))}
                            {savedCount === 0 && (
                              <p className="text-[12.5px] text-slate-400 text-center py-3">No saved places yet</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Confirm CTA */}
                    <motion.button onClick={confirmLocation} disabled={!canConfirm} whileTap={canConfirm ? { scale: 0.98 } : {}}
                      className="w-full h-14 rounded-full mt-4 flex items-center justify-center gap-2 text-[15px] font-extrabold text-white transition-colors"
                      style={{ background: canConfirm ? '#2563EB' : '#CBD5E1', boxShadow: canConfirm ? '0 10px 26px rgba(37,99,235,0.4)' : 'none' }}>
                      {geocoding
                        ? <><Loader2 size={18} className="animate-spin" /> Detecting address…</>
                        : <>Confirm This Location <ArrowRight size={18} strokeWidth={2.6} /></>}
                    </motion.button>

                    {/* Trust line */}
                    <div className="flex items-center justify-center gap-1.5 mt-3">
                      <Lock size={12} className="text-slate-400" />
                      <p className="text-[11.5px] font-medium text-slate-400">Your location is secure and encrypted</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
