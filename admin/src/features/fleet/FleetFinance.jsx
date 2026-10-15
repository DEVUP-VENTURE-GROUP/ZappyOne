import { useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import {
  useAdminFleetFinanceQuery, useAdminFleetExpensesQuery, useAdminAddFleetExpenseMutation, useAdminRemoveFleetExpenseMutation,
  useAdminHubsQuery, useAdminFleetCashDepositMutation, useAdminStaffQuery,
} from '@shared/services/api';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { Card, PageLoader, Th, Td, Input, Select, SaveBtn, FormRow } from '../../ui/kit';
import { Panel, rupees } from '../insights/charts';
import MonthPicker, { thisMonth } from './MonthPicker';

const CATEGORY = { rent: 'Rent', electricity: 'Electricity', internet: 'Internet', fuel: 'Fuel', travel: 'Travel', tools: 'Tools', uniforms: 'Uniforms', parts: 'Parts', repairs: 'Repairs', salary_advance: 'Salary advance', other: 'Other' };
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/**
 * Fleet finance, apart from the marketplace's money: each hub's month
 * (revenue, salaries, expenses, profit, cash), every expense with its receipt,
 * and recording cash staff hand in at the hub.
 */
export default function FleetFinance() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading } = useAdminFleetFinanceQuery(month);
  const { data: exp } = useAdminFleetExpensesQuery({ month });
  const { data: hubData } = useAdminHubsQuery();
  const { data: staffData } = useAdminStaffQuery();
  const [add, { isLoading: adding }] = useAdminAddFleetExpenseMutation();
  const [remove] = useAdminRemoveFleetExpenseMutation();
  const [deposit, { isLoading: depositing }] = useAdminFleetCashDepositMutation();
  const [form, setForm] = useState({ hubId: '', category: 'rent', amountRupees: '', day: today(), note: '', receiptKey: '' });
  const [cash, setCash] = useState({ workerId: '', amountRupees: '', reference: '' });
  const hubs = hubData?.hubs || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  async function saveExpense() {
    try {
      await add({ ...form, hubId: form.hubId || null, amountRupees: Number(form.amountRupees) }).unwrap();
      toast.success('Expense recorded'); setForm((f) => ({ ...f, amountRupees: '', note: '', receiptKey: '' }));
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }
  async function saveDeposit() {
    try {
      await deposit({ ...cash, amountRupees: Number(cash.amountRupees) }).unwrap();
      toast.success('Deposit recorded'); setCash({ workerId: '', amountRupees: '', reference: '' });
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }

  const rows = data ? [...data.hubs, ...(data.fleet.expensesPaise ? [data.fleet] : []), data.total] : [];
  return (
    <div className="space-y-5">
      <MonthPicker value={month} onChange={setMonth} />
      {isLoading || !data ? <PageLoader /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50"><tr>
              <Th>Hub</Th><Th right>Jobs</Th><Th right>Revenue</Th><Th right>Salaries</Th><Th right>Expenses</Th><Th right>Profit</Th><Th right>Cost per job</Th><Th right>Staff</Th><Th right>Deposited</Th><Th right>Cash with staff</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id || 'fleet'} className={`border-t border-slate-100 ${r.id === 'total' ? 'bg-slate-50 font-semibold' : ''}`}>
                  <Td><span className="text-slate-900">{r.name}</span></Td>
                  <Td right>{r.jobs}</Td><Td right>{rupees(r.revenuePaise)}</Td><Td right>{rupees(r.salaryPaise)}</Td><Td right>{rupees(r.expensesPaise)}</Td>
                  <Td right><span className={r.profitPaise < 0 ? 'text-red-600' : 'text-emerald-700'}>{rupees(r.profitPaise)}</span></Td>
                  <Td right>{r.costPerJobPaise != null ? rupees(r.costPerJobPaise) : '–'}</Td><Td right>{r.staff}</Td>
                  <Td right>{rupees(r.depositedPaise)}</Td><Td right><span className={r.cashWithStaffPaise ? 'text-amber-600' : ''}>{rupees(r.cashWithStaffPaise)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Record an expense" note="Stock purchases are recorded from Stock">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Hub"><Select value={form.hubId} onChange={set('hubId')}><option value="">Whole fleet</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></FormRow>
              <FormRow label="Kind"><Select value={form.category} onChange={set('category')}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FormRow>
              <FormRow label="Amount (₹)"><Input type="number" min={1} value={form.amountRupees} onChange={set('amountRupees')} /></FormRow>
              <FormRow label="Date"><Input type="date" value={form.day} max={today()} onChange={set('day')} /></FormRow>
            </div>
            <FormRow label="Note"><Input value={form.note} onChange={set('note')} maxLength={200} placeholder="October rent, Madhapur" /></FormRow>
            <ImageUploadField value={form.receiptKey} onChange={set('receiptKey')} folder="fleet-receipts" label="receipt" accept="image/*" maxMb={5} />
            <SaveBtn loading={adding} onClick={Number(form.amountRupees) > 0 ? saveExpense : undefined}>Record expense</SaveBtn>
          </div>
        </Panel>
        <Panel title="Cash handed in at the hub" note="Lowers what that staff member owes">
          <div className="space-y-3">
            <FormRow label="Staff"><Select value={cash.workerId} onChange={(e) => setCash((c) => ({ ...c, workerId: e.target.value }))}>
              <option value="">Pick…</option>{(staffData?.workers || []).map((w) => <option key={w._id} value={w._id}>{w.name || w.phone}</option>)}
            </Select></FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Amount (₹)"><Input type="number" min={1} value={cash.amountRupees} onChange={(e) => setCash((c) => ({ ...c, amountRupees: e.target.value }))} /></FormRow>
              <FormRow label="Reference"><Input value={cash.reference} onChange={(e) => setCash((c) => ({ ...c, reference: e.target.value }))} maxLength={80} placeholder="Slip no." /></FormRow>
            </div>
            <SaveBtn loading={depositing} onClick={cash.workerId && Number(cash.amountRupees) > 0 ? saveDeposit : undefined}>Record deposit</SaveBtn>
          </div>
        </Panel>
      </div>

      <Panel title="Expenses this month">
        <div className="divide-y divide-slate-100">
          {(exp?.expenses || []).map((e) => (
            <div key={e._id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="w-24 text-slate-500">{e.day}</span>
              <span className="w-32 font-semibold text-slate-800">{CATEGORY[e.category]}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">{e.hubId?.name || 'Whole fleet'}{e.note ? `, ${e.note}` : ''}</span>
              <span className="font-semibold text-slate-900">{rupees(e.amountPaise, { exact: true })}</span>
              <button type="button" aria-label="Remove" onClick={() => remove(e._id).unwrap().catch(() => toast.error('Could not remove'))} className="rounded p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
          {!(exp?.expenses || []).length && <p className="py-6 text-center text-sm text-slate-400">No expenses this month.</p>}
        </div>
      </Panel>
    </div>
  );
}
