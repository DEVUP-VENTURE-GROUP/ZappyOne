import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { RotateCw, Loader2 } from 'lucide-react';
import { useResendOtpMutation } from '../../services/api';

/**
 * Resend OTP — shared across every login panel (user, worker, admin, partner).
 *
 * The server owns all the rules; this component never invents its own numbers.
 * It reads cooldownSec / resendsLeft straight from the API and mirrors the
 * server's state, so the UI can't drift out of sync with what's enforced.
 *
 * Edge cases handled:
 *   OTP_COOLDOWN     — too soon; server returns retryAfterMs → restart countdown
 *   OTP_MAX_RESENDS  — resend limit hit → offer "start over" instead of a dead button
 *   OTP_NO_SESSION   — OTP expired/never sent → offer "start over"
 *   OTP_FLOOD        — hourly per-phone cap → surface the real message, lock the button
 *   OTP_SEND_FAILED  — provider down → allow an immediate retry (don't punish the user)
 *   double-click / unmount during request, and dev auto-fill of the returned OTP.
 *
 * Props:
 *   phone        (string, required)
 *   cooldownSec  initial cooldown from the request/resend response
 *   resendsLeft  initial remaining resends from the response
 *   onResent     (data) => void   — e.g. auto-fill the dev OTP
 *   onStartOver  () => void       — go back to the phone-entry step
 */
export default function ResendOtp({
  phone,
  cooldownSec = 30,
  resendsLeft: initialResendsLeft = 3,
  onResent,
  onStartOver,
  tone = 'light',            // 'light' | 'dark' — partner panel is dark-themed
}) {
  const dark = tone === 'dark';
  const T = {
    action:   dark ? 'text-violet-300 hover:text-violet-200' : 'text-indigo-600 hover:text-indigo-700',
    disabled: dark ? 'text-white/35 cursor-not-allowed'      : 'text-slate-400 cursor-not-allowed',
    muted:    dark ? 'text-white/40'                          : 'text-slate-400',
    warn:     dark ? 'text-amber-300'                         : 'text-amber-600',
    error:    dark ? 'text-rose-300'                          : 'text-rose-600',
  };
  const [resend, { isLoading }] = useResendOtpMutation();
  const [secsLeft, setSecsLeft] = useState(cooldownSec);
  const [left, setLeft] = useState(initialResendsLeft);
  const [exhausted, setExhausted] = useState(false); // max resends / no session / flood
  const [note, setNote] = useState('');
  const timerRef = useRef(null);

  // Start (or restart) the cooldown countdown.
  const startCountdown = useCallback((secs) => {
    clearInterval(timerRef.current);
    setSecsLeft(Math.max(0, Math.ceil(secs)));
    if (secs <= 0) return;
    timerRef.current = setInterval(() => {
      setSecsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startCountdown(cooldownSec);
    return () => clearInterval(timerRef.current);
  }, [cooldownSec, startCountdown]);

  async function handleResend() {
    if (isLoading || secsLeft > 0 || exhausted) return; // guards double-click
    try {
      const data = await resend({ phone }).unwrap();

      // Mirror the server's state rather than assuming.
      if (typeof data.resendsLeft === 'number') setLeft(data.resendsLeft);
      startCountdown(data.cooldownSec ?? cooldownSec);
      setNote('');
      toast.success('OTP sent again');
      onResent?.(data);
    } catch (err) {
      const code = err?.data?.code;
      const msg  = err?.data?.error || 'Could not resend OTP';

      if (code === 'OTP_COOLDOWN') {
        // Server is authoritative — resync our countdown to its retryAfterMs.
        const ms = err.data?.retryAfterMs ?? cooldownSec * 1000;
        startCountdown(ms / 1000);
        setNote(msg);
        return;
      }
      if (code === 'OTP_MAX_RESENDS' || code === 'OTP_NO_SESSION' || code === 'OTP_FLOOD') {
        // Dead-end states: don't leave a button that can never work.
        setExhausted(true);
        setLeft(0);
        setNote(msg);
        toast.error(msg);
        return;
      }
      if (code === 'OTP_SEND_FAILED') {
        // Provider hiccup — not the user's fault, let them retry immediately.
        startCountdown(0);
        setNote('Sending failed. Tap resend to try again.');
        toast.error(msg);
        return;
      }
      setNote(msg);
      toast.error(msg);
    }
  }

  // Dead end → the only useful action is to restart the flow.
  if (exhausted) {
    return (
      <div className="text-center">
        {note && <p className={`text-[12px] mb-2 ${T.error}`}>{note}</p>}
        <button
          type="button"
          onClick={onStartOver}
          className={`text-[13px] font-bold underline underline-offset-2 ${T.action}`}
        >
          Start over with a new OTP
        </button>
      </div>
    );
  }

  const waiting = secsLeft > 0;

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={handleResend}
        disabled={waiting || isLoading}
        className={`inline-flex items-center gap-1.5 text-[13px] font-bold transition-colors ${
          waiting || isLoading ? T.disabled : T.action
        }`}
      >
        {isLoading
          ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
          : waiting
            ? <>Resend OTP in {secsLeft}s</>
            : <><RotateCw size={13} /> Resend OTP</>}
      </button>

      {!waiting && !isLoading && left > 0 && (
        <p className={`text-[11px] mt-1 ${T.muted}`}>
          {left} resend{left !== 1 ? 's' : ''} left
        </p>
      )}
      {note && <p className={`text-[11px] mt-1 ${T.warn}`}>{note}</p>}
    </div>
  );
}
