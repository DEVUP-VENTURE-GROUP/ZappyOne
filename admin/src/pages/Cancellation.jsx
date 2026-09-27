import { useState, useEffect } from 'react';
import { useAdminGetCancellationConfigQuery, useAdminUpdateCancellationConfigMutation } from '@client/services/api';
import { SectionHeader, Card, FormRow, Input, SaveBtn, PageLoader } from './_shared';
import toast from 'react-hot-toast';

export default function Cancellation() {
  const { data: cfg, isLoading } = useAdminGetCancellationConfigQuery();
  const [update, { isLoading: saving }] = useAdminUpdateCancellationConfigMutation();

  // Display state — paise fields stored as ₹ (divided by 100)
  const [form, setForm] = useState({
    freeWindowMinutes:       2,
    userFlatPenaltyPaise:    20,   // ₹20 displayed, sent as 2000 paise
    userPercentPenalty:      10,
    workerFlatPenaltyPaise:  30,   // ₹30 displayed, sent as 3000 paise
    workerPercentPenalty:    15,
    maxDailyWorkerCancels:   3,
    cancelStrikeThreshold:   5,
    rejectRatePenaltyWeight: 2,
    cancelRatePenaltyWeight: 3,
  });

  useEffect(() => {
    if (cfg && Object.keys(cfg).length > 0) {
      setForm(prev => ({
        ...prev,
        ...cfg,
        // Convert paise → rupees for display
        userFlatPenaltyPaise:   Math.round((cfg.userFlatPenaltyPaise   ?? prev.userFlatPenaltyPaise * 100)   / 100),
        workerFlatPenaltyPaise: Math.round((cfg.workerFlatPenaltyPaise ?? prev.workerFlatPenaltyPaise * 100) / 100),
      }));
    }
  }, [cfg]);

  const f = (key) => ({
    type: 'number',
    value: form[key] ?? '',
    onChange: (e) => setForm(prev => ({ ...prev, [key]: Number(e.target.value) })),
  });

  async function save() {
    try {
      await update({
        ...form,
        // Convert ₹ → paise before sending to server
        userFlatPenaltyPaise:   Math.round(form.userFlatPenaltyPaise   * 100),
        workerFlatPenaltyPaise: Math.round(form.workerFlatPenaltyPaise * 100),
      }).unwrap();
      toast.success('Cancellation config saved');
    } catch (err) {
      toast.error(err.data?.error || 'Save failed');
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <SectionHeader title="Cancellation Settings" subtitle="Set penalty amounts, time windows, and how much cancellations hurt a worker's job priority." />

      {/* User penalties */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">User Cancellation Penalties</h3>
        <p className="text-xs text-slate-400 mb-4">What happens when a customer cancels an order after it has been accepted.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormRow label="Free Cancel Window (min)" hint="User can cancel for free within this many minutes of booking">
            <Input {...f('freeWindowMinutes')} step="1" min="0" />
          </FormRow>
          <FormRow label="Fixed Penalty (₹)" hint="Flat charge applied after the free window ends">
            <Input {...f('userFlatPenaltyPaise')} step="1" min="0" />
          </FormRow>
          <FormRow label="Order % Penalty" hint="Additional % of order value charged (use 0 to disable)">
            <Input {...f('userPercentPenalty')} step="1" min="0" max="100" />
          </FormRow>
        </div>
      </Card>

      {/* Worker penalties */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Worker Cancellation Penalties</h3>
        <p className="text-xs text-slate-400 mb-4">What happens when a worker cancels or repeatedly rejects orders.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FormRow label="Fixed Penalty (₹)" hint="Instantly deducted from the worker's wallet on cancel">
            <Input {...f('workerFlatPenaltyPaise')} step="1" min="0" />
          </FormRow>
          <FormRow label="Order % Deduction" hint="% of order value also deducted from wallet (use 0 to disable)">
            <Input {...f('workerPercentPenalty')} step="1" min="0" max="100" />
          </FormRow>
          <FormRow label="Daily Cancel Limit" hint="Cancels allowed in one day before a strike is recorded">
            <Input {...f('maxDailyWorkerCancels')} step="1" min="1" />
          </FormRow>
          <FormRow label="Lifetime Strike Limit" hint="Total strikes before the account is flagged for review">
            <Input {...f('cancelStrikeThreshold')} step="1" min="1" />
          </FormRow>
        </div>
      </Card>

      {/* Dispatch penalty weights */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Job Priority Penalty Weights</h3>
        <p className="text-xs text-slate-400 mb-4">
          Workers who frequently reject or cancel get a lower priority score — they receive fewer job offers.
          Increase these numbers to punish bad behaviour more aggressively.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Rejection Penalty Weight" hint="How hard rejection rate hurts dispatch priority (higher = stronger penalty)">
            <Input {...f('rejectRatePenaltyWeight')} step="0.1" min="0" max="20" />
          </FormRow>
          <FormRow label="Cancellation Penalty Weight" hint="How hard cancel rate hurts dispatch priority (higher = stronger penalty)">
            <Input {...f('cancelRatePenaltyWeight')} step="0.1" min="0" max="20" />
          </FormRow>
        </div>
        <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-500 font-mono">
          priority penalty = (reject rate × {form.rejectRatePenaltyWeight}) + (cancel rate × {form.cancelRatePenaltyWeight})
        </div>
      </Card>

      <div className="flex">
        <SaveBtn loading={saving} onClick={save} />
      </div>
    </div>
  );
}
