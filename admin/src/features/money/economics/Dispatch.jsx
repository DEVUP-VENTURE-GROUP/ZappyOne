import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminDispatchQuery, useAdminUpdateDispatchMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { Setting, UnitInput } from './fields';

const KEYS = ['firstLookSec', 'broadcastSec', 'broadcastSize', 'deadlineSec', 'autoAcceptKm', 'widenKm', 'autoAcceptPauseDays', 'fairBandMin', 'staffRingSec'];

/**
 * Dispatch: how fast a job wanted now finds its pro (server jobs/fast-assign),
 * for repairs, pet care and helping. Scheduled bookings keep their own pace.
 *
 *   0 s          a pro with auto-accept on, nearby, takes it with no tap
 *   0 s          first look: the best pro alone (twice as long if the customer chose them)
 *   first look   several pros at once, the first to claim it wins
 *   + broadcast  every pro, a wider radius, offline pros nudged
 *   deadline     auto-accept again as far as the wider radius; then the
 *                customer is told and chooses: keep searching, later, or cancel free
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
    && inRange('deadlineSec', 60, 1800) && inRange('autoAcceptKm', 0.5, 30) && inRange('widenKm', 1, 50) && inRange('autoAcceptPauseDays', 0, 90) && inRange('fairBandMin', 5, 60) && inRange('staffRingSec', 5, 60)
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
              ? `Best pro alone for ${values.firstLookSec}s, then ${values.broadcastSize} at once, everyone from ${widenAt}s, the customer told at ${Math.round(values.deadlineSec / 6) / 10} min.`
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
      <Setting title="Auto-accept radius" hint="Pros with auto-accept on take jobs this close with no tap. Each pro may set a smaller limit.">
        <UnitInput value={form.autoAcceptKm} onChange={set('autoAcceptKm')} label="Auto-accept km" unit="km" min={0.5} max={30} step={0.5} />
      </Setting>
      <Setting title="Wider radius" hint="Used once everyone sees the job, and for the last auto-accept try.">
        <UnitInput value={form.widenKm} onChange={set('widenKm')} label="Wider km" unit="km" min={1} max={50} />
      </Setting>
      <Setting title="Each staff member's turn" hint="ZappyOne staff are never given a job without tapping Accept. The fairest one nearby is rung for this long, then the next. The customer sees the same countdown.">
        <UnitInput value={form.staffRingSec} onChange={set('staffRingSec')} label="Ring time" unit="seconds" min={5} max={60} />
      </Setting>
      <Setting title="Pause after a give-back" hint="A pro who hands back a job auto-accept took for them loses auto-accept for this long.">
        <UnitInput value={form.autoAcceptPauseDays} onChange={set('autoAcceptPauseDays')} label="Pause days" unit="days" min={0} max={90} />
      </Setting>
      <Setting title="Fair share within" hint="Everyone who can reach the customer within this counts as equally close; the one with the fewest jobs today gets it, then whoever has waited longest. Beyond it, the nearest.">
        <UnitInput value={form.fairBandMin} onChange={set('fairBandMin')} label="Fair share minutes" unit="min" min={5} max={60} />
      </Setting>
      {!valid && <p className="px-4 pb-3 text-[12px] text-red-600">Check the numbers: the first look and several-at-once must end before the customer is told, and the wider radius must be at least the auto-accept radius.</p>}
    </Card>
  );
}
