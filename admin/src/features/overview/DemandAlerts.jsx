import { Link } from 'react-router-dom';
import { AlertTriangle, Search, SearchX, TrendingUp, ChevronRight } from 'lucide-react';
import { useAdminSearchDemandQuery, useAdminBookingAttentionQuery } from '@shared/services/api';
import { Card } from '../../ui/kit';

/**
 * The top of Overview: what needs a person right now, and what customers are
 * looking for. Searches are counted by person (one person retyping is one),
 * searches we could not serve are the services or areas to add next, and a
 * service with more people today than yesterday is rising.
 */
const SERVICE_NAME = {
  mobile_repair: 'Mobile phones', laptop_repair: 'Laptops', two_wheeler: '2-Wheeler', four_wheeler: '4-Wheeler',
  water_tank_care: 'Water & tank care',
};
const nameOf = (code) => SERVICE_NAME[code] || String(code || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

function Line({ Icon, tone, children }) {
  const tones = { red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600' };
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}><Icon size={14} /></span>
      <p className="min-w-0 flex-1 text-sm leading-snug text-slate-700">{children}</p>
    </li>
  );
}

export default function DemandAlerts() {
  const { data: d } = useAdminSearchDemandQuery(undefined, { pollingInterval: 120000 });
  const { data: attention } = useAdminBookingAttentionQuery(undefined, { pollingInterval: 30000 });
  const needs = attention?.count || 0;
  const unserved = d?.unserved || [];
  const top = d?.topSearches || [];
  const rising = d?.rising || [];

  return (
    <div className="space-y-3">
      {needs > 0 && (
        <Link to="?tab=bookings&view=attention"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">
            <b>{needs} {needs === 1 ? 'job needs' : 'jobs need'} a hand</b>
            {' '}({attention.stuck.length} past the time limit, {attention.waiting.length} waiting for a provider)
          </span>
          <span className="flex items-center gap-1 font-semibold">Intervene <ChevronRight size={15} /></span>
        </Link>
      )}

      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold text-slate-800">What customers are looking for</p>
          <Link to="?tab=insights&sub=demand" className="text-xs font-semibold text-zappy-600 hover:underline">Demand insights</Link>
        </div>
        {!d ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : !top.length && !unserved.length && !rising.length ? (
          <p className="mt-3 text-sm text-slate-500">No searches yet this week. As customers search, what they look for shows here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {unserved.map((u) => (
              <Line key={`u-${u.what}-${u.city}`} Icon={SearchX} tone="red">
                <b>{people(u.people)}</b> searched <b>“{nameOf(u.what)}”</b>{u.city ? ` in ${u.city}` : ''} and we had nothing to offer. Add the service or providers there.
              </Line>
            ))}
            {rising.map((r) => (
              <Line key={`r-${r.service}`} Icon={TrendingUp} tone="green">
                <b>{nameOf(r.service)}</b> is rising: {people(r.today)} today, {r.yesterday} yesterday.
              </Line>
            ))}
            {top.map((t) => (
              <Line key={`t-${t.query}`} Icon={Search} tone="blue">
                <b>{people(t.people)}</b> searched <b>“{t.query}”</b> this week{t.today ? ` (${t.today} today)` : ''}
                {t.unserved ? <span className="text-red-600">, {t.unserved} could not be served</span> : null}.
              </Line>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
