import toast from 'react-hot-toast';
import { useAdminLeaveQuery, useAdminDecideLeaveMutation } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../ui/kit';

const dayLabel = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Leave waiting for a decision. Approved leave is paid (payroll counts it). */
export default function FleetLeave() {
  const { data, isLoading } = useAdminLeaveQuery('requested');
  const [decide, { isLoading: saving }] = useAdminDecideLeaveMutation();
  if (isLoading) return <PageLoader />;
  const leave = data?.leave || [];
  if (!leave.length) return <EmptyState message="No leave waiting." />;
  const act = (id, decision) => decide({ id, decision }).unwrap().then(() => toast.success(decision === 'approved' ? 'Approved' : 'Not approved')).catch((e) => toast.error(e?.data?.error || 'Could not save'));
  return (
    <Card className="divide-y divide-slate-100 p-0">
      {leave.map((l) => (
        <div key={l._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-[180px] flex-1">
            <p className="text-sm font-semibold text-slate-900">{l.workerId?.name || 'Staff'}, {dayLabel(l.day)}</p>
            <p className="text-[12.5px] text-slate-500">{l.reason || 'No reason given'}</p>
          </div>
          <button type="button" disabled={saving} onClick={() => act(l._id, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Approve</button>
          <button type="button" disabled={saving} onClick={() => act(l._id, 'rejected')} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-600 ring-1 ring-slate-200 disabled:opacity-50">Reject</button>
        </div>
      ))}
    </Card>
  );
}
