import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useRepairSuggestionsQuery, useRepairVerticalsQuery } from '@shared/services/api';
import { targetsWith, thingFor } from '@shared/customer/repairBasket';

/**
 * Above "Choose who": book more in the same visit. "+ Add another vehicle"
 * (any kind we do), and "Also add…" suggestions for the same one, learned from
 * what customers book together (server repair/services/suggest).
 */
export default function BasketBar({ vertical, current, count, onAddAnother, onAddSuggestion }) {
  const [choosing, setChoosing] = useState(false);
  const { data } = useRepairSuggestionsQuery({ vertical, repairCode: current?.repairCode }, { skip: !current?.repairCode });
  const sameKind = (data?.suggestions || []).filter((s) => s.vertical === vertical);
  const { data: services } = useRepairVerticalsQuery();
  const items = services?.items || [];
  const thing = thingFor(vertical, items);
  if (!current) return null;
  return (
    <div className="card space-y-2.5">
      {count > 0 && <p className="text-[12px] font-bold text-zappy-700">{count + 1} items in this visit, one visit fee</p>}
      {sameKind.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500"><Sparkles size={12} /> Also add for this {thing}</p>
          <div className="flex flex-wrap gap-2">
            {sameKind.map((s) => (
              <button key={s.repairCode} type="button" onClick={() => onAddSuggestion(s)}
                className="rounded-full border border-zappy-200 bg-zappy-50 px-3 py-1.5 text-[12.5px] font-semibold text-zappy-700 hover:bg-zappy-100">
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {!choosing ? (
        <button type="button" onClick={() => setChoosing(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-[13.5px] font-bold text-slate-700 hover:border-zappy-400">
          <Plus size={16} /> Add another {thing} to this visit
        </button>
      ) : (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-500">What else should we look at?</p>
          <div className="grid grid-cols-2 gap-2">
            {targetsWith(items).map((t) => (
              <button key={t.vertical} type="button" onClick={() => onAddAnother(t)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-left text-[13px] font-bold text-[#0F172A] hover:border-zappy-300">
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
