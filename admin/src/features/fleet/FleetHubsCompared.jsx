import { useState } from 'react';
import { useAdminFleetInsightsQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState, Th, Td } from '../../ui/kit';
import { rupees } from '../insights/charts';
import MonthPicker, { thisMonth } from '@fleet/ui/MonthPicker';

const pct = (v) => (v == null ? '–' : `${v}%`);

// Every hub side by side, best profit first: is each dark store paying for itself, and why not.
export default function FleetHubsCompared() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading } = useAdminFleetInsightsQuery(month);
  if (isLoading || !data) return <PageLoader />;
  const best = Math.max(1, ...data.hubs.map((h) => Math.abs(h.profitPaise)));

  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={setMonth} />
      {!data.hubs.length ? <EmptyState message="No hubs yet." /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-50"><tr>
              <Th>Hub</Th><Th>Profit</Th><Th right>Margin</Th><Th right>Revenue</Th><Th right>Jobs</Th><Th right>Earns a job</Th><Th right>Costs a job</Th><Th right>Revenue per staff</Th><Th right>Attendance</Th><Th right>Incentives</Th><Th right>Under target</Th>
            </tr></thead>
            <tbody>
              {data.hubs.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <Td><span className="font-semibold text-slate-900">{h.name}</span><span className="block text-[11.5px] text-slate-500">{h.staff} staff</span></Td>
                  <Td>
                    <span className={`font-bold tabular-nums ${h.profitPaise < 0 ? 'text-red-600' : 'text-slate-900'}`}>{rupees(h.profitPaise, { exact: true })}</span>
                    <span className="mt-1 block h-1.5 w-28 rounded-full bg-slate-100"><span className={`block h-1.5 rounded-full ${h.profitPaise < 0 ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${(Math.abs(h.profitPaise) / best) * 100}%` }} /></span>
                  </Td>
                  <Td right>{pct(h.marginPct)}</Td>
                  <Td right>{rupees(h.revenuePaise, { exact: true })}</Td>
                  <Td right>{h.jobs}</Td>
                  <Td right>{h.revenuePerJobPaise != null ? rupees(h.revenuePerJobPaise, { exact: true }) : '–'}</Td>
                  <Td right><span className={h.costPerJobPaise != null && h.revenuePerJobPaise != null && h.costPerJobPaise > h.revenuePerJobPaise ? 'font-semibold text-red-600' : ''}>{h.costPerJobPaise != null ? rupees(h.costPerJobPaise, { exact: true }) : '–'}</span></Td>
                  <Td right>{h.revenuePerStaffPaise != null ? rupees(h.revenuePerStaffPaise, { exact: true }) : '–'}</Td>
                  <Td right><span className={h.attendancePct != null && h.attendancePct < 85 ? 'font-semibold text-amber-700' : ''}>{pct(h.attendancePct)}</span></Td>
                  <Td right>{h.incentivePaise ? rupees(h.incentivePaise, { exact: true }) : '–'}</Td>
                  <Td right>{h.lowWork || '–'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
