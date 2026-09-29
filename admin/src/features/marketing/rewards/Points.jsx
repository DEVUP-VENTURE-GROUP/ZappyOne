import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2, Save, Coins } from 'lucide-react';
import {
  useAdminGetRewardsConfigQuery,
  useAdminUpdateRewardsConfigMutation,
  useAdminGrantRewardPointsMutation,
} from '@shared/services/api';

const NUM_FIELDS = [
  ['pointsPerOrder', 'Points per completed order'],
  ['pointsPer100Rupees', 'Points per ₹100 spent'],
  ['pointsPerReferral', 'Points to referrer (per referral)'],
  ['pointsPerRefereeJoin', 'Points to new user on signup'],
  ['redeemPaisePerPoint', 'Redeem value (paise per point)'],
  ['minRedeemPoints', 'Minimum points to redeem'],
  ['scratchExpiryDays', 'Scratch card expiry (days)'],
];

const inp = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400';

export default function RewardsConfig() {
  const { data, isLoading } = useAdminGetRewardsConfigQuery();
  const [save, { isLoading: saving }] = useAdminUpdateRewardsConfigMutation();
  const [grant, { isLoading: granting }] = useAdminGrantRewardPointsMutation();
  const [form, setForm] = useState(null);
  const [g, setG] = useState({ userId: '', points: '' });

  useEffect(() => { if (data?.config) setForm(data.config); }, [data]);

  if (isLoading || !form) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" /></div>;

  const setNum = (k) => (e) => setForm((p) => ({ ...p, [k]: Number(e.target.value) }));
  const setTier = (i, k, v) => setForm((p) => ({ ...p, scratchTiers: p.scratchTiers.map((t, j) => j === i ? { ...t, [k]: k === 'label' || k === 'type' ? v : Number(v) } : t) }));
  const addTier = () => setForm((p) => ({ ...p, scratchTiers: [...(p.scratchTiers || []), { label: 'New reward', type: 'points', value: 10, weight: 10 }] }));
  const delTier = (i) => setForm((p) => ({ ...p, scratchTiers: p.scratchTiers.filter((_, j) => j !== i) }));

  async function onSave() {
    try {
      const { key, _id, createdAt, updatedAt, __v, updatedBy, ...body } = form;
      await save(body).unwrap();
      toast.success('Rewards config saved');
    } catch (err) { toast.error(err?.data?.error || 'Save failed'); }
  }

  async function onGrant() {
    if (!/^[a-f0-9]{24}$/i.test(g.userId) || !Number(g.points)) return toast.error('Enter a valid user id and points');
    try {
      const res = await grant({ userId: g.userId, points: Number(g.points) }).unwrap();
      toast.success(`Granted. New balance: ${res.balance}`);
      setG({ userId: '', points: '' });
    } catch (err) { toast.error(err?.data?.error || 'Grant failed'); }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Points & Scratch Cards</h2>
          <p className="text-sm text-slate-500">Earning rates, redemption and scratch-card odds.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} className="w-4 h-4" />
          Enabled
        </label>
      </div>

      {data?.stats && (
        <div className="grid grid-cols-3 gap-3">
          {[['Accounts', data.stats.accounts], ['Points outstanding', data.stats.outstandingPoints], ['Active cards', data.stats.activeCards]].map(([l, v]) => (
            <div key={l} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className="text-lg font-black text-slate-900">{Number(v).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      )}

      {/* Earning + redemption */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-3">
        {NUM_FIELDS.map(([k, label]) => (
          <div key={k}>
            <label className="text-xs font-bold text-slate-500">{label}</label>
            <input type="number" min="0" className={inp} value={form[k] ?? 0} onChange={setNum(k)} />
          </div>
        ))}
        <label className="col-span-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={form.scratchOnOrder} onChange={(e) => setForm((p) => ({ ...p, scratchOnOrder: e.target.checked }))} className="w-4 h-4" />
          Issue a scratch card on each completed order
        </label>
      </div>

      {/* Scratch tiers */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-slate-700">Scratch card rewards (weighted odds)</p>
          <button onClick={addTier} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><Plus size={14} /> Add</button>
        </div>
        <div className="space-y-2">
          {(form.scratchTiers || []).map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inp + ' flex-[2]'} value={t.label} onChange={(e) => setTier(i, 'label', e.target.value)} placeholder="Label" />
              <select className={inp + ' flex-1'} value={t.type} onChange={(e) => setTier(i, 'type', e.target.value)}>
                <option value="points">points</option><option value="cashback">cashback (paise)</option><option value="none">none</option>
              </select>
              <input type="number" className={inp + ' w-20'} value={t.value} onChange={(e) => setTier(i, 'value', e.target.value)} title="value" />
              <input type="number" className={inp + ' w-16'} value={t.weight} onChange={(e) => setTier(i, 'weight', e.target.value)} title="weight" />
              <button onClick={() => delTier(i)} className="text-rose-500 shrink-0"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Higher weight = more likely. Cashback value is in paise (1000 = ₹10).</p>
      </div>

      <button onClick={onSave} disabled={saving} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save configuration
      </button>

      {/* Manual grant */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Coins size={15} className="text-amber-500" /> Grant points (goodwill / support)</p>
        <div className="flex items-center gap-2">
          <input className={inp + ' flex-[2]'} placeholder="User ID (24-char)" value={g.userId} onChange={(e) => setG((p) => ({ ...p, userId: e.target.value.trim() }))} />
          <input type="number" className={inp + ' w-28'} placeholder="Points" value={g.points} onChange={(e) => setG((p) => ({ ...p, points: e.target.value }))} />
          <button onClick={onGrant} disabled={granting} className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50">{granting ? '…' : 'Grant'}</button>
        </div>
      </div>
    </div>
  );
}
