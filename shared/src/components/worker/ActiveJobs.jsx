import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * "Your jobs": work the provider has already taken and not finished, so a job
 * left mid-way (or waiting for payment) is always one tap away.
 *
 * items: [{ id, to, title, subtitle, status, attention }]
 */
export default function ActiveJobs({ items = [] }) {
  const nav = useNavigate();
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your jobs</p>
      {items.map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => nav(j.to)}
          className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-[#0F172A] truncate">{j.title}</span>
            {j.subtitle && <span className="block text-xs text-slate-500 truncate">{j.subtitle}</span>}
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${j.attention ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
            {j.status}
          </span>
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        </button>
      ))}
    </section>
  );
}
