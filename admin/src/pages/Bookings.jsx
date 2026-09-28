import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, X, Loader2, RotateCcw, Ban, Store, User, MapPin, ArrowRight } from 'lucide-react';
import {
  useAdminBookingsQuery, useAdminBookingDetailQuery, useAdminForceCancelOrderMutation,
  useCancelRepairBookingMutation, useAdminCancelPetBookingMutation, useAdminCancelHelpingTaskMutation,
  useAdminRefundOrderMutation,
} from '@shared/services/api';
import { SectionHeader, Card, Th, Td, EmptyState, Pagination, fmt, fmtDate } from './_shared';

const SOURCES = [
  { id: '', label: 'All' },
  { id: 'repair', label: 'Repair' },
  { id: 'pet', label: 'Pet' },
  { id: 'helping', label: 'Helping' },
  { id: 'order', label: 'Orders (legacy)' },
];
const BUCKETS = [
  { id: '', label: 'Any status' },
  { id: 'active', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'disputed', label: 'Disputed' },
];
const BUCKET_TONE = {
  active: 'bg-blue-50 text-blue-700', completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500', disputed: 'bg-red-50 text-red-700', other: 'bg-amber-50 text-amber-700',
};
const label = (s = '') => s.replace(/_/g, ' ').toLowerCase();

/**
 * Every booking on the platform, whichever engine took it. Actions call the
 * engine's own endpoint, so its business rules (fees, refunds, notices) apply.
 */
