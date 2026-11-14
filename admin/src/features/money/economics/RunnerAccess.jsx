import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminRunnerAccessQuery, useAdminUpdateRunnerAccessMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { Setting, UnitInput } from './fields';

const WINDOWS = [6, 8, 12, 24];
const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;

// Errand runners keep the whole fare and pay a pass per window with enough errands, like a ride app's captain (server jobs/runner-access).
export default function RunnerAccess() {
  const { data, isLoading, isError } = useAdminRunnerAccessQuery();
  const [save, { isLoading: saving }] = useAdminUpdateRunnerAccessMutation();
  const [form, setForm] = useState(null);
  const r = data?.runnerAccess;

  useEffect(() => { if (r) setForm({ on: r.on, fee: String(r.feePaise / 100), windowHours: r.windowHours, minJobs: String(r.minJobs), limit: String(r.limitPaise / 100) }); }, [r]);

  if (isError) return <EmptyState message="Could not load the runner pass. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const body = { on: form.on, feePaise: Math.round(Number(form.fee) * 100), windowHours: form.windowHours, minJobs: Number(form.minJobs), limitPaise: Math.round(Number(form.limit) * 100) };
  const valid = body.feePaise >= 0 && Number.isInteger(body.minJobs) && body.minJobs >= 1 && body.limitPaise >= 0;
  const dirty = JSON.stringify(body) !== JSON.stringify({ on: r.on, feePaise: r.feePaise, windowHours: r.windowHours, minJobs: r.minJobs, limitPaise: r.limitPaise });

  async function submit() {
    try { await save(body).unwrap(); toast.success('Saved. Applies from the next errand finished.'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Errand runner pass</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">Runners keep the whole errand fare: no commission. Instead, in each window where they finish enough errands, a small pass is added to what they owe. ZappyOne staff never pay it.</p>
          </div>
          <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
            className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
        <Setting title="Pass instead of commission" hint="Off: errands carry the errand type's commission again.">
          <button type="button" role="switch" aria-checked={form.on} onClick={() => setForm((f) => ({ ...f, on: !f.on }))}
            className={`h-7 w-12 rounded-full p-0.5 transition ${form.on ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <span className={`block h-6 w-6 rounded-full bg-white shadow transition ${form.on ? 'translate-x-5' : ''}`} />
          </button>
        </Setting>
        <Setting title="Pass per window">
          <UnitInput value={form.fee} onChange={(v) => setForm((f) => ({ ...f, fee: v }))} label="Pass per window" unit="₹" min={0} max={1000} step={5} />
        </Setting>
        <Setting title="Window length" hint="Windows start at midnight, India time.">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Window length">
            {WINDOWS.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={form.windowHours === h} onClick={() => setForm((f) => ({ ...f, windowHours: h }))}
                className={`rounded-md px-3 py-1 text-[12.5px] font-bold ${form.windowHours === h ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{h} hrs</button>
            ))}
          </div>
        </Setting>
        <Setting title="Errands before it is charged" hint="Fewer errands in a window: nothing is charged for it.">
          <UnitInput value={form.minJobs} onChange={(v) => setForm((f) => ({ ...f, minJobs: v }))} label="Errands before it is charged" unit="jobs" min={1} max={50} step={1} />
        </Setting>
        <Setting title="Owed limit for runners" hint="At this much owed: one alert, and no new errands until they pay.">
          <UnitInput value={form.limit} onChange={(v) => setForm((f) => ({ ...f, limit: v }))} label="Owed limit for runners" unit="₹" min={0} max={10000} step={50} />
        </Setting>
      </Card>
      {valid && form.on && (
        <Card className="p-4 text-[13px] text-slate-600">
          A runner who finishes {body.minJobs} errands between 12:00 and {12 + (body.windowHours === 24 ? 12 : body.windowHours)}:00 pays {rupees(body.feePaise)} for that window and keeps every rupee of the fares. After {Math.max(1, Math.ceil(body.limitPaise / Math.max(1, body.feePaise)))} unpaid windows they reach the {rupees(body.limitPaise)} limit.
        </Card>
      )}
    </div>
  );
}
