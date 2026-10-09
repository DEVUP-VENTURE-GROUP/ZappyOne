import { useCallback, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { selectAuth } from '../../modules/auth/authSlice';
import { useRequestOtpMutation, useVerifyActionOtpMutation } from '../../services/api';

/**
 * Sensitive changes (bank details, payouts) need a fresh OTP — the server
 * answers OTP_REQUIRED when the last one is over 10 minutes old. This asks for
 * the code once, then runs the action again; nothing else to handle per page.
 *
 *   const otp = useOtpGate();
 *   await otp.run(() => addBank(body).unwrap());
 *   …
 *   {otp.modal}
 */
export function useOtpGate() {
  const { profile, role } = useSelector(selectAuth);
  const phone = profile?.phone || '';
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [verify, { isLoading: verifying }] = useVerifyActionOtpMutation();
  const pending = useRef(null);

  const close = () => { setOpen(false); setCode(''); setSent(false); pending.current?.reject(new Error('cancelled')); pending.current = null; };

  const run = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err?.data?.code !== 'OTP_REQUIRED') throw err;
      // Ask for the code, then try the same action again.
      await new Promise((resolve, reject) => { pending.current = { resolve, reject }; setOpen(true); });
      return fn();
    }
  }, []);

  async function send() {
    try { await requestOtp({ phone, role }).unwrap(); setSent(true); toast.success(`Code sent to ${phone.replace(/^(\+91)?(\d{2})\d{6}(\d{2})$/, '$2••••••$3')}`); } catch (err) { toast.error(err?.data?.error || 'Could not send the code'); }
  }
  async function confirm() {
    try {
      await verify({ otp: code }).unwrap();
      const p = pending.current; pending.current = null;
      setOpen(false); setCode(''); setSent(false);
      p?.resolve();
    } catch (err) { toast.error(err?.data?.error || 'That code did not work'); }
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-[15px] font-bold text-[#0F172A]"><ShieldCheck size={18} className="text-emerald-600" /> Confirm it is you</p>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full p-1 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <p className="mt-1 text-[12.5px] text-slate-500">Money details are protected. We send a code to your registered number.</p>
        {!sent ? (
          <button type="button" onClick={send} disabled={sending || !phone}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#0F172A] text-sm font-bold text-white disabled:opacity-50">
            {sending && <Loader2 size={15} className="animate-spin" />} Send code
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoFocus placeholder="Code"
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-center text-lg tracking-[0.4em] tabular-nums outline-none focus:ring-2 focus:ring-emerald-200" />
            <button type="button" onClick={confirm} disabled={verifying || code.length < 4}
              className="flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white disabled:opacity-50">
              {verifying && <Loader2 size={15} className="animate-spin" />} Confirm
            </button>
          </div>
        )}
        {!phone && <p className="mt-2 text-[12px] text-red-600">No phone number on this account. Sign in again.</p>}
      </div>
    </div>
  ) : null;

  return { run, modal };
}
