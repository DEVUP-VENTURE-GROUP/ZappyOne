import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Zap, RefreshCw, X, Loader2, AlertTriangle, Star,
  UserCog, ArrowRightLeft, StickyNote, Ban, Phone, MapPin, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminOrdersQuery, useAdminOrderNearbyWorkersQuery,
  useAdminReassignOrderMutation, useAdminForceOrderStatusMutation,
  useAdminForceCancelOrderMutation, useAdminAddOrderNoteMutation,
} from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState, StatusBadge } from './_shared';

const ACTIVE_STATUSES = ['searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'];

// Mirror of the server safe-transition map.
const FORCE_TRANSITIONS = {
  searching:   ['assigned', 'cancelled', 'completed'],
  assigned:    ['on_the_way', 'cancelled', 'completed'],
  on_the_way:  ['arrived', 'cancelled', 'completed'],
  arrived:     ['in_progress', 'cancelled', 'completed'],
  in_progress: ['completed', 'cancelled'],
  created:     ['cancelled', 'completed'],
};

function minsSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 60000);
}
function ago(date) {
  const m = minsSince(date);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function currentStatusSince(o) {
  const hist = o.statusHistory || [];
  const last = [...hist].reverse().find((h) => h.status === o.status);
  return last ? minsSince(last.at) : minsSince(o.updatedAt || o.createdAt);
}
function isStale(o) {
  if (o.status === 'searching' && minsSince(o.createdAt) > 5) return true;
  if (o.status === 'in_progress' && currentStatusSince(o) > 120) return true;
  return false;
}

/* Modal shell */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <p className="font-bold text-slate-900">{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </motion.div>
    </div>
  );
}

