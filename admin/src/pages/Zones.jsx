import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Plus, X, Trash2, Check, Pencil, Loader2, Users, ShoppingBag,
  Layers, ZoomIn, ZoomOut, RotateCcw, MousePointer, Pentagon, CheckCircle2,
  AlertCircle, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminZonesQuery, useAdminCreateZoneMutation, useAdminUpdateZoneMutation,
  useAdminDeleteZoneMutation, useAdminZoneStatsQuery,
} from '@client/services/api';
import { SectionHeader, Card, PageLoader, FormRow, Input, Select } from './_shared';

// Fix Leaflet default icon path issue with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const INDIA_CENTER = [20.5937, 78.9629];
const INDIA_ZOOM = 5;

const TILE_LAYERS = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label: 'Voyager',
    subdomains: 'abcd',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attr: '&copy; OpenStreetMap &copy; CARTO',
    label: 'Dark',
    subdomains: 'abcd',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA',
    label: 'Satellite',
    subdomains: '',
  },
};

const COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#A855F7', '#06B6D4', '#EC4899', '#F97316'];
const STATUS_LABEL = { active: 'Active', coming_soon: 'Coming Soon', disabled: 'Disabled' };
const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  coming_soon: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  disabled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
};
const STATUS_DOT = { active: 'bg-emerald-500', coming_soon: 'bg-amber-400', disabled: 'bg-slate-400' };

const SERVICE_OPTIONS = [
  'screen_replacement', 'battery_replacement', 'puncture', 'car_wash', 'bike_wash',
  'car_service', 'bike_service', 'cctv_install', 'pet_grooming', 'event_helper',
];

