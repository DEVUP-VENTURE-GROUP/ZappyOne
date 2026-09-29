import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, Ban, CheckCircle, Eye, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { ziFraud } from './zi-api';

const RISK_COLOR = (score) => {
  if (score >= 71) return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', badge: 'bg-red-500/20 text-red-300 border border-red-500/30' };
  if (score >= 51) return { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' };
  return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' };
};

const ACTION_COLORS = {
  none: 'bg-slate-600/20 text-slate-400 border border-slate-600/30',
  flag: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  soft_block: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  hard_block: 'bg-red-500/20 text-red-300 border border-red-500/30',
  review: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};

function SkeletonRow() {
  return (
    <div className="animate-pulse flex gap-4 p-4 border-b border-slate-800">
      <div className="h-4 bg-slate-700 rounded w-32" />
      <div className="h-4 bg-slate-700 rounded w-24" />
      <div className="h-4 bg-slate-700 rounded w-16 ml-auto" />
    </div>
  );
}

export default function ZIFraudCenter() {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending');

  const loadData = async () => {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([
        ziFraud.getQueue({ status: filterStatus, limit: 50 }),
        ziFraud.getStats(),
      ]);
      setQueue(qRes.data || []);
      setStats(sRes.data || {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filterStatus]);

  const handleReview = async () => {
    if (!reviewAction || !selected) return;
    setReviewing(true);
    try {
      await ziFraud.reviewEvent(selected._id, reviewAction, reviewNotes);
      setSelected(null);
      setReviewAction('');
      setReviewNotes('');
      loadData();
    } catch (e) {
      alert(e.message);
    }
    setReviewing(false);
  };

  const radarData = selected?.signals
    ? Object.entries(selected.signals).map(([k, v]) => ({ subject: k.replace('Score', ''), value: v || 0 }))
    : [];

  const KPI = ({ label, value, sub, color }) => (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
      <p className="text-slate-400 text-xs font-medium">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color || 'text-white'}`}>{value ?? '—'}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fraud Center</h1>
          <p className="text-slate-400 text-sm mt-0.5">Real-time risk detection and entity management</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Flagged Today" value={stats?.flaggedToday ?? '—'} color="text-amber-400" />
        <KPI label="High Risk Queue" value={stats?.highRiskQueue ?? '—'} color="text-red-400" />
        <KPI label="Total Blocked" value={stats?.totalBlocked ?? '—'} color="text-orange-400" />
        <KPI label="False Positive Rate" value={stats?.falsePositiveRate ? `${stats.falsePositiveRate}%` : '—'} color="text-slate-300" sub="Target < 5%" />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['pending', 'reviewed', 'resolved'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Queue */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="grid grid-cols-6 gap-4 px-4 py-2.5 bg-slate-800/80 text-slate-500 text-xs font-semibold uppercase tracking-wider">
          <span className="col-span-2">Entity</span>
          <span>Risk Score</span>
          <span>Action</span>
          <span>Top Signal</span>
          <span>Time</span>
        </div>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          : queue.length === 0
          ? <div className="text-slate-500 text-center py-12">No items in queue</div>
          : queue.map((item) => {
              const rc = RISK_COLOR(item.compositeRisk);
              return (
                <button
                  key={item._id}
                  onClick={() => setSelected(item)}
                  className={`w-full grid grid-cols-6 gap-4 px-4 py-3 border-b border-slate-700/50 text-sm hover:bg-slate-700/30 transition-colors text-left ${rc.bg}`}
                >
                  <div className="col-span-2">
                    <div className="text-white font-medium">{item.entityType}</div>
                    <div className="text-slate-400 text-xs">{item.phone || item.entityId}</div>
                  </div>
                  <div>
                    <span className={`text-lg font-black ${rc.text}`}>{Math.round(item.compositeRisk)}</span>
                    <span className="text-slate-500 text-xs ml-1">/100</span>
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACTION_COLORS[item.action] || ACTION_COLORS.none}`}>
                      {(item.action || 'none').replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="text-slate-400 text-xs">
                    {(item.triggeredRules || []).slice(0, 2).join(', ') || '—'}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {item.createdAt ? new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </button>
              );
            })
        }
      </div>

      {/* Review Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-[420px] h-full bg-slate-950 border-l border-slate-800 flex flex-col overflow-y-auto"
            >
              <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-white font-bold">Risk Review</h3>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
              </div>

              <div className="p-5 space-y-5 flex-1">
                {/* Entity info */}
                <div className="bg-slate-800/60 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Entity Type</span>
                    <span className="text-white text-sm font-medium capitalize">{selected.entityType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">ID / Phone</span>
                    <span className="text-white text-sm">{selected.phone || selected.entityId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Composite Risk</span>
                    <span className={`text-xl font-black ${RISK_COLOR(selected.compositeRisk).text}`}>{Math.round(selected.compositeRisk)}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-xs">Auto Action</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACTION_COLORS[selected.action] || ACTION_COLORS.none}`}>
                      {(selected.action || 'none').replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Radar chart */}
                {radarData.length > 0 && (
                  <div className="bg-slate-800/60 rounded-xl p-4">
                    <h4 className="text-slate-300 text-xs font-semibold mb-3">Signal Breakdown</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#334155" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                        <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Triggered rules */}
                {(selected.triggeredRules || []).length > 0 && (
                  <div>
                    <h4 className="text-slate-400 text-xs font-semibold mb-2">Triggered Rules</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.triggeredRules.map((r) => (
                        <span key={r} className="text-[10px] font-medium px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-300 rounded-full">{r}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review action */}
                {selected.status === 'pending' && (
                  <div className="space-y-3">
                    <h4 className="text-slate-300 text-sm font-semibold">Take Action</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'clear', label: 'Clear', icon: CheckCircle, color: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10' },
                        { id: 'flag', label: 'Flag', icon: AlertTriangle, color: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10' },
                        { id: 'soft_block', label: 'Soft Block', icon: Shield, color: 'text-orange-400 border-orange-500/30 hover:bg-orange-500/10' },
                        { id: 'hard_block', label: 'Hard Block', icon: Ban, color: 'text-red-400 border-red-500/30 hover:bg-red-500/10' },
                      ].map(({ id, label, icon: Icon, color }) => (
                        <button
                          key={id}
                          onClick={() => setReviewAction(id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${color} ${reviewAction === id ? 'ring-2 ring-current' : ''}`}
                        >
                          <Icon size={14} /> {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                      placeholder="Review notes..."
                      rows={2}
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                    />
                    <button
                      onClick={handleReview}
                      disabled={!reviewAction || reviewing}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      {reviewing ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
