import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useClearCheckoutDraftMutation, useMyCheckoutDraftsQuery } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';

/**
 * A booking they started and left (jobs/checkout-draft): the newest one, its
 * price, and the way back to where they stopped. Dismissing it forgets it.
 * Nothing shows for guests or when there is nothing unfinished.
 */
export default function ContinueBookingCard({ isAuthed }) {
  const nav = useNavigate();
  const { data } = useMyCheckoutDraftsQuery(undefined, { skip: !isAuthed });
  const [clear] = useClearCheckoutDraftMutation();
  const d = data?.drafts?.[0];
  if (!d) return null;
  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-zappy-100 bg-zappy-50 p-3.5">
      <button type="button" onClick={() => nav(d.path)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-zappy-700">Continue your booking</span>
          <span className="block truncate text-[15px] font-bold capitalize text-ink-900">{d.title}</span>
          <span className="block text-[12px] text-ink-500">{[d.pricePaise ? formatPaise(d.pricePaise) : null, 'everything you picked is saved'].filter(Boolean).join(', ')}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zappy-600 text-white"><ArrowRight size={18} /></span>
      </button>
      <button type="button" onClick={() => clear(d.kind).catch(() => {})} aria-label="Dismiss" className="shrink-0 p-1 text-ink-400 hover:text-ink-700"><X size={16} /></button>
    </div>
  );
}
