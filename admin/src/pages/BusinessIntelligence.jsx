import { useState } from 'react';
import { TrendingDown, TrendingUp, AlertTriangle, Users, MapPin, BarChart2, Loader2, RefreshCw, CheckCircle, XCircle, Search } from 'lucide-react';
import {
  useAdminServicePnLQuery,
  useAdminChurnRiskQuery,
  useAdminDeadCategoriesQuery,
  useAdminQuoteAbandonmentQuery,
  useAdminGeoReadinessQuery,
} from '@shared/services/api';

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm ${className}`}>{children}</div>;
}
function SectionTitle({ icon: Icon, title, subtitle, color = 'text-slate-700' }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-50">
      <div className={`w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0`}>
        <Icon size={15} strokeWidth={2} className={color} />
      </div>
      <div>
        <p className={`text-sm font-bold ${color}`}>{title}</p>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
function Pill({ label, color }) {
  const colors = {
    red:    'bg-red-50 text-red-700 ring-red-100',
    amber:  'bg-amber-50 text-amber-700 ring-amber-100',
    green:  'bg-green-50 text-green-700 ring-green-100',
    slate:  'bg-slate-50 text-slate-600 ring-slate-100',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${colors[color] || colors.slate}`}>{label}</span>;
}

/* Per-service P&L */
function ServicePnL({ days }) {
  const { data, isLoading } = useAdminServicePnLQuery(days);
  const services = data?.services || [];
  const unprofitable = services.filter((s) => s.isUnprofitable || s.isLowMargin);

  return (
    <Card>
      <SectionTitle icon={BarChart2} title="Service P&L" subtitle={`Margin per service — last ${days} days`} color="text-indigo-600" />
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : services.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">No completed orders in this period.</p>
      ) : (
        <>
          {unprofitable.length > 0 && (
            <div className="mx-5 mt-4 p-3 bg-red-50 ring-1 ring-red-100 rounded-xl flex items-start gap-2">
              <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 font-medium">
                {unprofitable.length} service(s) with low or negative margin — review pricing.
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-bold text-slate-400 uppercase border-b border-slate-50">
                  {['Service','Orders','GMV','Revenue','Worker Cost','Margin %'].map((h) => (
                    <th key={h} className="text-left px-5 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {services.slice(0, 20).map((s) => (
                  <tr key={s.service} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium capitalize">{s.service.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-2.5">{s.orders}</td>
                    <td className="px-5 py-2.5">₹{s.gmvRupees.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-2.5 font-bold text-green-700">₹{s.revenueRupees.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-2.5 text-slate-500">₹{s.workerCostRupees.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-2.5">
                      <span className={`font-bold ${s.isUnprofitable ? 'text-red-600' : s.isLowMargin ? 'text-amber-600' : 'text-green-600'}`}>
                        {s.marginPct}%
                      </span>
                      {s.isLowMargin && !s.isUnprofitable && <Pill label="Low" color="amber" />}
                      {s.isUnprofitable && <Pill label="Loss" color="red" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* Worker churn risk */
function ChurnRisk() {
  const { data, isLoading, refetch, isFetching } = useAdminChurnRiskQuery();

  return (
    <Card>
      <div className="flex items-center justify-between pr-5">
        <SectionTitle icon={TrendingDown} title="Worker Churn Risk" subtitle="Low earners, dormant, high cancel rate" color="text-red-600" />
        <button onClick={refetch} className="text-slate-400 hover:text-slate-600">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : (
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { label: 'Low earners (<₹500/wk)', value: data?.lowEarners, color: 'text-red-600' },
              { label: 'Dormant (no job 7d)', value: data?.dormant, color: 'text-amber-600' },
              { label: 'High cancel rate', value: data?.highCancelRate, color: 'text-orange-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className={`text-2xl font-black ${color}`}>{value ?? '—'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          {(data?.details?.lowEarners?.length > 0) && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Low earners this week</p>
              <div className="space-y-1.5">
                {data.details.lowEarners.slice(0, 8).map((w) => (
                  <div key={w.workerId} className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-xl ring-1 ring-red-100">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{w.name || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-400">{w.phone} · {w.jobs} job{w.jobs !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-black text-red-600">₹{w.weeklyRupees}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* Dead categories */
function DeadCategories({ days }) {
  const { data, isLoading } = useAdminDeadCategoriesQuery(days);

  return (
    <Card>
      <SectionTitle icon={XCircle} title="Dead Categories" subtitle={`Active services with 0 orders in ${days} days`} color="text-slate-500" />
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : (
        <div className="px-5 pb-5 pt-3 space-y-3">
          {data?.recommendation && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">{data.recommendation}</p>
          )}
          {data?.dead?.count > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unused ({data.dead.count})</p>
              <div className="flex flex-wrap gap-2">
                {data.dead.services.map((s) => (
                  <span key={s.code} className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600 capitalize">
                    {s.name || s.code.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-xl px-3 py-2">
              <CheckCircle size={13} strokeWidth={2} />
              <p className="text-xs font-medium">All active services received orders in this period.</p>
            </div>
          )}
          {data?.lowUsage?.count > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Low usage (&lt;3 orders)</p>
              <div className="space-y-1">
                {data.lowUsage.services.slice(0, 8).map((s) => (
                  <div key={s.service} className="flex items-center justify-between px-3 py-1.5 bg-amber-50 rounded-lg ring-1 ring-amber-100">
                    <p className="text-xs font-medium text-amber-800 capitalize">{s.service.replace(/_/g, ' ')}</p>
                    <p className="text-xs font-bold text-amber-600">{s.count} order{s.count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* Quote abandonment / price sensitivity */
function QuoteAbandonment({ days }) {
  const { data, isLoading } = useAdminQuoteAbandonmentQuery(days);
  const high = data?.highSensitivity || [];

  return (
    <Card>
      <SectionTitle icon={TrendingDown} title="Price Sensitivity" subtitle="Services with high early-exit rates" color="text-amber-600" />
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : high.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400">No high-sensitivity services detected in this period.</p>
      ) : (
        <div className="px-5 pb-5 pt-3 space-y-2">
          <p className="text-[10px] text-slate-400">{data?.note}</p>
          {high.map((s) => (
            <div key={s.service} className="flex items-center gap-3 px-3 py-2.5 bg-amber-50 rounded-xl ring-1 ring-amber-100">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 capitalize">{s.service.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-slate-400">{s.total} orders · {s.earlyExits} early exits</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-amber-600">{s.exitRatePct}%</p>
                <p className="text-[9px] text-amber-500">exit rate</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* Main page */
export default function BusinessIntelligence() {
  const [days, setDays] = useState(30);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Business Intelligence</h2>
          <p className="text-sm text-slate-500 mt-0.5">P&L, churn risk, dead categories, price sensitivity, and expansion readiness.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <ServicePnL days={days} />

      <div className="grid lg:grid-cols-2 gap-6">
        <ChurnRisk />
        <DeadCategories days={days} />
      </div>

      <QuoteAbandonment days={days} />

      {/* Geo Readiness — manual lookup tool */}
      <GeoReadinessTool />
    </div>
  );
}

/* Geo readiness tool */
function GeoReadinessTool() {
  const [coords, setCoords] = useState({ lat: '', lng: '', radius: 20 });
  const [query, setQuery] = useState(null);
  const [area, setArea] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(null); // { label } | 'not_found' | 'error'
  const { data, isLoading, isFetching } = useAdminGeoReadinessQuery(query, { skip: !query });

  function handleCheck() {
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    if (!lat || !lng) return;
    setQuery({ lat, lng, radiusKm: coords.radius });
  }

  // Forward-geocode a typed area name → coordinates (free OpenStreetMap, no key),
  // auto-fill lat/lng and run the readiness check. No need to know coordinates.
  async function findArea() {
    const q = area.trim();
    if (!q) return;
    setResolving(true); setResolved(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=in&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const arr = await res.json();
      // Prefer a TOWN/CITY point over a district/state polygon centroid — the
      // centroid can sit 15–20km from where demand & workers actually cluster,
      // which would put everything outside the search radius and read as 0.
      const PLACE_TYPES = ['city', 'town', 'village', 'suburb', 'municipality', 'hamlet'];
      const best = arr?.find((r) => PLACE_TYPES.includes(r.type) || PLACE_TYPES.includes(r.addresstype)) || arr?.[0];
      if (best) {
        const lat = Number(best.lat);
        const lng = Number(best.lon);
        setCoords((c) => ({ ...c, lat: String(lat.toFixed(5)), lng: String(lng.toFixed(5)) }));
        const a = best.address || {};
        const label = [a.city || a.town || a.village || a.county || a.state_district, a.state]
          .filter(Boolean).join(', ') || best.display_name?.split(',').slice(0, 2).join(',');
        setResolved({ label });
        setQuery({ lat, lng, radiusKm: coords.radius }); // auto-run readiness
      } else {
        setResolved('not_found');
      }
    } catch { setResolved('error'); }
    setResolving(false);
  }

  return (
    <Card>
      <SectionTitle icon={MapPin} title="City Expansion Readiness" subtitle="Type an area name — or coordinates — to check worker density before launching (#85)" color="text-blue-600" />
      <div className="px-5 pb-5 pt-3 space-y-4">
        {/* Area-name search → resolves to coordinates automatically */}
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Search city / area</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findArea()}
                placeholder="e.g. Vikarabad, Warangal, Karimnagar…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
              />
            </div>
            <button onClick={findArea} disabled={resolving || !area.trim()}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center gap-2">
              {resolving ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Find
            </button>
          </div>
          {resolved && resolved !== 'not_found' && resolved !== 'error' && (
            <p className="text-[11px] text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
              <MapPin size={10} /> {resolved.label} · {coords.lat}, {coords.lng}
            </p>
          )}
          {resolved === 'not_found' && <p className="text-[11px] text-amber-600 font-semibold mt-1.5">No match found — try a nearby city or enter coordinates below.</p>}
          {resolved === 'error' && <p className="text-[11px] text-red-500 font-semibold mt-1.5">Lookup failed — enter coordinates manually below.</p>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Latitude <span className="text-slate-300 normal-case font-medium">(auto)</span></label>
            <input type="number" placeholder="28.6139" value={coords.lat}
              onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Longitude <span className="text-slate-300 normal-case font-medium">(auto)</span></label>
            <input type="number" placeholder="77.2090" value={coords.lng}
              onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Radius (km)</label>
            <input type="number" min="1" max="50" value={coords.radius}
              onChange={(e) => setCoords((c) => ({ ...c, radius: Number(e.target.value) }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
          </div>
        </div>
        <button onClick={handleCheck} disabled={isLoading || isFetching || !coords.lat || !coords.lng}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center gap-2">
          {(isLoading || isFetching) && <Loader2 size={13} className="animate-spin" />}
          Check Readiness
        </button>

        {data && (
          <div className={`rounded-2xl p-4 ring-1 space-y-4 ${data.isReady ? 'bg-green-50 ring-green-100' : 'bg-red-50 ring-red-100'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                {resolved && resolved.label && (
                  <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mb-0.5"><MapPin size={10} />{resolved.label}</p>
                )}
                <p className={`text-sm font-black flex items-center gap-1.5 ${data.isReady ? 'text-green-800' : 'text-red-800'}`}>
                  {data.isReady ? <CheckCircle size={15} /> : <XCircle size={15} />}
                  {data.isReady ? 'Area Ready' : 'Not Ready for Launch'}
                </p>
                <p className="text-xs mt-0.5 text-slate-600">{data.recommendation}</p>
              </div>
              <div className="text-center shrink-0">
                <p className="text-3xl font-black text-slate-800">{data.readinessScore}</p>
                <p className="text-[10px] text-slate-500">/100 score</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Total workers', value: data.totalWorkers },
                { label: 'KYC approved', value: data.approvedWorkers },
                { label: 'Currently online', value: data.onlineWorkers },
                { label: 'Orders (30d)', value: data.recentOrders },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/70 rounded-xl p-2.5 text-center">
                  <p className="text-xl font-black text-slate-800">{value}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {data.coveredSkills?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Skills covered</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.coveredSkills.slice(0, 15).map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-white/80 rounded-lg text-[10px] font-medium text-slate-600 capitalize">
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {data.coveredSkills.length > 15 && (
                    <span className="px-2 py-0.5 bg-white/80 rounded-lg text-[10px] text-slate-400">
                      +{data.coveredSkills.length - 15} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
