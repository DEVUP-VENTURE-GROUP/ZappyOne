import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAdminFleetMissedOrdersQuery } from '@shared/services/api';
import { Card, Th, Td, EmptyState, PageLoader } from '@admin/ui/kit';
import MissedByHour from './MissedByHour';

const RANGES = [1, 7, 30, 90];
const KIND = { repair: 'Wash / repair', pet: 'Pet care', helping: 'Family Assist' };
const label = (s) => String(s).replace(/^fa_/, '').replace(/_/g, ' ');
const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const what = (o) => (o.by === 'nobody accepted' ? 'Nobody accepted' : `Cancelled by ${o.by === 'worker' || o.by === 'provider' ? 'staff' : o.by}`);

// Every order we lost (nobody accepted, or staff or the system cancelled it): when, where, why, and which hours lose the most (server workforce/missed-orders).
export default function FleetMissed() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isFetching, isError } = useAdminFleetMissedOrdersQuery(days, { pollingInterval: 120000 });

  if (isError) return <EmptyState message="Could not load missed orders. Refresh to try again." />;
  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          <b className="text-slate-900">{data.total}</b> order{data.total === 1 ? '' : 's'} missed in the last {days === 1 ? 'day' : `${days} days`}. Customer cancellations are not counted.
        </p>
        <div className="flex items-center gap-1.5">
          {RANGES.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${days === d ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
              {d === 1 ? 'Today' : `${d} days`}
            </button>
          ))}
          {isFetching && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>
      </div>

      <MissedByHour hours={data.hours} />

      <Card className="overflow-hidden p-0">
        {data.orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full tabular-nums">
              <thead><tr><Th>Booked at</Th><Th>Order</Th><Th>Service</Th><Th>Area</Th><Th>What happened</Th><Th right>Waited</Th><Th>Reason</Th></tr></thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <Td>{when(o.at)}</Td>
                    <Td mono>{o.reference || o.id.slice(-6)}</Td>
                    <Td><span className="capitalize">{label(o.service)}</span><span className="block text-[11px] text-slate-400">{KIND[o.kind] || o.kind}</span></Td>
                    <Td muted>{o.area || '-'}</Td>
                    <Td><span className={o.by === 'nobody accepted' ? 'font-semibold text-red-600' : 'font-semibold text-amber-700'}>{what(o)}</span></Td>
                    <Td right>{o.waitedMin != null ? `${o.waitedMin} min` : '-'}</Td>
                    <Td muted>{o.reason || '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="px-4 py-10 text-center text-sm text-slate-400">No missed orders in this window.</p>}
      </Card>
    </div>
  );
}