/* Reassign modal */
function ReassignModal({ order, onClose, onDone }) {
  const { data, isLoading } = useAdminOrderNearbyWorkersQuery(order._id);
  const [reassign, { isLoading: busy }] = useAdminReassignOrderMutation();

  async function pick(w) {
    if (!window.confirm(`Reassign this order to ${w.name}?`)) return;
    try {
      await reassign({ id: order._id, workerId: w._id }).unwrap();
      toast.success(`Reassigned to ${w.name}`);
      onDone();
    } catch (e) { toast.error(e.data?.error || 'Reassign failed'); }
  }

  return (
    <Modal title="Reassign Order" onClose={onClose}>
      <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-800 capitalize">{order.service?.replace(/_/g, ' ')}</p>
        <p className="mt-0.5">Current: {order.workerId?.name || 'no worker'} · {order.status}</p>
      </div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Nearby Available Workers</p>
      {isLoading ? <PageLoader /> : !data?.workers?.length ? (
        <EmptyState message="No matching workers online within 10km" icon={UserCog} />
      ) : (
        <div className="space-y-2">
          {data.workers.map((w) => (
            <button key={w._id} onClick={() => pick(w)} disabled={busy}
              className="w-full text-left bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-3 transition disabled:opacity-50">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">{w.name}</p>
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600"><Star size={12} fill="currentColor" /> {w.rating?.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><Phone size={10} /> {w.phone}</span>
                {w.distanceKm != null && <span className="flex items-center gap-1"><MapPin size={10} /> {w.distanceKm} km</span>}
                <span className="text-emerald-600 font-semibold">online</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* Force status modal */
function ForceStatusModal({ order, onClose, onDone }) {
  const options = FORCE_TRANSITIONS[order.status] || ['cancelled', 'completed'];
  const [status, setStatus] = useState(options[0]);
  const [reason, setReason] = useState('');
  const [force, { isLoading: busy }] = useAdminForceOrderStatusMutation();
  const danger = status === 'completed' || status === 'cancelled';

  async function submit() {
    if (reason.trim().length < 3) { toast.error('Reason is required (min 3 chars)'); return; }
    try {
      await force({ id: order._id, status, reason: reason.trim() }).unwrap();
      toast.success(`Status forced to ${status}`);
      onDone();
    } catch (e) { toast.error(e.data?.error || 'Failed'); }
  }

  return (
    <Modal title="Force Status" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
          Current status: <span className="font-bold capitalize text-slate-800">{order.status?.replace(/_/g, ' ')}</span>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">New Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 capitalize">
            {options.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Reason</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this override needed?"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
        {danger && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              {status === 'completed' ? 'Forcing completion triggers worker earnings settlement.' : 'Forcing cancellation issues a full refund if the order was paid online.'}
            </p>
          </div>
        )}
        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition">
          {busy && <Loader2 size={14} className="animate-spin" />} Apply
        </button>
      </div>
    </Modal>
  );
}

/* Force cancel modal */
function ForceCancelModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [refundFull, setRefundFull] = useState(true);
  const [cancel, { isLoading: busy }] = useAdminForceCancelOrderMutation();
  const hasPayment = order.payment?.status === 'paid' && order.payment?.method !== 'cash';

  async function submit() {
    if (reason.trim().length < 3) { toast.error('Reason is required'); return; }
    try {
      await cancel({ id: order._id, reason: reason.trim(), refundFull: hasPayment ? refundFull : false }).unwrap();
      toast.success('Order cancelled');
      onDone();
    } catch (e) { toast.error(e.data?.error || 'Failed'); }
  }

  return (
    <Modal title="Force Cancel" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Reason</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for cancellation"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 resize-none" />
        </div>
        {hasPayment && (
          <label className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5 cursor-pointer">
            <span className="text-sm font-semibold text-slate-700">Issue full refund</span>
            <input type="checkbox" checked={refundFull} onChange={(e) => setRefundFull(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          </label>
        )}
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">This cannot be undone.</p>
        </div>
        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition">
          {busy && <Loader2 size={14} className="animate-spin" />} Cancel Order
        </button>
      </div>
    </Modal>
  );
}

/* Add note modal */
function NoteModal({ order, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [addNote, { isLoading: busy }] = useAdminAddOrderNoteMutation();

  async function submit() {
    if (!note.trim()) { toast.error('Note is empty'); return; }
    try {
      await addNote({ id: order._id, note: note.trim() }).unwrap();
      toast.success('Note added');
      setNote('');
      onDone();
    } catch (e) { toast.error(e.data?.error || 'Failed'); }
  }

  return (
    <Modal title="Admin Notes" onClose={onClose}>
      <div className="space-y-3">
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…"
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition">
          {busy && <Loader2 size={14} className="animate-spin" />} Add Note
        </button>
        {order.adminNotes?.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">History</p>
            {[...order.adminNotes].reverse().map((n, i) => (
              <div key={i} className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-sm text-slate-700">{n.text}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{n.by} · {ago(n.at)} ago</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* Order card */
function OrderCard({ o, onAction }) {
  const stale = isStale(o);
  // Reassign is only meaningful before the worker has physically arrived.
  // Once arrived or in_progress, the worker is on-site — reassigning would
  // leave the customer stranded mid-service.
  const canReassign = !['arrived', 'in_progress'].includes(o.status);
  // Cancel is blocked once service has actively started (in_progress).
  // arrived is still cancellable — worker is on-site but hasn't begun work.
  const canCancel = o.status !== 'in_progress';
  return (
    <Card className={`p-4 ${stale ? 'ring-1 ring-amber-300' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-400">#{String(o._id).slice(-6)}</span>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{o.service?.replace(/_/g, ' ')}</span>
            <StatusBadge status={o.status} />
          </div>
        </div>
        {stale && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
            <AlertTriangle size={10} /> STALE
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400 font-semibold">CUSTOMER</p>
          <p className="text-slate-700 font-medium truncate">{o.userId?.name || '—'}</p>
          <p className="text-slate-400">{o.userId?.phone || ''}</p>
        </div>
        <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400 font-semibold">WORKER</p>
          <p className="text-slate-700 font-medium truncate">{o.workerId?.name || 'Searching…'}</p>
          <p className="text-slate-400">{o.workerId?.phone || ''}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><Clock size={10} /> placed {ago(o.createdAt)} ago</span>
        <span>· in status {currentStatusSince(o)}m</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mt-3">
        <div className="relative group">
          <button
            onClick={() => canReassign && onAction('reassign', o)}
            disabled={!canReassign}
            className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition ${
              canReassign
                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            <ArrowRightLeft size={12} /> Reassign
          </button>
          {!canReassign && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
              <div className="bg-slate-800 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                Worker is {o.status === 'arrived' ? 'on-site' : 'in progress'} — cannot reassign
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
              </div>
            </div>
          )}
        </div>
        <button onClick={() => onAction('force', o)} className="flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
          <UserCog size={12} /> Force Status
        </button>
        <button onClick={() => onAction('note', o)} className="flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100">
          <StickyNote size={12} /> Note{o.adminNotes?.length ? ` (${o.adminNotes.length})` : ''}
        </button>
        <div className="relative group">
          <button
            onClick={() => canCancel && onAction('cancel', o)}
            disabled={!canCancel}
            className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition ${
              canCancel
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            <Ban size={12} /> Cancel
          </button>
          {!canCancel && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
              <div className="bg-slate-800 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                Service in progress — use Force Status to resolve
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800" />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* Main */
export default function Intervention() {
  const [filter, setFilter] = useState('active'); // 'active' | 'stale'
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { type, order }

  // Pull a generous page of recent orders; filter client-side for active/stale.
  const { data, isLoading, isFetching, refetch } = useAdminOrdersQuery({ page: 1 }, { pollingInterval: 20000 });

  const orders = useMemo(() => {
    let list = (data?.orders || []).filter((o) => ACTIVE_STATUSES.includes(o.status));
    if (filter === 'stale') list = list.filter(isStale);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) =>
        String(o._id).toLowerCase().includes(q) ||
        o.userId?.phone?.includes(q) ||
        o.workerId?.phone?.includes(q));
    }
    return list;
  }, [data, filter, search]);

  if (isLoading) return <PageLoader />;

  const closeModal = () => setModal(null);
  const afterAction = () => { refetch(); /* keep modal context fresh */ };

  return (
    <div className="p-5 space-y-5">
      <SectionHeader title="Order Intervention" subtitle="Reassign, override status, refund and annotate live orders">
        <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </SectionHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by order ID or phone…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1.5">
          {[['active', 'Active Orders'], ['stale', 'Stale']].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center gap-1.5 ${filter === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {id === 'stale' && <Zap size={12} />} {label}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState message={filter === 'stale' ? 'No stale orders right now' : 'No active orders'} icon={Zap} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {orders.map((o) => (
            <OrderCard key={o._id} o={o} onAction={(type, order) => setModal({ type, order })} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal?.type === 'reassign' && <ReassignModal order={modal.order} onClose={closeModal} onDone={() => { afterAction(); closeModal(); }} />}
        {modal?.type === 'force'    && <ForceStatusModal order={modal.order} onClose={closeModal} onDone={() => { afterAction(); closeModal(); }} />}
        {modal?.type === 'cancel'   && <ForceCancelModal order={modal.order} onClose={closeModal} onDone={() => { afterAction(); closeModal(); }} />}
        {modal?.type === 'note'     && <NoteModal order={modal.order} onClose={closeModal} onDone={afterAction} />}
      </AnimatePresence>
    </div>
  );
}
