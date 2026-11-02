import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Repeat } from 'lucide-react';
import { useAdminPendingPlansQuery, useAdminReviewPlanMutation, useAdminPlanConfigQuery, useAdminSetPlanConfigMutation } from '@shared/services/api';
import { Card, EmptyState, FormRow, Input, PageLoader, SaveBtn, SectionHeader, fmt } from '../../ui/kit';

// Partners' plans that fell outside the price band, and the rules every plan runs on (service-plan/).
export default function PartnerPlans() {
  const { data, isLoading } = useAdminPendingPlansQuery();
  const { data: cfgData } = useAdminPlanConfigQuery();
  const [review] = useAdminReviewPlanMutation();
  const [setCfg, { isLoading: saving }] = useAdminSetPlanConfigMutation();
  const [notes, setNotes] = useState({});
  const [cfg, setCfgForm] = useState(null);
  useEffect(() => { if (cfgData?.config && !cfg) setCfgForm({ fee: String(cfgData.config.platformFeePaise / 100), min: String(cfgData.config.autoApproveMinPct), max: String(cfgData.config.autoApproveMaxPct) }); }, [cfgData, cfg]);
  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  async function decide(p, approve) {
    try { await review({ id: p._id, approve, note: notes[p._id] || '' }).unwrap(); toast.success(approve ? 'Plan is live' : 'Plan declined'); } catch (e) { toast.error(e?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Partner plans" subtitle="Monthly plans and packs partners publish. Inside the price band they go live by themselves; the rest wait here." />
      {cfg && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormRow label="Platform fee a plan month (₹)"><Input inputMode="decimal" value={cfg.fee} onChange={(e) => setCfgForm({ ...cfg, fee: e.target.value })} /></FormRow>
            <FormRow label="Live by itself from (% of standard price)" hint="Monthly plans are cheaper per visit; 25 is usual"><Input inputMode="numeric" value={cfg.min} onChange={(e) => setCfgForm({ ...cfg, min: e.target.value })} /></FormRow>
            <FormRow label="Up to (% of standard price)"><Input inputMode="numeric" value={cfg.max} onChange={(e) => setCfgForm({ ...cfg, max: e.target.value })} /></FormRow>
          </div>
          <div className="mt-3"><SaveBtn loading={saving} onClick={async () => { try { await setCfg({ platformFeePaise: Math.round(Number(cfg.fee) * 100), autoApproveMinPct: Number(cfg.min), autoApproveMaxPct: Number(cfg.max) }).unwrap(); toast.success('Saved'); } catch (e) { toast.error(e?.data?.error || 'Failed'); } }} label="Save plan rules" /></div>
        </Card>
      )}
      {!items.length && <EmptyState message="No plans waiting for review" icon={Repeat} />}
      {items.map((p) => {
        const pct = p.referencePaise ? Math.round((p.pricePaise / p.referencePaise) * 100) : null;
        return (
          <Card key={p._id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">{p.vertical.replace(/_/g, ' ')} · {p.type === 'pack' ? 'pack' : `${p.visitsPerMonth} visits a month`} · {p.owner.kind}</p>
                <p className="mt-1 text-sm">{fmt(p.pricePaise)}{p.type === 'monthly' ? ' a month' : ''} {pct != null ? <span className={pct < 25 ? 'font-bold text-red-600' : 'font-bold text-amber-600'}>({pct}% of standard {fmt(p.referencePaise)})</span> : <span className="text-slate-500">(no standard price)</span>}</p>
                <p className="mt-1 text-xs text-slate-600">{p.items.map((i) => i.name).join(', ')}</p>
              </div>
              <div className="flex items-end gap-2">
                <Input placeholder="Note to the partner" value={notes[p._id] || ''} onChange={(e) => setNotes({ ...notes, [p._id]: e.target.value })} />
                <button type="button" onClick={() => decide(p, true)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">Approve</button>
                <button type="button" onClick={() => decide(p, false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Decline</button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
