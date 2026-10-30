import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Flame, IndianRupee, XCircle, SearchX, Users } from 'lucide-react';
import { useAdminInsightsGeoQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, Findings, Panel, rupees, count } from './charts';

/**
 * Map: where the business happens, from real bookings, searches and
 * providers. Five layers on one dark map (demand, earnings, cancellations,
 * not served, providers), a service filter, when bookings come in, the
 * busiest areas and where to recruit next. Points are about 1 km cells and
 * job pins are rounded to about 100 m, so no one's door is on this map.
 */
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
mapboxgl.accessToken = TOKEN;
const HYDERABAD = [78.45, 17.4];

const LAYERS = [
  { id: 'demand', label: 'Demand', Icon: Flame, note: 'Bookings and searches: brighter is busier' },
  { id: 'earnings', label: 'Earnings', Icon: IndianRupee, note: 'What we earned per area: bigger is more' },
  { id: 'cancel', label: 'Cancellations', Icon: XCircle, note: 'Share of bookings cancelled: red is worse' },
  { id: 'unserved', label: 'Not served', Icon: SearchX, note: 'Searches we could not serve: where to expand' },
  { id: 'providers', label: 'Providers', Icon: Users, note: 'Shop service areas, and workers online now' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toGeo(points, props) {
  return { type: 'FeatureCollection', features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: props(p) })) };
}

