import { useState } from 'react';
import { useAdminWalletAdjustMutation, useAdminWalletReconcileMutation } from '@client/services/api';
import { SectionHeader, Card, FormRow, Input, Select, SaveBtn } from './_shared';
import toast from 'react-hot-toast';

export default function Wallet() {
  const [form, setForm] = useState({ kind: 'user', id: '', type: 'credit', amountRupees: '', description: '' });
  const [reconcile, setReconcile] = useState({ kind: 'user', id: '' });
  const [adjust, { isLoading: adjusting }] = useAdminWalletAdjustMutation();
  const [doReconcile, { isLoading: reconciling }] = useAdminWalletReconcileMutation();

  const f = (key) => ({ value: form[key], onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })) });

  async function submitAdjust() {
    if (!form.id.match(/^[a-f0-9]{24}$/i)) { toast.error('Enter a valid 24-character MongoDB ID'); return; }
    const rupees = parseFloat(form.amountRupees);
    if (!rupees || rupees < 1) { toast.error('Enter a valid amount in ₹ (min ₹1)'); return; }
    const amountPaise = Math.round(rupees * 100);
    try {
      const result = await adjust({ ...form, amountPaise }).unwrap();
      toast.success(`Wallet ${form.type}ed ₹${rupees} — new balance: ₹${Math.round(result.newBalancePaise / 100)}`);
      setForm(p => ({ ...p, id: '', amountRupees: '', description: '' }));
    } catch (err) {
      toast.error(err.data?.error || 'Adjustment failed');
    }
  }

  async function submitReconcile() {
    if (!reconcile.id.match(/^[a-f0-9]{24}$/i)) { toast.error('Enter a valid 24-character MongoDB ID'); return; }
    try {
      const result = await doReconcile(reconcile).unwrap();
      toast.success(`Reconciled — balance set to ₹${Math.round((result.finalBalance || 0) / 100)}`);
    } catch (err) {
      toast.error(err.data?.error || 'Reconciliation failed');
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Wallet Operations" subtitle="Manually credit, debit, or reconcile user and worker wallets." />

      {/* Manual adjust */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Manual Credit / Debit</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Account Type">
            <Select {...f('kind')}>
              <option value="user">User</option>
              <option value="worker">Worker</option>
            </Select>
          </FormRow>
          <FormRow label="Account ID (MongoDB ObjectId)">
            <Input {...f('id')} placeholder="64f8c3a2b7e1d42f9e3a0001" />
          </FormRow>
          <FormRow label="Operation">
            <Select {...f('type')}>
              <option value="credit">Credit (add money)</option>
              <option value="debit">Debit (deduct money)</option>
            </Select>
          </FormRow>
          <FormRow label="Amount (₹)" hint="Enter amount in rupees. e.g. 50 = ₹50">
            <Input type="number" {...f('amountRupees')} placeholder="e.g. 50" min="1" step="1" />
          </FormRow>
          <FormRow label="Description (optional)" className="sm:col-span-2">
            <Input {...f('description')} placeholder="Reason for adjustment…" />
          </FormRow>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <SaveBtn loading={adjusting} onClick={submitAdjust}>Apply Adjustment</SaveBtn>
          {form.type === 'debit' && (
            <p className="text-xs text-amber-600 font-medium">⚠️ Debit will reduce wallet balance</p>
          )}
        </div>
      </Card>

      {/* Reconcile */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Force Reconcile</h3>
        <p className="text-xs text-slate-400 mb-4">Recomputes wallet balance from transaction ledger to fix any mismatch.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Account Type">
            <Select value={reconcile.kind} onChange={e => setReconcile(p => ({ ...p, kind: e.target.value }))}>
              <option value="user">User</option>
              <option value="worker">Worker</option>
            </Select>
          </FormRow>
          <FormRow label="Account ID">
            <Input value={reconcile.id} onChange={e => setReconcile(p => ({ ...p, id: e.target.value }))} placeholder="64f8c3a2b7e1d42f9e3a0001" />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={reconciling} onClick={submitReconcile}>Run Reconciliation</SaveBtn>
        </div>
      </Card>
    </div>
  );
}
