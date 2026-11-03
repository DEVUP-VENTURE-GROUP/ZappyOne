import { useState } from 'react';
import { useAdminDuesOverviewQuery } from '@shared/services/api';
import { Card, PageLoader, fmt } from '../../../ui/kit';

const HOW_TONE = { 'Pay now (online)': 'bg-emerald-50 text-emerald-700', 'Their payment, confirmed': 'bg-sky-50 text-sky-700', 'Recorded by admin': 'bg-slate-100 text-slate-700' };

// What every ServicePro partner owes ZappyOne and has paid, in one place (server wallet/dues-overview); the lists below are where payments are confirmed or recorded.
export default function DuesOverview() {
  const { data, isLoading } = useAdminDuesOverviewQuery(undefined, { pollingInterval: 60000 });
  const [q, setQ] = useState('');
  if (isLoading) return <PageLoader />;
  if (!data) return null;
  const t = data.totals;
  const tiles = [
    ['Owed to ZappyOne now', fmt(t.owedPaise), `${t.partnersOwing} partner${t.partnersOwing === 1 ? '' : 's'}`],
    ['Paused (over the limit)', String(t.paused), `New jobs stop at ${fmt(data.limits?.limitPaise || 0)}`],
    ['Payments to confirm', String(t.claimsWaiting), 'Partners say they paid outside the app'],
    ['Collected this month', fmt(t.collectedThisMonthPaise), `${t.paymentsThisMonth} payment${t.paymentsThisMonth === 1 ? '' : 's'}`],
  ];
  const term = q.trim().toLowerCase();
  const rows = (data.payments || []).filter((p) => !term || p.partner.name.toLowerCase().includes(term) || p.partner.phone.includes(term) || p.reference.toLowerCase().includes(term));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <Card key={label} className="p-4">
            <p className="text-[12px] font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
            <p className="mt-0.5 text-[11.5px] text-slate-500">{sub}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Payments received from partners</h3>
            <p className="text-[12px] text-slate-500">Every payment to ZappyOne, however it came. Pay now online clears by itself.</p>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or reference" className="w-60 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-[11.5px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Partner</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">How</th><th className="px-4 py-2">Reference</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{new Date(p.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-4 py-2"><p className="font-semibold text-slate-800">{p.partner.name}</p><p className="text-[11.5px] text-slate-500">{p.partner.kind === 'shop' ? 'Shop' : 'Independent pro'}{p.partner.phone ? ` · ${p.partner.phone}` : ''}</p></td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900">{fmt(p.amountPaise)}</td>
                    <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${HOW_TONE[p.how] || HOW_TONE['Recorded by admin']}`}>{p.how}</span></td>
                    <td className="px-4 py-2 font-mono text-[12px] text-slate-600">{p.reference || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-400">{term ? 'No payment matches.' : 'No payments received yet.'}</p>}
      </Card>
    </div>
  );
}
