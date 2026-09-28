import { useRef } from 'react';
import { KeyRound } from 'lucide-react';

/**
 * Six boxes a technician types the customer's code into.
 *
 * Lifted out of WorkerJobPage, where the same control already existed but was
 * bound to one screen's dark theme and one order's status — so the repair flow,
 * which asks for a code at up to three different moments, had to either
 * reimplement it or go without. Only the colours and the caption vary now.
 *
 * One real input behind six styled boxes: a box-per-input steals focus on every
 * keystroke and breaks paste, backspace and the numeric keyboard on Android.
 */
export default function OtpEntry({
  value,
  onChange,
  title = 'Customer code',
  hint = 'Ask the customer for their 6-digit code',
  tone = 'light',
  autoFocus = true,
}) {
  const inputRef = useRef(null);
  const dark = tone === 'dark';

  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${
          dark ? 'bg-amber-400/20' : 'bg-amber-50'
        }`}>
          <KeyRound size={15} strokeWidth={2} className={dark ? 'text-amber-300' : 'text-amber-600'} />
        </span>
        <span>
          <span className={`block text-xs font-extrabold uppercase tracking-widest ${
            dark ? 'text-amber-200' : 'text-amber-700'
          }`}>
            {title}
          </span>
          <span className={`mt-0.5 block text-[10.5px] font-medium ${
            dark ? 'text-amber-300/50' : 'text-slate-500'
          }`}>
            {hint}
          </span>
        </span>
      </div>

      <div className="mb-2 flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => inputRef.current?.focus()}
            className={`flex aspect-square max-w-[52px] flex-1 items-center justify-center rounded-2xl border-2 text-xl font-black transition-all ${
              value[i]
                ? dark
                  ? 'border-amber-400 bg-amber-400/25 text-white shadow-lg shadow-amber-500/20'
                  : 'border-amber-400 bg-amber-50 text-amber-900'
                : dark
                  ? 'border-white/12 bg-white/5 text-white/20'
                  : 'border-slate-200 bg-white text-slate-300'
            }`}
          >
            {value[i] ? '●' : '–'}
          </button>
        ))}
      </div>

      {/* The real field. Visually hidden, never display:none — a hidden input
          cannot be focused, and focus is what raises the keyboard. */}
      <input
        ref={inputRef}
        className="absolute h-1 w-full opacity-0"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className={`mt-3 w-full rounded-xl border py-3 text-xs font-semibold ${
          dark
            ? 'border-white/10 bg-white/5 text-amber-200/60'
            : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}
      >
        Tap here → enter code
      </button>
    </div>
  );
}
