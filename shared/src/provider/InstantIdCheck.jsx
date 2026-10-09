import { useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  useProviderIdCheckQuery, useStartAadhaarCheckMutation, useSubmitAadhaarOtpMutation, useVerifyPanCheckMutation,
} from '../services/api';

/**
 * Verify identity in a minute, instead of waiting for a person (server onboarding/idcheck):
 * Aadhaar by a code to its linked mobile, and PAN. Shown only when ZappyOne has
 * an instant-check provider; otherwise the uploaded documents are reviewed by
 * our team, as always — so this card simply is not there.
 */
export default function InstantIdCheck({ className = '' }) {
  const { data } = useProviderIdCheckQuery();
  const [start, { isLoading: starting }] = useStartAadhaarCheckMutation();
  const [submit, { isLoading: submitting }] = useSubmitAadhaarOtpMutation();
  const [panCheck, { isLoading: panning }] = useVerifyPanCheckMutation();
  const [aadhaar, setAadhaar] = useState('');
  const [checkId, setCheckId] = useState(null);
  const [otp, setOtp] = useState('');
  const [pan, setPan] = useState('');

  if (!data?.instant) return null;
  const aOk = data.aadhaar?.status === 'verified';
  const pOk = data.pan?.status === 'verified';

  async function sendCode() {
    try {
      const r = await start({ aadhaar: aadhaar.replace(/\s/g, '') }).unwrap();
      setCheckId(r.checkId);
      toast.success(r.message);
    } catch (err) { toast.error(err?.data?.error || 'Could not start the check'); }
  }
  async function confirm() {
    try {
      const r = await submit({ checkId, otp }).unwrap();
      setCheckId(null); setOtp(''); setAadhaar('');
      if (r.status === 'verified') toast.success(r.message); else toast(r.message);
    } catch (err) { toast.error(err?.data?.error || 'That code did not work'); }
  }
  async function checkPan() {
    try {
      const r = await panCheck({ pan: pan.toUpperCase() }).unwrap();
      if (r.status === 'verified') toast.success(r.message); else toast(r.message);
    } catch (err) { toast.error(err?.data?.error || 'Could not check the PAN'); }
  }

  return (
    <section className={`rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-black text-emerald-900"><ShieldCheck size={17} /> Verify your ID instantly</p>
      <p className="mt-0.5 text-[12px] text-emerald-800">Skip the wait: a code to the mobile linked to your Aadhaar. We keep only its last 4 digits.</p>

      <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-emerald-100">
        <p className="text-[13px] font-bold text-slate-800">Aadhaar</p>
        {aOk ? (
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700"><BadgeCheck size={14} /> Verified · ••••{data.aadhaar.last4} · {data.aadhaar.nameOnId}</p>
        ) : (
          <>
            {data.aadhaar?.status === 'mismatch' && (
              <p className="mt-1 flex items-start gap-1.5 text-[12px] text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> The name on Aadhaar ({data.aadhaar.nameOnId}) differs from your account. Our team will check it.
              </p>
            )}
            {!checkId ? (
              <div className="mt-2 flex gap-2">
                <input value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/[^\d\s]/g, '').slice(0, 14))} inputMode="numeric" placeholder="12-digit Aadhaar number"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-emerald-200" />
                <button type="button" onClick={sendCode} disabled={starting || aadhaar.replace(/\s/g, '').length !== 12}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                  {starting && <Loader2 size={14} className="animate-spin" />} Send code
                </button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit code" autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm tracking-widest tabular-nums outline-none focus:ring-2 focus:ring-emerald-200" />
                <button type="button" onClick={confirm} disabled={submitting || otp.length !== 6}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                  {submitting && <Loader2 size={14} className="animate-spin" />} Verify
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-emerald-100">
        <p className="text-[13px] font-bold text-slate-800">PAN <span className="font-normal text-slate-400">(needed for payouts above ₹20,000 a month)</span></p>
        {pOk ? (
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700"><BadgeCheck size={14} /> Verified · {data.pan.pan} · {data.pan.nameOnId}</p>
        ) : (
          <div className="mt-2 flex gap-2">
            <input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="ABCDE1234F"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-emerald-200" />
            <button type="button" onClick={checkPan} disabled={panning || pan.length !== 10}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-emerald-600 px-4 text-sm font-bold text-emerald-700 disabled:opacity-50">
              {panning && <Loader2 size={14} className="animate-spin" />} Check
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
