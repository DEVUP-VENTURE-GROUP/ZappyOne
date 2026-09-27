import { useState, Fragment } from 'react';
import { useAdminAuditLogsQuery } from '@client/services/api';
import { Shield } from 'lucide-react';
import { SectionHeader, Pagination, Card, Th, Td, EmptyState, PageLoader, fmtDate } from './_shared';

const ACTION_OPTS = ['', 'pricing_update', 'toggle_update', 'cancellation_config_update', 'worker_blocked', 'worker_unblocked', 'user_blocked', 'user_unblocked', 'payout_approved', 'payout_rejected', 'dispute_resolved', 'wallet_adjustment', 'wallet_reconcile', 'milestone_update'];

export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading, isFetching } = useAdminAuditLogsQuery({ page, action: action || undefined });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Audit Logs" subtitle={data?.total != null ? `${data.total} entries` : ''} />

      <div className="flex gap-1.5 flex-wrap">
        <button key="all" onClick={() => { setAction(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${action === '' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          All
        </button>
        {ACTION_OPTS.filter(Boolean).map(a => (
          <button key={a} onClick={() => { setAction(a); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${action === a ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {a.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Time</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.logs?.map((log) => {
                const hasDiff = log.before != null || log.after != null;
                return (
                  <Fragment key={log._id}>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <Td muted className="whitespace-nowrap">{fmtDate(log.at || log.createdAt)}</Td>
                      <Td>
                        <p className="font-semibold text-slate-900 text-xs">{log.actor?.email || log.actor?.kind || '—'}</p>
                        <p className="text-[11px] text-slate-400 capitalize">{log.actor?.kind}</p>
                      </Td>
                      <Td>
                        <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold capitalize">
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </Td>
                      <Td muted>
                        {log.target?.kind && <span className="capitalize">{log.target.kind}</span>}
                        {log.target?.id && (
                          <span className="text-[11px] text-slate-400 ml-1">…{String(log.target.id).slice(-6)}</span>
                        )}
                      </Td>
                      <Td>
                        {hasDiff && (
                          <button onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                            className="text-xs text-blue-600 hover:underline">
                            {expanded === log._id ? 'hide' : 'view changes'}
                          </button>
                        )}
                      </Td>
                    </tr>
                    {expanded === log._id && hasDiff && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="text-[11px] text-slate-600 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                            {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!data?.logs?.length && !isFetching && <EmptyState message="No audit logs" icon={Shield} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      </Card>
    </div>
  );
}
