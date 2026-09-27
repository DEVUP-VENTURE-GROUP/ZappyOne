import { useState } from 'react';
import {
  Crown, Plus, Edit2, Trash2, Loader2, CheckCircle2,
  XCircle, Users, Briefcase, ToggleLeft, ToggleRight, Save, X,
} from 'lucide-react';
import {
  useAdminListPlansQuery,
  useAdminCreatePlanMutation,
  useAdminUpdatePlanMutation,
  useAdminDeletePlanMutation,
} from '@client/services/api';
import toast from 'react-hot-toast';

const EFFECT_KEYS_USER   = ['surgeCap', 'waivePlatformFee', 'priorityAssignment'];
const EFFECT_KEYS_WORKER = ['commissionDelta', 'proBoost', 'visibilityMultiplier'];

const EMPTY_FORM = {
  code: '', name: '', description: '', audience: 'user',
  priceInPaise: '', durationDays: 30, trialDays: 0, sortOrder: 0,
  effects: {},
};

export default function AdminPlans() {
  const { data, isLoading, refetch } = useAdminListPlansQuery();
  const [createPlan]  = useAdminCreatePlanMutation();
  const [updatePlan]  = useAdminUpdatePlanMutation();
  const [deletePlan]  = useAdminDeletePlanMutation();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null); // plan being edited
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [filterAudience, setFilterAudience] = useState('all');

  const plans = (data?.plans || []).filter(
    (p) => filterAudience === 'all' || p.audience === filterAudience
  );

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(plan) {
    setForm({
      code:         plan.code,
      name:         plan.name,
      description:  plan.description || '',
      audience:     plan.audience,
      priceInPaise: plan.priceInPaise,
      durationDays: plan.durationDays,
      trialDays:    plan.trialDays || 0,
      sortOrder:    plan.sortOrder || 0,
      effects:      plan.effects || {},
    });
    setEditing(plan._id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.priceInPaise) {
      toast.error('Name and price are required');
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, priceInPaise: Number(form.priceInPaise) };
      if (editing) {
        const { code, ...rest } = body; // code is immutable after creation
        await updatePlan({ id: editing, ...rest }).unwrap();
        toast.success('Plan updated');
      } else {
        await createPlan(body).unwrap();
        toast.success('Plan created');
      }
      setShowForm(false);
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(plan) {
    try {
      await updatePlan({ id: plan._id, isActive: !plan.isActive }).unwrap();
      toast.success(plan.isActive ? 'Plan deactivated' : 'Plan activated');
      refetch();
    } catch {
      toast.error('Failed to update');
    }
  }

  async function handleDelete(plan) {
    if (!window.confirm(`Deactivate "${plan.name}"? Existing subscribers keep benefits until expiry.`)) return;
    try {
      await deletePlan(plan._id).unwrap();
      toast.success('Plan deactivated');
      refetch();
    } catch {
      toast.error('Failed');
    }
  }

  function setEffect(key, value) {
    setForm((f) => ({ ...f, effects: { ...f.effects, [key]: value } }));
  }

  const effectKeys = form.audience === 'user' ? EFFECT_KEYS_USER : EFFECT_KEYS_WORKER;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Crown size={20} className="text-amber-500" /> Subscription Plans
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage plans for users and workers</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition">
          <Plus size={16} /> New Plan
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {[['all', 'All Plans'], ['user', 'User Plans'], ['worker', 'Worker Plans']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilterAudience(v)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
              filterAudience === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Plans grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-blue-500" /></div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Crown size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No plans yet</p>
          <p className="text-sm mt-1">Create a plan to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div key={plan._id} className={`bg-white rounded-2xl border p-5 ${plan.isActive ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              {/* Plan header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      plan.audience === 'user' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
                    }`}>
                      {plan.audience === 'user' ? <><Users size={9} className="inline mr-1" />User</> : <><Briefcase size={9} className="inline mr-1" />Worker</>}
                    </span>
                    {!plan.isActive && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Inactive</span>}
                    {plan.trialDays > 0 && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{plan.trialDays}d trial</span>}
                  </div>
                  <h3 className="font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">{plan.code}</p>
                  {plan.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{plan.description}</p>}
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-xl font-black text-slate-900">₹{plan.priceInPaise / 100}</p>
                  <p className="text-xs text-slate-400">/{plan.durationDays}d</p>
                </div>
              </div>

              {/* Effects */}
              {plan.effects && Object.keys(plan.effects).length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Effects</p>
                  {Object.entries(plan.effects).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-mono">{k}</span>
                      <span className="font-bold text-slate-800">
                        {typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No') : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleToggleActive(plan)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                    plan.isActive ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {plan.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                  {plan.isActive ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => openEdit(plan)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                >
                  <Edit2 size={12} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(plan)}
                  className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-900 text-lg">{editing ? 'Edit Plan' : 'New Plan'}</h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Code — only editable on create */}
              {!editing && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Plan Code *</label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase outline-none focus:border-blue-400"
                    placeholder="e.g. ZAPPY_GOLD"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Name *</label>
                  <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Zappy Premium" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Audience *</label>
                  <select
                    disabled={!!editing}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50"
                    value={form.audience}
                    onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value, effects: {} }))}
                  >
                    <option value="user">User</option>
                    <option value="worker">Worker</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Price (₹) *</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" value={form.priceInPaise / 100 || ''} onChange={(e) => setForm((f) => ({ ...f, priceInPaise: Math.round(Number(e.target.value) * 100) }))} placeholder="149" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Duration (days)</label>
                  <input type="number" min="1" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" value={form.durationDays} onChange={(e) => setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Trial Days</label>
                  <input type="number" min="0" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400" value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: Number(e.target.value) }))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Description</label>
                <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 resize-none" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description of what this plan offers" />
              </div>

              {/* Effects */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2">Plan Effects</label>
                <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                  {form.audience === 'user' ? (
                    <>
                      <EffectRow label="Surge Cap (1.0 = no surge)" hint="number" value={form.effects.surgeCap ?? ''} onChange={(v) => setEffect('surgeCap', v === '' ? undefined : Number(v))} />
                      <EffectBool label="Waive Platform Fee" value={!!form.effects.waivePlatformFee} onChange={(v) => setEffect('waivePlatformFee', v)} />
                      <EffectBool label="Priority Assignment" value={!!form.effects.priorityAssignment} onChange={(v) => setEffect('priorityAssignment', v)} />
                    </>
                  ) : (
                    <>
                      <EffectRow label="Commission Delta (-0.05 = 5% off)" hint="number e.g. -0.05" value={form.effects.commissionDelta ?? ''} onChange={(v) => setEffect('commissionDelta', v === '' ? undefined : Number(v))} />
                      <EffectRow label="Pro Boost (dispatch priority points)" hint="number e.g. 10" value={form.effects.proBoost ?? ''} onChange={(v) => setEffect('proBoost', v === '' ? undefined : Number(v))} />
                      <EffectRow label="Visibility Multiplier (e.g. 1.5)" hint="number" value={form.effects.visibilityMultiplier ?? ''} onChange={(v) => setEffect('visibilityMultiplier', v === '' ? undefined : Number(v))} />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EffectRow({ label, hint, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400">{hint}</p>
      </div>
      <input
        type="number"
        step="any"
        className="w-28 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-blue-400 bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
    </div>
  );
}

function EffectBool({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <button
        onClick={() => onChange(!value)}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${value ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
      >
        {value ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
        {value ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  );
}
