import { useState } from 'react';
import { useAdminDuesOverviewQuery } from '@shared/services/api';
import { Card, PageLoader, fmt } from '../../../ui/kit';

const HOW_TONE = { 'Pay now (online)': 'bg-emerald-50 text-emerald-700', 'Their payment, confirmed': 'bg-sky-50 text-sky-700', 'Recorded by admin': 'bg-slate-100 text-slate-700' };
const STATUS = {
  paused: ['Paused', 'bg-red-50 text-red-700'],
  warned: ['Near the limit', 'bg-amber-50 text-amber-800'],
  owes: ['Owes', 'bg-slate-100 text-slate-700'],
  clear: ['Paid up', 'bg-emerald-50 text-emerald-700'],
};
const FILTERS = [['all', 'All'], ['paused', 'Paused'], ['warned', 'Near the limit'], ['claims', 'Payment to confirm']];
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');
const monthName = (m) => new Date(`${m}-01T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short' });

// Who owes ZappyOne and how much, most owed first: who to chase, with what they have paid before.
function WhoOwes({ partners }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all');
  const term = q.trim().toLowerCase();
  const rows = partners.filter((p) => (show === 'all' || (show === 'claims' ? p.claimsCount > 0 : p.status === show))
    && (!term || p.name.toLowerCase().includes(term) || p.phone.includes(term)));
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Who owes ZappyOne</h3>
          <p className="text-[12px] text-slate-500">Every shop and independent pro with money due or a payment to confirm, most owed first.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3" role="group" aria-label="Show">
        {FILTERS.map(([key, label]) => {
          const n = key === 'all' ? partners.length : key === 'claims' ? partners.filter((p) => p.claimsCount > 0).length : partners.filter((p) => p.status === key).length;
          return (
            <button key={key} type="button" onClick={() => setShow(key)} aria-pressed={show === key}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${show === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11.5px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Partner</th><th className="px-4 py-2 text-right">Owes now</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">To confirm</th><th className="px-4 py-2 text-right">Paid so far</th><th className="px-4 py-2">Last paid</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const [label, tone] = STATUS[p.status] || STATUS.owes;
                return (
                  <tr key={`${p.kind}:${p.id}`} className="border-t border-slate-100">
                    <td className="px-4 py-2"><p className="font-semibold text-slate-800">{p.name}</p><p className="text-[11.5px] text-slate-500">{p.kind === 'shop' ? 'Shop' : 'Independent pro'}{p.phone ? ` · ${p.phone}` : ''}</p></td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900">{fmt(p.owedPaise)}</td>
                    <td className="px-4 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${tone}`}>{label}</span></td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{p.claimsCount ? `${fmt(p.claimsPaise)} (${p.claimsCount})` : '-'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmt(p.paidPaise)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{day(p.lastPaidAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-400">{partners.length ? 'Nobody matches.' : 'Nobody owes ZappyOne right now.'}</p>}
    </Card>
  );
}

// Collected from partners per month, last six: bars to scale from zero, amount on hover or focus, a table for screen readers.
function Collected({ months }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...months.map((m) => m.paise), 1);
  const total = months.reduce((t, m) => t + m.paise, 0);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">Collected from partners, last 6 months</h3>
        <p className="text-[12px] tabular-nums text-slate-500">{fmt(total)} in all</p>
      </div>
      <div className="relative mt-4 flex h-36 items-end gap-3 border-b border-slate-200" aria-hidden="true">
        {months.map((m, i) => (
          <div key={m.month} className="relative flex h-full flex-1 items-end justify-center"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-full max-w-[36px] rounded-t bg-blue-600" style={{ height: `${(m.paise / max) * 100}%`, minHeight: m.paise ? 2 : 0 }} />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] text-white shadow">
                <b className="tabular-nums">{fmt(m.paise)}</b> · {m.count} payment{m.count === 1 ? '' : 's'}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">
        {months.map((m, i) => (
          <button key={m.month} type="button" aria-label={`${monthName(m.month)}: ${fmt(m.paise)} from ${m.count} payment${m.count === 1 ? '' : 's'}`} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            className="flex-1 rounded text-center text-[11.5px] text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500">{monthName(m.month)}</button>
        ))}
      </div>
      <table className="sr-only">
        <caption>Collected from partners per month</caption>
        <thead><tr><th>Month</th><th>Collected</th><th>Payments</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><td>{monthName(m.month)} {m.month.slice(0, 4)}</td><td>{fmt(m.paise)}</td><td>{m.count}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

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
      <WhoOwes partners={data.partners || []} />
      {data.monthly?.length > 0 && <Collected months={data.monthly} />}
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
