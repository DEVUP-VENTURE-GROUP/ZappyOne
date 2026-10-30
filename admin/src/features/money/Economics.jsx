import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminFeesQuery, useAdminUpdateFeeMutation } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState, fmt } from '../../ui/kit';
import CancellationRules from './economics/CancellationRules';
import WorkerDues from './economics/WorkerDues';
import BoostTips from './economics/BoostTips';
import Surge from './economics/Surge';
import Dispatch from './economics/Dispatch';
import PartnerCommission from './economics/PartnerCommission';

/**
 * Economics: every money rule in one place, a tab per kind of rule, so none of
 * it is fixed in code. Fees and commission per service, cancellation rules,
 * and what workers may owe from cash jobs.
 *
 * Fees tab: what ZappyOne earns and collects on every service line.
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

/** A number typed into a box, or NaN when it is empty or not a number. */
const num = (v) => (v === '' || v == null ? NaN : Number(v));
const within = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;

/** What the row's boxes say, whether it can be saved, and whether it changed. */
function readRow(row, fee, pct, tax) {
  const feePaise = Math.round(num(fee) * 100);
  const pctNum = num(pct);
  const taxNum = tax === null ? 0 : num(tax);
  const valid = within(feePaise, 0, 100000) && within(pctNum, 0, row.maxCommissionPct) && (tax === null || within(taxNum, 0, 40));
  const dirty = feePaise !== row.platformFeePaise || pctNum !== row.commissionPct || (tax !== null && taxNum !== row.taxPct);
  return { feePaise, pctNum, taxNum, valid, dirty };
}

function FeeRow({ row }) {
  const [fee, setFee] = useState(String(row.platformFeePaise / 100));
  const [pct, setPct] = useState(String(row.commissionPct));
  const hasTax = row.taxPct !== null;
  const [tax, setTax] = useState(String(row.taxPct ?? 0));
  const hasRedo = row.redoGuaranteeDays != null;
  const [redo, setRedo] = useState(String(row.redoGuaranteeDays ?? 7));
  const [save, { isLoading }] = useAdminUpdateFeeMutation();

  useEffect(() => { setRedo(String(row.redoGuaranteeDays ?? 7)); }, [row.redoGuaranteeDays]);
  useEffect(() => {
    setFee(String(row.platformFeePaise / 100)); setPct(String(row.commissionPct)); setTax(String(row.taxPct ?? 0));
  }, [row.platformFeePaise, row.commissionPct, row.taxPct]);

  const read = readRow(row, fee, pct, hasTax ? tax : null);
  const { feePaise, pctNum, taxNum } = read;
  const redoNum = num(redo);
  const redoOk = !hasRedo || within(redoNum, 0, 365);
  const valid = read.valid && redoOk;
  const dirty = read.dirty || (hasRedo && redoNum !== row.redoGuaranteeDays);

  const commission = Math.round(EXAMPLE_PAISE * (valid ? pctNum : 0) / 100);
  const taxPaise = valid ? Math.round((EXAMPLE_PAISE + feePaise) * taxNum / 100) : 0;

  async function submit() {
    try {
      await save({ line: row.line, key: row.key, platformFeePaise: feePaise, commissionPct: pctNum, ...(hasTax && { taxPct: taxNum }), ...(hasRedo && { redoGuaranteeDays: Math.round(redoNum) }) }).unwrap();
      toast.success(`${row.label}: saved. New bookings use these rates.`);
    } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{row.label}</p>
        {!row.configured && <p className="mt-0.5 text-[11px] text-slate-400">Not saved yet: these defaults apply</p>}
        {hasRedo && (
          <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">Redo guarantee
            <input type="number" min="0" max="365" step="1" value={redo} onChange={(e) => setRedo(e.target.value)} aria-label={`${row.label} redo guarantee days`} className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-[12px] tabular-nums" /> days
          </label>
        )}
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
          <>Customer pays <b className="text-slate-700">{fmt(EXAMPLE_PAISE + feePaise + taxPaise)}</b>, provider gets <b className="text-slate-700">{fmt(EXAMPLE_PAISE - commission)}</b>, ZappyOne earns <b className="text-slate-700">{fmt(commission + feePaise)}</b></>
        ) : '-'}
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

function FeesTab() {
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

const TABS = [
  ['fees', 'Fees & commission', 'Platform fee, commission and tax for every service'],
  ['partners', 'Partner commission', 'What shops, agencies, companies and individual providers pay ZappyOne on each job'],
  ['cancellations', 'Cancellations', 'What cancelling costs customers, and what backing out costs providers'],
  ['dues', 'Worker dues', 'What workers may owe from cash jobs, and recording what they pay'],
  ['boost', 'Boost & tips', 'What customers may add for a faster match, and tip after a job'],
  ['dispatch', 'Dispatch', 'How fast a job finds its pro: auto-accept, first look, several at once, then wider'],
  ['surge', 'Surge', 'Automatic: busy areas, rain and late night, priced every minute inside your limits'],
];

export default function Economics() {
  const [params, setParams] = useSearchParams();
  // `sub`, like every hub: `tab` is the admin section itself (app/Shell).
  const tab = TABS.some(([id]) => id === params.get('sub')) ? params.get('sub') : 'fees';
  const current = TABS.find(([id]) => id === tab);
  return (
    <div className="space-y-5">
      <SectionHeader title="Economics" subtitle={`${current[2]}. Nothing here is fixed in code.`} />
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('sub', id); return n; }, { replace: true })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === id ? 'border-zappy-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'fees' && <FeesTab />}
      {tab === 'partners' && <PartnerCommission />}
      {tab === 'cancellations' && <CancellationRules />}
      {tab === 'dues' && <WorkerDues />}
      {tab === 'boost' && <BoostTips />}
      {tab === 'dispatch' && <Dispatch />}
      {tab === 'surge' && <Surge />}
    </div>
  );
}
