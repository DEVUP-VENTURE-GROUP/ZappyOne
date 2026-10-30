import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminPartnerCommissionQuery, useAdminUpdatePartnerCommissionMutation, useAdminPartnerRateOverridesQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { Setting, UnitInput } from './fields';

const TYPES = [
  ['shop', 'Shops', 'A counter customers can walk into.'],
  ['agency', 'Agencies', 'A team that goes to customers, with no counter.'],
  ['company', 'Service companies', 'A registered company with its own staff.'],
  ['individual', 'Individual providers', 'One person working for themselves.'],
  ['ownLinkPct', "Through the partner's own link", 'Bookings from customers the partner brought with their storefront link, for their first months; reviews from these never count in their public rating.'],
];
const KEYS = [...TYPES.map(([k]) => k), 'ownLinkMonths'];
const MAX = 50;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Partners with a rate agreed with them alone; each is set or ended from that partner's panel in Providers.
function CustomRates() {
  const { data } = useAdminPartnerRateOverridesQuery();
  const rows = data?.overrides || [];
  return (
    <Card className="overflow-hidden p-0">
      <div className="px-4 py-3">
        <h3 className="text-sm font-bold text-slate-800">Agreed rates</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">Partners with their own rate. Set or end one from the partner's panel under Providers → Shops or Workers.</p>
      </div>
      {rows.length === 0 ? <p className="border-t border-slate-100 px-4 py-3 text-[12px] text-slate-400">None yet. Every partner pays their type's rate.</p> : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {rows.map((r) => (
            <li key={`${r.kind}${r.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-800">{r.name}</span><span className="block truncate text-[11px] text-slate-500">{r.kind === 'shop' ? 'Partner' : 'Individual provider'}{r.note ? `, ${r.note}` : ''}</span></span>
              <span className="shrink-0 tabular-nums font-bold text-slate-900">{r.pct}%</span>
              <span className={`w-28 shrink-0 text-right text-[11px] ${r.active ? 'text-slate-500' : 'text-amber-600'}`}>{r.until ? `${r.active ? 'until' : 'ended'} ${fmtDate(r.until)}` : 'no end date'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Percent ZappyOne takes from a partner's service money, by kind of partner (server shop/partner-commission); own staff are not partners.
export default function PartnerCommission() {
  const { data, isLoading, isError } = useAdminPartnerCommissionQuery();
  const [save, { isLoading: saving }] = useAdminUpdatePartnerCommissionMutation();
  const [form, setForm] = useState(null);
  const rates = data?.rates;

  useEffect(() => { if (rates) setForm(Object.fromEntries(KEYS.map((k) => [k, String(rates[k])]))); }, [rates]);

  if (isError) return <EmptyState message="Could not load partner commission. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const values = Object.fromEntries(KEYS.map((k) => [k, Number(form[k])]));
  const valid = KEYS.every((k) => form[k] !== '' && Number.isFinite(values[k]) && values[k] >= 0 && values[k] <= (k === 'ownLinkMonths' ? 36 : MAX));
  const dirty = KEYS.some((k) => values[k] !== rates[k]);

  async function submit() {
    try { await save(values).unwrap(); toast.success('Saved. Jobs partners take from now on use these rates.'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Partner commission</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
              Taken from the partner's service money when they take a job, in place of the service's own commission. The customer's bill does not change. ZappyOne's own staff are not partners: their job money is ZappyOne's.
            </p>
          </div>
          <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
            className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
        {TYPES.map(([k, title, hint]) => (
          <Setting key={k} title={title} hint={`${hint} On a ₹1,000 job: ₹${Number.isFinite(values[k]) ? Math.round(10 * values[k]) : 0} to ZappyOne.`}>
            <UnitInput value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} label={`${title} commission percent`} unit="%" min={0} max={MAX} step={0.5} />
          </Setting>
        ))}
        <Setting title="Own-link rate lasts" hint="Months from the day the partner joined ZappyOne. 0 turns the own-link rate off.">
          <UnitInput value={form.ownLinkMonths} onChange={(v) => setForm((f) => ({ ...f, ownLinkMonths: v }))} label="Own-link months" unit="months" min={0} max={36} step={1} />
        </Setting>
      </Card>
      <CustomRates />
    </div>
  );
}
