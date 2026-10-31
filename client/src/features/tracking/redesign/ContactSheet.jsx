import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useEditJobContactMutation } from '@shared/services/api';

// Who the pro meets at the door: someone else's name and number, or the booker themselves (jobs/place-edit editContact).
export default function ContactSheet({ job, onSite, onClose, onSaved }) {
  const [name, setName] = useState(onSite?.name || '');
  const [phone, setPhone] = useState(onSite?.phone || '');
  const [save, { isLoading }] = useEditJobContactMutation();
  const valid = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone);

  async function submit(value) {
    try {
      const r = await save({ id: job.id, onSite: value }).unwrap();
      toast.success(r.message);
      onSaved?.();
      onClose();
    } catch (err) { toast.error(err?.data?.error || 'Could not save that. Try again.'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="cs-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-2xl rounded-t-[24px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p id="cs-title" className="text-[18px] font-extrabold text-ink-900">Who will be there?</p>
        <p className="mt-1 text-[13px] text-ink-500">Your pro calls this person when they arrive, not you.</p>
        <label className="mt-4 block text-[12.5px] font-semibold text-ink-700" htmlFor="cs-name">Name</label>
        <input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off"
          className="mt-1 h-11 w-full rounded-btn border border-line px-3 text-[14px] text-ink-900 outline-none focus:border-zappy-600" />
        <label className="mt-3 block text-[12.5px] font-semibold text-ink-700" htmlFor="cs-phone">Mobile number</label>
        <div className="mt-1 flex h-11 items-center rounded-btn border border-line focus-within:border-zappy-600">
          <span className="pl-3 pr-2 text-[14px] text-ink-500">+91</span>
          <input id="cs-phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[14px] tabular-nums text-ink-900 outline-none" />
        </div>
        <div className="mt-5 flex gap-3">
          {onSite
            ? <button type="button" onClick={() => submit(null)} disabled={isLoading} className="btn-outline flex-1">I&apos;ll be there</button>
            : <button type="button" onClick={onClose} className="btn-outline flex-1">Cancel</button>}
          <button type="button" onClick={() => submit({ name: name.trim(), phone })} disabled={isLoading || !valid} className="btn-primary flex-1 disabled:opacity-50">
            {isLoading && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
