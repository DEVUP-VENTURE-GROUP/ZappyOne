import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Target, Zap, TrendingUp, Plus, Edit2, Check, Loader2, X, ChevronRight, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetWorkerGoalsQuery, useSetWorkerGoalMutation, useGetZoneBenchmarkQuery } from '../services/api';

function ProgressRing({ pct, size = 96, stroke = 8, color = '#6366f1' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 filter drop-shadow-md">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.04)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-sm font-black text-slate-800 leading-none">{pct}%</p>
      </div>
    </div>
  );
}

function GoalCard({ goal, onEdit, index }) {
  const earned = goal.earnedPaise ?? 0;
  const target = goal.targetPaise ?? 0;
  const pct = target > 0 ? Math.round((earned / target) * 100) : 0;
  const remaining = Math.max(0, target - earned);
  const over = earned > target;
  
  // Dynamic gradient based on progress
  const bgGrad = pct >= 100 
    ? 'from-emerald-500 to-teal-600' 
    : pct >= 60 
    ? 'from-indigo-500 to-violet-600' 
    : 'from-amber-400 to-orange-500';

  const ringColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`bg-white rounded-[1.5rem] border shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 relative overflow-hidden group ${pct >= 100 ? 'border-emerald-100 ring-1 ring-emerald-50' : 'border-slate-100'}`}
    >
      {/* Decorative background glow */}
      <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full blur-3xl opacity-10 bg-gradient-to-br ${bgGrad} group-hover:opacity-20 transition-opacity`} />

      <div className="flex items-center gap-5 relative z-10">
        <div className="flex-shrink-0">
          <ProgressRing pct={pct} color={ringColor} size={84} stroke={7} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <p className="font-black text-slate-800 text-[15px] capitalize tracking-wide">{goal.period} Goal</p>
              {pct >= 100 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-[9px] bg-emerald-100/80 text-emerald-700 font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-emerald-200/50">
                  <Trophy size={10} /> Achieved
                </motion.span>
              )}
            </div>
            <button onClick={onEdit} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition-colors shadow-sm border border-slate-100">
              <Edit2 size={13} strokeWidth={2.5} />
            </button>
          </div>
          
          <div className="flex items-end gap-1.5 mt-1">
            <p className="text-2xl font-black text-slate-800 leading-none">₹{(earned / 100).toFixed(0)}</p>
            <p className="text-[11px] font-bold text-slate-400 pb-0.5 uppercase tracking-wider">/ ₹{(target / 100).toFixed(0)}</p>
          </div>
          
          <div className="mt-2 inline-block">
            {over ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100/50">+₹{((earned - target) / 100).toFixed(0)} over target!</span>
            ) : (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">₹{(remaining / 100).toFixed(0)} more to go</span>
            )}
          </div>
        </div>
      </div>

      {/* Mini progress bar at the bottom */}
      <div className="mt-5 h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
          className={`h-full rounded-full bg-gradient-to-r ${bgGrad}`} 
        />
      </div>
    </motion.div>
  );
}

function SetGoalSheet({ period, currentTarget, onClose }) {
  const [val, setVal] = useState(currentTarget ? String(currentTarget / 100) : '');
  const [setGoal, { isLoading }] = useSetWorkerGoalMutation();

  async function submit(e) {
    e.preventDefault();
    const amtPaise = Math.round(parseFloat(val) * 100);
    if (!amtPaise || amtPaise < 100) return toast.error('Set at least ₹1 as goal');
    try {
      await setGoal({ period, targetPaise: amtPaise }).unwrap();
      toast.success(`${period} goal set!`);
      onClose();
    } catch (err) { toast.error(err?.data?.error || 'Failed to set goal'); }
  }

  const PRESETS = period === 'daily' ? [500, 1000, 1500, 2000] : [5000, 10000, 20000, 30000];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-lg p-6 relative z-10 shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black text-slate-800 capitalize tracking-wide">Set {period} Goal</h2>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X size={16} strokeWidth={2.5} /></button>
        </div>
        
        <form onSubmit={submit} className="space-y-6">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="text-2xl font-black text-slate-300 group-focus-within:text-indigo-400 transition-colors">₹</span>
            </div>
            <input type="number" min={1} step={1} value={val} onChange={e => setVal(e.target.value)}
              placeholder="0" 
              className="w-full text-4xl font-black text-slate-800 outline-none bg-slate-50 rounded-2xl py-6 pl-10 pr-4 border-2 border-transparent focus:border-indigo-500 focus:bg-white transition-all shadow-inner" 
            />
          </div>
          
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Quick Presets</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map(p => (
                <button key={p} type="button" onClick={() => setVal(String(p))}
                  className="py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-sm hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors shadow-sm active:scale-95">
                  ₹{p >= 1000 ? `${p / 1000}K` : p}
                </button>
              ))}
            </div>
          </div>
          
          <button type="submit" disabled={isLoading}
            className="w-full py-4 rounded-[1.25rem] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]">
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.5} />}
            Save Target
          </button>
        </form>
      </motion.div>
    </div>
  );
}

export default function WorkerGoalsPage() {
  const nav = useNavigate();
  const { data, isLoading } = useGetWorkerGoalsQuery();
  const { data: benchmark } = useGetZoneBenchmarkQuery();
  const [editPeriod, setEditPeriod] = useState(null);

  const goals = data?.goals ?? [];
  const dailyGoal = goals.find(g => g.period === 'daily');
  const weeklyGoal = goals.find(g => g.period === 'weekly');

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center md:bg-gradient-to-br md:from-slate-100 md:to-indigo-50/40">
      <div className="w-full max-w-lg lg:max-w-2xl bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] lg:shadow-[0_0_60px_rgba(0,0,0,0.08)] md:border-x border-slate-200/60">
        
        {/* Cinematic Header */}
        <header className="relative pt-6 pb-20 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute -top-10 -right-10 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-3xl" animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.div className="absolute -bottom-20 -left-10 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 6, repeat: Infinity, delay: 1 }} />
          
          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-6">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Earnings Goals</h1>
              <div className="w-10 h-10" /> {/* Balancer */}
            </div>

            <div className="text-center px-4">
              <p className="text-white/80 text-sm font-medium mb-1">Set targets and crush them.</p>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest">Track your daily & weekly hustle</p>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div className="relative z-20 px-4 -mt-8 pb-20 space-y-5">
          
          {/* Benchmark card */}
          <AnimatePresence>
            {benchmark && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[1.5rem] p-5 text-white shadow-lg shadow-indigo-900/20 border border-indigo-500/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={80} /></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><TrendingUp size={12} className="text-white" /></div>
                    <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">Zone Benchmark</p>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black">Top {Math.round(100 - benchmark.percentile)}%</p>
                    <span className="text-indigo-300 text-xs font-bold">in your zone</span>
                  </div>
                  <p className="text-xs text-indigo-200 mt-1 font-medium bg-white/10 inline-block px-2.5 py-1 rounded-full border border-white/10">Avg earning: ₹{(benchmark.zoneAvgPaise / 100).toFixed(0)} / week</p>
                  
                  <div className="mt-4 h-2 bg-indigo-900/50 rounded-full overflow-hidden shadow-inner">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${benchmark.percentile}%` }} transition={{ duration: 1, delay: 0.5 }} className="h-full bg-gradient-to-r from-teal-300 to-emerald-400 rounded-full" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading ? (
            <div className="flex flex-col justify-center items-center py-12">
              <Loader2 size={24} className="animate-spin text-indigo-400 mb-3" />
              <p className="text-sm font-semibold text-slate-400">Loading goals...</p>
            </div>
          ) : (
            <>
              {/* Daily goal */}
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                <div className="flex items-center justify-between mb-3 px-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Daily Goal</p>
                  {!dailyGoal && (
                    <button onClick={() => setEditPeriod('daily')} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-indigo-100 transition-colors">
                      <Plus size={12} strokeWidth={2.5} /> Set Target
                    </button>
                  )}
                </div>
                {dailyGoal ? (
                  <GoalCard goal={dailyGoal} onEdit={() => setEditPeriod('daily')} index={1} />
                ) : (
                  <button onClick={() => setEditPeriod('daily')}
                    className="w-full bg-white rounded-[1.5rem] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center text-slate-400 gap-3 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-500 transition-all group shadow-sm">
                    <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                      <Target size={24} strokeWidth={2} className="opacity-40 group-hover:opacity-100" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-slate-600 group-hover:text-indigo-600">Set Daily Target</p>
                      <p className="text-xs mt-1 opacity-70">Boost your daily motivation</p>
                    </div>
                  </button>
                )}
              </motion.div>

              {/* Weekly goal */}
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                <div className="flex items-center justify-between mb-3 px-2 mt-2">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Weekly Goal</p>
                  {!weeklyGoal && (
                    <button onClick={() => setEditPeriod('weekly')} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-indigo-100 transition-colors">
                      <Plus size={12} strokeWidth={2.5} /> Set Target
                    </button>
                  )}
                </div>
                {weeklyGoal ? (
                  <GoalCard goal={weeklyGoal} onEdit={() => setEditPeriod('weekly')} index={2} />
                ) : (
                  <button onClick={() => setEditPeriod('weekly')}
                    className="w-full bg-white rounded-[1.5rem] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center text-slate-400 gap-3 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-500 transition-all group shadow-sm">
                    <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                      <Target size={24} strokeWidth={2} className="opacity-40 group-hover:opacity-100" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-slate-600 group-hover:text-indigo-600">Set Weekly Target</p>
                      <p className="text-xs mt-1 opacity-70">Plan your weekly income</p>
                    </div>
                  </button>
                )}
              </motion.div>

              {/* Tip */}
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} onClick={() => nav('/worker/earnings')} 
                className="w-full mt-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100/60 rounded-[1.25rem] p-4 flex items-center gap-3 text-amber-800 shadow-sm hover:shadow-md transition-shadow group">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Zap size={18} className="text-amber-600 fill-amber-600/20" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[13px] font-bold leading-tight">Track Your Hustle</p>
                  <p className="text-[11px] font-medium opacity-80 mt-0.5">View detailed job-by-job breakdown</p>
                </div>
                <ChevronRight size={18} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {editPeriod && (
          <SetGoalSheet
            period={editPeriod}
            currentTarget={editPeriod === 'daily' ? dailyGoal?.targetPaise : weeklyGoal?.targetPaise}
            onClose={() => setEditPeriod(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
