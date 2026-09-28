/**
 * Digital Service Checklist Panel
 * Worker checks off each item. Required items must be completed before marking job done.
 * Customer gets a verifiable record of what was checked. Basis for warranty claims.
 */
import { useState } from 'react';
import { CheckSquare, Square, ClipboardList, Loader2 } from 'lucide-react';
import { useGetServiceChecklistQuery, useSubmitChecklistMutation } from '../../services/api';
import toast from 'react-hot-toast';

export default function ServiceChecklistPanel({ orderId, service, onChecked }) {
  const { data, isLoading: checklistLoading, isError } = useGetServiceChecklistQuery(service, { skip: !service });
  const [checked, setChecked] = useState(new Set());
  const [submit, { isLoading }] = useSubmitChecklistMutation();
  const checklist = data?.checklist || [];

  if (checklistLoading) {
    return (
      <div className="card flex items-center gap-2">
        <Loader2 size={14} className="text-emerald-500 animate-spin" />
        <p className="text-xs text-slate-500">Loading checklist…</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="card bg-amber-50 ring-1 ring-amber-100">
        <p className="text-xs text-amber-700 font-medium">Checklist unavailable — complete job manually</p>
      </div>
    );
  }
  if (!checklist.length) return null;

  function toggle(id) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const required = checklist.filter(c => c.required);
  const allRequiredDone = required.every(c => checked.has(c.id));

  async function handleSubmit() {
    try {
      await submit({ orderId, completedItems: [...checked] }).unwrap();
      toast.success('Checklist saved!');
      onChecked?.([...checked]);
    } catch (err) {
      toast.error(err.data?.error || 'Could not save checklist');
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <ClipboardList size={14} strokeWidth={2} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#0F172A]">Service Checklist</p>
          <p className="text-[11px] text-slate-400">{checked.size}/{checklist.length} completed</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {checklist.map(item => {
          const done = checked.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                done ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'bg-slate-50 ring-1 ring-slate-200 hover:ring-emerald-300'
              }`}
            >
              {done
                ? <CheckSquare size={16} strokeWidth={2} className="text-emerald-600 shrink-0" />
                : <Square size={16} strokeWidth={2} className="text-slate-300 shrink-0" />}
              <span className={`text-sm flex-1 ${done ? 'text-emerald-700 font-semibold' : 'text-slate-700'}`}>
                {item.label}
              </span>
              {item.required && !done && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase shrink-0">Required</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading || !allRequiredDone}
        className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
        {allRequiredDone ? 'Save Checklist' : `Complete ${required.filter(r => !checked.has(r.id)).length} required items first`}
      </button>
    </div>
  );
}
