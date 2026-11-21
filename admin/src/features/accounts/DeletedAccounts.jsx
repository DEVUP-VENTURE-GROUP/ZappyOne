import { useState } from 'react';
import { UserX } from 'lucide-react';
import { useAdminAccountDeletionsQuery } from '@shared/services/api';
import { SectionHeader, Card, Th, Td, EmptyState, ErrorState, PageSkeleton, Pagination, fmt, fmtDate } from '../../ui/kit';

const ROLES = [['', 'Everyone'], ['user', 'Customers'], ['worker', 'Pros'], ['shop', 'Businesses']];
const ROLE_LABEL = { user: 'Customer', worker: 'Pro', shop: 'Business', event_partner: 'Event partner' };

// Who deleted their account, why, and what they held or owed at that moment (server account/account-deletion).
export default function DeletedAccounts() {
  const [role, setRole] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useAdminAccountDeletionsQuery({ ...(role && { role }), ...(reason && { reason }), page });
  const pick = (setter) => (v) => { setter(v); setPage(1); };

  return (
    <div className="space-y-4">
      <SectionHeader title="Deleted accounts" subtitle="Who left, why, and their money position when they deleted. Personal details are already removed; only the last four digits of the phone are kept." />

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Account type">
        {ROLES.map(([id, label]) => (
          <button key={id || 'all'} type="button" role="radio" aria-checked={role === id} onClick={() => pick(setRole)(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${role === id ? 'bg-zappy-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {data?.byReason?.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Why they left</p>
          <div className="flex flex-wrap gap-2">
            {data.byReason.map((b) => (
              <button key={b.reason} type="button" onClick={() => pick(setReason)(reason === b.reason ? '' : b.reason)} aria-pressed={reason === b.reason}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${reason === b.reason ? 'bg-zappy-50 text-zappy-700 ring-zappy-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                {b.label} <span className="ml-1 font-bold tabular-nums">{b.count}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {isLoading ? <PageSkeleton rows={6} /> : isError ? <ErrorState onRetry={refetch} /> : !data?.deletions?.length ? (
        <EmptyState icon={UserX} message={reason || role ? 'No deleted accounts match this filter.' : 'Nobody has deleted their account yet.'} />
      ) : (
        <Card className={`overflow-x-auto p-0 ${isFetching ? 'opacity-70' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><Th>When</Th><Th>Who</Th><Th>Type</Th><Th>Reason</Th><Th right>Wallet</Th><Th right>Owed</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.deletions.map((d) => (
                <tr key={d._id} className="align-top">
                  <Td muted>{fmtDate(d.deletedAt)}</Td>
                  <Td><span className="font-medium text-slate-800">{d.name || 'Unnamed'}</span>{d.phoneLast4 && <span className="block text-xs text-slate-400">Phone ending {d.phoneLast4}</span>}</Td>
                  <Td>{ROLE_LABEL[d.role] || d.role}</Td>
                  <Td><span className="font-medium">{d.reasonLabel}</span>{d.note && <span className="mt-0.5 block max-w-xs whitespace-pre-wrap text-xs text-slate-500">{d.note}</span>}</Td>
                  <Td right>{d.walletPaise ? fmt(d.walletPaise) : '-'}</Td>
                  <Td right>{d.duesPaise ? <span className="font-semibold text-rose-600">{fmt(d.duesPaise)}</span> : '-'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3"><Pagination page={data.page} totalPages={data.pages} onChange={setPage} /></div>
        </Card>
      )}
    </div>
  );
}
