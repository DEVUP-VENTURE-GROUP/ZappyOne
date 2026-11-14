import { ShieldCheck } from 'lucide-react';
import { STAY_ON_ZAPPYONE } from '../../provider/jobFlows';

// Why a job stays on ZappyOne, for the customer or the pro (the app's StayOnZappyOne); one line in the chat, a card elsewhere.
export default function StayOnZappyOne({ audience = 'customer', compact = false }) {
  const c = STAY_ON_ZAPPYONE[audience === 'pro' ? 'pro' : 'customer'];
  if (compact) {
    return (
      <p role="note" className="flex items-start gap-2 border-b border-slate-100 bg-zappy-50 px-4 py-2 text-[12px] font-semibold leading-snug text-zappy-800">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{c.short}
      </p>
    );
  }
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border border-zappy-100 bg-zappy-50 px-4 py-3">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-zappy-700" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-zappy-900">{c.title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zappy-800">{c.body}</span>
      </span>
    </div>
  );
}