function TheMap({ data, layer }) {
  const box = useRef(null);
  const map = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!box.current || map.current || !TOKEN) return undefined;
    const m = new mapboxgl.Map({ container: box.current, style: 'mapbox://styles/mapbox/dark-v11', center: HYDERABAD, zoom: 10, attributionControl: false });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    m.on('load', () => { map.current = m; setReady(true); });
    return () => { m.remove(); map.current = null; };
  }, []);

  // Data sources, refreshed when the data changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const cells = toGeo(data.cells, (c) => ({
      area: c.area || '', bookings: c.bookings, completed: c.completed, cancelled: c.cancelled, take: Math.round(c.takePaise / 100),
      searches: c.searches, unserved: c.unserved, cancelRate: c.bookings ? c.cancelled / c.bookings : 0, demand: c.bookings + c.searches * 0.5,
    }));
    const providers = toGeo(data.providers, (p) => ({ kind: p.kind, live: p.live ? 1 : 0, radiusM: (p.radiusKm || 0) * 1000, lat: p.lat }));
    if (m.getSource('cells')) m.getSource('cells').setData(cells); else m.addSource('cells', { type: 'geojson', data: cells });
    if (m.getSource('providers')) m.getSource('providers').setData(providers); else m.addSource('providers', { type: 'geojson', data: providers });

    // Frame what there is to see.
    const pts = [...data.cells, ...data.providers];
    if (pts.length) {
      const b = new mapboxgl.LngLatBounds();
      pts.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 12.5, duration: 600 });
    }
  }, [ready, data]);

  // The chosen layer.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !m.getSource('cells')) return undefined;
    const ids = ['heat', 'dots', 'areas', 'live'];
    ids.forEach((id) => m.getLayer(id) && m.removeLayer(id));

    if (layer === 'demand' || layer === 'unserved') {
      const weight = layer === 'demand' ? 'demand' : 'unserved';
      const colors = layer === 'demand'
        ? ['rgba(31,79,216,0)', '#1F4FD8', '#22D3EE', '#FDE047', '#F97316']
        : ['rgba(225,29,72,0)', '#9F1239', '#E11D48', '#FB7185', '#FECDD3'];
      m.addLayer({
        id: 'heat', type: 'heatmap', source: 'cells', filter: ['>', ['get', weight], 0],
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', weight], 0, 0, 10, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 18, 14, 48],
          'heatmap-opacity': 0.9,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, colors[0], 0.2, colors[1], 0.45, colors[2], 0.7, colors[3], 1, colors[4]],
        },
      });
      m.addLayer({
        id: 'dots', type: 'circle', source: 'cells', minzoom: 12, filter: ['>', ['get', weight], 0],
        paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-opacity': 0.75 },
      });
    }
    if (layer === 'earnings') {
      m.addLayer({
        id: 'dots', type: 'circle', source: 'cells', filter: ['>', ['get', 'take'], 0],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'take']], 0, 6, 30, 16, 100, 34],
          'circle-color': '#10B981', 'circle-opacity': 0.55, 'circle-stroke-color': '#6EE7B7', 'circle-stroke-width': 1.5,
        },
      });
    }
    if (layer === 'cancel') {
      m.addLayer({
        id: 'dots', type: 'circle', source: 'cells', filter: ['>', ['get', 'bookings'], 0],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'bookings'], 1, 7, 20, 22],
          'circle-color': ['interpolate', ['linear'], ['get', 'cancelRate'], 0, '#10B981', 0.25, '#F59E0B', 0.5, '#E11D48'],
          'circle-opacity': 0.7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1,
        },
      });
    }
    if (layer === 'providers') {
      // Service areas drawn to scale: metres to pixels at this latitude and zoom.
      const px = ['/', ['get', 'radiusM'], ['*', 156543.03392, ['/', ['cos', ['/', ['*', ['get', 'lat'], 3.14159265], 180]], ['^', 2, ['zoom']]]]];
      m.addLayer({
        id: 'areas', type: 'circle', source: 'providers', filter: ['==', ['get', 'live'], 0],
        paint: { 'circle-radius': px, 'circle-color': '#1F4FD8', 'circle-opacity': 0.12, 'circle-stroke-color': '#60A5FA', 'circle-stroke-width': 1 },
      });
      m.addLayer({
        id: 'live', type: 'circle', source: 'providers', filter: ['==', ['get', 'live'], 1],
        paint: { 'circle-radius': 6, 'circle-color': '#22C55E', 'circle-stroke-color': '#BBF7D0', 'circle-stroke-width': 2 },
      });
      m.addLayer({
        id: 'dots', type: 'circle', source: 'cells', filter: ['>', ['get', 'unserved'], 0],
        paint: { 'circle-radius': 5, 'circle-color': '#E11D48', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 },
      });
    }

    // Click a spot for its numbers.
    const popup = new mapboxgl.Popup({ closeButton: false, offset: 10, className: 'insights-pop' });
    const show = (e) => {
      const f = e.features?.[0]?.properties;
      if (!f) return;
      const rate = f.bookings ? Math.round((f.cancelled / f.bookings) * 100) : 0;
      popup.setLngLat(e.lngLat).setHTML(
        `<div style="font:12px/1.5 Figtree,system-ui;color:#0F172A;min-width:150px">
          <b style="font-size:13px">${f.area || 'This area'}</b><br/>
          ${f.bookings} bookings, ${f.completed} done<br/>
          ₹${Number(f.take).toLocaleString('en-IN')} earned, ${rate}% cancelled<br/>
          ${f.searches} searching, ${f.unserved} not served
        </div>`,
      ).addTo(m);
    };
    const target = m.getLayer('dots') ? 'dots' : null;
    if (target) {
      m.on('click', target, show);
      m.on('mouseenter', target, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', target, () => { m.getCanvas().style.cursor = ''; });
    }
    return () => { if (target) m.off('click', target, show); popup.remove(); };
  }, [ready, layer, data]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" style={{ height: 520 }}>
      <div ref={box} className="h-full w-full" />
      {!TOKEN && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">The map needs VITE_MAPBOX_TOKEN in the admin app's settings.</div>}
      {!data.cells.length && !data.providers.length && TOKEN && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-slate-900/80 px-3 py-1.5 text-[12px] text-slate-300">No located bookings or searches in this period yet</div>
      )}
    </div>
  );
}

