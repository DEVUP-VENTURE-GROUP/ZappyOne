import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// The sign-in code boxes for every website. A paste, an SMS autofill or a keyboard suggestion lands the whole code at once, from any box.
export default function OtpBoxes({ digits, setDigits, refs: outerRefs, onComplete, disabled = false, autoFocus = true }) {
  const ownRefs = useRef([]);
  const refs = outerRefs || ownRefs;
  const len = digits.length;
  const last = useRef(digits.join(''));

  const fill = (from, text) => {
    const code = String(text).replace(/\D/g, '');
    if (!code) return;
    setDigits((prev) => {
      const next = [...prev];
      // A whole code replaces what is there; a single key fills the box it was typed in.
      const start = code.length >= len ? 0 : from;
      code.slice(0, len - start).split('').forEach((d, k) => { next[start + k] = d; });
      requestAnimationFrame(() => refs.current[Math.min(start + code.length, len - 1)]?.focus());
      return next;
    });
  };

  const clear = (i) => setDigits((prev) => { const next = [...prev]; next[i] = ''; return next; });

  useEffect(() => {
    const code = digits.join('');
    if (code.length === len && last.current.length !== len) onComplete?.(code);
    last.current = code;
  }, [digits, len, onComplete]);

  // Chrome on Android reads the code straight from the SMS when the message ends with "@<site> #<code>".
  useEffect(() => {
    if (disabled || typeof window === 'undefined' || !('OTPCredential' in window)) return undefined;
    const abort = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: abort.signal })
      .then((otp) => otp?.code && fill(0, otp.code))
      .catch(() => {});
    return () => abort.abort();
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex justify-between gap-2" onPaste={(e) => { e.preventDefault(); fill(0, e.clipboardData.getData('text')); }}>
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${len}`}
          maxLength={len}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onFocus={(e) => e.target.select()}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); if (v) fill(i, v.length === 2 && d ? v.replace(d, '') || v : v); else clear(i); }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) { e.preventDefault(); clear(i - 1); refs.current[i - 1]?.focus(); }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < len - 1) refs.current[i + 1]?.focus();
          }}
          animate={d ? { scale: [1, 1.12, 1], y: [0, -3, 0] } : { scale: 1, y: 0 }}
          transition={{ duration: 0.22, delay: d ? i * 0.035 : 0 }}
          className={`h-14 w-0 min-w-0 flex-1 rounded-btn border text-center text-[22px] font-bold text-ink-900 caret-zappy-600 outline-none transition-colors ${d ? 'border-zappy-600 bg-zappy-50 ring-1 ring-zappy-600' : 'border-line-strong bg-white focus:border-zappy-600 focus:ring-2 focus:ring-zappy-100'}`}
        />
      ))}
    </div>
  );
}
