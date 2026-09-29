import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAdminGeoAnalyticsQuery, useAdminDemandPatternsQuery, useAdminLiveOpsQuery, useAdminIntelUnmetDemandQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader } from '../../ui/kit';
import {
  Flame, IndianRupee, XCircle, Users, TrendingUp, Clock,
  Calendar, AlertTriangle, MapPin, ArrowUp, ArrowDown, MapPinOff,
} from 'lucide-react';
import useZoneNames    from '../../hooks/useZoneNames';
import useMapLayers    from '../../hooks/useMapLayers';
import ZoneList        from './components/heatmap/ZoneLeaderboard';
import { HourlyChart, DowChart, ServiceBreakdown } from './components/heatmap/DemandPatterns';
import { SERVICE_FILTER_OPTIONS, SERVICE_COLORS } from '@shared/constants/services';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

const INDIA_CENTER = [78.9629, 20.5937];
const INDIA_ZOOM   = 4.5;
const SERVICES     = SERVICE_FILTER_OPTIONS;
const DAY_OPTIONS  = [7, 14, 30, 60, 90];
const DOW_LABELS   = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const VIEWS = [
  { id: 'demand',  label: 'Demand Heatmap',   Icon: Flame,       color: '#f97316', desc: 'Order density — hottest areas = most bookings' },
  { id: 'revenue', label: 'Revenue Zones',    Icon: IndianRupee, color: '#2563eb', desc: 'Revenue per zone — blue intensity = earnings' },
  { id: 'cancel',  label: 'Cancel Rate',      Icon: XCircle,     color: '#dc2626', desc: 'Cancel rate — red circles = problem zones' },
  { id: 'no_service', label: 'No-Service',    Icon: MapPinOff,   color: '#e11d48', desc: 'Where customers found no coverage — expansion targets' },
  { id: 'workers', label: 'Live Workers',     Icon: Users,       color: '#10b981', desc: 'Live worker positions from GPS' },
];

/* MapView */
function MapView({ cells, workerLocations, noServicePoints, view, isLoading }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    const map = new mapboxgl.Map({ container: containerRef.current, style: 'mapbox://styles/mapbox/dark-v11', center: INDIA_CENTER, zoom: INDIA_ZOOM });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl());
    map.on('load', () => { mapRef.current = map; setReady(true); });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useMapLayers(mapRef, ready ? cells : [], ready ? workerLocations : [], view, ready ? noServicePoints : []);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 500 }}>
      <div ref={containerRef} className="w-full h-full" />
      {isLoading && <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center backdrop-blur-sm"><div className="bg-slate-900/80 text-white text-sm font-semibold px-4 py-2 rounded-lg animate-pulse">Updating map…</div></div>}
      {!MAPBOX_TOKEN && <div className="absolute inset-0 bg-slate-900 flex items-center justify-center"><p className="text-slate-400 text-sm">Add VITE_MAPBOX_TOKEN to .env.local</p></div>}
    </div>
  );
}