function closeRing(pts) {
  if (pts.length < 3) return null;
  const ring = pts.map((p) => [p.lng, p.lat]);
  const [f] = ring;
  const l = ring[ring.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
  return [ring];
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/* ─── Zone form drawer ──────────────────────────────────────────────────── */
function ZoneDrawer({ initial, coordinates, onClose, onSaved }) {
  const isEdit = !!initial?._id;
  const [form, setForm] = useState({
    name: initial?.name || '',
    city: initial?.city || '',
    description: initial?.description || '',
    status: initial?.status || 'active',
    surgeMultiplierOverride: initial?.surgeMultiplierOverride ?? '',
    pricingMultiplier: initial?.pricingMultiplier ?? 1.0,
    color: initial?.color || COLORS[0],
    disabledServices: initial?.disabledServices || [],
  });
  const [createZone, { isLoading: creating }] = useAdminCreateZoneMutation();
  const [updateZone, { isLoading: updating }] = useAdminUpdateZoneMutation();
  const busy = creating || updating;

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleService(s) {
    setForm((f) => ({
      ...f,
      disabledServices: f.disabledServices.includes(s)
        ? f.disabledServices.filter((x) => x !== s)
        : [...f.disabledServices, s],
    }));
  }

  async function save() {
    if (!form.name.trim() || !form.city.trim()) { toast.error('Name and city are required'); return; }
    const body = {
      name: form.name.trim(),
      city: form.city.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      surgeMultiplierOverride: form.surgeMultiplierOverride === '' ? null : Number(form.surgeMultiplierOverride),
      pricingMultiplier: Number(form.pricingMultiplier),
      color: form.color,
      disabledServices: form.disabledServices,
    };
    if (!isEdit) {
      const polygon = coordinates ? { type: 'Polygon', coordinates } : null;
      if (!polygon) { toast.error('Draw a polygon on the map first'); return; }
      body.polygon = polygon;
    } else if (coordinates) {
      body.polygon = { type: 'Polygon', coordinates };
    }
    try {
      if (isEdit) await updateZone({ id: initial._id, ...body }).unwrap();
      else await createZone(body).unwrap();
      toast.success(isEdit ? 'Zone updated' : 'Zone created');
      onSaved();
    } catch (e) {
      toast.error(e.data?.error || e.data?.details?.[0] || 'Save failed');
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 60, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `rgba(${hexToRgb(form.color)}, 0.12)` }}>
              <Pentagon size={14} style={{ color: form.color }} />
            </div>
            <p className="font-bold text-slate-900">{isEdit ? `Edit — ${initial.name}` : 'New Zone'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Zone Name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Whitefield" />
            </FormRow>
            <FormRow label="City">
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Bengaluru" />
            </FormRow>
          </div>

          <FormRow label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">✅ Active</option>
              <option value="coming_soon">🕐 Coming Soon</option>
              <option value="disabled">⛔ Disabled</option>
            </Select>
          </FormRow>

          <FormRow label="Description (optional)">
            <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Brief description of this zone coverage area"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-slate-300" />
          </FormRow>

          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Surge Override" hint="Empty = global surge">
              <Input type="number" min="1" max="5" step="0.1" value={form.surgeMultiplierOverride}
                onChange={(e) => set('surgeMultiplierOverride', e.target.value)} placeholder="global" />
            </FormRow>
            <FormRow label="Price Multiplier" hint="1.0 = standard rate">
              <Input type="number" min="0.5" max="3" step="0.05" value={form.pricingMultiplier}
                onChange={(e) => set('pricingMultiplier', e.target.value)} />
            </FormRow>
          </div>

          <FormRow label="Zone Color">
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => set('color', c)}
                  className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </FormRow>

          <FormRow label="Blocked Services" hint="Services unavailable in this zone">
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_OPTIONS.map((s) => (
                <button key={s} onClick={() => toggleService(s)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all ${form.disabledServices.includes(s) ? 'bg-red-600 text-white shadow-sm shadow-red-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </FormRow>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={save} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 text-white font-semibold text-sm py-2.5 rounded-xl transition disabled:opacity-50 shadow-sm"
            style={{ backgroundColor: form.color }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {isEdit ? 'Save Changes' : 'Create Zone'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Zone stats bar ────────────────────────────────────────────────────── */
function ZoneStats({ zoneId }) {
  const { data, isLoading } = useAdminZoneStatsQuery(zoneId);
  if (isLoading) return (
    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-t border-slate-100">
      <Loader2 size={13} className="animate-spin text-slate-300" />
      <span className="text-xs text-slate-400">Loading stats…</span>
    </div>
  );
  if (!data) return null;
  return (
    <div className="flex items-center gap-5 px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-t border-slate-100">
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Users size={12} className="text-emerald-500" />
        </div>
        <div>
          <span className="text-sm font-bold text-slate-800">{data.workerCount}</span>
          <span className="text-xs text-slate-400 ml-1">online</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
          <ShoppingBag size={12} className="text-blue-500" />
        </div>
        <div>
          <span className="text-sm font-bold text-slate-800">{data.recentOrders}</span>
          <span className="text-xs text-slate-400 ml-1">orders / 7d</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */
export default function Zones() {
  const { data, isLoading, refetch } = useAdminZonesQuery();
  const [deleteZone] = useAdminDeleteZoneMutation();

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const drawLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeStyle, setActiveStyle] = useState('light');

  const [selectedId, setSelectedId] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const drawPtsRef = useRef([]);
  const drawMarkersRef = useRef([]);
  const [drawCount, setDrawCount] = useState(0);
  const [drawer, setDrawer] = useState(null);

  const zones = data?.zones || [];
  const selected = zones.find((z) => z._id === selectedId) || null;

  // Init Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map;
    let ro;

    // Use rAF + a longer timeout so the grid layout has fully painted
    const raf = requestAnimationFrame(() => {
      if (!containerRef.current) return;

      map = L.map(containerRef.current, {
        center: INDIA_CENTER,
        zoom: INDIA_ZOOM,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });

      const tile = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        {
          attribution: TILE_LAYERS.light.attr,
          maxZoom: 19,
          subdomains: 'abcd',
          detectRetina: false,
        }
      ).addTo(map);
      tileLayerRef.current = tile;

      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      drawLayerRef.current = L.layerGroup().addTo(map);

      mapRef.current = map;

      // First invalidate at 200ms — enough for grid layout to settle
      const t1 = setTimeout(() => { map.invalidateSize({ animate: false }); }, 200);
      // Second pass at 600ms catches any residual flex/scroll recalculation
      const t2 = setTimeout(() => {
        map.invalidateSize({ animate: false });
        setMapReady(true);
      }, 600);

      // ResizeObserver keeps tiles correct if the panel is resized later
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
          if (mapRef.current) mapRef.current.invalidateSize({ animate: false });
        });
        ro.observe(containerRef.current);
      }

      // Stash cleanup refs
      mapRef.current._cleanupTimers = () => { clearTimeout(t1); clearTimeout(t2); };
    });

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (mapRef.current) {
        mapRef.current._cleanupTimers?.();
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // Switch tile style — remove old layer and add new so subdomains update too
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const cfg = TILE_LAYERS[activeStyle];
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const newTile = L.tileLayer(cfg.url, {
      attribution: cfg.attr,
      maxZoom: 19,
      subdomains: cfg.subdomains || 'abcd',
    });
    // Insert below zone/draw layers so zones stay on top
    newTile.addTo(map);
    newTile.bringToBack();
    tileLayerRef.current = newTile;
  }, [activeStyle, mapReady]);

  // Render zone polygons
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group || !mapReady) return;

    group.clearLayers();

    zones.forEach((z) => {
      if (!z.polygon?.coordinates?.length) return;
      const ring = z.polygon.coordinates[0];
      const latlngs = ring.map(([lng, lat]) => [lat, lng]);
      const color = z.color || '#3B82F6';
      const isSelected = z._id === selectedId;

      const poly = L.polygon(latlngs, {
        color,
        weight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: isSelected ? 0.22 : 0.12,
        dashArray: isSelected ? null : '6 3',
        className: 'zone-polygon',
      }).addTo(group);

      // Label via tooltip
      const center = poly.getBounds().getCenter();
      L.marker(center, {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            background: ${isSelected ? color : 'rgba(255,255,255,0.95)'};
            color: ${isSelected ? '#fff' : '#334155'};
            border: 1.5px solid ${color};
            padding: 3px 8px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            font-family: system-ui, -apple-system, sans-serif;
          ">${z.name}</div>`,
          iconAnchor: [40, 12],
        }),
        interactive: false,
      }).addTo(group);

      poly.on('click', () => {
        if (drawPtsRef.current.length) return;
        setSelectedId(z._id);
      });

      if (isSelected) {
        map.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 13 });
      }
    });
  }, [zones, mapReady, selectedId]);

  // Draw mode
  const finishDrawCallback = useCallback(() => {
    const coords = closeRing(drawPtsRef.current);
    if (!coords) { toast.error('Add at least 3 points'); return; }
    setDrawing(false);
    // Clear draw layers
    drawLayerRef.current?.clearLayers();
    drawMarkersRef.current = [];
    setDrawer({ initial: null, coordinates: coords });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    function renderDrawPreview() {
      drawLayerRef.current.clearLayers();
      const pts = drawPtsRef.current;
      if (!pts.length) return;

      // Draw points
      pts.forEach((p, i) => {
        L.circleMarker([p.lat, p.lng], {
          radius: i === 0 ? 7 : 5,
          color: '#2563EB',
          fillColor: i === 0 ? '#1d4ed8' : '#ffffff',
          fillOpacity: 1,
          weight: 2,
        }).addTo(drawLayerRef.current);
      });

      // Draw lines
      if (pts.length >= 2) {
        const latLngs = pts.map((p) => [p.lat, p.lng]);
        // Closing dash back to first point
        const closingLine = [...latLngs, [pts[0].lat, pts[0].lng]];
        L.polyline(closingLine, {
          color: '#2563EB', weight: 2, dashArray: '8 4', opacity: 0.6,
        }).addTo(drawLayerRef.current);
      }

      // Preview fill if >= 3 points
      if (pts.length >= 3) {
        L.polygon(pts.map((p) => [p.lat, p.lng]), {
          color: '#2563EB', fillColor: '#3B82F6', fillOpacity: 0.15, weight: 2.5, dashArray: null,
        }).addTo(drawLayerRef.current);
      }
    }

    function onClick(e) {
      drawPtsRef.current = [...drawPtsRef.current, { lng: e.latlng.lng, lat: e.latlng.lat }];
      setDrawCount(drawPtsRef.current.length);
      renderDrawPreview();
    }

    if (drawing) {
      // Refresh tile layout in case the map column was resized while idle —
      // otherwise the first draw can land on a mis-sized/blank canvas.
      map.invalidateSize({ animate: false });
      map.getContainer().style.cursor = 'crosshair';
      map.on('click', onClick);
      mapRef.current._finishDraw = finishDrawCallback;
    }

    return () => {
      map.off('click', onClick);
      map.getContainer().style.cursor = '';
    };
  }, [drawing, mapReady, finishDrawCallback]);

  function startDraw() {
    drawPtsRef.current = [];
    setDrawCount(0);
    setSelectedId(null);
    setDrawing(true);
  }
  function cancelDraw() {
    drawPtsRef.current = [];
    setDrawCount(0);
    setDrawing(false);
    drawLayerRef.current?.clearLayers();
    if (mapRef.current) mapRef.current.getContainer().style.cursor = '';
  }
  function completeDraw() {
    if (mapRef.current?._finishDraw) mapRef.current._finishDraw();
  }
  function resetView() {
    mapRef.current?.setView(INDIA_CENTER, INDIA_ZOOM, { animate: true });
    setSelectedId(null);
  }
  function zoomIn() { mapRef.current?.zoomIn(); }
  function zoomOut() { mapRef.current?.zoomOut(); }

  function afterSaved() {
    setDrawer(null);
    cancelDraw();
    refetch();
  }

  async function handleDelete(z) {
    if (!window.confirm(`Delete zone "${z.name}"? This cannot be undone.`)) return;
    try {
      await deleteZone(z._id).unwrap();
      toast.success('Zone deleted');
      if (selectedId === z._id) setSelectedId(null);
      refetch();
    } catch (e) { toast.error(e.data?.error || 'Delete failed'); }
  }

  if (isLoading) return <PageLoader />;

  const activeCount = zones.filter(z => z.status === 'active').length;
  const comingSoonCount = zones.filter(z => z.status === 'coming_soon').length;

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Zones &amp; Geofences</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-500">{zones.length} total zones</span>
            {activeCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeCount} live
              </span>
            )}
            {comingSoonCount > 0 && (
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {comingSoonCount} coming soon
              </span>
            )}
          </div>
        </div>
        <button
          onClick={startDraw}
          disabled={drawing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm shadow-blue-200"
        >
          <Plus size={15} />
          Add Zone
        </button>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        {/* Left: zone list */}
        <div className="lg:col-span-2 space-y-2">
          {zones.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                <MapPin size={22} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No zones yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Zone" to draw your first geofence on the map</p>
            </div>
          ) : (
            zones.map((z) => {
              const isSelected = selectedId === z._id;
              return (
                <motion.button
                  key={z._id}
                  onClick={() => setSelectedId(isSelected ? null : z._id)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full text-left bg-white rounded-xl border p-3.5 transition-all ${isSelected ? 'border-blue-300 ring-2 ring-blue-100 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: `rgba(${hexToRgb(z.color || '#3B82F6')}, 0.12)` }}>
                        <Pentagon size={14} style={{ color: z.color || '#3B82F6' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate text-sm">{z.name}</p>
                        <p className="text-xs text-slate-400 truncate">{z.city}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${STATUS_BADGE[z.status]}`}>
                      {STATUS_LABEL[z.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-slate-50">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <TrendingUp size={11} className="text-slate-400" />
                      <span>Surge: <span className="font-semibold text-slate-700">{z.surgeMultiplierOverride ? `${z.surgeMultiplierOverride}×` : 'global'}</span></span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Price: <span className="font-semibold text-slate-700">{z.pricingMultiplier}×</span>
                    </div>
                    {z.disabledServices?.length > 0 && (
                      <div className="ml-auto flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle size={11} />
                        {z.disabledServices.length} blocked
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })
          )}
        </div>

        {/* Right: map */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm" style={{ overflow: 'visible' }}>
            {/* Map toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60 rounded-t-2xl">
              <div className="flex items-center gap-1">
                {Object.entries(TILE_LAYERS).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setActiveStyle(key)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition ${activeStyle === key ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={zoomIn} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 transition">
                  <ZoomIn size={14} />
                </button>
                <button onClick={zoomOut} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 transition">
                  <ZoomOut size={14} />
                </button>
                <button onClick={resetView} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 transition" title="Reset view">
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>

            {/* Map container — overflow:hidden here only, not on the outer card */}
            <div className="relative rounded-b-2xl overflow-hidden" style={{ height: '460px' }}>
              <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

              {/* Drawing mode banner — full-width wrapper keeps it inside the map
                  and lets the content wrap instead of overflowing/clipping. */}
              <AnimatePresence>
                {drawing && (
                  <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    className="absolute top-3 inset-x-3 z-[1000] flex justify-center pointer-events-none"
                  >
                    <div className="pointer-events-auto bg-blue-600/95 backdrop-blur-sm text-white rounded-2xl shadow-xl px-3.5 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 max-w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                          <MousePointer size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-none">Draw Mode</p>
                          <p className="text-[11px] text-blue-100 mt-0.5 whitespace-nowrap">
                            {drawCount === 0
                              ? 'Tap the map to add corner points'
                              : `${drawCount} point${drawCount > 1 ? 's' : ''} · ${drawCount >= 3 ? 'ready to complete' : 'need 3+'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={completeDraw}
                          disabled={drawCount < 3}
                          className="flex items-center gap-1.5 bg-white text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-3 py-1.5 text-xs font-bold transition hover:bg-blue-50"
                        >
                          <Check size={12} /> Complete
                        </button>
                        <button
                          onClick={cancelDraw}
                          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-xl px-3 py-1.5 text-xs font-bold transition"
                        >
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Empty state hint (when no zones and not drawing) */}
              {!drawing && zones.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
                  <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-4 text-center shadow-lg border border-slate-200">
                    <Layers size={24} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-500">No geofences drawn</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click "Add Zone" to draw your first boundary</p>
                  </div>
                </div>
              )}
            </div>

            {/* Selected zone actions */}
            <AnimatePresence>
              {selected && !drawing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <ZoneStats zoneId={selected._id} />
                  <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-white">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selected.color || '#3B82F6' }} />
                      <span className="text-sm font-bold text-slate-800 truncate">{selected.name}</span>
                      <span className="text-xs text-slate-400">{selected.city}</span>
                    </div>
                    <button
                      onClick={() => setDrawer({ initial: selected, coordinates: null })}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(selected)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Zone form drawer */}
      <AnimatePresence>
        {drawer && (
          <ZoneDrawer
            initial={drawer.initial}
            coordinates={drawer.coordinates}
            onClose={() => { setDrawer(null); cancelDraw(); }}
            onSaved={afterSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
