import { useState } from 'react';
import { Eye, EyeOff, Check, Circle } from 'lucide-react';

/**
 * The same rules the server enforces, shown while typing so nobody meets them
 * only as an error after pressing the button.
 */
export function passwordChecks(pw = '', phone = '') {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-zA-Z]/.test(pw) && /\d/.test(pw), label: 'A letter and a number' },
    { ok: !digits || !pw.includes(digits), label: 'Not your phone number' },
  ];
}

export const passwordOk = (pw, phone) => passwordChecks(pw, phone).every((c) => c.ok);

export default function PasswordField({ id, label = 'Password', value, onChange, autoComplete = 'new-password', showRules = false, phone, placeholder }) {
  const [show, setShow] = useState(false);
  const checks = passwordChecks(value, phone);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-700">{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} placeholder={placeholder} maxLength={72} className="input w-full pr-11" />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-500 hover:text-ink-900">
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {showRules && (
        <ul className="mt-2 space-y-1">
          {checks.map((c) => (
            <li key={c.label} className={`flex items-center gap-1.5 text-[12px] ${c.ok ? 'text-green-700' : 'text-ink-500'}`}>
              {c.ok ? <Check size={13} /> : <Circle size={11} />} {c.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
