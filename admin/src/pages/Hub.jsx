import { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * One sidebar entry, several related screens as tabs: `?tab=<hub>&sub=<view>`.
 * The URL is the state, so a tab can be linked to, bookmarked and refreshed.
 *
 *   <Hub title="Money" views={[{ id, label, icon, Comp }, …]} />
 */
export default function Hub({ title, subtitle, views }) {
  const [params, setParams] = useSearchParams();
  const active = views.find((v) => v.id === params.get('sub')) || views[0];
  const Active = active.Comp;

  function pick(id) {
    const next = new URLSearchParams(params);
    next.set('sub', id);
    setParams(next, { replace: true });
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-black text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div role="tablist" aria-label={title} className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-6">
        {views.map((v) => {
          const Icon = v.icon;
          const on = v.id === active.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(v.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition ${
                on ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {Icon && <Icon size={14} />} {v.label}
            </button>
          );
        })}
      </div>
      <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">Loading…</div>}>
        <Active />
      </Suspense>
    </div>
  );
}
