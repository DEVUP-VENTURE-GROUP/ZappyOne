import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminBoostTipsQuery, useAdminUpdateBoostTipsMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { RupeeInput, Setting, toRupees, toPaise } from './fields';

/** "10, 20, 50" ↔ [10, 20, 50]: whole rupees, smallest first, no repeats. */
const toList = (text) => [...new Set(String(text).split(/[\s,]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);
const listOk = (list, max) => list.length > 0 && list.every((n) => Number.isInteger(n) && n >= 1 && n <= 1000) && list.length <= max;

/**
 * Boost: what a customer may add while we are still finding a provider, all
 * of it the provider's. Tips: what they may give once the job is done. Both
 * apply to repairs, pet care and helping.
 */
export default function BoostTips() {
  const { data, isLoading, isError } = useAdminBoostTipsQuery();
  const [save, { isLoading: saving }] = useAdminUpdateBoostTipsMutation();
  const [form, setForm] = useState(null);
  const s = data?.settings;

  useEffect(() => {
    if (s) {
      setForm({
        boostEnabled: s.boostEnabled, boostOptions: s.boostOptions.join(', '), boostMaxPaise: toRupees(s.boostMaxPaise),
        tipOptions: s.tipOptions.join(', '), tipMaxPaise: toRupees(s.tipMaxPaise),
      });
    }
  }, [s]);

  if (isError) return <EmptyState message="Could not load the boost and tip settings. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const values = {
    boostEnabled: form.boostEnabled,
    boostOptions: toList(form.boostOptions),
    boostMaxPaise: toPaise(form.boostMaxPaise),
    tipOptions: toList(form.tipOptions),
    tipMaxPaise: toPaise(form.tipMaxPaise),
  };
  const valid = listOk(values.boostOptions, 8) && listOk(values.tipOptions, 6)
    && Number.isFinite(values.boostMaxPaise) && values.boostMaxPaise >= 0 && values.boostMaxPaise <= 100000
    && Number.isFinite(values.tipMaxPaise) && values.tipMaxPaise >= 0 && values.tipMaxPaise <= 100000
    && values.boostOptions[0] * 100 <= values.boostMaxPaise && values.tipOptions[0] * 100 <= values.tipMaxPaise;
  const dirty = JSON.stringify(values) !== JSON.stringify({
    boostEnabled: s.boostEnabled, boostOptions: s.boostOptions, boostMaxPaise: s.boostMaxPaise, tipOptions: s.tipOptions, tipMaxPaise: s.tipMaxPaise,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    try { await save(values).unwrap(); toast.success('Boost and tip settings saved'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  const listInput = (key, label) => (
    <input value={form[key]} onChange={(e) => set(key)(e.target.value)} aria-label={label} placeholder="10, 20, 50"
      className="w-full min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-blue-500 sm:w-56" />
  );

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Boost and tips</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">Both go entirely to the provider; ZappyOne takes nothing from them. Repairs, pet care and helping.</p>
        </div>
        <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      <Setting title="Let customers boost" hint="Offered after a minute of searching with nobody accepting. Providers nearby are told again, including those who passed.">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.boostEnabled} onChange={(e) => set('boostEnabled')(e.target.checked)} className="h-4 w-4" />
          {form.boostEnabled ? 'On' : 'Off'}
        </label>
      </Setting>
      <Setting title="Boost amounts (₹)" hint="The buttons the customer sees, separated by commas. Up to 8.">
        {listInput('boostOptions', 'Boost amounts')}
      </Setting>
      <Setting title="Most a customer can add" hint="In total, across several boosts on one booking.">
        <RupeeInput value={form.boostMaxPaise} onChange={set('boostMaxPaise')} max={1000} label="Boost maximum" />
      </Setting>
      <Setting title="Tip amounts (₹)" hint="Shown after a job is done, separated by commas. Up to 6.">
        {listInput('tipOptions', 'Tip amounts')}
      </Setting>
      <Setting title="Largest tip" hint="Set to ₹0 to turn tips off.">
        <RupeeInput value={form.tipMaxPaise} onChange={set('tipMaxPaise')} max={1000} label="Tip maximum" />
      </Setting>
      {!valid && <p className="px-4 pb-3 text-[12px] text-red-600">Use whole rupees from ₹1 to ₹1,000; the smallest amount must fit under its maximum.</p>}
    </Card>
  );
}
