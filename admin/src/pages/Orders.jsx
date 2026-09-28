import { useState } from 'react';
import { useAdminOrdersQuery, useAdminRefundOrderMutation } from '@shared/services/api';
import { Search, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { SectionHeader, Pagination, StatusBadge, Card, Th, Td, PageLoader, EmptyState, fmtDate } from './_shared';
import { ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUSES = ['', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'failed'];

export default function Orders() {
  const [status, setStatus]           = useState('');
  const [reconciliation, setRecon]    = useState(false); // show only reconciliation-required orders
  const [page, setPage]               = useState(1);
  const [selected, setSelected]       = useState(null);
  const [refunding, setRefunding]     = useState(false);
  const { data, isFetching } = useAdminOrdersQuery({ status: status || undefined, page, reconciliationRequired: reconciliation || undefined });
  const [refundOrder] = useAdminRefundOrderMutation();

  // Count reconciliation-needed from current page (approximation — server filters)
  const reconCount = data?.orders?.filter(o => o.payment?.reconciliationRequired).length ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader title="Orders" subtitle={data?.total != null ? `${data.total} total` : ''} />

      {/* Reconciliation alert banner */}
      {!reconciliation && reconCount > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 ring-1 ring-red-200 cursor-pointer"
          onClick={() => { setRecon(true); setStatus(''); setPage(1); }}
        >
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">Manual reconciliation required</p>
            <p className="text-xs text-red-500">{reconCount} order(s) have payment issues needing ops review. Click to filter.</p>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => { setRecon(false); setStatus(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!reconciliation && !status ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          All
        </button>
        {STATUSES.filter(Boolean).map((s) => (
          <button
            key={s}
            onClick={() => { setRecon(false); setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!reconciliation && status === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
        <button
          onClick={() => { setRecon(true); setStatus(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${reconciliation ? 'bg-red-600 text-white' : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'}`}
        >
          <AlertTriangle size={11} />
          Needs Review
        </button>
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Order ID</Th><Th>Service</Th><Th>Customer</Th><Th>Worker</Th>
                <Th>Tier</Th><Th>Status</Th><Th right>Amount</Th><Th>Boost</Th><Th>Payment</Th><Th>Date</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.orders?.map((o) => (
                <tr
                  key={o._id}
                  className={`cursor-pointer transition-colors ${o.payment?.reconciliationRequired ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-blue-50/40'}`}
                  onClick={() => setSelected(o)}
                >
                  <Td mono>#{o._id.slice(-8)}</Td>
                  <Td>{o.service?.replace(/_/g, ' ')}</Td>
                  <Td muted>{o.userId?.name || o.userId?.phone || '—'}</Td>
                  <Td muted>
                    {o.teamSize > 1 ? (
                      <div>
                        <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">Team ×{o.teamSize}</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {o.workerIds?.length || (o.workerId ? 1 : 0)}/{o.teamSize} assigned
                        </span>
                      </div>
                    ) : (o.workerId?.name || '—')}
                  </Td>
                  <Td>
                    {o.tier === 'express' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">⚡ Express</span>
                    ) : o.tier === 'priority' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">⭐ Priority</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Standard</span>
                    )}
                  </Td>
                  <Td><StatusBadge status={o.status} /></Td>
                  <Td right>
                    <div className="text-right">
                      <span className="font-bold text-slate-900">₹{o.pricing?.total || 0}</span>
                      {o.teamSize > 1 && (
                        <span className="block text-[9px] text-violet-500">₹{Math.round((o.pricing?.total || 0) / o.teamSize)}/worker</span>
                      )}
                      {o.pricing?.tierMultiplier > 1 && (
                        <span className="block text-[9px] text-slate-400">{o.pricing.tierMultiplier}× tier</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {o.pricing?.tipPaise > 0 ? (
                      <span className="text-[10px] font-bold text-orange-600">+₹{Math.round(o.pricing.tipPaise / 100)}</span>
                    ) : <span className="text-[10px] text-slate-300">—</span>}
                  </Td>
                  <Td muted>{o.payment?.method || '—'}</Td>
                  <Td muted>{fmtDate(o.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.orders?.length && !isFetching && (
            <EmptyState message="No orders found" icon={ClipboardList} />
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      </Card>

      {/* Order detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Order #{selected._id.slice(-10)}</h3>
              <StatusBadge status={selected.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Service', selected.service?.replace(/_/g, ' ')],
                ['Customer', selected.userId?.name || selected.userId?.phone || '—'],
                ...( (selected.teamSize || 1) <= 1 ? [['Worker', selected.workerId?.name || '—']] : [] ),
                ['Total Amount', `₹${selected.pricing?.total || 0}`],
                ...( (selected.teamSize || 1) > 1 ? [
                  ['Team Size', `${selected.teamSize} workers`],
                  ['Per Worker', `₹${Math.round((selected.pricing?.total || 0) / selected.teamSize)}`],
                  ['Workers Assigned', `${selected.workerIds?.length || (selected.workerId ? 1 : 0)} / ${selected.teamSize}`],
                ] : [] ),
                ['Tier', selected.tier || 'standard'],
                ['Tier Multiplier', selected.pricing?.tierMultiplier ? `${selected.pricing.tierMultiplier}×` : '1.0×'],
                ['Payment', selected.payment?.method || '—'],
                ['Pay Status', selected.payment?.status || '—'],
                ['Priority', selected.priority || 'normal'],
                ['Created', fmtDate(selected.createdAt)],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-[11px] text-slate-400 font-semibold uppercase">{k}</p>
                  <p className="font-medium text-slate-800 capitalize">{v}</p>
                </div>
              ))}
            </div>

            {/* Team workers panel */}
            {(selected.teamSize || 1) > 1 && (
              <div className="rounded-xl bg-violet-50 ring-1 ring-violet-100 p-3">
                <p className="text-[11px] text-violet-500 font-bold uppercase mb-2">Team Members</p>
                <div className="space-y-1.5">
                  {(selected.workerIds?.length ? selected.workerIds : selected.workerId ? [selected.workerId] : []).map((w, i) => (
                    <div key={w._id || w} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                        <span className="text-sm font-semibold text-slate-800">{w.name || 'Unknown'}</span>
                        {i === 0 && <span className="text-[9px] bg-violet-600 text-white px-1.5 py-0.5 rounded-full font-bold">LEAD</span>}
                      </div>
                      <span className="text-xs text-slate-400">{w.phone || '—'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, (selected.teamSize || 1) - (selected.workerIds?.length || (selected.workerId ? 1 : 0))) }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-black flex items-center justify-center">?</span>
                      <span className="text-xs text-amber-600 font-semibold">Searching for worker…</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Boost / Tip row */}
            {(selected.pricing?.tipPaise > 0 || selected.pricing?.boostedTotal) && (
              <div className="rounded-xl bg-orange-50 ring-1 ring-orange-100 p-3 grid grid-cols-2 gap-3">
                {selected.pricing?.tipPaise > 0 && (
                  <div>
                    <p className="text-[11px] text-orange-400 font-semibold uppercase">Worker Boost</p>
                    <p className="font-bold text-orange-700">+₹{Math.round(selected.pricing.tipPaise / 100)}</p>
                  </div>
                )}
                {selected.pricing?.boostedTotal && (
                  <div>
                    <p className="text-[11px] text-orange-400 font-semibold uppercase">Boosted Total</p>
                    <p className="font-bold text-orange-700">₹{selected.pricing.boostedTotal}</p>
                  </div>
                )}
              </div>
            )}
            {selected.pickupLocation?.address && (
              <div>
                <p className="text-[11px] text-slate-400 font-semibold uppercase mb-0.5">Pickup</p>
                <p className="text-sm text-slate-700">{selected.pickupLocation.address}</p>
              </div>
            )}
            {selected.description && (
              <div>
                <p className="text-[11px] text-slate-400 font-semibold uppercase mb-0.5">Description</p>
                <p className="text-sm text-slate-700">{selected.description}</p>
              </div>
            )}
            {/* Refund button — only for paid online orders */}
            {selected.payment?.status === 'paid' && selected.payment?.method !== 'cash' && (
              <button
                onClick={async () => {
                  if (!window.confirm(`Refund ₹${selected.pricing?.total} for order #${selected._id.slice(-8)}?`)) return;
                  setRefunding(true);
                  try {
                    await refundOrder({ id: selected._id }).unwrap();
                    toast.success('Refund initiated');
                    setSelected(null);
                  } catch (err) {
                    toast.error(err.data?.error || 'Refund failed');
                  } finally {
                    setRefunding(false);
                  }
                }}
                disabled={refunding}
                className="w-full py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition"
              >
                {refunding ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {refunding ? 'Refunding…' : `Refund ₹${selected.pricing?.total}`}
              </button>
            )}
            <button onClick={() => setSelected(null)} className="w-full py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
