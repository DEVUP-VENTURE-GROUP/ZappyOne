import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Repeat } from 'lucide-react';
import { useAdminPartnerPlansQuery, useAdminSetPlanHiddenMutation, useAdminPlanConfigQuery, useAdminSetPlanConfigMutation } from '@shared/services/api';
import { Card, EmptyState, FormRow, Input, PageLoader, SaveBtn, SectionHeader, fmt } from '../../ui/kit';

const STATUS = { live: 'Live', paused: 'Paused by partner', pending: 'Not live yet', rejected: 'Hidden' };

// Partners' plans, live the moment they publish at their own price; admin hides one that looks wrong (service-plan/).
export default function PartnerPlans() {
  const { data, isLoading } = useAdminPartnerPlansQuery();
  const [setHidden] = useAdminSetPlanHiddenMutation();
  const { data: cfgData } = useAdminPlanConfigQuery();
  const [setCfg, { isLoading: saving }] = useAdminSetPlanConfigMutation();
  const [notes, setNotes] = useState({});
  const [fee, setFee] = useState(null);
  useEffect(() => { if (cfgData?.config && fee === null) setFee(String(cfgData.config.platformFeePaise / 100)); }, [cfgData, fee]);
  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  async function toggle(p, hidden) {
    try { await setHidden({ id: p._id, hidden, note: notes[p._id] || '' }).unwrap(); toast.success(hidden ? 'Plan hidden from customers' : 'Plan is live again'); } catch (e) { toast.error(e?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Partner plans" subtitle="Monthly plans and packs partners publish at their own price. They go live at once; hide any that looks wrong." />
      {fee !== null && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormRow label="Platform fee a plan month (₹)"><Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></FormRow>
          </div>
          <div className="mt-3"><SaveBtn loading={saving} onClick={async () => { try { await setCfg({ platformFeePaise: Math.round(Number(fee) * 100) }).unwrap(); toast.success('Saved'); } catch (e) { toast.error(e?.data?.error || 'Failed'); } }} label="Save" /></div>
        </Card>
      )}
      {!items.length && <EmptyState message="No partner plans yet" icon={Repeat} />}
      {items.map((p) => {
        const hidden = p.status === 'rejected' || p.status === 'pending';
        return (
          <Card key={p._id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{p.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${hidden ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>{STATUS[p.status] || p.status}</span></p>
                <p className="text-xs text-slate-500">{p.vertical.replace(/_/g, ' ')} · {p.type === 'pack' ? 'pack' : `${p.visitsPerMonth} visits a month`} · {p.owner.kind}</p>
                <p className="mt-1 text-sm">{fmt(p.pricePaise)}{p.type === 'monthly' ? ' a month' : ''}</p>
                <p className="mt-1 text-xs text-slate-600">{p.items.map((i) => i.name).join(', ')}</p>
              </div>
              <div className="flex items-end gap-2">
                {!hidden && <Input placeholder="Why (the partner sees this)" value={notes[p._id] || ''} onChange={(e) => setNotes({ ...notes, [p._id]: e.target.value })} />}
                {hidden
                  ? <button type="button" onClick={() => toggle(p, false)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">Show again</button>
                  : <button type="button" onClick={() => toggle(p, true)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">Hide</button>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
