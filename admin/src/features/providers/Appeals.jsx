import { useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminGetAppealsQuery, useAdminResolveAppealMutation } from '@shared/services/api';

const STATUS_TABS = ['all', 'pending', 'under_review', 'upheld', 'dismissed'];
const STATUS_LABEL = { pending: 'Pending', under_review: 'Under Review', upheld: 'Upheld', dismissed: 'Dismissed' };
const STATUS_COLOR = {
  pending:      'bg-amber-50 text-amber-700 border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  upheld:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed:    'bg-red-50 text-red-700 border-red-200',
};
const TYPE_LABEL = { rating: 'Rating', penalty: 'Penalty', cancellation: 'Cancellation', order_issue: 'Order Issue' };

function AppealRow({ appeal }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [resolve, { isLoading }] = useAdminResolveAppealMutation();

  async function handleResolve(status) {
    try {
      await resolve({ id: appeal._id, status, adminNote: note.trim() }).unwrap();
      toast.success(`Appeal ${status}`);
    } catch (err) { toast.error(err?.data?.error || 'Failed'); }
  }

  const terminal = ['upheld', 'dismissed'].includes(appeal.status);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[appeal.status]}`}>
              {STATUS_LABEL[appeal.status] ?? appeal.status}
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full uppercase">
              {TYPE_LABEL[appeal.type] ?? appeal.type}
            </span>
          </div>
          <p className="font-semibold text-slate-800 text-sm truncate">{appeal.subject}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {appeal.workerId?.name ?? 'Worker'} · {new Date(appeal.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">DESCRIPTION</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{appeal.description}</p>
          </div>
          {appeal.adminNote && (
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-bold text-slate-500 mb-1">ADMIN NOTE</p>
              <p className="text-sm text-slate-700">{appeal.adminNote}</p>
            </div>
          )}
          {!terminal && (
            <div className="space-y-2">
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="Resolution note (optional — shown to worker)…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-indigo-300" />
              <div className="flex gap-2">
                <button onClick={() => handleResolve('under_review')} disabled={isLoading}
                  className="flex-1 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold disabled:opacity-50 hover:bg-blue-100">
                  {isLoading ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Mark Under Review'}
                </button>
                <button onClick={() => handleResolve('upheld')} disabled={isLoading}
                  className="flex-1 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold disabled:opacity-50 hover:bg-emerald-100">
                  Uphold
                </button>
                <button onClick={() => handleResolve('dismissed')} disabled={isLoading}
                  className="flex-1 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold disabled:opacity-50 hover:bg-red-100">
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {terminal && (
            <p className="text-xs text-slate-400 text-center">
              {appeal.status === 'upheld' ? '✅ Appeal was upheld' : '❌ Appeal was dismissed'}
              {appeal.resolvedAt && ` on ${new Date(appeal.resolvedAt).toLocaleDateString('en-IN')}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Appeals() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useAdminGetAppealsQuery({ status: status === 'all' ? undefined : status, page });
  const appeals = data?.appeals ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const counts = { pending: appeals.filter(a => a.status === 'pending').length };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Worker Appeals</h2>
          <p className="text-xs text-slate-500 mt-0.5">Rating, penalty, cancellation, and order disputes</p>
        </div>
        <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full">
          {total} {status !== 'all' ? STATUS_LABEL[status] : 'Total'}
        </span>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${status === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isLoading || isFetching ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : appeals.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center">
          <CheckCircle size={28} className="mx-auto mb-2 text-emerald-300" />
          <p className="text-sm text-slate-500">No {status !== 'all' ? STATUS_LABEL[status]?.toLowerCase() : ''} appeals</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appeals.map(a => <AppealRow key={a._id} appeal={a} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center pt-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-40">Previous</button>
          <span className="px-3 py-1.5 text-xs text-slate-500">{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
