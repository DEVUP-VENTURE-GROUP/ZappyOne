import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Power, Flame, CloudRain, Moon, ExternalLink } from 'lucide-react';
import { useAdminSurgeQuery, useAdminUpdateSurgeMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState, fmt } from '../../../ui/kit';
import { RupeeInput, UnitInput, Setting, toRupees, toPaise } from './fields';

/**
 * Surge — automatic. Set the limits once; the engine prices every ~1 km zone
 * every minute from bookings vs pros nearby, live weather and the clock
 * (server jobs/surge). Nothing here is switched by hand day to day.
 *
 *   always    on by itself for every service where a pro travels to the
 *             customer — nothing to switch per service or per day
 *   limits    the busy-area cap, the ₹ ceiling, rain and night amounts, the
 *             provider's share, how much demand counts
 *   kill      everything back to no surge at once
 *   live      every zone pricing right now, and why
 *   results   what it earned ZappyOne, and whether people still booked
 */
export default function Surge() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isError } = useAdminSurgeQuery(days, { pollingInterval: 30000 });
  const [save, { isLoading: saving }] = useAdminUpdateSurgeMutation();
  const [form, setForm] = useState(null);
  const s = data?.settings;

  useEffect(() => {
    if (s) {
      setForm({
        maxMultiplier: s.maxMultiplier, ceilingPaise: toRupees(s.ceilingPaise),
        rainPaise: toRupees(s.rainPaise), nightPaise: toRupees(s.nightPaise), nightStartHour: s.nightStartHour, nightEndHour: s.nightEndHour,
        providerSharePct: s.providerSharePct, minDemand: s.minDemand, lockMinutes: s.lockMinutes,
      });
    }
  }, [s]);

  if (isError) return <EmptyState message="Could not load surge. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const values = {
    maxMultiplier: Number(form.maxMultiplier), ceilingPaise: toPaise(form.ceilingPaise),
    rainPaise: toPaise(form.rainPaise), nightPaise: toPaise(form.nightPaise), nightStartHour: Number(form.nightStartHour),
    nightEndHour: Number(form.nightEndHour), providerSharePct: Number(form.providerSharePct), minDemand: Number(form.minDemand), lockMinutes: Number(form.lockMinutes),
  };
  const bad = Object.entries(values).filter(([, v]) => !Number.isFinite(v)).map(([kk]) => kk);

  async function submit(patch = values) {
    try { await save(patch).unwrap(); toast.success('Saved. The engine uses it from the next minute.'); } catch (err) { toast.error(err?.data?.error || 'Could not save'); }
  }
  const set = (kk) => (v) => setForm((f) => ({ ...f, [kk]: v }));
  const zones = data.zones?.zones || [];
  const surging = zones.filter((z) => z.multiplier > 1);
  const rep = data.report;

  return (
    <div className="space-y-4">
      {/* Kill switch first: the one thing that may need a hand in a hurry. */}
      <Card className={`flex flex-wrap items-center justify-between gap-3 p-4 ${s.killSwitch ? 'bg-red-50 ring-1 ring-red-200' : ''}`}>
        <div>
          <p className="text-sm font-bold text-slate-900">{s.killSwitch ? 'Surge is stopped everywhere' : 'Surge runs by itself, for every service'}</p>
          <p className="text-[12px] text-slate-500">{s.killSwitch
            ? 'No one pays surge until you resume.'
            : 'Every minute, every zone, inside the limits below. Stop it only for an incident or a government notice.'}</p>
        </div>
        <button type="button" onClick={() => submit({ killSwitch: !s.killSwitch })}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold ${s.killSwitch ? 'bg-emerald-600 text-white' : 'border border-red-300 text-red-700'}`}>
          <Power size={15} /> {s.killSwitch ? 'Resume surge' : 'Stop all surge now'}
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`ZappyOne earned, ${days} days`} value={fmt(rep.zappyRevenuePaise)} />
        <Kpi label="Zones surging now" value={surging.length} />
        <Kpi label="Zones watched now" value={zones.length} />
        <Kpi label="Your share of every surge" value={`${100 - s.providerSharePct}%`} />
      </div>

      <Card className="overflow-hidden">
        <p className="px-4 pt-4 text-sm font-bold text-slate-900">Limits</p>
        <p className="px-4 pb-2 text-[12px] text-slate-500">Set once. Applies to every service where a pro travels to the customer; workshop visits and stays never surge.</p>
        <Setting title="Busy-area cap" hint="The most a busy zone raises the service price (1.3 = +30%). Rides are capped at 2.0 by law.">
          <UnitInput value={form.maxMultiplier} onChange={set('maxMultiplier')} label="Busy-area cap" unit="×" min={1} max={2} step={0.05} />
        </Setting>
        <Setting title="Most extra per booking" hint="Busy + peak + weekend together never above this, so a costly repair never doubles.">
          <RupeeInput value={form.ceilingPaise} onChange={set('ceilingPaise')} label="Ceiling" />
        </Setting>
        <Setting title="Rain fee" hint="Added only when live weather says it is raining at the door. Unsure = no fee.">
          <RupeeInput value={form.rainPaise} onChange={set('rainPaise')} label="Rain fee" max={300} />
        </Setting>
        <Setting title="Late-night fee" hint={`From ${form.nightStartHour}:00 to ${form.nightEndHour}:00 IST.`}>
          <div className="flex items-center gap-2">
            <RupeeInput value={form.nightPaise} onChange={set('nightPaise')} label="Night fee" max={300} />
            <UnitInput value={form.nightStartHour} onChange={set('nightStartHour')} label="Night from" unit="h" min={0} max={23} />
            <UnitInput value={form.nightEndHour} onChange={set('nightEndHour')} label="Night until" unit="h" min={0} max={23} />
          </div>
        </Setting>
        <Setting title="Provider's share" hint={`What the provider gets of every surge line; ZappyOne keeps ${100 - (Number(form.providerSharePct) || 0)}%. Enough for the provider pulls more of them into busy zones.`}>
          <UnitInput value={form.providerSharePct} onChange={set('providerSharePct')} label="Provider share" unit="%" min={0} max={100} />
        </Setting>
        <Setting title="Demand before a zone surges" hint="Searches + bookings in 15 minutes. Below this, no busy surge (too little evidence).">
          <UnitInput value={form.minDemand} onChange={set('minDemand')} label="Minimum demand" unit="" min={1} max={100} />
        </Setting>
        <Setting title="Price held for" hint="A quoted price holds this long; the booking pays exactly what was shown.">
          <UnitInput value={form.lockMinutes} onChange={set('lockMinutes')} label="Lock" unit="min" min={2} max={30} />
        </Setting>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-4 py-3">
          {bad.length > 0 && <span className="text-[12px] text-red-600">Fill every box with a number.</span>}
          <button type="button" onClick={() => submit()} disabled={saving || bad.length > 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} Save limits
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">Zones right now</p>
          <p className="text-[11.5px] text-slate-400">{data.zones?.at ? `updated ${new Date(data.zones.at).toLocaleTimeString('en-IN')}` : 'no activity yet'}</p>
        </div>
        {!zones.length ? <p className="px-4 py-6 text-center text-[12px] text-slate-400">No one has searched or booked in the last 15 minutes.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Service</th><th className="px-3 py-2">Now</th><th className="px-3 py-2">Heading to</th><th className="px-3 py-2">Demand (15 min)</th><th className="px-3 py-2">Pros nearby</th><th className="px-3 py-2">Where</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {zones.slice(0, 50).map((z) => (
                  <tr key={`${z.line}-${z.zone}`}>
                    <td className="px-4 py-2 font-semibold">{z.line.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${z.multiplier > 1 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{z.multiplier > 1 && <Flame size={11} />}{z.multiplier.toFixed(2)}×</span></td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{z.target.toFixed(2)}×</td>
                    <td className="px-3 py-2 tabular-nums">{z.demand}</td>
                    <td className="px-3 py-2 tabular-nums">{z.supply}{z.noSupply && <span className="ml-1 text-[11px] font-semibold text-red-600">nobody: recruit here</span>}</td>
                    <td className="px-3 py-2">{z.lat != null && <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={`https://www.google.com/maps?q=${z.lat},${z.lng}`} target="_blank" rel="noreferrer">Map <ExternalLink size={11} /></a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Flame size={11} /> busy: bookings vs pros nearby</span>
          <span className="inline-flex items-center gap-1"><CloudRain size={11} /> rain: live weather at the door</span>
          <span className="inline-flex items-center gap-1"><Moon size={11} /> night: the clock</span>
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">Did people still book?</p>
          <div className="flex gap-1">
            {[1, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${days === d ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>{d === 1 ? 'Today' : `${d} d`}</button>
            ))}
          </div>
        </div>
        {!rep.lines.length ? <p className="px-4 py-6 text-center text-[12px] text-slate-400">No price quotes yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Service</th><th className="px-3 py-2">Booked, no surge</th><th className="px-3 py-2">Booked, with surge</th><th className="px-3 py-2">Surge collected</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rep.lines.map((l) => (
                  <tr key={l.line}>
                    <td className="px-4 py-2 font-semibold">{l.line.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2">{l.conversionPlain != null ? `${l.conversionPlain}% of ${l.plainQuotes}` : '-'}</td>
                    <td className="px-3 py-2">{l.conversionSurged != null ? <span className={l.conversionPlain != null && l.conversionSurged < l.conversionPlain - 15 ? 'font-bold text-red-600' : ''}>{l.conversionSurged}% of {l.surgedQuotes}</span> : '-'}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(l.surgePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">Red: surge is costing bookings there. Lower the cap or the ceiling for that service.</p>
      </Card>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <Card className="p-4">
      <p className="text-[22px] font-black tabular-nums text-slate-900">{value}</p>
      <p className="text-[12px] font-semibold text-slate-500">{label}</p>
    </Card>
  );
}
