import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import {
  useAdminShieldFeeScheduleQuery, useAdminShieldUpdateFeeScheduleMutation,
  useAdminGetCancellationConfigQuery, useAdminUpdateCancellationConfigMutation,
} from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { RupeeInput, UnitInput, Setting, toRupees, toPaise } from './fields';

/** The moments a customer can cancel, in the order a job reaches them. */
const STAGES = [
  ['searching', 'Still finding someone', 'Before any provider has accepted'],
  ['assigned', 'Provider accepted', 'After the free minutes below'],
  ['on_the_way', 'On the way', 'The provider has set off'],
  ['arrived', 'At the door', 'Also what a no-show customer pays'],
];
const TIERS = ['1st cancel', '2nd cancel', '3rd and later'];

function SaveButton({ busy, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
      {busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
    </button>
  );
}

/** What a customer pays to cancel, by how far the job got and how often they cancel. */
function CustomerFees() {
  const { data, isLoading } = useAdminShieldFeeScheduleQuery();
  const [save, { isLoading: saving }] = useAdminShieldUpdateFeeScheduleMutation();
  const [grid, setGrid] = useState(null);
  const [share, setShare] = useState('');

  useEffect(() => {
    if (data?.feeSchedule) setGrid(Object.fromEntries(STAGES.map(([s]) => [s, (data.feeSchedule[s] || [0, 0, 0]).map(toRupees)])));
    if (data?.defaultSplit) setShare(String(data.defaultSplit.workerPct));
  }, [data]);

  if (isLoading || !grid) return <PageLoader />;
  const paise = Object.fromEntries(STAGES.map(([s]) => [s, grid[s].map(toPaise)]));
  const shareNum = share === '' ? NaN : Number(share);
  const valid = STAGES.every(([s]) => paise[s].every((p) => Number.isFinite(p) && p >= 0 && p <= 100000))
    && Number.isInteger(shareNum) && shareNum >= 50 && shareNum <= 100;
  const dirty = STAGES.some(([s]) => paise[s].some((p, i) => p !== (data.feeSchedule[s] || [])[i]))
    || shareNum !== data.defaultSplit?.workerPct;

  async function submit() {
    try {
      await save({
        feeSchedule: { created: data.feeSchedule.created || [0, 0, 0], ...paise },
        splitWorkerPct: shareNum, splitPlatformPct: 100 - shareNum,
      }).unwrap();
      toast.success('Customer cancellation fees saved');
    } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Customer cancelling</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">Counted over the last 30 days. Always free after a provider backs out. Repairs and helping; pet care follows each service&apos;s own policy.</p>
        </div>
        <SaveButton busy={saving} disabled={!dirty || !valid} onClick={submit} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2">When they cancel</th>
              {TIERS.map((t) => <th key={t} className="px-4 py-2">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {STAGES.map(([s, label, hint]) => (
              <tr key={s} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="text-[11.5px] text-slate-400">{hint}</p>
                </td>
                {grid[s].map((v, i) => (
                  <td key={i} className="px-4 py-3">
                    {s === 'searching' && i === 0
                      ? <p className="text-[12px] text-slate-400">Always free</p>
                      : <RupeeInput value={v} label={`${label}, ${TIERS[i]}`} onChange={(nv) => setGrid((g) => ({ ...g, [s]: g[s].map((x, j) => (j === i ? nv : x)) }))} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Setting title="Providers' share of the Shield fund"
        hint="Every fee collected goes into the week's fund. Each Monday this share is paid to the providers whose trips were cancelled, by how far they had got; ZappyOne keeps the rest.">
        <UnitInput value={share} onChange={setShare} unit="%" min={50} max={100} label="Providers' share" />
      </Setting>
      {!valid && <p className="px-4 pb-3 text-[12px] text-red-600">Each fee is ₹0 to ₹1,000; the providers' share is 50 to 100%.</p>}
    </Card>
  );
}

/** Settings stored in the cancellation rules (one versioned record), edited a group at a time. */
export function useRuleForm(fields) {
  const { data, isLoading, isError } = useAdminGetCancellationConfigQuery();
  const [save, { isLoading: saving }] = useAdminUpdateCancellationConfigMutation();
  const [form, setForm] = useState(null);
  const cfg = data?.config;
  useEffect(() => {
    if (cfg) setForm(Object.fromEntries(fields.map((f) => [f.key, f.toForm(cfg[f.key])])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);
  const values = form ? Object.fromEntries(fields.map((f) => [f.key, f.toValue(form[f.key])])) : {};
  const valid = !!form && fields.every((f) => f.valid(values[f.key]));
  const dirty = !!form && fields.some((f) => values[f.key] !== cfg[f.key]);
  const set = (key) => (v) => setForm((x) => ({ ...x, [key]: v }));
  async function submit(message) {
    try { await save(values).unwrap(); toast.success(message); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }
  return { cfg, form, set, valid, dirty, saving, submit, isLoading, isError };
}

export const rupeeField = (key, max = 100000) => ({ key, toForm: toRupees, toValue: toPaise, valid: (p) => Number.isFinite(p) && p >= 0 && p <= max });
export const numField = (key, lo, hi, scale = 1) => ({
  key, toForm: (v) => (v == null ? '' : String(v / scale)), toValue: (v) => (v === '' ? NaN : Math.round(Number(v) * scale)),
  valid: (n) => Number.isFinite(n) && n >= lo * scale && n <= hi * scale,
});

const PROVIDER_FIELDS = [
  numField('freeCancelWindowSec', 0, 60, 60),
  rupeeField('workerCancelPenaltyPaise', 100000),
  { ...numField('lateWorkerCancelMultiplier', 1, 10), toValue: (v) => (v === '' ? NaN : Number(v)) },
  numField('workerCancelLimit', 1, 20),
  numField('workerCancelWindowSec', 1, 168, 3600),
  rupeeField('workerNoShowPenaltyPaise', 100000),
  numField('workerRejectLimit', 1, 50),
  numField('customerWaitMinutes', 1, 60),
  numField('providerLateMinutes', 5, 180),
];

function ProviderRules() {
  const f = useRuleForm(PROVIDER_FIELDS);
  if (f.isLoading || !f.form) return f.isError ? <EmptyState message="Could not load the rules. Refresh to try again." /> : <PageLoader />;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Timing and provider rules</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">When cancelling turns paid, and what backing out of an accepted job costs a provider.</p>
        </div>
        <SaveButton busy={f.saving} disabled={!f.dirty || !f.valid} onClick={() => f.submit('Cancellation rules saved')} />
      </div>
      <Setting title="Free minutes after a provider accepts" hint="A customer who cancels within this time pays nothing.">
        <UnitInput value={f.form.freeCancelWindowSec} onChange={f.set('freeCancelWindowSec')} unit="min" max={60} label="Free minutes" />
      </Setting>
      <Setting title="Handing back an accepted job" hint="Charged from the second hand-back in the period; the first is a warning. Genuine reasons are free.">
        <RupeeInput value={f.form.workerCancelPenaltyPaise} onChange={f.set('workerCancelPenaltyPaise')} label="Hand-back penalty" />
      </Setting>
      <Setting title="Once on the way, multiply by" hint="Handing back after setting off wastes more of the customer's time.">
        <UnitInput value={f.form.lateWorkerCancelMultiplier} onChange={f.set('lateWorkerCancelMultiplier')} unit="×" min={1} max={10} step={0.5} label="Late multiplier" />
      </Setting>
      <Setting title="Hand-backs before going offline" hint="Reaching this many in the period takes a worker offline until it ends.">
        <UnitInput value={f.form.workerCancelLimit} onChange={f.set('workerCancelLimit')} unit="jobs" min={1} max={20} label="Daily limit" />
      </Setting>
      <Setting title="Counted over" hint="The period hand-backs are counted in.">
        <UnitInput value={f.form.workerCancelWindowSec} onChange={f.set('workerCancelWindowSec')} unit="hours" min={1} max={168} label="Counting period" />
      </Setting>
      <Setting title="Provider did not turn up" hint="Charged when a customer reports the provider never came.">
        <RupeeInput value={f.form.workerNoShowPenaltyPaise} onChange={f.set('workerNoShowPenaltyPaise')} label="No-show penalty" />
      </Setting>
      <Setting title="Offers passed in a row before going offline" hint="A worker who keeps passing is set offline so customers are not matched to them. No charge; they go online again with one tap. Accepting a job resets the count.">
        <UnitInput value={f.form.workerRejectLimit} onChange={f.set('workerRejectLimit')} unit="offers" min={1} max={50} label="Passes in a row" />
      </Setting>
      <Setting title="Wait at the door before 'customer not here'" hint="After this long at the address, the provider can close the job and the customer pays the at-the-door fee.">
        <UnitInput value={f.form.customerWaitMinutes} onChange={f.set('customerWaitMinutes')} unit="min" min={1} max={60} label="Wait at the door" />
      </Setting>
      <Setting title="Late before 'provider not coming'" hint="This long past the booked time with nobody there, the customer can report it: the provider pays the no-show penalty and the next one is sent.">
        <UnitInput value={f.form.providerLateMinutes} onChange={f.set('providerLateMinutes')} unit="min" min={5} max={180} label="Provider late by" />
      </Setting>
      {!f.valid && <p className="px-4 pb-3 text-[12px] text-red-600">Check the boxes: amounts ₹0 to ₹1,000, waits and limits within their ranges.</p>}
    </Card>
  );
}

export default function CancellationRules() {
  return (
    <div className="space-y-5">
      <CustomerFees />
      <ProviderRules />
    </div>
  );
}
