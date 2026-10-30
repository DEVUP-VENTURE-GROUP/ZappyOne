import { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useRepairWarrantyQuery, useClaimRepairWarrantyMutation } from '@shared/services/api';

/**
 * The warranty on a finished repair: until when it runs, and a claim inside
 * that window (repair/services/warranty). One open claim per booking.
 */
const CLAIM_STATUS = {
  submitted: 'Claim received - we reply within a day',
  under_review: 'We are looking into your claim',
  approved: 'Claim approved - we will arrange the fix free',
  rejected: 'Claim not covered',
  resolved: 'Claim resolved',
};

export default function RepairWarrantyCard({ booking }) {
  const done = booking?.status === 'COMPLETED';
  const { data } = useRepairWarrantyQuery(booking?._id, { skip: !done });
  const [claim, { isLoading }] = useClaimRepairWarrantyMutation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!done || !data?.warrantyDays) return null;

  const until = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const c = data.claim;
  const claimOpen = c && ['submitted', 'under_review', 'approved'].includes(c.status);

  async function send() {
    if (text.trim().length < 10) return toast.error('Tell us what went wrong (a sentence is enough)');
    try {
      await claim({ id: booking._id, issueDescription: text.trim() }).unwrap();
      toast.success('Claim sent - we will reply within a day');
      setOpen(false); setText('');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send the claim');
    }
    return undefined;
  }

  return (
    <div className="rounded-card bg-white p-[18px] ring-1 ring-slate-100">
      <p className="flex items-center gap-2 text-[14px] font-bold text-navy">
        <ShieldCheck size={16} className={data.active ? 'text-emerald-600' : 'text-slate-400'} />
        {data.warrantyDays}-day warranty
      </p>
      <p className="mt-0.5 text-[12.5px] text-slate-500">
        {data.active ? `Covered until ${until}.` : `Ended on ${until}.`}
      </p>
      {c && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-semibold text-slate-700">{CLAIM_STATUS[c.status] || c.status}{c.reviewNote ? ` - ${c.reviewNote}` : ''}</p>}
      {data.active && !claimOpen && !open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[13px] font-bold text-zappy-600">
          Something is not right? Claim warranty
        </button>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
            placeholder="What went wrong since the repair? e.g. the screen stopped responding again"
            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-zappy-200" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" onClick={send} disabled={isLoading} className="flex-1 rounded-xl bg-zappy-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {isLoading ? <Loader2 size={15} className="mx-auto animate-spin" /> : 'Send claim'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
