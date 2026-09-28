import { useState } from 'react';
import { useAdminPayoutsQuery, useAdminApprovePayoutMutation, useAdminRejectPayoutMutation, useAdminProcessPayoutMutation, useAdminMarkPayoutPaidMutation } from '@shared/services/api';
import { CreditCard, X, CheckCircle2, XCircle } from 'lucide-react';
import { SectionHeader, Pagination, StatusBadge, Card, Th, Td, EmptyState, fmtDate, fmt } from './_shared';
import toast from 'react-hot-toast';

// Must match the payout model's statuses.
const STATUS_OPTS = ['', 'requested', 'approved', 'processing', 'paid', 'failed', 'rejected'];

export default function Payouts() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isFetching, refetch } = useAdminPayoutsQuery({ status: status || undefined, page });
  const [approve, { isLoading: approving }] = useAdminApprovePayoutMutation();
  const [reject, { isLoading: rejecting }] = useAdminRejectPayoutMutation();
  const [process, { isLoading: processing }] = useAdminProcessPayoutMutation();
  const [markPaid, { isLoading: marking }] = useAdminMarkPayoutPaidMutation();
  const [paidTarget, setPaidTarget] = useState(null);
  const [reference, setReference] = useState('');

  async function doApprove(id) {
    try {
      await approve(id).unwrap();
      toast.success('Payout approved');
      refetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function doReject() {
    if (!rejectReason.trim()) { toast.error('Provide a reason'); return; }
    try {
      await reject({ id: rejectTarget, reason: rejectReason }).unwrap();
      toast.success('Payout rejected');
      setRejectTarget(null);
      setRejectReason('');
      refetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function doProcess(id) {
    try {
      const p = await process(id).unwrap();
      toast.success(p.manualTransferRequired ? 'No payout gateway — transfer it by hand, then mark it paid' : 'Payout sent');
      refetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function doMarkPaid() {
    try {
      await markPaid({ id: paidTarget, reference: reference.trim() }).unwrap();
      toast.success('Marked paid — the worker has been told');
      setPaidTarget(null);
      setReference('');
      refetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Payouts" subtitle={data?.total != null ? `${data.total} total` : ''} />

      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTS.map(s => (
          <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${status === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>ID</Th><Th>Worker</Th><Th>Amount</Th><Th>Method</Th><Th>Status</Th><Th>Date</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.items?.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50/60 transition-colors">
                  <Td mono>#{p._id.slice(-8)}</Td>
                  <Td>
                    <p className="font-semibold text-slate-900">{p.workerId?.name || '—'}</p>
                    <p className="text-xs text-slate-400">{p.workerId?.phone}</p>
                  </Td>
                  <Td><span className="font-bold text-slate-900">{fmt(p.amountPaise)}</span></Td>
                  <Td muted className="capitalize">{p.method || '—'}{p.destination?.upiId ? ` · ${p.destination.upiId}` : ''}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td muted>{fmtDate(p.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {p.status === 'requested' && (
                        <>
                          <button onClick={() => doApprove(p._id)} disabled={approving}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition disabled:opacity-50">
                            <CheckCircle2 size={11} /> Approve
                          </button>
                          <button onClick={() => { setRejectTarget(p._id); setRejectReason(''); }}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition">
                            <XCircle size={11} /> Reject
                          </button>
                        </>
                      )}
                      {p.status === 'approved' && !p.manualTransferRequired && (
                        <button onClick={() => doProcess(p._id)} disabled={processing}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition disabled:opacity-50">
                          Process
                        </button>
                      )}
                      {p.status === 'approved' && p.manualTransferRequired && (
                        <button onClick={() => { setPaidTarget(p._id); setReference(''); }}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 transition">
                          Mark paid (UTR)
                        </button>
                      )}
                      {p.transferReference && <span className="text-[11px] text-slate-400">Ref {p.transferReference}</span>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.items?.length && !isFetching && <EmptyState message="No payouts" icon={CreditCard} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      </Card>

      {paidTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPaidTarget(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900">Mark payout as paid</h3>
            <p className="text-xs text-slate-500">Only after the bank or UPI transfer has gone through. The worker sees this reference.</p>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Transfer reference / UTR" value={reference} onChange={e => setReference(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setPaidTarget(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={doMarkPaid} disabled={marking || reference.trim().length < 6}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition">
                {marking ? 'Saving…' : 'Mark paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRejectTarget(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Reject Payout</h3>
              <button onClick={() => setRejectTarget(null)} className="p-1 hover:bg-slate-100 rounded"><X size={16} /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Reason (shown to worker)</label>
              <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3} placeholder="e.g. Bank details mismatch…"
                value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRejectTarget(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={doReject} disabled={rejecting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition">
                {rejecting ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
