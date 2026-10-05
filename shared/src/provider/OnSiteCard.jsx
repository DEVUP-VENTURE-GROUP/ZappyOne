import { Phone, UserRound } from 'lucide-react';

/**
 * When a customer booked for someone else: who to meet at the door, with a
 * call button. Shown on every provider job screen that has one.
 */
export default function OnSiteCard({ onSite }) {
  if (!onSite?.name) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700"><UserRound size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-amber-800">Meet at the door</span>
        <span className="block truncate text-[15px] font-semibold text-slate-900">{onSite.name}</span>
        <span className="block text-[12px] text-slate-500">Booked for them by the customer</span>
      </span>
      {onSite.phone && (
        <a href={`tel:+91${onSite.phone}`} className="flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white">
          <Phone size={15} /> Call
        </a>
      )}
    </div>
  );
}
