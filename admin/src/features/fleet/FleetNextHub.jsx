import { useState } from 'react';
import { Sparkles, Users, Clock, Store, MapPin } from 'lucide-react';
import { useAdminFleetNextHubQuery } from '@shared/services/api';
import DaysPicker from './DaysPicker';
import { PageLoader, EmptyState } from '../../ui/kit';
import { Kpi, Panel, rupees } from '../insights/charts';
import NextHubMap from './NextHubMap';

const hr = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

// Where the next hub should open (server admin-portal/expansion): coverage today, a plain summary, ranked sites, and the map.
export default function FleetNextHub() {
  const [span, setSpan] = useState(30);
  const { data, isLoading, isError } = useAdminFleetNextHubQuery(span);
  const [focus, setFocus] = useState(null);
  if (isError) return <EmptyState message="Could not work out where to launch next." />;
  if (isLoading || !data) return <PageLoader />;
  const c = data.coverage;

  return (
    <div className="space-y-5">
      <DaysPicker value={span} onChange={setSpan} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Inside your hubs" value={`${c.hubPct}%`} hint="Of bookings and searches" accent="#16A34A" />
        <Kpi label="Partners only" value={`${c.partnerOnlyPct}%`} hint="No hub of yours reaches it" accent="#D97706" />
        <Kpi label="Nobody serves it" value={`${c.nobodyPct}%`} hint="Lost or at risk" accent="#DC2626" />
        <Kpi label="Arrival promise" value={`${data.promise.minutes} min`} hint={`So each new hub covers about ${data.promise.km} km`} />
      </div>

      <section className="rounded-2xl border border-[#1F4FD8]/20 bg-[#1F4FD8]/[0.04] p-5">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[#1F4FD8]"><Sparkles size={13} /> What the data says</p>
        <ul className="mt-2 space-y-1.5">
          {data.summary.map((t) => <li key={t} className="text-[14px] leading-relaxed text-slate-800">{t}</li>)}
        </ul>
        <p className="mt-3 text-[11.5px] text-slate-500">Worked out from the last {data.days} days of bookings and searches with a location. Unmet searches count double.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Panel title="Demand and coverage" note="Green: your hubs. Amber: partners only. Red: nobody. Numbers: recommended sites.">
          <NextHubMap cells={data.cells} hubs={data.hubs} sites={data.sites} focus={focus} />
        </Panel>
        <div className="space-y-3">
          {!data.sites.length && <EmptyState message="No unserved demand found yet." />}
          {data.sites.map((s) => (
            <button key={s.rank} type="button" onClick={() => setFocus({ lat: s.lat, lng: s.lng, at: Date.now() })} className="block w-full text-left">
              <section className="rounded-2xl border border-slate-200/70 bg-white p-4 transition hover:border-[#1F4FD8]/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#1F4FD8]">Site {s.rank}</p>
                    <p className="truncate text-[16px] font-semibold text-slate-900">{s.area}</p>
                  </div>
                  <p className="shrink-0 text-right"><span className="block text-[20px] font-semibold tabular-nums text-slate-900">{s.jobsPerMonth}</span><span className="text-[11px] text-slate-500">jobs a month</span></p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] text-slate-600">
                  <span className="flex items-center gap-1.5"><Users size={13} className="text-slate-400" /> About {s.staffNeeded} staff</span>
                  <span className="flex items-center gap-1.5"><Clock size={13} className="text-slate-400" /> {s.peakHour != null ? `Busiest ${hr(s.peakHour)}` : 'No peak yet'}</span>
                  <span className="flex items-center gap-1.5"><Store size={13} className="text-slate-400" /> {s.partnersNearby ? `${s.partnersNearby} partner${s.partnersNearby === 1 ? '' : 's'} near` : 'No partners near'}</span>
                  <span className="flex items-center gap-1.5"><MapPin size={13} className="text-slate-400" /> {s.nearestHub ? `${s.nearestHub.km} km from ${s.nearestHub.name}` : 'No hub yet'}</span>
                </div>
                <p className="mt-2 text-[12px] text-slate-500">
                  {s.demandShare}% of all demand: {s.bookings} bookings, {s.unserved} searches with nobody to send{s.takePerMonthPaise ? `, about ${rupees(s.takePerMonthPaise)} a month to ZappyOne today` : ''}.
                  {s.topServices.length ? ` Mostly ${s.topServices.map((x) => x.name).join(', ')}.` : ''}
                </p>
              </section>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
