import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminDispatchQuery, useAdminUpdateDispatchMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { Setting, UnitInput } from './fields';

const KEYS = ['firstLookSec', 'broadcastSec', 'broadcastSize', 'deadlineSec', 'autoAcceptKm', 'widenKm', 'fairBandMin', 'staffRingSec', 'ringSec', 'autoAssignSec'];

/**
 * Dispatch: how fast a job wanted now finds its pro (server jobs/fast-assign),
 * for repairs, pet care and helping. Scheduled bookings keep their own pace.
 *
 *   0 s          staff rung in turn; every nearby free pro rung, first to accept wins
 *   every ring   rung again, a little wider each round
 *   auto-assign  nobody accepted: the fairest nearby free pro is given it
 */
export default function Dispatch() {
  const { data, isLoading, isError } = useAdminDispatchQuery();
  const [save, { isLoading: saving }] = useAdminUpdateDispatchMutation();
  const [form, setForm] = useState(null);
  const s = data?.settings;

  useEffect(() => {
    if (s) setForm({ enabled: s.enabled, ...Object.fromEntries(KEYS.map((k) => [k, String(s[k])])) });
  }, [s]);

  if (isError) return <EmptyState message="Could not load the dispatch settings. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const values = { enabled: form.enabled, ...Object.fromEntries(KEYS.map((k) => [k, Number(form[k])])) };
  const inRange = (k, lo, hi) => form[k] !== '' && Number.isFinite(values[k]) && values[k] >= lo && values[k] <= hi;
  const valid = inRange('firstLookSec', 10, 300) && inRange('broadcastSec', 15, 600) && inRange('broadcastSize', 2, 20)
    && inRange('deadlineSec', 60, 1800) && inRange('autoAcceptKm', 0.5, 30) && inRange('widenKm', 1, 50) && inRange('fairBandMin', 5, 60) && inRange('staffRingSec', 5, 60)
    && inRange('ringSec', 10, 120) && inRange('autoAssignSec', 30, 1800) && values.ringSec < values.autoAssignSec
    && values.firstLookSec + values.broadcastSec <= values.deadlineSec && values.autoAcceptKm <= values.widenKm;
  const dirty = KEYS.some((k) => values[k] !== s[k]) || values.enabled !== s.enabled;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    try { await save(values).unwrap(); toast.success('Dispatch settings saved. New searches use them.'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  const widenAt = values.firstLookSec + values.broadcastSec;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Dispatch</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {valid
              ? `Nearby pros rung every ${values.ringSec}s, the fairest given it at ${Math.round(values.autoAssignSec / 6) / 10} min. Repairs: best pro alone ${values.firstLookSec}s, then ${values.broadcastSize} at once, everyone from ${widenAt}s.`
              : 'Jobs wanted now. Scheduled bookings keep their own pace.'}
          </p>
        </div>
        <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      <Setting title="Fast dispatch" hint="Off: one pro at a time, ten minutes each, as before.">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled')(e.target.checked)} className="h-4 w-4" />
          {form.enabled ? 'On' : 'Off'}
        </label>
      </Setting>
      <Setting title="First look" hint="The best-ranked pro alone. Twice this when the customer picked them.">
        <UnitInput value={form.firstLookSec} onChange={set('firstLookSec')} label="First look seconds" unit="s" min={10} max={300} />
      </Setting>
      <Setting title="Several at once, for" hint="How long the job sits with the next pros before everyone sees it.">
        <UnitInput value={form.broadcastSec} onChange={set('broadcastSec')} label="Broadcast seconds" unit="s" min={15} max={600} />
      </Setting>
      <Setting title="How many at once" hint="The next best pros, the first to claim it wins.">
        <UnitInput value={form.broadcastSize} onChange={set('broadcastSize')} label="Broadcast size" unit="pros" min={2} max={20} />
      </Setting>
      <Setting title="Tell the customer at" hint="If nobody has it by then: auto-accept wider once more, then the customer chooses keep searching, later, or cancel free.">
        <UnitInput value={form.deadlineSec} onChange={set('deadlineSec')} label="Deadline seconds" unit="s" min={60} max={1800} />
      </Setting>
      <Setting title="Ring nearby pros for" hint="Every free pro nearby is rung with this countdown, first to accept wins. Then rung again, a little wider each round.">
        <UnitInput value={form.ringSec} onChange={set('ringSec')} label="Ring seconds" unit="s" min={10} max={120} />
      </Setting>
      <Setting title="Auto-assign at" hint="Nobody accepted by then: the fairest nearby free pro is given the job. Nobody is ever given a job instantly.">
        <UnitInput value={form.autoAssignSec} onChange={set('autoAssignSec')} label="Auto-assign seconds" unit="s" min={30} max={1800} />
      </Setting>
      <Setting title="First ring radius" hint="The first round rings pros this close; each round after reaches further, up to the wider radius.">
        <UnitInput value={form.autoAcceptKm} onChange={set('autoAcceptKm')} label="First ring km" unit="km" min={0.5} max={30} step={0.5} />
      </Setting>
      <Setting title="Wider radius" hint="The last ring rounds and the auto-assign reach this far.">
        <UnitInput value={form.widenKm} onChange={set('widenKm')} label="Wider km" unit="km" min={1} max={50} />
      </Setting>
      <Setting title="Each staff member's turn" hint="ZappyOne staff are never given a job without tapping Accept. The fairest one nearby is rung for this long, then the next. The customer sees the same countdown.">
        <UnitInput value={form.staffRingSec} onChange={set('staffRingSec')} label="Ring time" unit="seconds" min={5} max={60} />
      </Setting>
      <Setting title="Fair share within" hint="Everyone who can reach the customer within this counts as equally close; the one with the fewest jobs today gets it, then whoever has waited longest. Beyond it, the nearest.">
        <UnitInput value={form.fairBandMin} onChange={set('fairBandMin')} label="Fair share minutes" unit="min" min={5} max={60} />
      </Setting>
      {!valid && <p className="px-4 pb-3 text-[12px] text-red-600">Check the numbers: the ring must be shorter than the auto-assign time, the first look and several-at-once must end before the customer is told, and the wider radius must be at least the first ring radius.</p>}
    </Card>
  );
}
