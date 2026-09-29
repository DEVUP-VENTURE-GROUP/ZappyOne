import { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';
import { ziHeatmap } from './zi-api';

const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'pune', 'chennai'];
const LAYERS = [
  { id: 'demand', label: 'Demand', desc: 'Order density by zone', palette: ['#fef3c7', '#fcd34d', '#f97316', '#dc2626'] },
  { id: 'revenue', label: 'Revenue', desc: 'Revenue concentration', palette: ['#d1fae5', '#6ee7b7', '#10b981', '#059669'] },
  { id: 'workers', label: 'Workers', desc: 'Worker density', palette: ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'] },
  { id: 'gap', label: 'Supply Gap', desc: 'Demand vs supply gap', palette: ['#dc2626', '#f97316', '#eab308', '#22c55e'] },
  { id: 'complaints', label: 'Complaints', desc: 'Low-rated order clusters', palette: ['#fef3c7', '#fbbf24', '#f59e0b', '#d97706'] },
];

function interpolateColor(palette, intensity) {
  if (intensity <= 0) return palette[0];
  if (intensity >= 1) return palette[palette.length - 1];
  const i = intensity * (palette.length - 1);
  const lower = Math.floor(i);
  const upper = Math.ceil(i);
  const t = i - lower;
  const c1 = palette[lower];
  const c2 = palette[upper];
  // Simple hex interpolation
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

function HeatGrid({ data, palette, rows = 20, cols = 20 }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) {
    // Generate placeholder grid
    const grid = Array.from({ length: rows * cols }, (_, i) => ({ id: i, intensity: Math.random() }));
    return (
      <div className="relative">
        <div className="text-center text-slate-500 text-xs mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg py-1.5">
          Demo grid — connect to live data
        </div>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {grid.map((cell) => (
            <div
              key={cell.id}
              className="aspect-square rounded-sm cursor-pointer hover:opacity-100 hover:ring-1 hover:ring-white/30 transition-all"
              style={{ backgroundColor: interpolateColor(palette, cell.intensity), opacity: 0.7 + cell.intensity * 0.3 }}
            />
          ))}
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.intensity || d.orderCount || d.workerCount || d.revenuePaise || 0));

  return (
    <div className="relative">
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {data.slice(0, rows * cols).map((cell, i) => {
          const val = cell.intensity ?? ((cell.orderCount || cell.workerCount || cell.revenuePaise || 0) / (maxVal || 1));
          return (
            <div
              key={i}
              onMouseEnter={() => setTooltip({ ...cell, i })}
              onMouseLeave={() => setTooltip(null)}
              className="aspect-square rounded-sm cursor-pointer hover:opacity-100 hover:ring-1 hover:ring-white/40 transition-all"
              style={{ backgroundColor: interpolateColor(palette, val), opacity: 0.6 + val * 0.4 }}
            />
          );
        })}
      </div>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white whitespace-nowrap z-10 pointer-events-none">
          <div>Zone {tooltip.i + 1}</div>
          {tooltip.orderCount != null && <div>Orders: {tooltip.orderCount}</div>}
          {tooltip.workerCount != null && <div>Workers: {tooltip.workerCount}</div>}
          {tooltip.revenuePaise != null && <div>Revenue: ₹{Math.round(tooltip.revenuePaise / 100).toLocaleString()}</div>}
          {tooltip.gap != null && <div>Gap: {tooltip.gap > 0 ? '+' : ''}{tooltip.gap?.toFixed(2)}</div>}
          <div>Intensity: {((tooltip.intensity || 0) * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}

export default function ZIHeatmaps() {
  const [city, setCity] = useState('hyderabad');
  const [activeLayer, setActiveLayer] = useState('demand');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const layer = LAYERS.find(l => l.id === activeLayer);

  const load = async () => {
    setLoading(true);
    setData([]);
    setStats(null);
    try {
      let r;
      const now = new Date();
      const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      if (activeLayer === 'demand') r = await ziHeatmap.getDemand(city, week.toISOString(), now.toISOString());
      else if (activeLayer === 'revenue') r = await ziHeatmap.getRevenue(city, '7d');
      else if (activeLayer === 'workers') r = await ziHeatmap.getWorkers(city);
      else if (activeLayer === 'gap') r = await ziHeatmap.getGap(city);
      else if (activeLayer === 'complaints') r = await ziHeatmap.getComplaints(city, 30);

      setData(r?.data?.cells || []);
      setStats(r?.data || null);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [city, activeLayer]);

  const topZones = [...data].sort((a, b) => (b.intensity || 0) - (a.intensity || 0)).slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Geospatial Heatmaps</h1>
        <p className="text-slate-400 text-sm mt-0.5">Zone-level demand, supply, and complaint mapping</p>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <select value={city} onChange={e => setCity(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
          {CITIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Layer Selector */}
      <div className="flex gap-2 flex-wrap">
        {LAYERS.map(l => (
          <button
            key={l.id}
            onClick={() => setActiveLayer(l.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              activeLayer === l.id
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap */}
        <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">{layer?.label} — {city.charAt(0).toUpperCase() + city.slice(1)}</h3>
              <p className="text-slate-400 text-xs mt-0.5">{layer?.desc}</p>
            </div>
            {loading && (
              <div className="text-slate-400 text-xs animate-pulse">Loading...</div>
            )}
          </div>

          <HeatGrid data={data} palette={layer?.palette || []} />

          {/* Legend */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-slate-500 text-xs">Low</span>
            <div className="flex-1 h-3 rounded-full" style={{
              background: `linear-gradient(to right, ${(layer?.palette || []).join(', ')})`
            }} />
            <span className="text-slate-500 text-xs">High</span>
          </div>
        </div>

        {/* Stats Panel */}
        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-slate-300 text-sm font-semibold mb-3">Zone Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Zones</span>
                <span className="text-white font-medium">{data.length || 400}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">High Activity Zones</span>
                <span className="text-white font-medium">{data.filter(d => (d.intensity || 0) > 0.7).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Low Activity Zones</span>
                <span className="text-white font-medium">{data.filter(d => (d.intensity || 0) < 0.2).length}</span>
              </div>
              {activeLayer === 'gap' && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Undersupplied</span>
                  <span className="text-red-400 font-medium">{data.filter(d => (d.gap || 0) < -0.3).length}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-slate-300 text-sm font-semibold mb-3">Top 5 Zones</h4>
            {topZones.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">Calculating...</p>
            ) : (
              <div className="space-y-2">
                {topZones.map((z, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs w-4">{i + 1}</span>
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(z.intensity || 0) * 100}%`, backgroundColor: (layer?.palette || [])[3] || '#6366f1' }} />
                    </div>
                    <span className="text-slate-300 text-xs">{((z.intensity || 0) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-slate-300 text-sm font-semibold mb-3">Action Items</h4>
            <div className="space-y-2">
              {activeLayer === 'gap' && <div className="text-amber-300 text-xs bg-amber-500/10 rounded-lg p-2">Deploy more workers to red zones</div>}
              {activeLayer === 'demand' && <div className="text-blue-300 text-xs bg-blue-500/10 rounded-lg p-2">Boost supply in top-3 demand clusters</div>}
              {activeLayer === 'complaints' && <div className="text-red-300 text-xs bg-red-500/10 rounded-lg p-2">Review worker assignments in hotspot zones</div>}
              {activeLayer === 'workers' && <div className="text-emerald-300 text-xs bg-emerald-500/10 rounded-lg p-2">Optimize worker distribution across zones</div>}
              {activeLayer === 'revenue' && <div className="text-violet-300 text-xs bg-violet-500/10 rounded-lg p-2">Target premium services in high-revenue zones</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
