import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminScheduleCheckQuery, useAdminUpdateScheduleCheckMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { Setting, UnitInput } from './fields';

const KEYS = ['askBeforeMin', 'askAgainBeforeMin', 'reofferBeforeMin', 'alertBeforeMin', 'clashGapMin'];

// Jobs booked for later: the pro confirms before the time, or the job goes to the next pro or store while there is still time (server jobs/time-check).
export default function BookedVisits() {
  const { data, isLoading, isError } = useAdminScheduleCheckQuery();
  const [save, { isLoading: saving }] = useAdminUpdateScheduleCheckMutation();
  const [form, setForm] = useState(null);
  const s = data?.scheduleCheck;

  useEffect(() => { if (s) setForm({ on: s.on, ...Object.fromEntries(KEYS.map((k) => [k, String(s[k])])) }); }, [s]);

  if (isError) return <EmptyState message="Could not load booked-visit settings. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const body = { on: form.on, ...Object.fromEntries(KEYS.map((k) => [k, Number(form[k])])) };
  const ordered = body.askBeforeMin > body.askAgainBeforeMin && body.askAgainBeforeMin > body.reofferBeforeMin && body.reofferBeforeMin > body.alertBeforeMin && body.alertBeforeMin >= 5 && body.clashGapMin >= 0 && body.clashGapMin <= 240;
  const dirty = JSON.stringify(body) !== JSON.stringify({ on: s.on, ...Object.fromEntries(KEYS.map((k) => [k, s[k]])) });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    try { await save(body).unwrap(); toast.success('Saved. Applies to the next booked job.'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800">Booked visits</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">For a job booked for later, the pro is asked to confirm before the time. If they do not, the job goes to the next pro or store while there is still time, and the customer is told. Saying &quot;Can&apos;t make it&quot; early is free; never confirming counts like a hand-back but is never charged.</p>
          </div>
          <button type="button" onClick={submit} disabled={!dirty || !ordered || saving}
            className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </button>
        </div>
        <Setting title="Confirm before the time" hint="Off: booked jobs stay with the pro who took them, as before.">
          <button type="button" role="switch" aria-checked={form.on} aria-label="Confirm before the time" onClick={() => setForm((f) => ({ ...f, on: !f.on }))}
            className={`h-7 w-12 rounded-full p-0.5 transition ${form.on ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <span className={`block h-6 w-6 rounded-full bg-white shadow transition ${form.on ? 'translate-x-5' : ''}`} />
          </button>
        </Setting>
        <Setting title="Ask the pro" hint="Minutes before the booked time. A job taken later than this is confirmed by taking it.">
          <UnitInput value={form.askBeforeMin} onChange={set('askBeforeMin')} label="Ask the pro" unit="min" min={20} max={240} step={5} />
        </Setting>
        <Setting title="Ask again">
          <UnitInput value={form.askAgainBeforeMin} onChange={set('askAgainBeforeMin')} label="Ask again" unit="min" min={15} max={235} step={5} />
        </Setting>
        <Setting title="Move the job if not confirmed" hint="Also the last moment &quot;Can't make it&quot; is free.">
          <UnitInput value={form.reofferBeforeMin} onChange={set('reofferBeforeMin')} label="Move the job if not confirmed" unit="min" min={10} max={230} step={5} />
        </Setting>
        <Setting title="Alert pro and customer" hint="The pro is told to set off; the customer that the pro is due.">
          <UnitInput value={form.alertBeforeMin} onChange={set('alertBeforeMin')} label="Alert pro and customer" unit="min" min={5} max={60} step={1} />
        </Setting>
        <Setting title="Time between two booked jobs" hint="A pro cannot take a job this close to one they already have booked. 0 = no check.">
          <UnitInput value={form.clashGapMin} onChange={set('clashGapMin')} label="Time between two booked jobs" unit="min" min={0} max={240} step={15} />
        </Setting>
      </Card>
      {!ordered && <p role="alert" className="text-[12.5px] font-semibold text-amber-700">The times must go down in order: ask, ask again, move the job, alert (at least 5 min).</p>}
      {ordered && form.on && (
        <Card className="p-4 text-[13px] text-slate-600">
          For a 3:00 pm booking: the pro is asked at {at(body.askBeforeMin)}, again at {at(body.askAgainBeforeMin)}, the job moves at {at(body.reofferBeforeMin)} if they stay silent, and both sides are alerted at {at(body.alertBeforeMin)}.
        </Card>
      )}
    </div>
  );
}

// Clock time this many minutes before 3:00 pm, for the example.
function at(before) {
  const t = 15 * 60 - before;
  const h = Math.floor(t / 60);
  return `${h % 12 || 12}:${String(t % 60).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
