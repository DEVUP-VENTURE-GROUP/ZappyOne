import { useState } from 'react';
import { useAdminFleetInsightsQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState, Th, Td } from '../../ui/kit';
import { rupees } from '../insights/charts';
import MonthPicker, { thisMonth } from '@fleet/ui/MonthPicker';

const SORTS = [['jobs', 'Most jobs'], ['targetPct', 'Against target'], ['attendancePct', 'Attendance'], ['givenBack', 'Hand-backs']];

// Every staff member ranked: jobs against their pro-rated target, incentive earned, attendance, lateness and hand-backs.
export default function FleetPeople() {
  const [month, setMonth] = useState(thisMonth());
  const [sort, setSort] = useState('jobs');
  const { data, isLoading } = useAdminFleetInsightsQuery(month);
  if (isLoading || !data) return <PageLoader />;
  const rows = [...data.people].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {SORTS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${sort === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
      </div>
      {!rows.length ? <EmptyState message="No staff yet." /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50"><tr>
              <Th>#</Th><Th>Staff</Th><Th>Jobs against target</Th><Th right>Incentive</Th><Th right>Attendance</Th><Th right>Late</Th><Th right>Handed back</Th><Th right>Total pay</Th>
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.workerId} className="border-t border-slate-100">
                  <Td muted>{i + 1}</Td>
                  <Td><span className="font-semibold text-slate-900">{p.name}</span><span className="block text-[11.5px] text-slate-500">{p.phone}</span></Td>
                  <Td>
                    <span className={`text-[12.5px] font-semibold tabular-nums ${p.lowWork ? 'text-red-600' : p.extraJobs ? 'text-emerald-700' : 'text-slate-800'}`}>{p.jobs} / {p.targetJobs}{p.extraJobs ? ` (+${p.extraJobs})` : ''}</span>
                    <span className="mt-1 block h-1.5 w-36 rounded-full bg-slate-100"><span className={`block h-1.5 rounded-full ${p.lowWork ? 'bg-red-400' : p.extraJobs ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, p.targetPct ?? 0)}%` }} /></span>
                  </Td>
                  <Td right>{p.incentivePaise ? rupees(p.incentivePaise, { exact: true }) : '–'}</Td>
                  <Td right><span className={p.attendancePct != null && p.attendancePct < 85 ? 'font-semibold text-amber-700' : ''}>{p.attendancePct != null ? `${p.attendancePct}%` : '–'}</span></Td>
                  <Td right>{p.lateShifts || '–'}</Td>
                  <Td right><span className={p.manyGiveBacks ? 'font-semibold text-red-600' : ''}>{p.givenBack || '–'}</span></Td>
                  <Td right><b>{rupees(p.totalPaise, { exact: true })}</b></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
