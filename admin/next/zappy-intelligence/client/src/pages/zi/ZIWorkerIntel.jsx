import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Trophy, Star, Zap } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ziWorker } from './zi-api';

const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'pune'];
const SCORE_COLOR = (s) => s >= 70 ? '#22c55e' : s >= 50 ? '#eab308' : '#ef4444';
const CHURN_BG = (p) => p >= 0.7 ? 'bg-red-500/20 text-red-300 border border-red-500/30' : p >= 0.4 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

function fmt(paise) { return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`; }
function medal(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`; }

export default function ZIWorkerIntel() {
  const [workers, setWorkers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('table');
  const [lbMetric, setLbMetric] = useState('earnings');
  const [city, setCity] = useState('');
  const [selected, setSelected] = useState(null);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const loadWorkers = async () => {
    setLoading(true);
    try {
      const r = await ziWorker.getAll({ cityId: city || undefined, limit: 30 });
      setWorkers(r.data || []);
      setTotal(r.total || 0);
    } catch {}
    setLoading(false);
  };

  const loadLeaderboard = async () => {
    try {
      const r = await ziWorker.getLeaderboard(city || undefined, lbMetric, 20);
      setLeaderboard(r.data || []);
    } catch {}
  };

  useEffect(() => { loadWorkers(); }, [city]);
  useEffect(() => { if (tab === 'leaderboard') loadLeaderboard(); }, [tab, lbMetric, city]);

  const openWorker = async (w) => {
    setSelected(w);
    setInsights([]);
    setInsightsLoading(true);
    try {
      const wId = w.workerId?._id || w.workerId;
      const r = await ziWorker.getInsights(wId);
      setInsights(r.data || []);
    } catch {}
    setInsightsLoading(false);
  };

  const kpis = {
    total: total || workers.length,
    avgScore: workers.length ? Math.round(workers.reduce((s, w) => s + (w.scores?.compositeScore || 0), 0) / workers.length) : 0,
    burnoutRisk: workers.filter(w => (w.riskFlags?.burnoutRisk || 0) >= 0.7).length,
    topPerformers: workers.filter(w => (w.scores?.compositeScore || 0) >= 80).length,
  };

  const radarData = selected?.scores ? [
    { subject: 'Productivity', value: selected.scores.productivityScore || 0 },
    { subject: 'Earnings', value: selected.scores.earningsScore || 0 },
    { subject: 'Quality', value: selected.scores.qualityScore || 0 },
    { subject: 'Attendance', value: selected.scores.attendanceScore || 0 },
    { subject: 'Training', value: selected.scores.trainingScore || 0 },
  ] : [];

  const workerName = (w) => w.workerId?.name || `Worker ${w.workerId?._id?.toString().slice(-4) || w.workerId?.toString().slice(-4) || '????'}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Worker Intelligence</h1>
          <p className="text-slate-400 text-sm mt-0.5">Performance scoring, burnout detection, training plans</p>
        </div>
        <select value={city} onChange={e => setCity(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
          <option value="">All Cities</option>
          {CITIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Workers', value: kpis.total },
          { label: 'Avg Score', value: `${kpis.avgScore}/100`, color: 'text-indigo-400' },
          { label: 'Burnout Risk', value: kpis.burnoutRisk, color: 'text-red-400' },
          { label: 'Top Performers', value: kpis.topPerformers, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className={`text-2xl font-black mt-1 ${color || 'text-white'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {['table', 'leaderboard'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-white'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      {tab === 'table' && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="grid grid-cols-6 gap-3 px-4 py-2.5 bg-slate-800/80 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span className="col-span-2">Worker</span>
            <span>Score</span>
            <span>Earnings 30d</span>
            <span>Rating</span>
            <span>Churn Risk</span>
          </div>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="animate-pulse border-b border-slate-800 h-12" />)
            : workers.map((w) => (
                <button key={w._id} onClick={() => openWorker(w)}
                  className="w-full grid grid-cols-6 gap-3 px-4 py-3 border-b border-slate-700/50 text-left hover:bg-slate-700/30 transition-colors text-sm">
                  <div className="col-span-2">
                    <div className="text-white font-medium">{workerName(w)}</div>
                    <div className="text-slate-400 text-xs">{w.workerId?.skills?.slice(0, 2).join(', ') || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{ color: SCORE_COLOR(w.scores?.compositeScore || 0) }}>
                      {Math.round(w.scores?.compositeScore || 0)}
                    </span>
                  </div>
                  <div className="text-slate-300 text-xs">{fmt(w.metrics30d?.earningsPaise)}</div>
                  <div className="flex items-center gap-1 text-amber-400 text-xs">
                    <Star size={11} fill="currentColor" /> {(w.metrics30d?.avgRating || 0).toFixed(1)}
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CHURN_BG(w.riskFlags?.churnProbability || 0)}`}>
                      {Math.round((w.riskFlags?.churnProbability || 0) * 100)}%
                    </span>
                  </div>
                </button>
              ))
          }
        </div>
      )}

      {/* Leaderboard */}
      {tab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {['earnings', 'rating', 'jobs'].map(m => (
              <button key={m} onClick={() => setLbMetric(m)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                  lbMetric === m ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}>
                {m}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {leaderboard.slice(0, 10).map((w, i) => (
              <div key={w._id || i} className={`flex items-center gap-4 p-4 rounded-xl border ${i < 3 ? 'bg-slate-800/80 border-indigo-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}>
                <span className="text-2xl w-8">{medal(i)}</span>
                <div className="flex-1">
                  <div className="text-white font-medium">{workerName(w)}</div>
                  <div className="text-slate-400 text-xs">{w.workerId?.skills?.[0] || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">
                    {lbMetric === 'earnings' ? fmt(w.metrics30d?.earningsPaise) :
                     lbMetric === 'rating' ? `${(w.metrics30d?.avgRating || 0).toFixed(1)} ⭐` :
                     `${w.metrics30d?.jobsCompleted || 0} jobs`}
                  </div>
                  <div className="text-slate-500 text-xs">Score: {Math.round(w.scores?.compositeScore || 0)}</div>
                </div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="text-slate-500 text-center py-12">No leaderboard data. Run worker intel recompute first.</div>
            )}
          </div>
        </div>
      )}

      {/* Worker Detail Drawer */}
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
                  <h3 className="text-white font-bold">{workerName(selected)}</h3>
                  <p className="text-slate-400 text-sm">{selected.workerId?.skills?.join(', ') || '—'}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-4xl font-black" style={{ color: SCORE_COLOR(selected.scores?.compositeScore || 0) }}>
                      {Math.round(selected.scores?.compositeScore || 0)}
                    </div>
                    <div className="text-slate-400 text-xs">Composite Score</div>
                  </div>
                </div>

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

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Earnings 30d</div>
                    <div className="text-white font-bold mt-1">{fmt(selected.metrics30d?.earningsPaise)}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Jobs Completed</div>
                    <div className="text-white font-bold mt-1">{selected.metrics30d?.jobsCompleted || 0}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Avg Rating</div>
                    <div className="text-amber-400 font-bold mt-1">⭐ {(selected.metrics30d?.avgRating || 0).toFixed(1)}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <div className="text-slate-400 text-xs">Online Hours</div>
                    <div className="text-white font-bold mt-1">{Math.round(selected.metrics30d?.onlineHours || 0)}h</div>
                  </div>
                </div>

                {(selected.trainingPlan || []).length > 0 && (
                  <div>
                    <h4 className="text-slate-300 text-sm font-semibold mb-2">Training Plan</h4>
                    <div className="space-y-2">
                      {selected.trainingPlan.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-800/60 rounded-xl p-3 text-sm">
                          <Zap size={13} className="text-amber-400 shrink-0" />
                          <div>
                            <div className="text-white font-medium capitalize">{t.module?.replace(/_/g, ' ')}</div>
                            <div className="text-slate-400 text-xs">Priority: {t.priority}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-slate-300 text-sm font-semibold mb-2">Insights</h4>
                  {insightsLoading ? (
                    <div className="animate-pulse bg-slate-800 rounded-xl h-16" />
                  ) : insights.length === 0 ? (
                    <p className="text-slate-500 text-sm">No insights available</p>
                  ) : insights.map((ins, i) => (
                    <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 mb-2">{ins}</div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
