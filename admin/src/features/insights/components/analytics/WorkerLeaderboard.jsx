import { Star } from 'lucide-react';

export default function WorkerLeaderboard({ workers = [] }) {
  if (!workers.length) return <p className="text-xs text-slate-400 text-center py-6">No completed orders yet</p>;
  const maxJobs = workers[0]?.jobs || 1;
  return (
    <div className="space-y-2">
      {workers.slice(0, 8).map((w, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `${i+1}`;
        return (
          <div key={w._id || i} className="flex items-center gap-2.5 py-1">
            <span className="text-sm w-6 text-center shrink-0 font-bold text-slate-400">{medal}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-slate-800 truncate">{w.name || '—'}</p>
                <span className="text-xs font-bold text-slate-700 ml-2 shrink-0">{w.jobs} jobs</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(w.jobs / maxJobs) * 100}%` }} />
                </div>
                {w.avgRating != null && <span className="text-[10px] text-amber-500 font-bold shrink-0 flex items-center gap-0.5"><Star size={9} fill="currentColor" />{w.avgRating?.toFixed(1)}</span>}
                {w.earningPaise > 0 && <span className="text-[10px] text-emerald-600 font-semibold shrink-0">₹{Math.round(w.earningPaise / 100).toLocaleString('en-IN')}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
