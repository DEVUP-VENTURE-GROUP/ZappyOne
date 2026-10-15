import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { useAdminPayrollQuery, useAdminPayrollCsvMutation } from '@shared/services/api';
import { Card, PageLoader, Th, Td } from '../../ui/kit';
import { rupees } from '../insights/charts';
import MonthPicker, { thisMonth } from './MonthPicker';

/**
 * Payroll: each staff member's month: monthly salary for the days worked plus
 * approved leave, out of the working days a full salary covers. Tips are theirs
 * on top; cash not yet deposited is shown so it is settled before paying.
 */
export default function FleetPayroll() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading } = useAdminPayrollQuery(month);
  const [csv, { isLoading: exporting }] = useAdminPayrollCsvMutation();
  const rows = data?.rows || [];
  const total = rows.reduce((t, r) => t + r.payPaise, 0);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600">Salaries due: <b className="text-slate-900">{rupees(total, { exact: true })}</b></p>
          <button type="button" onClick={download} disabled={exporting || !rows.length} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Download size={14} /> Export CSV</button>
        </div>
      </div>
      {isLoading ? <PageLoader /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50"><tr>
              <Th>Staff</Th><Th right>Monthly salary</Th><Th right>Worked</Th><Th right>Leave</Th><Th right>Paid days</Th><Th right>Missed</Th><Th right>Late</Th><Th right>Salary due</Th><Th right>Tips</Th><Th right>Cash to deposit</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workerId} className="border-t border-slate-100">
                  <Td><span className="font-semibold text-slate-900">{r.name}</span><span className="block text-[12px] text-slate-500">{r.phone}</span></Td>
                  <Td right>{rupees(r.salaryPaise, { exact: true })}</Td>
                  <Td right>{r.workedDays}</Td><Td right>{r.leaveDays}</Td><Td right>{r.paidDays}/{r.workingDays}</Td>
                  <Td right>{r.missedShifts || '–'}</Td><Td right>{r.lateShifts || '–'}</Td>
                  <Td right><b>{rupees(r.payPaise, { exact: true })}</b></Td>
                  <Td right>{rupees(r.tipsPaise, { exact: true })}</Td>
                  <Td right><span className={r.cashToDepositPaise ? 'font-semibold text-amber-600' : ''}>{rupees(r.cashToDepositPaise, { exact: true })}</span></Td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">No staff yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
