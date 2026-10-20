import { useState } from 'react';
import { timeOf } from '../utils/clock';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, CalendarDays, ChevronRight, Loader2, LogIn, LogOut } from 'lucide-react';
import { useCheckInShiftMutation, useCheckOutShiftMutation, usePresignUploadMutation, useStaffSalaryQuery } from '../services/api';
import { formatPaise } from '../utils/money';
import { prepareImage } from '../utils/prepareImage';
import LiveSelfieCapture from '../components/kyc/LiveSelfieCapture';
import { onePosition } from '../utils/position';

const time = timeOf;

/**
 * For ZappyOne's own staff, at the top of the Rakshak home (server workforce/):
 * today's shift and the one button that matters (check in at the hub with a
 * selfie, or check out), this month's salary so far, and cash to deposit.
 */
export default function StaffDutyCard({ me }) {
  const nav = useNavigate();
  const [selfie, setSelfie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [presign] = usePresignUploadMutation();
  const [checkIn] = useCheckInShiftMutation();
  const [checkOut, { isLoading: leaving }] = useCheckOutShiftMutation();
  const { data } = useStaffSalaryQuery();
  const salary = data?.salary;
  const shift = me.current;
  const onDuty = shift?.status === 'checked_in';

  const here = () => onePosition().then(({ lat, lng }) => ({ lat, lng }));

  async function onSelfie(blob) {
    setSelfie(false);
    setBusy(true);
    try {
      const where = await here();
      const file = await prepareImage(blob);
      const contentType = file.type || 'image/jpeg';
      const { data: signed } = await presign({ folder: 'staff-checkin', contentType });
      const put = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
      if (!put.ok) throw new Error('Could not upload the selfie. Try again.');
      const r = await checkIn({ ...where, selfieKey: signed.key }).unwrap();
      toast.success(r.message);
    } catch (e) { toast.error(e?.data?.error || e.message || 'Could not check in'); }
    setBusy(false);
  }

  async function end() {
    try { const r = await checkOut().unwrap(); toast.success(r.message); } catch (e) { toast.error(e?.data?.error || 'Could not check out'); }
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zappy-50 text-zappy-700"><Building2 size={19} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">ZappyOne staff, {me.hub.name}</p>
          <p className="truncate text-[15px] font-bold text-slate-900">
            {shift ? `${shift.label || 'Shift'}, ${time(shift.startAt)} to ${time(shift.endAt)}` : 'No shift booked today'}
          </p>
          {shift && <p className={`text-[12.5px] font-semibold ${onDuty ? 'text-emerald-600' : 'text-slate-500'}`}>{onDuty ? 'On duty. Jobs near you come to you first.' : `Check in at ${me.hub.address || me.hub.name}`}</p>}
        </div>
      </div>

      <div className="px-4 pt-3">
        {shift && !onDuty && (
          <button type="button" onClick={() => setSelfie(true)} disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zappy-600 text-[15px] font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />} Check in with a selfie
          </button>
        )}
        {onDuty && (
          <button type="button" onClick={end} disabled={leaving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-[15px] font-bold text-slate-800 disabled:opacity-60">
            {leaving ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />} Check out
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
        <div className="px-4 py-3">
          <p className="text-[11.5px] font-semibold text-slate-500">Salary this month</p>
          <p className="text-[17px] font-extrabold text-slate-900">{salary ? formatPaise(salary.payPaise) : '–'}</p>
          {salary && <p className="text-[11.5px] text-slate-400">{salary.paidDays} of {salary.workingDays} days</p>}
        </div>
        <div className="px-4 py-3">
          <p className="text-[11.5px] font-semibold text-slate-500">Cash to deposit</p>
          <p className={`text-[17px] font-extrabold ${salary?.cashToDepositPaise ? 'text-amber-600' : 'text-slate-900'}`}>{salary ? formatPaise(salary.cashToDepositPaise) : '–'}</p>
          <p className="text-[11.5px] text-slate-400">At your hub, end of shift</p>
        </div>
      </div>

      <button type="button" onClick={() => nav('/worker/shifts')} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-left text-[13.5px] font-semibold text-zappy-700">
        <CalendarDays size={16} /> My shifts, salary and leave <ChevronRight size={16} className="ml-auto" />
      </button>

      {selfie && (
        <div className="fixed inset-0 z-[120] bg-black/60">
          <LiveSelfieCapture title="Check in" instruction="A clear selfie at the hub's meeting point." onCapture={onSelfie} onCancel={() => setSelfie(false)} />
        </div>
      )}
    </section>
  );
}