/** Day of week × hour, India time: darker is busier. */
function WhenGrid({ when }) {
  const max = Math.max(1, ...when.flat());
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="min-w-[640px] border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="text-[10px] font-medium text-slate-400">{h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {when.map((hours, d) => (
            <tr key={DAYS[d]}>
              <td className="pr-2 text-[11px] font-medium text-slate-500">{DAYS[d]}</td>
              {hours.map((n, h) => (
                <td key={h} title={`${DAYS[d]} ${h}:00, ${n} bookings`} className="h-5 w-5 rounded"
                  style={{ background: n ? `rgba(31,79,216,${0.12 + (n / max) * 0.88})` : '#F1F5F9' }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MapView({ days }) {
  const span = days === 1 ? 30 : days;
  const [layer, setLayer] = useState('demand');
  const [service, setService] = useState('');
  const { data, isLoading, isError, refetch, isFetching } = useAdminInsightsGeoQuery({ days: span, service: service || undefined }, { pollingInterval: 120000 });
  const current = LAYERS.find((l) => l.id === layer);
  const services = useMemo(() => data?.services || [], [data]);

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">The map did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }
  const t = data.totals;

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">The map is shown for the last 30 days.</p>}
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Bookings on the map" value={count(t.mapped)} hint={t.bookings > t.mapped ? `${count(t.bookings - t.mapped)} had no location` : 'Every booking located'} />
        <Kpi label="People searching" value={count(t.searches)} hint="With a location" />
        <Kpi label="Providers" value={count(t.providers)} hint={`${count(t.online)} workers online now`} accent="#10B981" />
        <Kpi label="Areas active" value={count(data.areas.length)} hint="About 1 km each" />
      </div>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Map layer">
            {LAYERS.map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => setLayer(id)} aria-pressed={layer === id}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${layer === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Service"
            className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All services</option>
            {services.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </div>
        <p className="mb-2 px-1 text-[12px] text-slate-500">{current.note}{isFetching ? ', updating…' : ''}</p>
        <TheMap data={data} layer={layer} />
      </section>

      <Panel title="When bookings come in" note="Day of week × hour, India time">
        <WhenGrid when={data.when} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Busiest areas" note="Bookings and searches" className="lg:col-span-3">
          {data.areas.length ? (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-1 pb-2">Area</th><th className="px-1 pb-2 text-right">Bookings</th><th className="px-1 pb-2 text-right">Searching</th>
                    <th className="px-1 pb-2 text-right">Cancelled</th><th className="px-1 pb-2 text-right">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.areas.map((a) => {
                    const rate = a.bookings ? Math.round((a.cancelled / a.bookings) * 100) : null;
                    return (
                      <tr key={a.area}>
                        <td className="px-1 py-2.5 font-medium text-slate-800">{a.area}</td>
                        <td className="px-1 py-2.5 text-right tabular-nums font-semibold text-slate-900">{count(a.bookings)}</td>
                        <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">{count(a.searches)}</td>
                        <td className={`px-1 py-2.5 text-right tabular-nums ${rate >= 30 ? 'font-semibold text-rose-600' : 'text-slate-700'}`}>{rate == null ? '—' : `${rate}%`}</td>
                        <td className="px-1 py-2.5 text-right tabular-nums text-emerald-700">{rupees(a.takePaise)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="py-6 text-center text-sm text-slate-400">No located activity yet</p>}
        </Panel>
        <Panel title="Where to expand" note="Demand with no provider near, or not served" className="lg:col-span-2">
          {data.expand.length ? (
            <ol className="space-y-3">
              {data.expand.map((a, i) => (
                <li key={a.area} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[12px] font-bold text-rose-600">{i + 1}</span>
                  <span className="min-w-0 text-[13px]">
                    <span className="block font-medium text-slate-800">{a.area}</span>
                    <span className="block text-[11.5px] text-slate-500">{count(a.unserved)} not served, {count(a.uncovered)} outside every provider's reach</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="py-6 text-center text-sm text-slate-400">Every search and booking had a provider in reach</p>}
        </Panel>
      </div>
    </div>
  );
}
