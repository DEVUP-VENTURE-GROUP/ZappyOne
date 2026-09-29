/**
 * BookingMapView — Rapido-style live worker map for the booking screen.
 *
 * Shows:
 *  • Interactive Mapbox GL map centred on the service location
 *  • A pulsing radar ring expanding from the pin (scanning animation)
 *  • Animated vehicle emoji markers at actual worker GPS positions
 *  • Vehicle type adapts to service category ( bikes, repair vans, etc.)
 *  • Worker count badge with live green pulse dot
 *
 * Worker positions come from GET /workers/nearby which returns real Redis GEO
 * coordinates — not mocked.
 */

import { useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* Service → vehicle emoji */
const VEHICLE_SERVICES = new Set([
  'puncture','bike_chain_issue','bike_brake_issue','bike_battery_issue',
  'bike_wash','bike_breakdown','bike_service',
  'car_wash','car_detailing','battery_jump_start','car_puncture',
  'car_breakdown','fuel_delivery','car_service',
  'commercial_emergency','commercial_scheduled_maintenance','fleet_support','auto_repair','van_repair',
]);
const CAR_SERVICES = new Set([
  'car_wash','car_detailing','battery_jump_start','car_puncture',
  'car_breakdown','car_service','fuel_delivery',
]);
const MOBILE_SERVICES = new Set([
  'screen_replacement','battery_replacement','charging_issue',
  'speaker_mic_issue','microphone_issue','software_issue',
  'water_damage','camera_issue','data_recovery','device_not_turning_on',
]);
const LAPTOP_SERVICES = new Set([
  'laptop_slow','laptop_ssd_upgrade','laptop_ram_upgrade','laptop_keyboard_issue',
  'laptop_motherboard_issue','laptop_charging_issue','laptop_screen_issue',
  'laptop_virus_removal','laptop_data_recovery',
]);

function vehicleEmoji(service) {
  if (CAR_SERVICES.has(service))    return '🚗';
  if (VEHICLE_SERVICES.has(service)) return '🛵';
  if (MOBILE_SERVICES.has(service) || LAPTOP_SERVICES.has(service)) return '🔧';
  if (service?.startsWith('pet_'))   return '🐾';
  if (service?.startsWith('event_')) return '🎪';
  if (service?.startsWith('elder_') || service?.startsWith('medicine') || service?.startsWith('hospital')) return '🏥';
  return '🔧';
}

/* Service → accent colour (matches LiveTrackingMap) */
const SVC_COLORS = {
  puncture:'#FF6B6B', bike_wash:'#26de81', bike_chain_issue:'#fd9644',
  bike_brake_issue:'#fc5c65', bike_battery_issue:'#45aaf2',
  car_wash:'#2bcbba', car_puncture:'#FF6B6B', battery_jump_start:'#FFD32A',
  fuel_delivery:'#fd9644', screen_replacement:'#5352ed',
  battery_replacement:'#eccc68', software_issue:'#70a1ff',
  water_damage:'#1e90ff', laptop_slow:'#778ca3',
};
const DEFAULT_COLOR = '#2563EB';
function svcColor(service) { return SVC_COLORS[service] || DEFAULT_COLOR; }

/* Inject CSS once */
function ensureStyles() {
  if (document.getElementById('bmap-styles')) return;
  const s = document.createElement('style');
  s.id = 'bmap-styles';
  s.textContent = `
    @keyframes bmap-radar {
      0%   { transform: scale(1);   opacity: .55; }
      100% { transform: scale(5.5); opacity: 0;   }
    }
    @keyframes bmap-radar2 {
      0%   { transform: scale(1);   opacity: .3;  }
      100% { transform: scale(8.0); opacity: 0;   }
    }
    @keyframes bmap-float {
      0%,100% { transform: translateY(0px) rotate(-8deg); }
      50%      { transform: translateY(-5px) rotate(-8deg); }
    }
    @keyframes bmap-float2 {
      0%,100% { transform: translateY(0px) rotate(6deg); }
      50%      { transform: translateY(-7px) rotate(6deg); }
    }
    @keyframes bmap-float3 {
      0%,100% { transform: translateY(-3px) rotate(-4deg); }
      50%      { transform: translateY(3px) rotate(-4deg); }
    }
    @keyframes bmap-pin-pulse {
      0%,100% { transform: scale(1); }
      50%      { transform: scale(1.12); }
    }
    .bmap-radar-ring {
      position: absolute; width: 36px; height: 36px; top: 50%; left: 50%;
      margin: -18px 0 0 -18px; border-radius: 50%;
      border: 2px solid var(--rc, #2563EB);
      animation: bmap-radar 2.4s ease-out infinite;
      pointer-events: none;
    }
    .bmap-radar-ring.ring2 {
      animation: bmap-radar2 2.4s ease-out infinite;
      animation-delay: 0.8s;
    }
    .bmap-radar-ring.ring3 {
      animation: bmap-radar 2.4s ease-out infinite;
      animation-delay: 1.6s;
    }
    .bmap-vehicle {
      font-size: 22px; line-height: 1;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.28));
      cursor: default;
      user-select: none;
    }
    .bmap-vehicle.f1 { animation: bmap-float  3.2s ease-in-out infinite; }
    .bmap-vehicle.f2 { animation: bmap-float2 2.8s ease-in-out infinite; animation-delay: 0.4s; }
    .bmap-vehicle.f3 { animation: bmap-float3 3.6s ease-in-out infinite; animation-delay: 0.9s; }
    .bmap-vehicle.f4 { animation: bmap-float  2.6s ease-in-out infinite; animation-delay: 1.4s; }
    .bmap-vehicle.f5 { animation: bmap-float2 3.4s ease-in-out infinite; animation-delay: 0.2s; }
    .bmap-pin-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--pc, #2563EB);
      box-shadow: 0 0 0 4px rgba(59,130,246,0.25);
      animation: bmap-pin-pulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(s);
}

/* Component */
export default function BookingMapView({ location, workers = [], service }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);

  const color = svcColor(service);
  const emoji = vehicleEmoji(service);

  const buildMap = useCallback(() => {
    if (!TOKEN || !location || mapRef.current) return;
    ensureStyles();

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [location.lng, location.lat],
      zoom: 14.2,
      interactive: false,
      attributionControl: false,
      logoPosition: 'bottom-right',
    });
    mapRef.current = map;

    map.on('load', () => {
      // Service location pin with radar rings
      const pinEl = document.createElement('div');
      pinEl.style.cssText = 'position:relative; display:flex; align-items:center; justify-content:center; width:36px; height:36px;';
      pinEl.innerHTML = `
        <div class="bmap-radar-ring" style="--rc:${color}"></div>
        <div class="bmap-radar-ring ring2" style="--rc:${color}"></div>
        <div class="bmap-radar-ring ring3" style="--rc:${color}"></div>
        <div class="bmap-pin-dot" style="--pc:${color}; background:${color}; box-shadow:0 0 0 4px ${color}33;"></div>
      `;
      new mapboxgl.Marker({ element: pinEl, anchor: 'center' })
        .setLngLat([location.lng, location.lat])
        .addTo(map);

      // Worker markers at their actual GPS positions
      placeWorkerMarkers(map, workers, emoji, color);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function placeWorkerMarkers(map, workerList, emojiChar, col) {
    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const visible = workerList.slice(0, 6); // show max 6 vehicles
    visible.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = `bmap-vehicle f${(i % 5) + 1}`;
      el.style.cssText = `
        background: white;
        border-radius: 10px;
        padding: 3px 5px;
        box-shadow: 0 3px 12px rgba(0,0,0,0.22), 0 0 0 1.5px ${col}55;
        font-size: 18px;
        line-height: 1;
      `;
      el.textContent = emojiChar;

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([w.lng, w.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }

  // Mount
  useEffect(() => {
    buildMap();
    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update worker markers when data arrives
  useEffect(() => {
    if (!mapRef.current || !workers.length) return;
    if (mapRef.current.loaded()) {
      placeWorkerMarkers(mapRef.current, workers, emoji, color);
    } else {
      mapRef.current.once('load', () => {
        placeWorkerMarkers(mapRef.current, workers, emoji, color);
      });
    }
  }, [workers]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!TOKEN) return null;

  return (
    <div className="relative w-full h-40 overflow-hidden rounded-t-2xl">
      <div ref={containerRef} className="w-full h-full" />

      {/* Subtle dark gradient at bottom so address text reads cleanly */}
      <div
        className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.18), transparent)' }}
      />

      {/* Worker count badge — bottom-left */}
      <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md ring-1 ring-black/5">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
        <span className="text-[11px] font-bold text-slate-800">
          {workers.length > 0
            ? `${workers.length} ${workers.length === 1 ? 'worker' : 'workers'} nearby`
            : 'Scanning for workers…'}
        </span>
      </div>

      {/* High demand badge — top-right when many workers */}
      {workers.length >= 4 && (
        <div className="absolute top-2.5 right-3 flex items-center gap-1 bg-green-500/90 backdrop-blur-sm rounded-full px-2.5 py-1 shadow">
          <span className="text-[10px] font-black text-white">Available now</span>
        </div>
      )}
    </div>
  );
}
