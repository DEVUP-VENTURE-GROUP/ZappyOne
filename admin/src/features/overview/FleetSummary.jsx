import { Link } from 'react-router-dom';
import { useAdminFleetOverviewQuery } from '@shared/services/api';
import { Kpi, Panel, TrendChart, rupees } from '../insights/charts';

/**
 * Our own fleet on the admin overview (server workforce/analytics): the last
 * 30 days in six numbers and one chart, linking to Fleet. Nothing shows for a
 * role that does not open Fleet, or before the first hub exists.
 */
export default function FleetSummary() {
  const { data, isError } = useAdminFleetOverviewQuery(30);
  if (isError || !data || !data.kpis.hubs) return null;
  const k = data.kpis;
  const series = data.days.map((d) => ({ ...d, date: d.day, costPaise: d.salaryPaise + d.expensesPaise }));
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">Our fleet</h2>
        <Link to="?tab=fleet" className="text-[12px] font-semibold text-[#1F4FD8] hover:underline">Open Fleet</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue, 30 days" value={rupees(k.revenuePaise)} delta={k.revenueDelta} />
        <Kpi label="Profit, 30 days" value={rupees(k.profitPaise)} delta={k.profitDelta} accent="#059669" />
        <Kpi label="On duty now" value={`${k.onDutyNow}/${k.staff}`} hint={`${k.hubs} hub${k.hubs === 1 ? '' : 's'}`} />
        <Kpi label="Attendance" value={k.attendancePct != null ? `${k.attendancePct}%` : '–'} accent="#7C3AED" />
        <Kpi label="Cash with staff" value={rupees(k.cashWithStaffPaise)} accent="#D97706" />
        <Kpi label="Low stock" value={k.lowStock} hint={rupees(k.stockValuePaise) + ' in stock'} accent="#0891B2" />
      </div>
      <Panel title="Fleet revenue and cost, 30 days" className="mt-3">
        <TrendChart days={series} bar="revenuePaise" barLabel="Revenue" line="costPaise" lineLabel="Cost" barFormat={rupees} lineFormat={rupees} sameScale height={180} />
      </Panel>
    </div>
  );
}
