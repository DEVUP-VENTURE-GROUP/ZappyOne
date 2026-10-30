import { Link } from 'react-router-dom';
import { useAdminMetricsQuery, useAdminInsightsOverviewQuery, useAdminMeQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import DemandAlerts from './DemandAlerts';
import FleetSummary from './FleetSummary';
import { Kpi, TrendChart, Panel, rupees, count } from '../insights/charts';

/**
 * The first screen: what needs a person now, what customers are looking for,
 * then today's business and the last seven days. Bookings and money come from
 * the bookings the platform takes today (repair, pet, helping, events); the
 * people counts (providers online, customers) from the accounts.
 */
export default function Overview() {
  const { data: today, isLoading } = useAdminInsightsOverviewQuery(1, { pollingInterval: 60000 });
  const { data: week } = useAdminInsightsOverviewQuery(7, { pollingInterval: 120000 });
  const { data: m } = useAdminMetricsQuery(undefined, { pollingInterval: 60000 });
  const { data: me } = useAdminMeQuery();

  if (isLoading) return <PageLoader />;
  const t = today?.current || {};
  const d = today?.delta || {};

  return (
    <div className="space-y-6">
      <DemandAlerts />

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-slate-900">Today</h2>
          <p className="text-[12px] text-slate-400">Since midnight, India time, compared with yesterday at this time</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <Kpi label="Bookings" value={count(t.bookings)} delta={d.bookings} hint={`${count(t.active)} in progress`} />
          <Kpi label="Completed" value={count(t.completed)} delta={d.completed} />
          <Kpi label="Booked value" value={rupees(t.gmvPaise)} delta={d.gmvPaise} />
          <Kpi label="We earned" value={rupees(t.takePaise)} delta={d.takePaise} accent="#10B981" />
          <Kpi label="Providers online" value={m ? `${count(m.onlineWorkers)}/${count(m.totalWorkers)}` : '-'} hint="Rakshak workers" />
          <Kpi label="Customers" value={m ? count(m.totalUsers) : '-'} hint="All time" />
        </div>
      </div>

      {/* Our own staff and dark stores (Fleet), for roles that open it. */}
      {me?.areas?.includes('fleet') && <FleetSummary />}

      {week && (
        <Panel title="Last 7 days" note={<Link to="?tab=insights&sub=today&days=7" className="font-semibold text-[#1F4FD8] hover:underline">Open Insights</Link>}>
          <TrendChart days={week.daily} bar="bookings" barLabel="Bookings" prev="prevBookings" line="takePaise" lineLabel="We earned"
            lineFormat={(v) => rupees(v, { exact: true })} height={200} />
        </Panel>
      )}
    </div>
  );
}
