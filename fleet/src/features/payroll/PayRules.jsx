import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useAdminWorkforceSettingsQuery, useAdminSaveWorkforceSettingsMutation } from '@shared/services/api';

const FIELDS = [
  ['workingDays', 'Working days a month', 'A full salary pays for this many days.', 20, 31, 'days'],
  ['monthlyJobTarget', 'Jobs expected a month', 'Pro-rated by paid days, so leave and new joiners are fair.', 0, 1000, 'jobs'],
  ['incentivePerJobPaise', 'Incentive per job above target', 'Paid with the salary.', 0, 1000, '₹'],
  ['lowWorkPct', 'Flag below', 'Share of their pro-rated target; shown in Needs attention.', 0, 100, '%'],
  ['giveBackFlag', 'Flag at hand-backs', 'Jobs handed back in a month.', 1, 100, 'jobs'],
  ['checkInEarlyMin', 'Check-in opens', 'Minutes before a shift.', 0, 120, 'min'],
  ['lateGraceMin', 'Late after', 'Minutes past the start.', 0, 60, 'min'],
];

// The rules payroll and the roster use (server workforce settings); the incentive is typed in rupees and kept in paise.
export default function PayRules() {
  const { data } = useAdminWorkforceSettingsQuery();
  const [save, { isLoading }] = useAdminSaveWorkforceSettingsMutation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const s = data?.settings;
  useEffect(() => { if (s) setForm(Object.fromEntries(FIELDS.map(([k]) => [k, String(k === 'incentivePerJobPaise' ? s[k] / 100 : s[k])]))); }, [s]);
  if (!s || !form) return null;

  const values = Object.fromEntries(FIELDS.map(([k]) => [k, k === 'incentivePerJobPaise' ? Math.round(Number(form[k]) * 100) : Number(form[k])]));
  const valid = FIELDS.every(([k, , , lo, hi]) => form[k] !== '' && Number.isFinite(Number(form[k])) && Number(form[k]) >= lo && Number(form[k]) <= hi);
  const dirty = FIELDS.some(([k]) => values[k] !== s[k]);
  const submit = () => save(values).unwrap().then(() => toast.success('Pay rules saved')).catch((e) => toast.error(e?.data?.error || 'Could not save'));

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span>
          <span className="block text-sm font-bold text-slate-900">Pay rules</span>
          <span className="block text-[12px] text-slate-500">{s.monthlyJobTarget} jobs a month expected, ₹{s.incentivePerJobPaise / 100} for each job above, {s.workingDays} working days.</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(([k, label, hint, lo, hi, unit]) => (
              <label key={k} className="block">
                <span className="block text-[12px] font-bold text-slate-700">{label}</span>
                <span className="mt-1 flex items-center rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
                  {unit === '₹' && <span className="pl-3 text-sm text-slate-400">₹</span>}
                  <input type="number" min={lo} max={hi} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} aria-label={label} className="w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none" />
                  {unit !== '₹' && <span className="pr-3 text-sm text-slate-400">{unit}</span>}
                </span>
                <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>
              </label>
            ))}
          </div>
          <button type="button" onClick={submit} disabled={!dirty || !valid || isLoading} className="mt-3 inline-flex min-w-[80px] items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-100 disabled:text-slate-400">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      )}
    </section>
  );
}
