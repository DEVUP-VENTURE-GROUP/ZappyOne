import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { useAdminPayrollQuery, useAdminPayrollCsvMutation } from '@shared/services/api';
import { Card, PageLoader, Th, Td } from '@admin/ui/kit';
import { rupees } from '@admin/features/insights/charts';
import MonthPicker, { thisMonth } from '../../ui/MonthPicker';
import PayRules from './PayRules';

// Payroll: salary for paid days, incentive above the pro-rated job target, tips theirs, cash to settle before paying.
export default function FleetPayroll() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading } = useAdminPayrollQuery(month);
  const [csv, { isLoading: exporting }] = useAdminPayrollCsvMutation();
  const rows = data?.rows || [];
  const total = rows.reduce((t, r) => t + (r.totalPaise ?? r.payPaise), 0);

  async function download() {
    try {
      const text = await csv(month).unwrap();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `zappyone-payroll-${month}.csv` });
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error('Could not export'); }
  }

  return (
    <div className="space-y-4">
      <PayRules />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600">Total due: <b className="text-slate-900">{rupees(total, { exact: true })}</b></p>
          <button type="button" onClick={download} disabled={exporting || !rows.length} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Download size={14} /> Export CSV</button>
        </div>
      </div>
      {isLoading ? <PageLoader /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px]">
            <thead className="bg-slate-50"><tr>
              <Th>Staff</Th><Th right>Monthly salary</Th><Th right>Worked</Th><Th right>Leave</Th><Th right>Paid days</Th><Th right>Missed</Th><Th right>Late</Th><Th right>Jobs / target</Th><Th right>Handed back</Th><Th right>Salary</Th><Th right>Incentive</Th><Th right>Total due</Th><Th right>Tips</Th><Th right>Cash to deposit</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workerId} className="border-t border-slate-100">
                  <Td><span className="font-semibold text-slate-900">{r.name}</span><span className="block text-[12px] text-slate-500">{r.phone}</span></Td>
                  <Td right>{rupees(r.salaryPaise, { exact: true })}</Td>
                  <Td right>{r.workedDays}</Td><Td right>{r.leaveDays}</Td><Td right>{r.paidDays}/{r.workingDays}</Td>
                  <Td right>{r.missedShifts || '–'}</Td><Td right>{r.lateShifts || '–'}</Td>
                  <Td right><span className={r.lowWork ? 'font-semibold text-red-600' : r.extraJobs ? 'font-semibold text-emerald-700' : ''}>{r.jobs} / {r.targetJobs}</span>{r.extraJobs ? <span className="block text-[11px] text-emerald-700">+{r.extraJobs} above</span> : null}</Td>
                  <Td right><span className={r.manyGiveBacks ? 'font-semibold text-red-600' : ''}>{r.givenBack || '–'}</span></Td>
                  <Td right>{rupees(r.payPaise, { exact: true })}</Td>
                  <Td right>{r.incentivePaise ? rupees(r.incentivePaise, { exact: true }) : '–'}</Td>
                  <Td right><b>{rupees(r.totalPaise ?? r.payPaise, { exact: true })}</b></Td>
                  <Td right>{rupees(r.tipsPaise, { exact: true })}</Td>
                  <Td right><span className={r.cashToDepositPaise ? 'font-semibold text-amber-600' : ''}>{rupees(r.cashToDepositPaise, { exact: true })}</span></Td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-slate-400">No staff yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
