import { useState } from 'react';
import toast from 'react-hot-toast';
import { Store, Loader2 } from 'lucide-react';
import { useAdminShopPayoutsQuery, useAdminDecideShopPayoutMutation } from '@shared/services/api';
import { Card, EmptyState, fmt, fmtDate } from '../../ui/kit';

/**
 * Shop payouts — shops ask for what ZappyOne owes them (server shop/shop-payout);
 * ops sends it by bank / UPI, then marks it paid with the reference (or rejects
 * with a reason). The shop is told either way.
 */
export default function ShopPayouts() {
  const [status, setStatus] = useState('requested');
  const { data, isFetching } = useAdminShopPayoutsQuery(status);
  const [decide, { isLoading }] = useAdminDecideShopPayoutMutation();
  const [open, setOpen] = useState(null);
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');

  async function act(id, decision) {
    try {
      await decide({ id, decision, reference: ref.trim(), reason: reason.trim() }).unwrap();
      toast.success(decision === 'paid' ? 'Marked paid. The shop has been told.' : 'Rejected. The shop has been told.');
      setOpen(null); setRef(''); setReason('');
    } catch (err) { toast.error(err?.data?.error || 'Could not save'); }
  }

  const rows = data?.payouts || [];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Store size={15} /> Shop payouts</p>
        <div className="flex gap-1">
          {['requested', 'paid', 'rejected', 'all'].map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold capitalize ${status === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>{s}</button>
          ))}
        </div>
      </div>
      {isFetching && !rows.length ? <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
        : !rows.length ? <EmptyState message="No shop payouts here." icon={Store} /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r._id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{r.shop?.businessName || 'Shop'} <span className="font-normal text-slate-400">{r.shop?.phone}</span></span>
                    <span className="block text-[12px] text-slate-500">
                      To {r.destination?.type === 'upi' ? `UPI ${r.destination.upiId}` : `${r.destination?.bankName || 'bank'} ••${r.destination?.accountLast4}, ${r.destination?.ifsc}, ${r.destination?.accountName}`}
                      {', '}{fmtDate(r.createdAt)}{r.reference ? `, ref ${r.reference}` : ''}{r.reason ? `, ${r.reason}` : ''}
                    </span>
                  </span>
                  <span className="text-[15px] font-black tabular-nums">{fmt(r.amountPaise)}</span>
                  {r.status === 'requested' && (
                    <button type="button" onClick={() => setOpen(open === r._id ? null : r._id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold">Decide</button>
                  )}
                </div>
                {open === r._id && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="flex gap-2">
                      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank / UPI reference" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />
                      <button type="button" disabled={isLoading || !ref.trim()} onClick={() => act(r._id, 'paid')} className="rounded-lg bg-emerald-600 px-3 text-[12.5px] font-semibold text-white disabled:opacity-40">Mark paid</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not (shown to the shop)" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />
                      <button type="button" disabled={isLoading || !reason.trim()} onClick={() => act(r._id, 'rejected')} className="rounded-lg border border-red-300 px-3 text-[12.5px] font-semibold text-red-700 disabled:opacity-40">Reject</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
