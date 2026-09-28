import { useState } from 'react';
import { useAdminDisputesQuery, useAdminResolveDisputeMutation } from '@shared/services/api';
import { Scale, X } from 'lucide-react';
import { SectionHeader, Pagination, StatusBadge, Card, Th, Td, EmptyState, PageLoader, fmtDate, fmt } from './_shared';
import toast from 'react-hot-toast';

const STATUS_OPTS = ['all', 'open', 'in_review', 'resolved', 'closed'];
const RESOLUTION_TYPES = ['resolved_for_user', 'resolved_for_worker', 'no_action', 'partial_refund', 'full_refund'];

export default function Disputes() {
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState(null);
  const { data, isFetching, refetch } = useAdminDisputesQuery({ status, page });
  const [resolveDispute, { isLoading: submitting }] = useAdminResolveDisputeMutation();

  const [form, setForm] = useState({ type: 'no_action', refundAmountPaise: '', penaltyAmountPaise: '', adminNotes: '' });

  async function submitResolve() {
    try {
      const body = {
        id: resolving._id,
        type: form.type,
        adminNotes: form.adminNotes || undefined,
        refundAmountPaise:  form.refundAmountPaise  ? Math.round(Number(form.refundAmountPaise)  * 100) : undefined,
        penaltyAmountPaise: form.penaltyAmountPaise ? Math.round(Number(form.penaltyAmountPaise) * 100) : undefined,
      };
      await resolveDispute(body).unwrap();
      toast.success('Dispute resolved');
      setResolving(null);
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Failed to resolve');
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Disputes & Refunds" subtitle={data?.total != null ? `${data.total} disputes` : ''} />

      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTS.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${status === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>ID</Th><Th>Category</Th><Th>Raised By</Th><Th>Status</Th><Th>SLA</Th><Th>Date</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.items?.map((d) => (
                <tr key={d._id} className="hover:bg-slate-50/60 transition-colors">
                  <Td mono>#{d._id.slice(-8)}</Td>
                  <Td><span className="capitalize">{d.category?.replace(/_/g, ' ')}</span></Td>
                  <Td muted className="capitalize">{d.raisedBy?.kind} — {d.raisedBy?.id?.toString().slice(-6)}</Td>
                  <Td><StatusBadge status={d.status} /></Td>
                  <Td muted>{d.slaDeadline ? fmtDate(d.slaDeadline) : '—'}</Td>
                  <Td muted>{fmtDate(d.createdAt)}</Td>
                  <Td>
                    {d.status === 'open' || d.status === 'in_review' ? (
                      <button
                        onClick={() => { setResolving(d); setForm({ type: 'no_action', refundAmountPaise: '', penaltyAmountPaise: '', adminNotes: '' }); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{d.resolution?.type?.replace(/_/g, ' ') || '—'}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.items?.length && !isFetching && <EmptyState message="No disputes" icon={Scale} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      </Card>

      {/* Resolve modal */}
      {resolving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setResolving(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Resolve Dispute</h3>
              <button onClick={() => setResolving(null)} className="p-1 hover:bg-slate-100 rounded transition"><X size={16} /></button>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-slate-800 capitalize">{resolving.category?.replace(/_/g, ' ')}</p>
              <p className="text-slate-500 text-xs mt-1 line-clamp-2">{resolving.description}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Resolution Type</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {RESOLUTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              {(form.type === 'partial_refund' || form.type === 'full_refund') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Refund Amount (₹)</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    type="number" placeholder="e.g. 50"
                    value={form.refundAmountPaise} onChange={e => setForm(p => ({ ...p, refundAmountPaise: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Penalty on Worker (₹, optional)</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  type="number" placeholder="e.g. 20"
                  value={form.penaltyAmountPaise} onChange={e => setForm(p => ({ ...p, penaltyAmountPaise: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Admin Notes</label>
                <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2} placeholder="Internal notes…"
                  value={form.adminNotes} onChange={e => setForm(p => ({ ...p, adminNotes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setResolving(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={submitResolve} disabled={submitting}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition">
                {submitting ? 'Resolving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
