import { Loader2, Wallet } from 'lucide-react';
import { useJobEarningsQuery } from '../../services/api';
import { formatPaise } from '../../utils/money';

function Lines({ rows }) {
  return rows.map((r) => (
    <div key={r.label} className="flex items-start justify-between gap-3 text-[13px]">
      <span className="text-slate-600">{r.label}{r.note && <span className="block text-[11px] text-slate-400">{r.note}</span>}</span>
      <span className="shrink-0 font-semibold tabular-nums text-[#0F172A]">{r.paise < 0 ? `− ${formatPaise(-r.paise)}` : formatPaise(r.paise)}</span>
    </div>
  ));
}

function Block({ title, totalPaise, rows, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50',
    zappy: 'bg-amber-50/60',
    you: 'bg-emerald-50 ring-1 ring-emerald-200',
  };
  return (
    <div className={`space-y-1.5 rounded-xl p-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-bold ${tone === 'you' ? 'text-emerald-800' : 'text-[#0F172A]'}`}>{title}</p>
        <p className={`text-base font-black tabular-nums ${tone === 'you' ? 'text-emerald-700' : 'text-[#0F172A]'}`}>{formatPaise(totalPaise)}</p>
      </div>
      <Lines rows={rows} />
    </div>
  );
}

/**
 * The money on a finished job: what the customer paid, what ZappyOne keeps,
 * what is the provider's, and how it settles. Server jobs/earnings forJob,
 * so it matches the Earnings page. Every worker job screen uses this one card.
 */
export default function JobEarningsCard({ jobId }) {
  const { data, isLoading } = useJobEarningsQuery(jobId);
  const e = data?.earnings;
  if (isLoading) return <div className="card flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-400" /></div>;
  if (!e) return null;

  return (
    <div className="card space-y-2.5">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Wallet size={14} /> Payment breakdown</p>
      <Block title="Customer paid" totalPaise={e.customerPaidPaise} rows={e.bill} />
      <Block title="ZappyOne keeps" totalPaise={e.zappyKeepsPaise} rows={e.zappy} tone="zappy" />
      <Block title="You earn" totalPaise={e.youEarnPaise} rows={e.yours} tone="you" />
      <p className="text-[12px] leading-relaxed text-slate-600">
        {e.cash
          ? `You collected ${formatPaise(e.customerPaidPaise)} in cash. ZappyOne's ${formatPaise(e.zappyKeepsPaise)} comes off your wallet, so you keep ${formatPaise(e.youEarnPaise)}.`
          : `The customer paid online. Your ${formatPaise(e.youEarnPaise)} goes to your wallet.`}
      </p>
    </div>
  );
}
