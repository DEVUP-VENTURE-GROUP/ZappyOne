import { Plus } from 'lucide-react';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

// Services the customer added after booking (jobs/extras): already in the total, collected in cash.
export default function ExtrasCard({ extras }) {
  if (!extras?.length) return null;
  const sum = extras.reduce((a, e) => a + (e.pricePaise || 0) + (e.taxPaise || 0), 0);
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-zappy-700"><Plus size={14} /> Added by the customer</p>
      <ul className="mt-1.5 space-y-1">
        {extras.map((e, i) => (
          <li key={i} className="flex justify-between gap-3 text-[14px] text-ink-900">
            <span className="min-w-0 truncate">{e.name}</span>
            <span className="tabular-nums font-semibold">{rupees((e.pricePaise || 0) + (e.taxPaise || 0))}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[12px] text-ink-500">Included in the total. Collect {rupees(sum)} extra in cash.</p>
    </div>
  );
}