/* Main */
export default function Heatmap() {
  const [view, setView]       = useState('demand');
  const [days, setDays]       = useState(30);
  const [service, setService] = useState('all');
  const [tab, setTab]         = useState('zones');

  const { data: geoData, isLoading: geoLoading } = useAdminGeoAnalyticsQuery({ days, service });
  const { data: patData, isLoading: patLoading } = useAdminDemandPatternsQuery({ days, service });
  const { data: liveData }                        = useAdminLiveOpsQuery(undefined, { pollingInterval: 30000 });
  const { data: unmetData } = useAdminIntelUnmetDemandQuery(days, { skip: view !== 'no_service' });

  const rawCells   = geoData?.cells            || [];
  const workerLocs = liveData?.workerLocations || [];
  const noServicePoints = unmetData?.mapPoints || [];
  const topZones   = geoData?.topZones         || {};

  const allNamedZones = useMemo(() => [
    ...(topZones.byDemand  || []),
    ...(topZones.byRevenue || []),
    ...(topZones.byCancel  || []),
  ], [topZones]);

  const nameMap = useZoneNames(allNamedZones);
  const cells   = useMemo(() => rawCells.map(c => ({ ...c, displayName: nameMap[`${c.lat},${c.lng}`] || c.name || null })), [rawCells, nameMap]);

  const currentViewMeta = VIEWS.find(v => v.id === view);
  const totalOrders  = geoData?.totalOrders  || 0;
  const totalRevenue = geoData?.totalRevenue || 0;

  return (
    <div className="space-y-5">
      <SectionHeader title="Geographic Intelligence" subtitle={geoData ? `${totalOrders.toLocaleString('en-IN')} orders · ₹${totalRevenue.toLocaleString('en-IN')} revenue · ${cells.length} zones mapped` : 'Loading…'}>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={service} onChange={e => setService(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 capitalize">
            {SERVICES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Services' : s.replace(/_/g,' ')}</option>)}
          </select>
          <div className="flex gap-1">
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${days===d ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{d}d</button>
            ))}
          </div>
        </div>
      </SectionHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders',  value: totalOrders.toLocaleString('en-IN'),          Icon: MapPin,      color: 'text-blue-600',    bg: 'bg-blue-50'    },
          { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`,   Icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Zones Mapped',  value: cells.length,                                  Icon: TrendingUp,  color: 'text-violet-600',  bg: 'bg-violet-50'  },
          { label: 'Live Workers',  value: liveData?.counts?.onlineWorkers || 0,          Icon: Users,       color: 'text-orange-600',  bg: 'bg-orange-50'  },
        ].map(({ label, value, Icon, color, bg }) => (
          <Card key={label} className="p-3.5 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}><Icon size={16} className={color} /></div>
            <div><p className="text-lg font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p><p className="text-[11px] text-slate-400 font-semibold">{label}</p></div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {VIEWS.map(v => {
          const Icon = v.Icon; const isActive = view === v.id;
          return (
            <button key={v.id} onClick={() => setView(v.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition shadow-sm ${isActive ? 'text-white border-transparent shadow-md' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`} style={isActive ? { backgroundColor: v.color } : {}}>
              <Icon size={13} />{v.label}
              {v.id === 'workers' && liveData?.counts?.onlineWorkers != null && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/25' : 'bg-emerald-50 text-emerald-700'}`}>{liveData.counts.onlineWorkers} live</span>}
            </button>
          );
        })}
        <span className="text-xs text-slate-400 ml-1 hidden sm:inline">{currentViewMeta?.desc}</span>
      </div>

      <MapView cells={cells} workerLocations={workerLocs} noServicePoints={noServicePoints} view={view} isLoading={geoLoading} />

      {view === 'no_service' && (
        <p className="text-xs text-slate-400 px-1">
          {noServicePoints.length > 0
            ? `${noServicePoints.length} no-service hotspots · ${(unmetData?.lostBookings || 0).toLocaleString('en-IN')} lost bookings · ₹${(unmetData?.potentialRevenueLost || 0).toLocaleString('en-IN')} potential revenue lost`
            : 'No "No Service Available" events captured yet in this window.'}
        </p>
      )}

      {view !== 'workers' && view !== 'no_service' && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{view === 'cancel' ? 'Cancel rate' : view === 'revenue' ? 'Revenue' : 'Order volume'}:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Low</span>
            <div className="w-24 h-2.5 rounded-full" style={{ background: view === 'cancel' ? 'linear-gradient(to right,#dcfce7,#fef9c3,#fca5a5,#dc2626)' : view === 'revenue' ? 'linear-gradient(to right,#dbeafe,#93c5fd,#3b82f6,#1e3a8a)' : 'linear-gradient(to right,#fde68a,#f97316,#c2410c,#7c2d12)' }} />
            <span className="text-[10px] text-slate-400">High</span>
          </div>
        </div>
      )}

      <div className="flex gap-0 border-b border-slate-100">
        {[{ id: 'zones', label: 'Top & Worst Zones', Icon: MapPin }, { id: 'patterns', label: 'Demand Patterns', Icon: Clock }, { id: 'services', label: 'Service Breakdown', Icon: TrendingUp }].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${tab===id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {tab === 'zones' && (
        <div className="grid sm:grid-cols-3 gap-4">
          <ZoneList title="Top Demand Zones"   Icon={Flame}          zones={topZones.byDemand}  metric="total"      nameMap={nameMap} iconColor="text-orange-500" />
          <ZoneList title="Top Revenue Zones"  Icon={IndianRupee}    zones={topZones.byRevenue} metric="revenue"    nameMap={nameMap} iconColor="text-blue-500" />
          <ZoneList title="Worst Cancel Zones" Icon={AlertTriangle}  zones={topZones.byCancel}  metric="cancelRate" nameMap={nameMap} iconColor="text-red-500" />
        </div>
      )}

      {tab === 'patterns' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><Clock size={14} className="text-slate-500" />Orders by Hour of Day (IST)</p>
              <p className="text-xs text-slate-400 mb-4">Plan worker shifts for peak demand windows</p>
              {patLoading ? <div className="h-20 bg-slate-50 rounded-lg animate-pulse" /> : <HourlyChart data={patData?.hourly} />}
            </Card>
            <Card className="p-5">
              <p className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><Calendar size={14} className="text-slate-500" />Orders by Day of Week</p>
              <p className="text-xs text-slate-400 mb-4">Weekly demand pattern</p>
              {patLoading ? <div className="h-16 bg-slate-50 rounded-lg animate-pulse" /> : <DowChart data={patData?.byDow} />}
            </Card>
          </div>
          {patData && (
            <Card className="p-5">
              <p className="text-sm font-bold text-slate-700 mb-4">Operations Intelligence</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {[
                  { label: 'Peak Hour (IST)', value: patData.peakHour != null ? `${patData.peakHour}:00` : '—', sub: 'highest demand', Icon: ArrowUp, color: 'text-orange-500' },
                  { label: 'Busiest Day',     value: DOW_LABELS[patData.peakDow] || '—',                        sub: 'most bookings',  Icon: Calendar, color: 'text-violet-500' },
                  { label: 'Total Orders',    value: (patData.byDay?.reduce((s, d) => s + d.orders, 0) || 0).toLocaleString('en-IN'), sub: `in ${days} days`, Icon: TrendingUp, color: 'text-blue-500' },
                  { label: 'Avg Daily',       value: patData.byDay?.length > 0 ? Math.round(patData.byDay.reduce((s, d) => s + d.orders, 0) / patData.byDay.length) : '—', sub: 'orders/day', Icon: ArrowDown, color: 'text-emerald-500' },
                ].map(({ label, value, sub, Icon, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><Icon size={18} className={color} /></div>
                    <div><p className="text-xl font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="text-[10px] text-slate-400">{sub}</p></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-5">
            <p className="text-sm font-bold text-slate-700 mb-4">Service Order Mix & Completion Rate</p>
            {patLoading ? <div className="h-40 bg-slate-50 rounded-lg animate-pulse" /> : <ServiceBreakdown data={patData?.byService || []} />}
          </Card>
          <Card className="p-5">
            <p className="text-sm font-bold text-slate-700 mb-4">Revenue & Avg Fare by Service</p>
            <div className="space-y-2">
              {(patData?.byService || []).map(s => {
                const col = SERVICE_COLORS[s.service] || '#94a3b8';
                return (
                  <div key={s.service} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 gap-3">
                    <div className="flex items-center gap-2 min-w-0"><div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: col }} /><span className="text-xs font-semibold text-slate-700 capitalize truncate">{s.service?.replace(/_/g,' ')}</span></div>
                    <div className="text-right shrink-0"><p className="text-xs font-extrabold text-slate-800">₹{s.revenue?.toLocaleString('en-IN')}</p><p className="text-[10px] text-slate-400">avg ₹{s.avgFare}</p></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
