import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldAlert, AlertOctagon, Ban, X, Loader2,
  MapPin, Gauge, RotateCcw, Users, Star, CreditCard, MapPinned,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminFraudSummaryQuery, useAdminFraudEventsQuery,
  useAdminFraudActorEventsQuery, useAdminResolveFraudEventMutation,
} from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState } from './_shared';

const TYPE_META = {
  gps_spoof:            { label: 'GPS Spoof',           Icon: MapPin },
  velocity_abuse:       { label: 'Velocity Abuse',       Icon: Gauge },
  refund_abuse:         { label: 'Refund Abuse',         Icon: RotateCcw },
  duplicate_account:    { label: 'Duplicate Account',    Icon: Users },
  payment_anomaly:      { label: 'Payment Anomaly',      Icon: CreditCard },
  rating_manipulation:  { label: 'Rating Manipulation',  Icon: Star },
  fake_location:        { label: 'Fake Location',        Icon: MapPinned },
};

const SEVERITY_DOT = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-400',
  low:      'bg-slate-400',
};

const STATUS_BADGE = {
  open:      'bg-red-100 text-red-700',
  escalated: 'bg-orange-100 text-orange-700',
  dismissed: 'bg-slate-100 text-slate-500',
  blocked:   'bg-slate-900 text-white',
};

const TYPE_TABS = [
  { id: '',                   label: 'All' },
  { id: 'gps_spoof',          label: 'GPS Spoof' },
  { id: 'velocity_abuse',     label: 'Velocity' },
  { id: 'refund_abuse',       label: 'Refund Abuse' },
  { id: 'duplicate_account',  label: 'Duplicate' },
  { id: 'rating_manipulation',label: 'Rating' },
];

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function detailSummary(ev) {
  const d = ev.details || {};
  switch (ev.type) {
    case 'velocity_abuse':      return `${d.ordersInLast60Min} orders in 60 min`;
    case 'refund_abuse':        return `${d.refundsLast30d} refunds · ${d.refundRatePct}% rate`;
    case 'duplicate_account':   return d.reason === 'shared_phone' ? `${d.accountCount} accounts on phone` : `${d.accountCount} accounts on device`;
    case 'rating_manipulation': return `${d.fiveStarPairCount7d}× 5★ same pair (7d)`;
    case 'gps_spoof':           return `${d.speedMps} m/s jump · ${d.distMetres}m`;
    default:                    return Object.keys(d).length ? JSON.stringify(d).slice(0, 60) : '—';
  }
}

function StatCard({ label, value, color, bg, Icon }) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{value ?? 0}</p>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">{label}</p>
        </div>
        <Icon size={20} className={color} />
      </div>
    </div>
  );
}

/* Actor history modal */
function ActorModal({ actor, onClose }) {
  const { data, isLoading } = useAdminFraudActorEventsQuery({ actorKind: actor.actorKind, actorId: actor.actorId });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <p className="font-bold text-slate-900">{actor.actorName || 'Unknown actor'}</p>
            <p className="text-xs text-slate-500">{actor.actorPhone || '—'} · {actor.actorKind}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {isLoading ? <PageLoader /> : !data?.events?.length ? (
            <EmptyState message="No fraud events for this actor" icon={Shield} />
          ) : data.events.map((ev) => {
            const meta = TYPE_META[ev.type] || { label: ev.type, Icon: ShieldAlert };
            return (
              <div key={ev._id} className="flex items-start gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[ev.severity]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${STATUS_BADGE[ev.status]}`}>{ev.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{detailSummary(ev)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(ev.createdAt)}{ev.adminNote ? ` · note: ${ev.adminNote}` : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

/* Main */
export default function Fraud() {
  const [type, setType]       = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus]   = useState('');
  const [page, setPage]       = useState(1);
  const [actor, setActor]     = useState(null);

  const { data: summary } = useAdminFraudSummaryQuery(undefined, { pollingInterval: 30000 });
  const { data, isLoading, isFetching } = useAdminFraudEventsQuery(
    { type: type || undefined, severity: severity || undefined, status: status || undefined, page },
    { pollingInterval: 30000 },
  );
  const [resolve, { isLoading: resolving }] = useAdminResolveFraudEventMutation();

  async function act(ev, newStatus) {
    if (newStatus === 'blocked') {
      const ok = window.confirm(`This will block ${ev.actorName || 'this actor'} from the platform. All their active orders will be flagged.`);
      if (!ok) return;
    }
    try {
      const res = await resolve({ id: ev._id, status: newStatus }).unwrap();
      toast.success(newStatus === 'blocked' ? (res.actorBlocked ? 'Actor blocked' : 'Event marked blocked') : `Event ${newStatus}`);
    } catch (e) {
      toast.error(e.data?.error || 'Action failed');
    }
  }

  if (isLoading) return <PageLoader />;

  const events = data?.events || [];

  return (
    <div className="p-5 space-y-5">
      <SectionHeader title="Fraud Detection" subtitle="Suspicious activity across users and workers (last 30 days)" />

      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open Flags"     value={summary?.openCount}     color="text-red-600"    bg="bg-red-50 border-red-100"       Icon={ShieldAlert} />
        <StatCard label="Critical"       value={summary?.criticalOpen}  color="text-orange-600" bg="bg-orange-50 border-orange-100" Icon={AlertOctagon} />
        <StatCard label="This Week"      value={summary?.thisWeek}      color="text-amber-600"  bg="bg-amber-50 border-amber-100"   Icon={Shield} />
        <StatCard label="Blocked Actors" value={summary?.blockedActors} color="text-slate-700"  bg="bg-slate-100 border-slate-200"  Icon={Ban} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setType(t.id); setPage(1); }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${type === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none">
            <option value="">All severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none">
            <option value="">All status</option>
            <option value="open">Open</option>
            <option value="escalated">Escalated</option>
            <option value="dismissed">Dismissed</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {/* Events table */}
      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-red-500 animate-pulse" />}
        {events.length === 0 ? (
          <EmptyState message="No fraud events match these filters" icon={Shield} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Sev</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Actor</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Details</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">When</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {events.map((ev) => {
                  const meta = TYPE_META[ev.type] || { label: ev.type, Icon: ShieldAlert };
                  const Icon = meta.Icon;
                  const closed = ['dismissed', 'blocked'].includes(ev.status);
                  return (
                    <tr key={ev._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3"><span className={`block w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[ev.severity]}`} title={ev.severity} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className="text-slate-400" />
                          <span className="text-sm font-semibold text-slate-800">{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setActor(ev)} className="text-left">
                          <span className="text-sm font-semibold text-indigo-700 hover:underline">{ev.actorName || 'Unknown'}</span>
                          <span className="block text-[11px] text-slate-400">{ev.actorPhone || '—'} · <span className="capitalize">{ev.actorKind}</span></span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px] truncate">{detailSummary(ev)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{timeAgo(ev.createdAt)}</td>
                      <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full font-bold capitalize ${STATUS_BADGE[ev.status]}`}>{ev.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button disabled={closed || resolving} onClick={() => act(ev, 'dismissed')}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">Dismiss</button>
                          <button disabled={closed || resolving} onClick={() => act(ev, 'escalated')}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-40">Escalate</button>
                          <button disabled={ev.status === 'blocked' || resolving} onClick={() => act(ev, 'blocked')}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">Block</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Prev</button>
            <span className="text-xs text-slate-400">Page {page} / {data.totalPages} · {data.total} total</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
          </div>
        )}
      </Card>

      <AnimatePresence>
        {actor && <ActorModal actor={actor} onClose={() => setActor(null)} />}
      </AnimatePresence>
    </div>
  );
}
