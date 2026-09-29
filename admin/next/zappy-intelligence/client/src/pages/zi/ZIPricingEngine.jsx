import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { ziPricing } from './zi-api';

const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'pune', 'chennai', 'kolkata'];
const SERVICES = ['phone_repair', 'ac_service', 'plumbing', 'electrical', 'cleaning', 'painting', 'carpentry'];

function fmt(paise) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export default function ZIPricingEngine() {
  const [city, setCity] = useState('hyderabad');
  const [service, setService] = useState('phone_repair');
  const [tab, setTab] = useState('recommendations');

  const [recommendations, setRecommendations] = useState([]);
  const [history, setHistory] = useState([]);
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(false);

  const [simPrice, setSimPrice] = useState('');
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    ziPricing.getRecommendations(city)
      .then(r => setRecommendations(r.data?.recommendations || []))
      .catch(() => setRecommendations([]))
      .finally(() => setLoading(false));
  }, [city]);

  useEffect(() => {
    if (tab !== 'history') return;
    ziPricing.getHistory(service, city, 30)
      .then(r => setHistory(r.data?.history || []))
      .catch(() => setHistory([]));
  }, [tab, service, city]);

  const runSimulation = async () => {
    const paise = Math.round(parseFloat(simPrice) * 100);
    if (!paise) return;
    setSimLoading(true);
    try {
      const r = await ziPricing.simulate(service, paise, city);
      setSimulation(r.data);
    } catch (e) {
      alert(e.message);
    }
    setSimLoading(false);
  };

  const simData = simulation ? [
    { name: 'Current', revenue: simulation.historicalRevenueRupees || 0 },
    { name: 'Projected', revenue: simulation.projectedRevenueRupees || 0 },
  ] : [];

  const heatData = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    surge: 1 + Math.random() * 1.5,
  }));

  const getSurgeColor = (surge) => {
    if (surge >= 1.8) return '#ef4444';
    if (surge >= 1.3) return '#f97316';
    if (surge >= 1.1) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pricing Engine</h1>
        <p className="text-slate-400 text-sm mt-0.5">Dynamic pricing intelligence and optimization</p>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {CITIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select
          value={service}
          onChange={e => setService(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
        >
          {SERVICES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {['recommendations', 'heatmap', 'history', 'simulator'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Recommendations */}
      {tab === 'recommendations' && (
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-slate-800/60 rounded-xl h-16" />
            ))
          ) : recommendations.length === 0 ? (
            <div className="text-slate-500 text-center py-16">No pricing recommendations for {city}</div>
          ) : (
            recommendations.map((rec, i) => {
              const delta = rec.recommendedBase - rec.currentBase;
              const positive = delta > 0;
              return (
                <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-white font-medium capitalize">{rec.service?.replace(/_/g, ' ')}</div>
                    <div className="text-slate-400 text-xs mt-0.5">{rec.reasoning}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">Current</div>
                    <div className="text-white font-bold">{fmt(rec.currentBase || 0)}</div>
                  </div>
                  <ArrowRight size={16} className="text-slate-600" />
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">Recommended</div>
                    <div className={`font-bold ${positive ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(rec.recommendedBase || 0)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs">Impact</div>
                    <div className={`font-bold flex items-center gap-1 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {fmt(Math.abs(rec.expectedRevenueImpact || 0))}/mo
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Heatmap */}
      {tab === 'heatmap' && (
        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4">Surge Multiplier Map — {city.charAt(0).toUpperCase() + city.slice(1)}</h3>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
              {heatData.map((cell) => (
                <div
                  key={cell.id}
                  title={`Zone ${cell.id + 1}: ${cell.surge.toFixed(2)}x surge`}
                  style={{ backgroundColor: getSurgeColor(cell.surge), opacity: 0.7 + Math.random() * 0.3 }}
                  className="aspect-square rounded-sm cursor-pointer hover:opacity-100 transition-opacity"
                />
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
              {[['#22c55e', 'No surge (1x)'], ['#eab308', '1.1x–1.3x'], ['#f97316', '1.3x–1.8x'], ['#ef4444', '>1.8x']].map(([c, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Surge History — {service.replace(/_/g, ' ')} in {city}</h3>
          {history.length === 0 ? (
            <div className="text-slate-500 text-center py-12">No surge history data</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={history.map((e, i) => ({ day: i + 1, surge: e.multiplier || 1 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis domain={[1, 3]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} />
                <Line type="monotone" dataKey="surge" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Revenue Simulator */}
      {tab === 'simulator' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold">Revenue Impact Simulator</h3>
            <div>
              <label className="text-slate-400 text-xs block mb-1.5">Service</label>
              <select value={service} onChange={e => setService(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500">
                {SERVICES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1.5">New Base Price (₹)</label>
              <input
                type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. 599"
                value={simPrice}
                onChange={e => setSimPrice(e.target.value)}
              />
            </div>
            <button
              onClick={runSimulation}
              disabled={simLoading || !simPrice}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              {simLoading ? 'Simulating...' : 'Run Simulation'}
            </button>
          </div>

          {simulation && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
              <h3 className="text-white font-semibold">Simulation Results</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                  <div className="text-slate-400 text-xs">Current Revenue</div>
                  <div className="text-white text-lg font-bold mt-1">₹{(simulation.historicalRevenueRupees || 0).toLocaleString('en-IN')}/mo</div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                  <div className="text-slate-400 text-xs">Projected Revenue</div>
                  <div className={`text-lg font-bold mt-1 ${(simulation.revenueImpactRupees || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ₹{(simulation.projectedRevenueRupees || 0).toLocaleString('en-IN')}/mo
                  </div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                  <div className="text-slate-400 text-xs">Volume Change</div>
                  <div className={`text-lg font-bold mt-1 ${((simulation.projectedOrders || 0) - (simulation.historicalOrders || 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {((simulation.projectedOrders || 0) - (simulation.historicalOrders || 0)) >= 0 ? '+' : ''}{(simulation.projectedOrders || 0) - (simulation.historicalOrders || 0)} orders
                  </div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                  <div className="text-slate-400 text-xs">Revenue Delta</div>
                  <div className={`text-lg font-bold mt-1 ${(simulation.revenueImpactRupees || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(simulation.revenueImpactRupees || 0) >= 0 ? '+' : ''}₹{Math.abs(simulation.revenueImpactRupees || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={simData}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
