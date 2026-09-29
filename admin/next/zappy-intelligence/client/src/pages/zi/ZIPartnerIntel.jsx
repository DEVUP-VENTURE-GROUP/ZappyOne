import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Handshake, TrendingDown, AlertTriangle, Star } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { ziPartner } from './zi-api';

const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'pune'];
const SCORE_COLOR = (s) => s >= 70 ? '#22c55e' : s >= 50 ? '#eab308' : '#ef4444';
const CHURN_COLOR = (p) => p >= 0.7 ? 'text-red-400' : p >= 0.4 ? 'text-amber-400' : 'text-emerald-400';
const CHURN_BG = (p) => p >= 0.7 ? 'bg-red-500/20 text-red-300 border border-red-500/30' : p >= 0.4 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

function fmt(paise) { return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`; }

function ScoreBar({ label, value }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold" style={{ color: SCORE_COLOR(value) }}>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: SCORE_COLOR(value) }} />
      </div>
    </div>
  );
}

export default function ZIPartnerIntel() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [city, setCity] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const r = await ziPartner.getAll({ cityId: city || undefined, page, limit: 20 });
      setPartners(r.data || []);
      setTotal(r.total || 0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [city, page]);

  const openPartner = async (p) => {
    setSelected(p);
    setInsights([]);
    setInsightsLoading(true);
    try {
      const r = await ziPartner.getInsights(p.partnerId);
      setInsights(r.data || []);
    } catch {}
    setInsightsLoading(false);
  };

  const kpis = {
    total: partners.length,
    avgScore: partners.length ? Math.round(partners.reduce((s, p) => s + (p.scores?.compositeScore || 0), 0) / partners.length) : 0,
    highChurn: partners.filter(p => (p.riskFlags?.churnProbability || 0) >= 0.7).length,
    excellent: partners.filter(p => (p.scores?.compositeScore || 0) >= 80).length,
  };

  const radarData = selected?.scores ? [
    { subject: 'Revenue', value: selected.scores.revenueScore || 0 },
    { subject: 'Quality', value: selected.scores.qualityScore || 0 },
    { subject: 'Acceptance', value: selected.scores.acceptanceScore || 0 },
    { subject: 'Completion', value: selected.scores.completionScore || 0 },
    { subject: 'Response', value: selected.scores.responseScore || 0 },
    { subject: 'Loyalty', value: selected.scores.loyaltyScore || 0 },
  ] : [];

  const distData = [
    { range: '0-20', count: partners.filter(p => (p.scores?.compositeScore || 0) < 20).length },
    { range: '20-40', count: partners.filter(p => (p.scores?.compositeScore || 0) >= 20 && (p.scores?.compositeScore || 0) < 40).length },
    { range: '40-60', count: partners.filter(p => (p.scores?.compositeScore || 0) >= 40 && (p.scores?.compositeScore || 0) < 60).length },
    { range: '60-80', count: partners.filter(p => (p.scores?.compositeScore || 0) >= 60 && (p.scores?.compositeScore || 0) < 80).length },
    { range: '80-100', count: partners.filter(p => (p.scores?.compositeScore || 0) >= 80).length },
  ];

  const scatterData = partners.map(p => ({
    x: p.scores?.revenueScore || 0,
    y: (p.riskFlags?.churnProbability || 0) * 100,
    name: p.partnerName,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Partner Intelligence</h1>
          <p className="text-slate-400 text-sm mt-0.5">Scoring, churn prediction, and actionable insights</p>
        </div>
        <select value={city} onChange={e => { setCity(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
          <option value="">All Cities</option>
          {CITIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Partners', value: total || kpis.total },
          { label: 'Avg Score', value: `${kpis.avgScore}/100`, color: 'text-indigo-400' },
          { label: 'High Churn Risk', value: kpis.highChurn, color: 'text-red-400' },
          { label: 'Excellent (80+)', value: kpis.excellent, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className={`text-2xl font-black mt-1 ${color || 'text-white'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Partner Table */}
        <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-3 px-4 py-2.5 bg-slate-800/80 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span className="col-span-2">Partner</span>
            <span>Score</span>
            <span>Revenue 30d</span>
            <span>Churn Risk</span>
          </div>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="animate-pulse border-b border-slate-800 h-12" />)
            : partners.map((p) => (
                <button
                  key={p.partnerId}
                  onClick={() => openPartner(p)}
                  className="w-full grid grid-cols-5 gap-3 px-4 py-3 border-b border-slate-700/50 text-left hover:bg-slate-700/30 transition-colors text-sm"
                >
                  <div className="col-span-2">
                    <div className="text-white font-medium">{p.partnerName || p.partnerId}</div>
                    <div className="text-slate-400 text-xs">{p.cityId} · {p.category}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{ color: SCORE_COLOR(p.scores?.compositeScore || 0) }}>
                      {Math.round(p.scores?.compositeScore || 0)}
                    </span>
                    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.scores?.compositeScore || 0}%`, backgroundColor: SCORE_COLOR(p.scores?.compositeScore || 0) }} />
                    </div>
                  </div>
                  <div className="text-slate-300 text-xs">{fmt(p.financials?.gmv30dPaise)}</div>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CHURN_BG(p.riskFlags?.churnProbability || 0)}`}>
                      {Math.round((p.riskFlags?.churnProbability || 0) * 100)}%
                    </span>
                  </div>
                </button>
              ))
          }
        </div>

        {/* Charts */}
        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-slate-300 text-sm font-semibold mb-3">Score Distribution</h4>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={distData}>
                <XAxis dataKey="range" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distData.map((_, i) => <Cell key={i} fill={['#ef4444', '#f97316', '#eab308', '#22c55e', '#6366f1'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-slate-300 text-sm font-semibold mb-1">Churn Risk Matrix</h4>
            <p className="text-slate-500 text-xs mb-3">Revenue Score vs Churn Probability</p>
            <ResponsiveContainer width="100%" height={160}>
              <ScatterChart>
                <XAxis dataKey="x" name="Revenue Score" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} label={{ value: 'Revenue', position: 'bottom', fill: '#64748b', fontSize: 10 }} />
                <YAxis dataKey="y" name="Churn Risk" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} label={{ value: 'Churn%', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} formatter={(v, n, p) => [v.toFixed(1), n]} />
                <Scatter data={scatterData} fill="#6366f1" opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Partner Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
            onClick={() => setSelected(null)}>
            <motion.div initial={{ x: 440 }} animate={{ x: 0 }} exit={{ x: 440 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-[440px] h-full bg-slate-950 border-l border-slate-800 overflow-y-auto">
              <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold">{selected.partnerName || selected.partnerId}</h3>
                  <p className="text-slate-400 text-sm">{selected.cityId} · {selected.category}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-5">
                {/* Composite score */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-4xl font-black" style={{ color: SCORE_COLOR(selected.scores?.compositeScore || 0) }}>
                      {Math.round(selected.scores?.compositeScore || 0)}
                    </div>
                    <div className="text-slate-400 text-xs">Composite Score</div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <ScoreBar label="Revenue" value={selected.scores?.revenueScore || 0} />
                    <ScoreBar label="Quality" value={selected.scores?.qualityScore || 0} />
                    <ScoreBar label="Acceptance" value={selected.scores?.acceptanceScore || 0} />
                  </div>
                </div>

                {/* Radar chart */}
                {radarData.length > 0 && (
                  <div className="bg-slate-800/60 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} />
                        <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Financials */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">GMV 30d</div>
                    <div className="text-white font-bold mt-1">{fmt(selected.financials?.gmv30dPaise)}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Avg Order</div>
                    <div className="text-white font-bold mt-1">{fmt(selected.financials?.avgOrderValuePaise)}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Churn Risk</div>
                    <div className={`font-bold mt-1 ${CHURN_COLOR(selected.riskFlags?.churnProbability || 0)}`}>
                      {Math.round((selected.riskFlags?.churnProbability || 0) * 100)}%
                    </div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Fraud Risk</div>
                    <div className={`font-bold mt-1 ${(selected.riskFlags?.fraudRisk || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {Math.round(selected.riskFlags?.fraudRisk || 0)}/100
                    </div>
                  </div>
                </div>

                {/* Insights */}
                <div>
                  <h4 className="text-slate-300 text-sm font-semibold mb-2">AI Insights</h4>
                  {insightsLoading ? (
                    <div className="animate-pulse bg-slate-800 rounded-xl h-16" />
                  ) : insights.length === 0 ? (
                    <p className="text-slate-500 text-sm">No insights available</p>
                  ) : (
                    <div className="space-y-2">
                      {insights.map((ins, i) => (
                        <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300">{ins}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
