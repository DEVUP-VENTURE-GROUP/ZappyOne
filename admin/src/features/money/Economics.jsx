import { useEffect, useMemo, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminFeesQuery, useAdminUpdateFeeMutation } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState, fmt } from '../../ui/kit';

/**
 * Economics: what ZappyOne earns and collects on every service line.
 *
 *   Platform fee   added to the customer's bill on each booking (₹)
 *   Commission     taken from the provider's service money (%)
 *   Tax            added to the customer's bill on the service + fee (%)
 *
 * The numbers live with each line's pricing, so this page and the line's own
 * console always agree. Typed in rupees, stored in paise. A change applies to
 * new bookings; every booking keeps the rates it was made at.
 */
const GROUPS = [
  { line: 'repair', title: 'Repairs', who: 'shops and technicians' },
  { line: 'pet', title: 'Pet care', who: 'pet care providers' },
  { line: 'helping', title: 'Helping', who: 'helpers' },
  { line: 'event', title: 'Events', who: 'event partners' },
];

const EXAMPLE_PAISE = 100000; // a ₹1,000 job, to show what the numbers mean

function FeeRow({ row }) {
  const [fee, setFee] = useState(String(row.platformFeePaise / 100));
  const [pct, setPct] = useState(String(row.commissionPct));
  const hasTax = row.taxPct !== null;
  const [tax, setTax] = useState(String(row.taxPct ?? 0));
  const [save, { isLoading }] = useAdminUpdateFeeMutation();

  useEffect(() => {
    setFee(String(row.platformFeePaise / 100)); setPct(String(row.commissionPct)); setTax(String(row.taxPct ?? 0));
  }, [row.platformFeePaise, row.commissionPct, row.taxPct]);

  const feePaise = Math.round(Number(fee) * 100);
  const pctNum = Number(pct);
  const taxNum = hasTax ? Number(tax) : 0;
  const valid = fee !== '' && pct !== '' && Number.isFinite(feePaise) && feePaise >= 0 && feePaise <= 100000
    && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= row.maxCommissionPct
    && (!hasTax || (tax !== '' && Number.isFinite(taxNum) && taxNum >= 0 && taxNum <= 40));
  const dirty = feePaise !== row.platformFeePaise || pctNum !== row.commissionPct || (hasTax && taxNum !== row.taxPct);

  const commission = Math.round(EXAMPLE_PAISE * (valid ? pctNum : 0) / 100);
  const taxPaise = valid ? Math.round((EXAMPLE_PAISE + feePaise) * taxNum / 100) : 0;

  async function submit() {
    try {
      await save({ line: row.line, key: row.key, platformFeePaise: feePaise, commissionPct: pctNum, ...(hasTax && { taxPct: taxNum }) }).unwrap();
      toast.success(`${row.label}: saved. New bookings use these rates.`);
    } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{row.label}</p>
        {!row.configured && <p className="mt-0.5 text-[11px] text-slate-400">Not saved yet: these defaults apply</p>}
      </td>
      <td className="px-4 py-3">
        <label className="flex w-full max-w-[128px] items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
          <span className="pl-3 text-sm text-slate-400">₹</span>
          <input type="number" min="0" max="1000" step="1" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)}
            aria-label={`${row.label} platform fee in rupees`} className="w-full bg-transparent px-2 py-2 text-sm tabular-nums outline-none" />
        </label>
      </td>
      <td className="px-4 py-3">
        <label className="flex w-full max-w-[112px] items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
          <input type="number" min="0" max={row.maxCommissionPct} step="0.5" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)}
            aria-label={`${row.label} commission percent`} className="w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none" />
          <span className="pr-3 text-sm text-slate-400">%</span>
        </label>
        {!valid && <p className="mt-1 text-[11px] text-red-600">Fee ₹0–₹1,000, commission 0–{row.maxCommissionPct}%, tax 0–40%</p>}
      </td>
      <td className="px-4 py-3">
        {hasTax ? (
          <label className="flex w-full max-w-[96px] items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
            <input type="number" min="0" max="40" step="0.5" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)}
              aria-label={`${row.label} tax percent`} className="w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none" />
            <span className="pr-3 text-sm text-slate-400">%</span>
          </label>
        ) : <p className="py-2 text-[12px] text-slate-400">No tax line</p>}
      </td>
      <td className="px-4 py-3 text-[12px] leading-relaxed text-slate-500 tabular-nums">
        {valid ? (
          <>Customer pays <b className="text-slate-700">{fmt(EXAMPLE_PAISE + feePaise + taxPaise)}</b> · provider gets <b className="text-slate-700">{fmt(EXAMPLE_PAISE - commission)}</b> · ZappyOne earns <b className="text-slate-700">{fmt(commission + feePaise)}</b></>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <button type="button" onClick={submit} disabled={!dirty || !valid || isLoading}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      </td>
    </tr>
  );
}

export default function Economics() {
  const { data, isLoading, isError } = useAdminFeesQuery();
  const byLine = useMemo(() => {
    const m = {};
    for (const r of data?.lines || []) (m[r.line] ||= []).push(r);
    return m;
  }, [data]);

  if (isLoading) return <PageLoader />;
  if (isError) return <EmptyState message="Could not load the economics settings. Refresh to try again." />;

  return (
    <div className="space-y-5">
      <SectionHeader title="Economics" subtitle="Platform fee, commission and tax for every service. Nothing here is fixed in code." />

      <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
        <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
        <p>
          <b className="text-slate-800">Platform fee</b> is added to the customer&apos;s bill.{' '}
          <b className="text-slate-800">Commission</b> comes out of the provider&apos;s service money, never out of travel, tax or the platform fee.{' '}
          <b className="text-slate-800">Tax</b> is added on the service and fee; it starts at 0% until you set the rate you are registered for.
          Changes apply to new bookings only; bookings already made keep their rates.
        </p>
      </div>

      {GROUPS.map((g) => (byLine[g.line]?.length ? (
        <Card key={g.line} className="overflow-hidden p-0">
          <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">{g.title}</h3>
            <p className="text-[12px] text-slate-400">Commission from {g.who}</p>
          </div>
          <div className="overflow-x-auto">
            {/* Fixed columns so every service line's table lines up with the others. */}
            <table className="w-full min-w-[860px] table-fixed">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[13%]" /><col className="w-[12%]" />
                <col className="w-[11%]" /><col /><col className="w-[96px]" />
              </colgroup>
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2">Service</th>
                  <th className="px-4 py-2">Platform fee</th>
                  <th className="px-4 py-2">Commission</th>
                  <th className="px-4 py-2">Tax</th>
                  <th className="px-4 py-2">On a ₹1,000 job</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>{byLine[g.line].map((r) => <FeeRow key={`${r.line}-${r.key}`} row={r} />)}</tbody>
            </table>
          </div>
        </Card>
      ) : null))}
    </div>
  );
}
