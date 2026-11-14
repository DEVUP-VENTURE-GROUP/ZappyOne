import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAdminTravelQuery, useAdminUpdateTravelMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../../ui/kit';
import { Setting, UnitInput } from './fields';

// Rupee fields are shown in rupees and stored in paise; the rest as typed.
const MONEY = ['baseFeePaise', 'perKmPaise', 'maxPaise', 'trafficExtraPerKmPaise', 'waitPerMinPaise', 'waitMaxPaise'];
const STEPS = [
  { title: 'Step 1. The journey', hint: 'What the pro gets for travelling to the customer. The straight line is turned into road distance, the first part is free, and the rest is paid per km.', fields: [
    ['baseFeePaise', 'Base to turn up', '₹', 0, 1000, 5],
    ['perKmPaise', 'Per road km', '₹', 0, 100, 0.5],
    ['freeKm', 'Free distance', 'km', 0, 20, 0.1],
    ['roadFactor', 'Road distance is straight line ×', '×', 1, 2, 0.05],
    ['maxPaise', 'Journey never above (0 = no cap)', '₹', 0, 2000, 10],
  ] },
  { title: 'Step 2. Traffic', hint: 'Inside these hours (India time) each km costs more, because the trip takes longer.', fields: [
    ['trafficExtraPerKmPaise', 'Extra per km in traffic hours', '₹', 0, 50, 0.5],
  ], hours: true },
  { title: 'Step 3. Waiting at the door', hint: 'From the pro tapping Arrived to the customer giving their code. All of it goes to the pro. Customers are told the rule before they book.', fields: [
    ['waitFreeMin', 'Free waiting', 'min', 0, 120, 1],
    ['waitPerMinPaise', 'Then per minute', '₹', 0, 50, 0.5],
    ['waitMaxPaise', 'Waiting never above (0 = no cap)', '₹', 0, 1000, 5],
  ] },
];
const KEYS = STEPS.flatMap((s) => s.fields.map(([k]) => k));
const toForm = (t) => Object.fromEntries(KEYS.map((k) => [k, String(MONEY.includes(k) ? t[k] / 100 : t[k])]));
const toBody = (f, hours) => ({ ...Object.fromEntries(KEYS.map((k) => [k, MONEY.includes(k) ? Math.round(Number(f[k]) * 100) : Number(f[k])])), trafficHours: hours });

// The journey the pricing engine bills (repair pricing.service journeyFee), worked out here only to show the example.
function journey(v, straightKm, traffic) {
  const roadKm = Math.round(straightKm * v.roadFactor * 10) / 10;
  const perKm = v.perKmPaise + (traffic ? v.trafficExtraPerKmPaise : 0);
  const fee = v.baseFeePaise + Math.round(Math.max(0, roadKm - v.freeKm) * perKm);
  return { roadKm, paise: v.maxPaise > 0 ? Math.min(fee, v.maxPaise) : fee };
}

export default function Travel() {
  const { data, isLoading, isError } = useAdminTravelQuery();
  const [save, { isLoading: saving }] = useAdminUpdateTravelMutation();
  const [form, setForm] = useState(null);
  const [hours, setHours] = useState([]);
  const t = data?.travel;

  useEffect(() => { if (t) { setForm(toForm(t)); setHours((t.trafficHours || []).map((h) => ({ ...h }))); } }, [t]);

  if (isError) return <EmptyState message="Could not load travel and waiting. Refresh to try again." />;
  if (isLoading || !form) return <PageLoader />;

  const body = toBody(form, hours.map((h) => ({ startHour: Number(h.startHour), endHour: Number(h.endHour) })));
  const valid = KEYS.every((k) => form[k] !== '' && Number.isFinite(Number(form[k])) && Number(form[k]) >= 0)
    && body.roadFactor >= 1 && body.trafficHours.every((h) => h.startHour >= 0 && h.endHour <= 24 && h.endHour > h.startHour);
  const dirty = JSON.stringify(body) !== JSON.stringify(toBody(toForm(t), t.trafficHours || []));
  const rupees = (p) => `₹${(p / 100).toFixed(2)}`;

  async function submit() {
    try { await save(body).unwrap(); toast.success('Saved. New quotes use these from now on.'); } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-500">One setting for every service. A pro who set their own travel price keeps it.</p>
        <button type="button" onClick={submit} disabled={!dirty || !valid || saving}
          className="inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400">
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      {STEPS.map((step) => (
        <Card key={step.title} className="overflow-hidden p-0">
          <div className="px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">{step.title}</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{step.hint}</p>
          </div>
          {step.fields.map(([k, label, unit, min, max, stepBy]) => (
            <Setting key={k} title={label}>
              <UnitInput value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} label={label} unit={unit} min={min} max={max} step={stepBy} />
            </Setting>
          ))}
          {step.hours && (
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="mb-2 text-[13px] font-semibold text-slate-700">Traffic hours</p>
              <ul className="space-y-2">
                {hours.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                    From <UnitInput value={String(h.startHour)} onChange={(v) => setHours((all) => all.map((x, j) => (j === i ? { ...x, startHour: v } : x)))} label={`Traffic ${i + 1} from`} unit=":00" min={0} max={23} step={1} />
                    to <UnitInput value={String(h.endHour)} onChange={(v) => setHours((all) => all.map((x, j) => (j === i ? { ...x, endHour: v } : x)))} label={`Traffic ${i + 1} to`} unit=":00" min={1} max={24} step={1} />
                    <button type="button" onClick={() => setHours((all) => all.filter((_, j) => j !== i))} aria-label={`Remove traffic hours ${i + 1}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={hours.length >= 6} onClick={() => setHours((all) => [...all, { startHour: 8, endHour: 10 }])}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 disabled:text-slate-300"><Plus size={15} /> Add hours</button>
            </div>
          )}
        </Card>
      ))}
      {valid && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-slate-800">What a pro gets, with these numbers</h3>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0.4, 2, 5].map((km) => {
              const n = journey(body, km, false);
              const tr = journey(body, km, true);
              return (
                <li key={km} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="block text-[12px] text-slate-500">{km} km away ({n.roadKm} km by road)</span>
                  <span className="block font-bold tabular-nums text-slate-900">{rupees(n.paise)}, in traffic {rupees(tr.paise)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] text-slate-500">Waiting 25 minutes at the door: {rupees(body.waitMaxPaise > 0 ? Math.min(Math.max(0, 25 - body.waitFreeMin) * body.waitPerMinPaise, body.waitMaxPaise) : Math.max(0, 25 - body.waitFreeMin) * body.waitPerMinPaise)}.</p>
        </Card>
      )}
    </div>
  );
}
