import { useState } from 'react';
import { targetLine } from '../staffTarget';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  useWorkforceMeQuery, useBookShiftMutation, useCancelShiftMutation, useStaffSalaryQuery, useStaffLeaveQuery, useRequestLeaveMutation,
} from '../../services/api';
import { formatPaise } from '../../utils/money';

const dayLabel = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const STATUS = { booked: 'Booked', checked_in: 'On duty', done: 'Worked', missed: 'Missed' };
const todayKey = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/**
 * My shifts (ZappyOne staff, server workforce/): book their hub's shifts for
 * the coming week, their salary for the month, and leave.
 */
export default function StaffShiftsPage() {
  const nav = useNavigate();
  const { data, isLoading } = useWorkforceMeQuery();
  const { data: sal } = useStaffSalaryQuery();
  const { data: leaveData } = useStaffLeaveQuery();
  const [book, { isLoading: booking }] = useBookShiftMutation();
  const [cancel] = useCancelShiftMutation();
  const [askLeave, { isLoading: asking }] = useRequestLeaveMutation();
  const [leaveDay, setLeaveDay] = useState('');
  const [reason, setReason] = useState('');
  const salary = sal?.salary;

  const run = (p, ok) => p.unwrap().then(() => ok && toast.success(ok)).catch((e) => toast.error(e?.data?.error || 'Could not do that'));

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <header className="page-header"><div className="page-header-inner">
        <button type="button" onClick={() => nav(-1)} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">My shifts</h1>
      </div></header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 lg:max-w-2xl">
        {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-zappy-500" /></div> : !data?.staff ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-100">Shifts are for ZappyOne staff.</p>
        ) : (
          <>
            {salary && (
              <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                <p className="text-sm font-bold text-slate-900">Salary, this month</p>
                <p className="mt-1 text-[26px] font-extrabold text-slate-900">{formatPaise(salary.totalPaise ?? salary.payPaise)}</p>
                <p className="text-[12.5px] text-slate-500">
                  {salary.paidDays} of {salary.workingDays} days paid ({salary.workedDays} worked, {salary.leaveDays} leave) on a monthly salary of {formatPaise(salary.salaryPaise)}.
                </p>
                {targetLine(salary) && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">{targetLine(salary)}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 py-2"><p className="text-[15px] font-bold text-slate-900">{formatPaise(salary.tipsPaise)}</p><p className="text-[11px] text-slate-500">Tips, yours</p></div>
                  <div className="rounded-xl bg-slate-50 py-2"><p className="text-[15px] font-bold text-slate-900">{salary.missedShifts}</p><p className="text-[11px] text-slate-500">Missed shifts</p></div>
                  <div className="rounded-xl bg-slate-50 py-2"><p className="text-[15px] font-bold text-amber-600">{formatPaise(salary.cashToDepositPaise)}</p><p className="text-[11px] text-slate-500">Cash to deposit</p></div>
                </div>
              </section>
            )}

            <section className="space-y-3">
              <p className="px-1 text-sm font-bold text-slate-900">Shifts at {data.hub.name}</p>
              {data.schedule.map((d) => (
                <div key={d.day} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                  <p className="px-1 pb-2 text-[13px] font-bold text-slate-700">{dayLabel(d.day)}</p>
                  <div className="space-y-2">
                    {d.shifts.map((s) => (
                      <div key={s.code} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-slate-900">{s.label}, {s.start} to {s.end}</p>
                          <p className="text-[12px] text-slate-500">{s.booked} of {s.need} booked</p>
                        </div>
                        {s.mine ? (
                          s.mine.status === 'booked'
                            ? <button type="button" onClick={() => run(cancel(s.mine.id), 'Taken off the shift')} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-slate-500 ring-1 ring-slate-200">Cancel</button>
                            : <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">{STATUS[s.mine.status] || s.mine.status}</span>
                        ) : s.canBook ? (
                          <button type="button" disabled={booking} onClick={() => run(book({ day: d.day, code: s.code }), 'Shift booked')} className="rounded-lg bg-zappy-600 px-3.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-60">Book</button>
                        ) : <span className="text-[12px] font-semibold text-slate-400">Full</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <p className="text-sm font-bold text-slate-900">Leave</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input type="date" value={leaveDay} min={todayKey()} onChange={(e) => setLeaveDay(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Leave day" />
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason" className="flex-[2] rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Reason" />
                <button type="button" disabled={!leaveDay || asking} onClick={() => run(askLeave({ day: leaveDay, reason }), 'Leave requested').then(() => { setLeaveDay(''); setReason(''); })}
                  className="rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">Ask</button>
              </div>
              {(leaveData?.leave || []).length > 0 && (
                <ul className="mt-3 divide-y divide-slate-100">
                  {leaveData.leave.map((l) => (
                    <li key={l._id} className="flex items-center justify-between py-2 text-[13px]">
                      <span className="text-slate-700">{dayLabel(l.day)}{l.reason ? `, ${l.reason}` : ''}</span>
                      <span className={`font-semibold ${l.status === 'approved' ? 'text-emerald-600' : l.status === 'rejected' ? 'text-red-600' : 'text-slate-500'}`}>{l.status === 'requested' ? 'Waiting' : l.status === 'approved' ? 'Approved' : 'Not approved'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
