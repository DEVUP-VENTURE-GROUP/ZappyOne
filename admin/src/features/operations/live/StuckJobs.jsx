import { useState } from 'react';
import { RefreshCw, AlertTriangle, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import { useAdminStuckJobsQuery } from '@shared/services/api';
import { SectionHeader, Card, PageLoader } from '../../../ui/kit';
import { BookingDrawer } from '../../bookings/Bookings';

/**
 * Jobs past their time limit, every kind, longest first.
 *
 * Each kind keeps its own clock (server: jobs/kinds.js): no provider after
 * ten minutes, a helper en route for an hour, an event whose date passed.
 * Opening a job uses the same drawer as Bookings, so cancelling or refunding
 * runs that engine's own rules: fees, refunds and the customer's notice.
 */

const KIND_LABEL = { repair: 'Repair', pet: 'Pet care', helping: 'Helping', event: 'Event' };
const label = (s = '') => s.replace(/_/g, ' ').toLowerCase();
const minutes = (m) => (m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} days`);

export default function StuckJobs() {
  const [open, setOpen] = useState(null);
  const { data, isLoading, isFetching, refetch } = useAdminStuckJobsQuery(undefined, { pollingInterval: 30000 });
  if (isLoading) return <PageLoader />;
  const jobs = data?.jobs || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Stuck jobs" subtitle="Live jobs past their time limit, longest first">
        <button type="button" onClick={refetch} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </SectionHeader>

      {jobs.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 size={28} className="text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">Nothing is stuck</p>
          <p className="text-xs text-slate-500">Every live job is inside its time limit.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {jobs.map((j) => (
              <li key={`${j.kind}-${j.id}`}>
                <button type="button" onClick={() => setOpen({ source: j.kind, id: j.id })} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">
                      {KIND_LABEL[j.kind] || j.kind} · <span className="capitalize">{j.title}</span>
                      {j.reference && <span className="ml-1.5 font-mono text-xs font-normal text-slate-400">{j.reference}</span>}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-red-600">{j.stuck}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="capitalize">{label(j.status)}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {minutes(j.minutesInStatus)}</span>
                      {!j.hasProvider && <span className="font-semibold text-amber-700">no provider</span>}
                      {j.address && <span className="flex min-w-0 items-center gap-1 truncate"><MapPin size={11} /> {j.address}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-600">Open</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open && <BookingDrawer {...open} onClose={() => { setOpen(null); refetch(); }} />}
    </div>
  );
}
