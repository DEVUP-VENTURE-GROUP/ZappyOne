import { CircleCheck } from 'lucide-react';

// "Payment done" once a partner has paid ZappyOne everything (workerHome duesPaidView).
export default function DuesPaidCard({ paid }) {
  return (
    <section role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <CircleCheck size={20} className="mt-0.5 shrink-0 text-emerald-700" />
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-slate-900">{paid.title}</h2>
        <p className="mt-0.5 text-[13px] tabular-nums text-slate-700">{paid.line}. {paid.body}</p>
      </div>
    </section>
  );
}

// The last payment under what is still owed (a part payment).
export function LastPaidLine({ paid }) {
  if (!paid || paid.cleared) return null;
  return <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-emerald-700"><CircleCheck size={14} /> Last paid: {paid.line}</p>;
}
