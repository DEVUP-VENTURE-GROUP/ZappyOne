import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, TrendingUp, Download, Zap, ChevronDown, ChevronUp, Loader2, Info } from 'lucide-react';
import { useGetJobEarningsQuery } from '../services/api';

const fmt = v => `₹${(v / 100).toFixed(2)}`;

function EarningRow({ job, expanded, onToggle, index }) {
  const hasSurge = job.surgeMultiplier && job.surgeMultiplier > 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-[1.25rem] border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden mb-3"
    >
      <button className="w-full flex items-center gap-4 p-4 text-left active:bg-slate-50 transition" onClick={onToggle}>
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${hasSurge ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-indigo-500 to-violet-600'}`}>
          {hasSurge ? <Zap size={18} className="text-white fill-white" /> : <TrendingUp size={18} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-black text-slate-800 truncate leading-tight mb-0.5">{job.serviceLabel ?? 'Service'}</p>
          <p className="text-xs font-semibold text-slate-400">{new Date(job.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black text-lg text-slate-800">{fmt(job.net)}</p>
          {hasSurge && <span className="inline-block mt-0.5 text-[10px] font-extrabold tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shadow-sm">{job.surgeMultiplier}×</span>}
        </div>
        {expanded ? <ChevronUp size={16} className="text-indigo-400" /> : <ChevronDown size={16} className="text-slate-300" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-50 px-5 pb-5 pt-4 bg-slate-50/50 space-y-2.5 text-sm">
              <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Gross earnings</span><span className="font-bold text-slate-700">{fmt(job.gross)}</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Platform fee</span><span className="font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md">-{fmt(job.platformFee)}</span></div>
              {job.tip > 0 && <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Customer tip</span><span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">+{fmt(job.tip)}</span></div>}
              {job.bonus > 0 && <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Bonus</span><span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">+{fmt(job.bonus)}</span></div>}
              {hasSurge && (
                <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Surge multiplier</span>
                  <span className="text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md">{job.surgeMultiplier}×</span>
                </div>
              )}
              <div className="border-t border-slate-200/60 pt-3 mt-1 flex justify-between items-center">
                <span className="text-slate-800 font-black">Net payout</span><span className="text-indigo-600 font-black text-lg">{fmt(job.net)}</span>
              </div>
              {job.orderId && <p className="text-[10px] text-slate-400 font-semibold pt-1">Order ID: {job.orderId}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function generatePayslipCSV(jobs, period) {
  const rows = [['Date', 'Service', 'Gross', 'Platform Fee', 'Tip', 'Bonus', 'Surge', 'Net']];
  jobs.forEach(j => {
    rows.push([
      new Date(j.completedAt).toLocaleDateString('en-IN'),
      j.serviceLabel ?? 'Service',
      (j.gross / 100).toFixed(2),
      (j.platformFee / 100).toFixed(2),
      (j.tip / 100).toFixed(2),
      (j.bonus / 100).toFixed(2),
      j.surgeMultiplier ?? 1,
      (j.net / 100).toFixed(2),
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `payslip-${period}.csv`;
  a.click();
}

const PERIODS = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: '3months', label: '3 Months' },
];

export default function WorkerEarningsPage() {
  const nav = useNavigate();
  const [period, setPeriod] = useState('month');
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useGetJobEarningsQuery({ period });
  const jobs = data?.jobs ?? [];
  const summary = data?.summary ?? {};

  function toggle(id) { setExpanded(p => p === id ? null : id); }

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center md:bg-gradient-to-br md:from-slate-100 md:to-indigo-50/40">
      <div className="w-full max-w-lg lg:max-w-2xl bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] lg:shadow-[0_0_60px_rgba(0,0,0,0.08)] md:border-x border-slate-200/60">
        
        {/* Cinematic Header */}
        <header className="relative pt-6 pb-24 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 4, repeat: Infinity }} />
          <motion.div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} />
          
          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-8">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Earnings</h1>
              <motion.button onClick={() => generatePayslipCSV(jobs, period)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white" title="Download CSV">
                <Download size={18} strokeWidth={2} />
              </motion.button>
            </div>

            <div className="text-center">
              <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1.5">Total Net Earnings</p>
              <h2 className="text-white font-black text-5xl tracking-tight drop-shadow-lg">{fmt(summary.totalNet ?? 0)}</h2>
            </div>
          </div>
        </header>

        {/* Content Container (pulled up over header) */}
        <div className="relative z-20 px-4 -mt-16 pb-20">
          
          {/* Period Tabs */}
          <div className="bg-white/80 backdrop-blur-xl p-1.5 rounded-2xl shadow-lg ring-1 ring-black/5 flex gap-1 mb-6 max-w-sm mx-auto">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`flex-1 text-[13px] font-bold py-2.5 rounded-xl transition-all duration-300 ${period === p.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Quick Stats Grid */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Jobs Done</p>
              <p className="text-xl font-black text-slate-800">{summary.count ?? 0}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tips</p>
              <p className="text-xl font-black text-emerald-500">{fmt(summary.totalTips ?? 0)}</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 shadow-sm border border-amber-100 text-center">
              <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider mb-1">Surge Jobs</p>
              <p className="text-xl font-black text-amber-600">{summary.surgeCount ?? 0}</p>
            </div>
          </motion.div>

          {/* Platform fee info */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-4 flex gap-3 text-[13px] text-indigo-800/80 mb-8 font-medium">
            <Info size={16} className="shrink-0 mt-0.5 text-indigo-500" />
            <p>Platform fee is deducted per job. You can reduce it by upgrading your subscription plan to <b>Go Pro</b>.</p>
          </motion.div>

          {/* Jobs list */}
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Job Breakdown</p>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-indigo-400 mb-3" />
                <p className="text-sm font-semibold text-slate-400">Loading earnings...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-white rounded-[1.5rem] border border-dashed border-slate-200 p-12 text-center shadow-sm">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                  <BarChart2 size={24} className="text-slate-300" />
                </div>
                <p className="font-bold text-slate-500">No earnings found</p>
                <p className="text-sm text-slate-400 mt-1">Complete jobs in this period to see them here.</p>
              </div>
            ) : jobs.map((j, i) => (
              <EarningRow key={j._id} job={j} index={i} expanded={expanded === j._id} onToggle={() => toggle(j._id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
