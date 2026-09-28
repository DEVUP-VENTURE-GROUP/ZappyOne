import { Loader2 } from 'lucide-react';

export const PASS_REASONS = [
  'Busy on another job',
  'Too far away',
  "Don't have the part or tool",
  'Not well / going off duty',
  'Vehicle problem',
];

/** Why a job is being passed — kept so owners and ops see real reasons, not "declined". */
export default function PassReasonPicker({ title = 'Why are you passing this job?', busy, onPick, onCancel }) {
  return (
    <div>
      <p className="text-sm font-bold text-[#0F172A]">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PASS_REASONS.map((r) => (
          <button
            key={r}
            disabled={busy}
            onClick={() => onPick(r)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 disabled:opacity-50"
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={onCancel} disabled={busy} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
          Back
        </button>
        {busy && <Loader2 size={15} className="animate-spin text-slate-400" />}
      </div>
    </div>
  );
}
