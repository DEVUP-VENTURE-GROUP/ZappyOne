import { useState } from 'react';
import { AlertTriangle, Clock, MapPin, RefreshCw, CheckCircle2, Hourglass } from 'lucide-react';
import { useAdminBookingAttentionQuery } from '@shared/services/api';
import { Card, PageLoader } from '../../ui/kit';
import { BookingDrawer } from './Bookings';

/**
 * Bookings → Needs intervention. What needs a person now, every job kind:
 * jobs past their time limit, then jobs still waiting for a provider. Opening
 * one shows the booking with its Intervene panel (nearby providers, assign
 * with a reason, notes), so the fix happens right there.
 */
const KIND_LABEL = { repair: 'Repair', pet: 'Pet care', helping: 'Helping', event: 'Event' };
const label = (s = '') => s.replace(/_/g, ' ').toLowerCase();
const minutes = (m) => (m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} days`);

function Row({ j, tone, onOpen }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
        {tone === 'stuck'
          ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
          : <Hourglass size={16} className="mt-0.5 shrink-0 text-amber-500" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {KIND_LABEL[j.kind] || j.kind} · <span className="capitalize">{j.title}</span>
            {j.reference && <span className="ml-1.5 font-mono text-xs font-normal text-slate-400">{j.reference}</span>}
          </span>
          {j.stuck && <span className="mt-0.5 block text-xs font-semibold text-red-600">{j.stuck}</span>}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="capitalize">{label(j.status)}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> {minutes(j.minutesInStatus)}</span>
            {!j.hasProvider && <span className="font-semibold text-amber-700">no provider</span>}
            {j.address && <span className="flex min-w-0 items-center gap-1 truncate"><MapPin size={11} /> {j.address}</span>}
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Intervene</span>
      </button>
    </li>
  );
}

function Section({ title, hint, jobs, tone, onOpen }) {
  if (!jobs.length) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-sm font-bold text-slate-800">{title} <span className="ml-1 text-slate-400">{jobs.length}</span></h3>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {jobs.map((j) => <Row key={`${j.kind}-${j.id}`} j={j} tone={tone} onOpen={() => onOpen({ source: j.kind, id: j.id })} />)}
        </ul>
      </Card>
    </section>
  );
}

export default function InterventionQueue() {
  const [open, setOpen] = useState(null);
  const { data, isLoading, isFetching, refetch } = useAdminBookingAttentionQuery(undefined, { pollingInterval: 30000 });
  if (isLoading) return <PageLoader />;
  const stuck = data?.stuck || [];
  const waiting = data?.waiting || [];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" onClick={refetch} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      {!stuck.length && !waiting.length ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 size={28} className="text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">Nothing needs a hand right now</p>
          <p className="text-xs text-slate-500">Every live job has a provider and is inside its time limit. This refreshes every 30 seconds.</p>
        </Card>
      ) : (
        <>
          <Section title="Past their time limit" hint="Longest first" jobs={stuck} tone="stuck" onOpen={setOpen} />
          <Section title="Waiting for a provider" hint="Still inside the limit" jobs={waiting} tone="waiting" onOpen={setOpen} />
        </>
      )}
      {open && <BookingDrawer {...open} onClose={() => { setOpen(null); refetch(); }} />}
    </div>
  );
}
