import { useState } from 'react';
import { X } from 'lucide-react';
import { useAdminFleetActivityQuery } from '@shared/services/api';
import { Card, Th, Td, EmptyState, PageLoader, Pagination, fmtDate } from '@admin/ui/kit';

const LABEL = {
  'admin.login_success': 'Signed in',
  'admin.login_failure': 'Failed sign-in',
  'workforce.hub_create': 'Added a hub',
  'workforce.hub_update': 'Changed a hub',
  'workforce.staff_set': 'Changed a staff member',
  'workforce.shift_assign': 'Put someone on a shift',
  'workforce.shift_remove': 'Took someone off a shift',
  'workforce.roster_autofill': 'Auto-filled the roster',
  'workforce.leave_approved': 'Approved leave',
  'workforce.leave_rejected': 'Turned down leave',
  'workforce.expense_add': 'Added an expense',
  'workforce.expense_remove': 'Removed an expense',
  'workforce.cash_deposit': 'Recorded a cash deposit',
  'workforce.stock_item': 'Added a stock item',
  'economics.workforce': 'Changed fleet settings',
  'fleet.view_selfie': 'Viewed a check-in selfie',
  'fleet.view_payroll': 'Viewed payroll',
};
const labelOf = (a) => LABEL[a] || (a?.startsWith('fleet.') ? `Changed something (${a.slice(6).toUpperCase()})` : a?.startsWith('workforce.') ? a.slice(10).replace(/_/g, ' ') : a);
const PORTAL = { fleet: 'Fleet portal', admin: 'Admin' };

// Every Fleet action and every Fleet portal sign-in: who, what, when, from where (server workforce/activity).
export default function FleetActivity() {
  const [page, setPage] = useState(1);
  const [who, setWho] = useState(null);
  const { data, isLoading, isFetching, isError } = useAdminFleetActivityQuery({ page, actorId: who?.id });

  if (isError) return <EmptyState message="Could not load activity. Refresh to try again." />;
  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-slate-500">Kept for two years. Nobody can edit or delete an entry.</p>
        {who && (
          <button type="button" onClick={() => { setWho(null); setPage(1); }} className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
            Only {who.email} <X size={12} />
          </button>
        )}
      </div>
      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 animate-pulse bg-blue-600" />}
        {!data?.logs?.length ? <EmptyState message="Nothing yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-slate-100"><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Where</Th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {data.logs.map((l) => (
                  <tr key={l._id}>
                    <Td muted><span className="whitespace-nowrap">{fmtDate(l.at)}</span></Td>
                    <Td>
                      {l.actor?.id
                        ? <button type="button" onClick={() => { setWho({ id: l.actor.id, email: l.actor.email || 'this person' }); setPage(1); }} className="text-left text-xs font-semibold text-slate-900 hover:underline">{l.actor.email || 'Admin'}</button>
                        : <span className="text-xs text-slate-500">{l.actor?.email || 'Unknown'}</span>}
                    </Td>
                    <Td>
                      <span className={`text-xs font-semibold ${l.action === 'admin.login_failure' ? 'text-red-600' : 'text-slate-800'}`}>{labelOf(l.action)}</span>
                      {l.after?.code && <span className="block text-[11px] text-slate-400">{l.after.code}</span>}
                    </Td>
                    <Td muted><span className="text-xs">{PORTAL[l.portal] || l.portal || '—'}</span><span className="block text-[11px] text-slate-400">{l.ip || ''}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data?.pages > 1 && <Pagination page={page} totalPages={data.pages} onChange={setPage} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(data.pages, p + 1))} />}
    </div>
  );
}
