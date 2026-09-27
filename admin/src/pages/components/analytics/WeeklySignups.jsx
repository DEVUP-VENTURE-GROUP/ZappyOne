export default function WeeklySignups({ weeklySignups }) {
  const users   = weeklySignups?.users   || [];
  const workers = weeklySignups?.workers || [];
  if (!users.length && !workers.length) return <p className="text-xs text-slate-400 text-center py-4">No signup data</p>;
  const allWeeks = [...new Set([...users.map(u => u._id), ...workers.map(w => w._id)])].sort();
  const maxVal   = Math.max(...allWeeks.map(wk => (users.find(u => u._id === wk)?.count || 0) + (workers.find(w => w._id === wk)?.count || 0)), 1);
  return (
    <div className="space-y-2">
      {allWeeks.slice(-8).map(wk => {
        const uc = users.find(u => u._id === wk)?.count || 0;
        const wc = workers.find(w => w._id === wk)?.count || 0;
        const total = uc + wc;
        return (
          <div key={wk} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-12 shrink-0">{wk?.replace(/\d{4}-/, '')}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden flex">
              <div className="h-4 bg-blue-400" style={{ width: `${(uc / maxVal) * 100}%` }} />
              <div className="h-4 bg-emerald-400" style={{ width: `${(wc / maxVal) * 100}%` }} />
            </div>
            <span className="text-[10px] font-bold text-slate-600 w-6 text-right">{total}</span>
          </div>
        );
      })}
      <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Users</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Workers</span>
      </div>
    </div>
  );
}