export default function Bookings() {
  const [params] = useSearchParams();
  const [source, setSource] = useState(params.get('source') || '');
  const [bucket, setBucket] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const query = { page, limit: 25, ...(source && { source }), ...(bucket && { bucket }), ...(q.trim() && { q: q.trim() }) };
  const { data, isFetching } = useAdminBookingsQuery(query);
  const rows = data?.rows || [];

  const reset = (fn) => (v) => { fn(v); setPage(1); };
  return (
    <div className="space-y-4">
      <SectionHeader title="Bookings" subtitle={data ? `${data.total} matching` : 'Repair, pet, helping and legacy orders in one place'} />

      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map((s) => (
          <button key={s.id} onClick={() => reset(setSource)(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${source === s.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
            {s.label}
          </button>
        ))}
        <select value={bucket} onChange={(e) => reset(setBucket)(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500">
          {BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Reference or customer phone"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-0.5 animate-pulse bg-indigo-600" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Booking</Th><Th>Service</Th><Th>Customer</Th><Th>Provider</Th><Th right>Amount</Th><Th>Status</Th><Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={`${r.source}:${r._id}`} onClick={() => setOpen({ source: r.source, id: r._id })} className="cursor-pointer hover:bg-slate-50/70">
                  <Td mono>{r.reference}</Td>
                  <Td><span className="font-medium text-slate-800">{r.serviceName}</span><span className="ml-1.5 text-[10px] uppercase text-slate-400">{r.source}</span></Td>
                  <Td muted>{r.customer?.name || r.customer?.phone || '—'}</Td>
                  <Td muted>{r.provider ? r.provider.name : <span className="text-amber-600">Unassigned</span>}</Td>
                  <Td right>{fmt(r.totalPaise)}</Td>
                  <Td><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${BUCKET_TONE[r.statusBucket]}`}>{label(r.status)}</span></Td>
                  <Td muted>{fmtDate(r.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !isFetching && <EmptyState message="No bookings match these filters" />}
        </div>
      </Card>
      {data?.total > 25 && <Pagination page={page} total={data.total} limit={25} onChange={setPage} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />}

      {open && <BookingDrawer {...open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BookingDrawer({ source, id, onClose }) {
  const [, setParams] = useSearchParams();
  const { data, isLoading, refetch } = useAdminBookingDetailQuery({ source, id });
  const [cancelOrder, o] = useAdminForceCancelOrderMutation();
  const [cancelRepair, r] = useCancelRepairBookingMutation();
  const [cancelPet, p] = useAdminCancelPetBookingMutation();
  const [cancelHelping, h] = useAdminCancelHelpingTaskMutation();
  const [refundOrder, rf] = useAdminRefundOrderMutation();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(null);
  const busy = o.isLoading || r.isLoading || p.isLoading || h.isLoading || rf.isLoading;

  async function run() {
    try {
      if (confirming === 'refund') {
        await refundOrder({ orderId: id, reason }).unwrap();
        toast.success('Refund started');
      } else {
        const cancel = { order: () => cancelOrder({ id, reason, refundFull: true }), repair: () => cancelRepair({ id, reason }),
          pet: () => cancelPet({ id, reason }), helping: () => cancelHelping({ id, reason }) }[source];
        await cancel().unwrap();
        toast.success('Booking cancelled — the customer has been told');
      }
      setConfirming(null); setReason(''); refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'That did not work');
    }
  }

  const b = data?.booking;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()} aria-label="Booking details">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <p className="font-mono text-xs text-slate-400">{b?.reference}</p>
            <p className="text-lg font-bold text-slate-900">{b?.serviceName || 'Booking'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>
        {isLoading || !b ? <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-slate-300" /></div> : (
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Person Icon={User} title="Customer" p={b.customer} />
              <Person Icon={b.provider?.kind === 'shop' ? Store : User} title="Provider" p={b.provider} empty="Not assigned yet" />
            </div>
            {data.address && <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><MapPin size={13} className="mt-0.5 shrink-0" />{data.address}</p>}

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Money</p>
              <Row k="Customer pays" v={fmt(b.totalPaise)} bold />
              {b.commissionPaise != null && <Row k="ZappyOne commission" v={fmt(b.commissionPaise)} />}
              {b.providerEarningPaise != null && <Row k="Provider gets" v={fmt(b.providerEarningPaise)} />}
              {b.itemMoneyPaise > 0 && <Row k="Items bought (customer's money)" v={fmt(b.itemMoneyPaise)} />}
              <Row k="Payment" v={`${label(b.paymentMethod || 'unknown')} · ${label(b.paymentStatus || 'pending')}`} />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Timeline</p>
              <ol className="space-y-2 border-l border-slate-200 pl-3">
                {data.history.map((e, i) => (
                  <li key={i}>
                    <p className="text-xs font-semibold capitalize text-slate-800">{label(e.status)}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(e.at)}{e.by ? ` · ${e.by}` : ''}{e.note ? ` · ${e.note}` : ''}</p>
                  </li>
                ))}
                {!data.history.length && <li className="text-xs text-slate-400">No history recorded</li>}
              </ol>
            </div>

            {confirming ? (
              <div className="space-y-2 rounded-xl border border-red-100 bg-red-50/60 p-3">
                <p className="text-xs font-bold text-red-800">{confirming === 'refund' ? `Refund ${fmt(b.totalPaise)} to the customer?` : 'Cancel this booking? The customer will not be charged.'}</p>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the customer sees this)"
                  className="w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(null)} className="flex-1 rounded-lg bg-white py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">Back</button>
                  <button onClick={run} disabled={busy || reason.trim().length < 5} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busy && <Loader2 size={13} className="animate-spin" />} Confirm
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {data.actions.cancel && (
                  <button onClick={() => setConfirming('cancel')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100">
                    <Ban size={14} /> Cancel booking
                  </button>
                )}
                {data.actions.refund && (
                  <button onClick={() => setConfirming('refund')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100">
                    <RotateCcw size={14} /> Refund {fmt(b.totalPaise)}
                  </button>
                )}
                {data.actions.reassign && (
                  <button onClick={() => setParams({ tab: 'intervention' })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
                    Reassign in Intervention <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Person({ Icon, title, p, empty = '—' }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {p ? (
        <>
          <p className="mt-1 flex items-center gap-1.5 font-semibold text-slate-800"><Icon size={12} />{p.name || '—'}</p>
          {p.phone && <a href={`tel:${p.phone}`} className="text-xs text-indigo-600">{p.phone}</a>}
        </>
      ) : <p className="mt-1 text-xs text-amber-600">{empty}</p>}
    </div>
  );
}

function Row({ k, v, bold }) {
  return (
    <div className="flex justify-between py-0.5 text-xs">
      <span className="text-slate-500">{k}</span>
      <span className={`tabular-nums ${bold ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{v}</span>
    </div>
  );
}
