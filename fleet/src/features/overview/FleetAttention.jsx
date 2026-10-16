import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAdminFleetAttentionQuery } from '@shared/services/api';

const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/**
 * What needs a person now (server workforce/watchdog), at the top of the
 * fleet overview: shifts short today or tomorrow, yesterday's no-shows, cash
 * held over a day, low stock, leave waiting. The same list goes to ops at 8 am.
 */
export default function FleetAttention() {
  const { data } = useAdminFleetAttentionQuery(undefined, { pollingInterval: 120000 });
  if (!data) return null;
  const items = [
    ...data.short.map((s) => `${s.hub}: ${s.shift} ${s.when} is ${s.short} short`),
    ...data.noShows.map((s) => `${s.name} missed ${s.shift} at ${s.hub} yesterday`),
    ...data.cash.map((c) => `${c.name} still holds ${rupees(c.paise)} in cash`),
    ...data.lowStock.map((i) => `${i.name} at ${i.hub}: ${i.qty} ${i.unit} left`),
    ...(data.slack || []).map((s) => `${s.name}: ${s.jobs} of ${s.targetJobs} jobs this month${s.manyGiveBacks ? `, ${s.givenBack} handed back` : ''}`),
    ...(data.leave ? [`${data.leave} leave request${data.leave === 1 ? '' : 's'} waiting`] : []),
  ];
  if (!items.length) {
    return <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800"><CheckCircle2 size={16} /> Nothing needs you: every shift is covered, cash is in and stock is fine.</p>;
  }
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="flex items-center gap-2 text-[14px] font-bold text-amber-900"><AlertTriangle size={16} /> Needs attention ({items.length})</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {items.slice(0, 12).map((t) => <li key={t} className="text-[13px] text-amber-900">{t}</li>)}
      </ul>
    </section>
  );
}
