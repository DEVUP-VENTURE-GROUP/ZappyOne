import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';

/**
 * "This is for someone else": the person the provider meets at the door, when
 * it is not the customer booking (a parent at home, a tenant, a colleague).
 * Calls onChange with { name, phone } when both are filled in correctly,
 * otherwise null; `valid` says whether the booking may go ahead.
 */
const PHONE = /^[6-9]\d{9}$/;

export default function SomeoneElse({ onChange }) {
  const [on, setOn] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const digits = phone.replace(/\D/g, '').slice(-10);
  const ok = name.trim().length >= 2 && PHONE.test(digits);

  useEffect(() => {
    onChange?.(on ? (ok ? { name: name.trim(), phone: digits } : 'incomplete') : null);
  }, [on, name, digits, ok]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><UserRound size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[#0F172A]">This is for someone else</span>
          <span className="block text-[12px] text-slate-500">The provider will call them, not you</span>
        </span>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5 accent-[#1F4FD8]" />
      </label>
      {on && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Their name" autoComplete="off"
            aria-label="Their name" className="input w-full" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={14} placeholder="Their mobile number"
            aria-label="Their mobile number" className="input w-full" />
          {phone && !PHONE.test(digits) && <p className="text-[12px] font-semibold text-red-700 sm:col-span-2">Enter their 10-digit mobile number</p>}
        </div>
      )}
    </div>
  );
}
