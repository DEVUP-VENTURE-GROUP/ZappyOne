import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, TrendingUp, CheckCircle, XCircle, Search, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ziExpansion } from './zi-api';

const SCORE_COLOR = (s) => s >= 70 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400';
const STATUS_BADGE = {
  pending_review: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
  launched: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
};

function SkeletonRow() {
  return (
    <div className="animate-pulse bg-slate-800/60 rounded-xl p-4 space-y-3">
      <div className="flex justify-between">
        <div className="h-4 bg-slate-700 rounded w-40" />
        <div className="h-4 bg-slate-700 rounded w-16" />
      </div>
      <div className="h-2 bg-slate-700 rounded w-full" />
    </div>
  );
}

export default function ZIExpansion() {
  const [recommendations, setRecommendations] = useState([]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab] = useState('recommendations');

  // Analyze form
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // Category gaps
  const [gapCity, setGapCity] = useState('');
  const [gaps, setGaps] = useState([]);

  // Notes modal
  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    ziExpansion.getRecommendations(10)
      .then(r => setRecommendations(r.data || []))
      .finally(() => setLoading(false));
    ziExpansion.list({ limit: 30 })
      .then(r => setList(r.data || []))
      .finally(() => setListLoading(false));
  }, []);

  const handleAnalyze = async () => {
    if (!city || !state) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await ziExpansion.analyzeCity(city, state);
      setAnalysis(r.data);
    } catch (e) {
      alert(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'approve') {
        await ziExpansion.approve(id, noteText);
      } else {
        await ziExpansion.reject(id, noteText);
      }
      setNoteModal(null);
      setNoteText('');
      const r = await ziExpansion.list({ limit: 30 });
      setList(r.data || []);
    } catch (e) {
      alert(e.message);
    }
  };

  const loadGaps = async () => {
    if (!gapCity) return;
    try {
      const r = await ziExpansion.getCategoryGaps(gapCity);
      setGaps(r.data?.gaps || []);
    } catch {}
  };

  const scoreData = analysis ? [
    { name: 'Demand', value: analysis.reasoning?.demandScore || 0 },
    { name: 'Population', value: analysis.reasoning?.populationScore || 0 },
    { name: 'Competition', value: analysis.reasoning?.competitionScore || 0 },
    { name: 'Supply', value: analysis.reasoning?.supplyScore || 0 },
    { name: 'Income', value: analysis.reasoning?.incomeScore || 0 },
    { name: 'Connectivity', value: analysis.reasoning?.connectivityScore || 0 },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Expansion Engine</h1>
          <p className="text-slate-400 text-sm mt-0.5">AI-powered city & category expansion intelligence</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {['recommendations', 'analyze', 'queue', 'gaps'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-indigo-400 border-indigo-400'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            {t === 'analyze' ? 'City Analyzer' : t === 'queue' ? 'Decision Queue' : t === 'gaps' ? 'Category Gaps' : 'Recommendations'}
          </button>
        ))}
      </div>

      {/* Recommendations Tab */}
      {tab === 'recommendations' && (
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : recommendations.length === 0 ? (
            <div className="text-slate-500 text-center py-16">No recommendations yet. Use the City Analyzer to score new cities.</div>
          ) : (
            recommendations.map((rec) => (
              <motion.div
                key={rec._id || rec.target}
                className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(expanded === (rec._id || rec.target) ? null : (rec._id || rec.target))}
                  className="w-full p-4 flex items-center gap-4 text-left hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-semibold">{rec.target || rec.city}</span>
                      <span className="text-slate-400 text-sm">{rec.state}</span>
                      {rec.status && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_BADGE[rec.status] || STATUS_BADGE.pending_review}`}>
                          {rec.status.replace('_', ' ').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-xs">Score</span>
                        <span className={`font-bold ${SCORE_COLOR(rec.reasoning?.compositeScore || rec.compositeScore || 0)}`}>
                          {Math.round(rec.reasoning?.compositeScore || rec.compositeScore || 0)}/100
                        </span>
                      </div>
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                          style={{ width: `${rec.reasoning?.compositeScore || rec.compositeScore || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {expanded === (rec._id || rec.target) ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>

                <AnimatePresence>
                  {expanded === (rec._id || rec.target) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-700/50 p-4 space-y-4"
                    >
                      {rec.reasoning && (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                          {Object.entries(rec.reasoning).filter(([k]) => k !== 'compositeScore').map(([key, val]) => (
                            <div key={key} className="bg-slate-900/60 rounded-lg p-2.5 text-center">
                              <div className={`text-lg font-bold ${SCORE_COLOR(val)}`}>{Math.round(val)}</div>
                              <div className="text-slate-400 text-[10px] capitalize mt-0.5">{key.replace('Score', '')}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {rec.projections && (
                        <div className="grid grid-cols-3 gap-3">
                          {['bear', 'base', 'bull'].map((s) => rec.projections.scenarios?.[s] && (
                            <div key={s} className="bg-slate-900/60 rounded-lg p-3">
                              <div className="text-slate-400 text-xs uppercase font-bold mb-1">{s}</div>
                              <div className="text-white text-sm font-semibold">
                                ₹{Math.round((rec.projections.scenarios[s].revenue || 0) / 10000000)}Cr/yr
                              </div>
                              <div className="text-slate-400 text-xs">{rec.projections.scenarios[s].orders?.toLocaleString()} orders</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {rec.aiNarrative && (
                        <p className="text-slate-300 text-sm bg-indigo-900/20 border border-indigo-500/20 rounded-lg p-3">{rec.aiNarrative}</p>
                      )}

                      {(!rec.status || rec.status === 'pending_review') && rec._id && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setNoteModal({ id: rec._id, action: 'approve' })}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-lg text-sm font-medium hover:bg-emerald-600/30 transition-colors"
                          >
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button
                            onClick={() => setNoteModal({ id: rec._id, action: 'reject' })}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg text-sm font-medium hover:bg-red-600/30 transition-colors"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* City Analyzer Tab */}
      {tab === 'analyze' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold">Analyze New City</h3>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              placeholder="City name (e.g. Pune)"
              value={city}
              onChange={e => setCity(e.target.value)}
            />
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              placeholder="State (e.g. Maharashtra)"
              value={state}
              onChange={e => setState(e.target.value)}
            />
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !city || !state}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              {analyzing ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>

          {analysis && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">{analysis.target || city} — {analysis.state || state}</h3>
                <span className={`text-2xl font-black ${SCORE_COLOR(analysis.reasoning?.compositeScore || 0)}`}>
                  {Math.round(analysis.reasoning?.compositeScore || 0)}/100
                </span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={scoreData} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {scoreData.map((_, i) => (
                      <Cell key={i} fill={['#6366f1', '#8b5cf6', '#a78bfa', '#818cf8', '#c4b5fd', '#e879f9'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {analysis.projections && (
                <div className="grid grid-cols-3 gap-2">
                  {['bear', 'base', 'bull'].map((s) => analysis.projections.scenarios?.[s] && (
                    <div key={s} className="bg-slate-900/60 rounded-lg p-2.5 text-center">
                      <div className="text-slate-400 text-[10px] uppercase font-bold">{s}</div>
                      <div className="text-white text-sm font-bold mt-1">
                        ₹{Math.round((analysis.projections.scenarios[s].revenue || 0) / 100000)}L/yr
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!analysis && !analyzing && (
            <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-xl p-5 flex items-center justify-center text-slate-500">
              Results will appear here
            </div>
          )}
        </div>
      )}

      {/* Decision Queue Tab */}
      {tab === 'queue' && (
        <div className="space-y-3">
          {listLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : list.length === 0 ? (
            <div className="text-slate-500 text-center py-16">Queue is empty</div>
          ) : (
            list.map((item) => (
              <div key={item._id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1">
                  <span className="text-white font-medium">{item.target}</span>
                  <span className="text-slate-400 text-sm ml-2">{item.state}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_BADGE[item.status] || STATUS_BADGE.pending_review}`}>
                  {(item.status || 'pending').replace('_', ' ').toUpperCase()}
                </span>
                <span className={`font-bold ${SCORE_COLOR(item.reasoning?.compositeScore || 0)}`}>
                  {Math.round(item.reasoning?.compositeScore || 0)}
                </span>
                {(!item.status || item.status === 'pending_review') && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setNoteModal({ id: item._id, action: 'approve' })} className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors"><CheckCircle size={16} /></button>
                    <button onClick={() => setNoteModal({ id: item._id, action: 'reject' })} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors"><XCircle size={16} /></button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Category Gaps Tab */}
      {tab === 'gaps' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              placeholder="Enter city ID (e.g. hyderabad)"
              value={gapCity}
              onChange={e => setGapCity(e.target.value)}
            />
            <button onClick={loadGaps} className="px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Analyze
            </button>
          </div>
          {gaps.length > 0 && (
            <div className="space-y-2">
              {gaps.map((g, i) => (
                <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-4">
                  <span className="text-white text-sm font-medium w-40">{g.category}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Demand: {g.demandOrders}</span>
                      <span>Supply: {g.supplyServices}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (g.gap || 0) * 10)}%` }} />
                    </div>
                  </div>
                  <span className={`text-xs font-bold ${g.gap > 5 ? 'text-red-400' : g.gap > 2 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    Gap: {(g.gap || 0).toFixed(1)}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes modal */}
      <AnimatePresence>
        {noteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setNoteModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4"
            >
              <h3 className="text-white font-bold capitalize">{noteModal.action} Recommendation</h3>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Add notes (optional)"
                rows={3}
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
                <button
                  onClick={() => handleAction(noteModal.id, noteModal.action)}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                    noteModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
