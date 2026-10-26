import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAdminBookingHealthQuery } from '@shared/services/api';

const KIND = { repair: 'Repairs and washes', pet: 'Pet care', helping: 'Family Assist and errands' };
const RANGES = [7, 30, 90];
const label = (s) => String(s).replace(/^fa_/, '').replace(/_/g, ' ');

// Where bookings go wrong (server admin-portal/booking-health): per service, made, finished, cancelled, never got a provider, still waiting, and minutes to acceptance.
export default function BookingHealth() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isFetching } = useAdminBookingHealthQuery(days, { pollingInterval: 120000 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">What happened to bookings made in the last {days} days. <b>Lost</b> is cancelled by a provider or the system, or never got a provider: the orders that went missing.</p>
        <div className="flex gap-1.5">
          {RANGES.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${days === d ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{d} days</button>
          ))}
          {isFetching && <Loader2 size={14} className="mt-1.5 animate-spin text-slate-400" />}
        </div>
      </div>
      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> : (data?.kinds || []).map((k) => (
        <section key={k.kind} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">{KIND[k.kind] || k.kind}</h3>
            <p className="text-[12px] text-slate-500 tabular-nums">
              {k.made} made · {k.done} done · {k.cancelledByCustomer} cancelled by customer · <span className="font-bold text-red-600">{k.cancelledOther + k.noProvider} lost</span> · {k.waiting} waiting
              {k.acceptMedianMin != null && ` · accepted in ${k.acceptMedianMin} min (slowest 10%: ${k.acceptP90Min} min)`}
              {k.capped && ' · latest 3,000 only'}
            </p>
          </div>
          {k.services.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] tabular-nums">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2">Service</th><th className="px-3 py-2 text-right">Made</th><th className="px-3 py-2 text-right">Done</th><th className="px-3 py-2 text-right">Customer cancelled</th><th className="px-3 py-2 text-right">Provider or system cancelled</th><th className="px-3 py-2 text-right">No provider</th><th className="px-3 py-2 text-right">Waiting</th><th className="px-4 py-2 text-right">Lost</th></tr>
                </thead>
                <tbody>
                  {k.services.map((r) => (
                    <tr key={r.service} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-semibold capitalize text-slate-800">{label(r.service)}</td>
                      <td className="px-3 py-2 text-right">{r.made}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{r.done}</td>
                      <td className="px-3 py-2 text-right">{r.cancelledByCustomer}</td>
                      <td className="px-3 py-2 text-right">{r.cancelledOther}</td>
                      <td className="px-3 py-2 text-right">{r.noProvider}</td>
                      <td className="px-3 py-2 text-right">{r.waiting}</td>
                      <td className={`px-4 py-2 text-right font-bold ${r.lostPct >= 20 ? 'text-red-600' : r.lostPct ? 'text-amber-600' : 'text-slate-400'}`}>{r.lostPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 py-6 text-center text-sm text-slate-400">No bookings in this window.</p>}
        </section>
      ))}
    </div>
  );
}
