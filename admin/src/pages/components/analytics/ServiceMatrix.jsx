function BarChart2Icon({ size, strokeWidth }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

export default function ServiceMatrix({ services = [] }) {
  if (!services.length) return (
    <div className="h-32 flex flex-col items-center justify-center gap-1 text-slate-400">
      <BarChart2Icon size={28} strokeWidth={1} />
      <p className="text-xs font-semibold">No service data yet</p>
    </div>
  );
  const avgDemand  = services.reduce((s, sv) => s + sv.total, 0) / services.length;
  const avgQuality = services.reduce((s, sv) => s + sv.completionRate, 0) / services.length;

  const categories = {
    star:    { label: 'Stars',        desc: 'High demand + high quality — protect & scale', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    problem: { label: 'Problems',     desc: 'High demand + low quality — fix urgently',      bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500'     },
    gem:     { label: 'Hidden Gems',  desc: 'Low demand + high quality — promote more',       bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
    review:  { label: 'Review',       desc: 'Low demand + low quality — improve or cut',      bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  };

  const categorized = services.map(sv => ({
    ...sv,
    quad: sv.total > avgDemand
      ? sv.completionRate >= avgQuality ? 'star' : 'problem'
      : sv.completionRate >= avgQuality ? 'gem'  : 'review',
  }));

  const grouped = { star: [], problem: [], gem: [], review: [] };
  categorized.forEach(sv => grouped[sv.quad].push(sv));

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(categories).map(([quad, cat]) => (
        <div key={quad} className={`p-3.5 rounded-xl border ${cat.bg} ${cat.border}`}>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cat.dot}`} />{cat.label}
          </p>
          <p className="text-[10px] text-slate-500 mb-2.5">{cat.desc}</p>
          {grouped[quad].length === 0
            ? <p className="text-xs text-slate-400 italic">None</p>
            : <div className="space-y-1.5">
                {grouped[quad].map(sv => (
                  <div key={sv.service} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${cat.dot}`} />
                      <span className="text-xs font-semibold text-slate-700 capitalize truncate">{sv.service?.replace(/_/g,' ')}</span>
                    </div>
                    <div className="flex gap-2 shrink-0 text-[10px]">
                      <span className="text-slate-500">{sv.total} orders</span>
                      <span className={`font-bold ${sv.completionRate >= 70 ? 'text-emerald-600' : 'text-red-500'}`}>{sv.completionRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      ))}
    </div>
  );
}
