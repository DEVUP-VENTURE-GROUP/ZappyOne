import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAdminGetCancellationConfigQuery, useAdminUpdateCancellationConfigMutation } from '@shared/services/api';
import { SectionHeader, Card, FormRow, Input, SaveBtn, PageLoader } from './_shared';

/**
 * Cancellation policy for Rakshak jobs — the one place it is edited.
 *
 * Every field here is one the server enforces. Admins work in rupees, minutes
 * and hours; the server stores paise and seconds. Each field declares its unit
 * once, and the conversion both ways comes from that.
 */
const UNITS = {
  rupees:  { toForm: (v) => v / 100,  toServer: (v) => Math.round(v * 100), step: 1,   suffix: '₹' },
  minutes: { toForm: (v) => v / 60,   toServer: (v) => Math.round(v * 60),  step: 1,   suffix: 'min' },
  hours:   { toForm: (v) => v / 3600, toServer: (v) => Math.round(v * 3600), step: 1,  suffix: 'h' },
  pct:     { toForm: (v) => v,        toServer: (v) => v, step: 1,   suffix: '%' },
  count:   { toForm: (v) => v,        toServer: (v) => Math.round(v), step: 1, suffix: '' },
  times:   { toForm: (v) => v,        toServer: (v) => v, step: 0.5, suffix: '×' },
  weight:  { toForm: (v) => v,        toServer: (v) => v, step: 0.5, suffix: '' },
};

const SECTIONS = [
  {
    title: 'When a customer cancels',
    note: 'Free before a worker is assigned and for a short grace period after. Then the fee depends on how far the worker got.',
    fields: [
      { key: 'freeCancelWindowSec', label: 'Free window after assignment', unit: 'minutes', min: 0, max: 60 },
      { key: 'userCancelFeeAssignedPaise', label: 'Fee: worker assigned', unit: 'rupees', min: 0 },
      { key: 'userCancelFeeOnWayPaise', label: 'Fee: worker on the way', unit: 'rupees', min: 0 },
      { key: 'userCancelFeeArrivedPaise', label: 'Fee: worker at the door', unit: 'rupees', min: 0 },
      { key: 'workerShareOnWayPct', label: 'Worker’s share (on the way)', unit: 'pct', min: 0, max: 100, hint: 'Of the fee, paid to the worker for the wasted trip' },
      { key: 'workerShareArrivedPct', label: 'Worker’s share (arrived)', unit: 'pct', min: 0, max: 100 },
    ],
  },
  {
    title: 'When a worker cancels',
    note: 'Genuine reasons (breakdown, emergency, customer unreachable, unsafe job) are free and never counted.',
    fields: [
      { key: 'workerCancelPenaltyPaise', label: 'Cancel penalty', unit: 'rupees', min: 0, hint: 'Debited from the worker’s wallet' },
      { key: 'lateWorkerCancelMultiplier', label: 'Late-cancel multiplier', unit: 'times', min: 1, max: 10, hint: 'Applied once the worker is on the way or has arrived' },
      { key: 'workerNoShowPenaltyPaise', label: 'No-show penalty', unit: 'rupees', min: 0 },
      { key: 'workerCancelLimit', label: 'Cancels before auto-offline', unit: 'count', min: 1, hint: 'Penalised cancels allowed within the window' },
      { key: 'workerCancelWindowSec', label: 'Counting window', unit: 'hours', min: 1, max: 168 },
      { key: 'workerRejectLimit', label: 'Rejects before unavailable', unit: 'count', min: 1, hint: 'Consecutive rejected offers' },
    ],
  },
  {
    title: 'Dispatch ranking',
    note: 'How much a worker’s reject and cancel rates push them down the offer queue. Higher means a bigger drop.',
    fields: [
      { key: 'rejectRatePenaltyWeight', label: 'Reject-rate weight', unit: 'weight', min: 0, max: 20 },
      { key: 'cancelRatePenaltyWeight', label: 'Cancel-rate weight', unit: 'weight', min: 0, max: 20 },
    ],
  },
];
const FIELDS = SECTIONS.flatMap((s) => s.fields);

export default function Cancellation() {
  const { data, isLoading, isError } = useAdminGetCancellationConfigQuery();
  const [update, { isLoading: saving }] = useAdminUpdateCancellationConfigMutation();
  const [form, setForm] = useState(null);

  const server = data?.config;
  const initial = useMemo(() => (server
    ? Object.fromEntries(FIELDS.map((f) => [f.key, UNITS[f.unit].toForm(Number(server[f.key] ?? 0))]))
    : null), [server]);

  useEffect(() => { if (initial) setForm(initial); }, [initial]);

  if (isLoading) return <PageLoader />;
  if (isError || !form) return <p className="p-6 text-sm text-rose-600">Could not load the cancellation policy.</p>;

  const changed = FIELDS.filter((f) => form[f.key] !== initial[f.key]);

  function invalid(f) {
    const v = form[f.key];
    if (v === '' || Number.isNaN(v)) return 'Required';
    if (f.min != null && v < f.min) return `At least ${f.min}`;
    if (f.max != null && v > f.max) return `At most ${f.max}`;
    return null;
  }
  const errors = FIELDS.map((f) => [f.key, invalid(f)]).filter(([, e]) => e);

  async function save() {
    if (errors.length) { toast.error('Fix the highlighted fields first'); return; }
    if (!changed.length) { toast('Nothing changed'); return; }
    const patch = Object.fromEntries(changed.map((f) => [f.key, UNITS[f.unit].toServer(form[f.key])]));
    try {
      await update(patch).unwrap();
      toast.success('Cancellation policy saved');
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cancellation policy"
        subtitle={`Version ${server.version ?? 1}${server.updatedAt ? ` · last changed ${new Date(server.updatedAt).toLocaleString('en-IN')}` : ''}`}
      />

      {SECTIONS.map((section) => (
        <Card key={section.title} className="p-6">
          <h3 className="text-sm font-bold text-slate-700">{section.title}</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">{section.note}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {section.fields.map((f) => {
              const err = invalid(f);
              const unit = UNITS[f.unit];
              return (
                <FormRow key={f.key} label={`${f.label}${unit.suffix ? ` (${unit.suffix})` : ''}`} hint={err || f.hint}>
                  <Input
                    type="number"
                    step={unit.step}
                    min={f.min}
                    max={f.max}
                    value={form[f.key]}
                    aria-invalid={!!err}
                    className={err ? 'ring-2 ring-rose-300' : undefined}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                </FormRow>
              );
            })}
          </div>
        </Card>
      ))}

      <div className="flex items-center justify-end gap-3">
        {changed.length > 0 && <span className="text-xs text-slate-500">{changed.length} unsaved change{changed.length > 1 ? 's' : ''}</span>}
        <SaveBtn loading={saving} onClick={save} label="Save policy" />
      </div>
    </div>
  );
}
