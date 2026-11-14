import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAdminPartnerCommissionQuery, useAdminUpdatePartnerCommissionMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { UnitInput } from './fields';

const MAX_TIERS = 5;
const EXAMPLES = [99, 249, 499, 999];

// Small jobs pay a smaller commission: a job up to a price pays at most that tier's percent, the lower of it and the partner's own rate (server shop/partner-commission forBase).
export default function SmallJobs() {
  const { data, isLoading, isError } = useAdminPartnerCommissionQuery();
  const [save, { isLoading: saving }] = useAdminUpdatePartnerCommissionMutation();
  const [tiers, setTiers] = useState(null);
  const rates = data?.rates;

  useEffect(() => { if (rates) setTiers((rates.smallJobs || []).map((t) => ({ upto: String(t.uptoRupees), pct: String(t.pct) }))); }, [rates]);

  if (isError) return <EmptyState message="Could not load the small-job tiers. Refresh to try again." />;
  if (isLoading || !tiers) return <PageLoader />;

  const clean = tiers.map((t) => ({ uptoRupees: Number(t.upto), pct: Number(t.pct) }));
  const valid = clean.every((t) => Number.isInteger(t.uptoRupees) && t.uptoRupees > 0 && Number.isFinite(t.pct) && t.pct >= 0 && t.pct <= 50)
    && new Set(clean.map((t) => t.uptoRupees)).size === clean.length;
  const dirty = JSON.stringify(clean) !== JSON.stringify(rates.smallJobs || []);
  const sorted = [...clean].sort((a, b) => a.uptoRupees - b.uptoRupees);
  const normal = Number(rates.individual);
  const pctFor = (price) => Math.min(normal, sorted.find((t) => price <= t.uptoRupees)?.pct ?? normal);
  const set = (i, key, v) => setTiers((all) => all.map((t, j) => (j === i ? { ...t, [key]: v } : t)));

  async function submit() {
    try { await save({ smallJobs: sorted }).unwrap(); toast.success('Saved. Jobs taken from now on use these tiers.'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Small jobs pay less</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">A job up to the price in a row pays at most that row's percent. A partner always pays the lower of this and their own rate, so an agreed deal is never raised. Jobs above every row pay the normal partner rate.</p>
          </div>
          <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
            className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {tiers.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Jobs up to</span>
              <UnitInput value={t.upto} onChange={(v) => set(i, 'upto', v)} label={`Row ${i + 1} price`} unit="₹" min={1} max={100000} step={1} />
              <span className="text-sm font-semibold text-slate-700">pay at most</span>
              <UnitInput value={t.pct} onChange={(v) => set(i, 'pct', v)} label={`Row ${i + 1} percent`} unit="%" min={0} max={50} step={0.5} />
              <button type="button" onClick={() => setTiers((all) => all.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <button type="button" disabled={tiers.length >= MAX_TIERS} onClick={() => setTiers((all) => [...all, { upto: '', pct: '' }])}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 disabled:text-slate-300"><Plus size={15} /> Add a row</button>
          {!valid && <span className="text-[12px] font-semibold text-amber-700">Each row needs its own price and a percent from 0 to 50.</span>}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-bold text-slate-800">What partners pay, with these rows</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">For an individual provider on the normal {normal}% rate.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EXAMPLES.map((price) => (
            <li key={price} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="block text-[12px] text-slate-500">₹{price} job</span>
              <span className="block font-bold tabular-nums text-slate-900">{pctFor(price)}% = ₹{((price * pctFor(price)) / 100).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
