import { BadgeCheck, MessageSquareText, Phone, ShieldCheck, Star } from 'lucide-react';
import { firstNameOf } from '@shared/customer/trackingSteps';
import Avatar from './Avatar';

// Who is coming, as Rapido shows the captain: name, rating and jobs, then one tap to call or message.
export default function WorkerRichCard({ job, onCall, onChat, onProfile }) {
  const p = job.provider || {};
  const name = p.name || `Your ${job.noun || 'pro'}`;
  const facts = [p.jobs ? `${p.jobs} jobs` : null, p.from ? `from ${p.from}` : null].filter(Boolean);
  return (
    <section className="border-b-8 border-sunken bg-white px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3.5">
        <button type="button" onClick={onProfile} disabled={!onProfile} aria-label={`About ${name}`} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          <Avatar name={p.name} photo={p.photo} size={54} radius={16} />
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-bold text-ink-900">{name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-500">
              {p.rating != null
                ? <span className="inline-flex items-center gap-0.5 font-semibold text-ink-900"><Star size={13} className="text-amber-500" fill="currentColor" strokeWidth={0} />{Number(p.rating).toFixed(1)}</span>
                : <span className="font-semibold text-ink-900">New</span>}
              {facts.map((f) => <span key={f}>· {f}</span>)}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-700"><ShieldCheck size={13} /> ID verified</span>
              {p.neverCancels && <span className="inline-flex items-center gap-1 rounded-full bg-zappy-50 px-2 py-0.5 text-[11.5px] font-bold text-zappy-700"><BadgeCheck size={12} /> Never cancels</span>}
            </span>
          </span>
        </button>
        {onCall && (
          <button type="button" onClick={onCall} aria-label={`Call ${name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-900 hover:bg-sunken">
            <Phone size={18} />
          </button>
        )}
      </div>
      {onChat && (
        <button type="button" onClick={onChat} className="mt-3.5 flex h-11 w-full items-center gap-2.5 rounded-full border border-line px-4 text-[14.5px] text-ink-700 hover:bg-sunken">
          <MessageSquareText size={18} className="text-ink-900" /> Message {firstNameOf(p.name) || name}
        </button>
      )}
    </section>
  );
}
