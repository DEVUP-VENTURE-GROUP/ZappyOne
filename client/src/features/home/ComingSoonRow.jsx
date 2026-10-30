import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { useNotifyLaunchMutation } from '@shared/services/api';
import { selectIsAuthed } from '@shared/modules/auth/authSlice';

// Services nobody covers at this address yet: kept off the grid, listed small at the end, and each "Notify me" tells recruiting what this area wants.
export default function ComingSoonRow({ services, loc }) {
  const nav = useNavigate();
  const isAuthed = useSelector(selectIsAuthed);
  const [notify] = useNotifyLaunchMutation();
  const [asked, setAsked] = useState(() => new Set());
  if (!services.length || loc?.lat == null) return null;

  async function ask(s) {
    if (!isAuthed) { nav('/login', { state: { from: '/' } }); return; }
    try {
      await notify({ lat: loc.lat, lng: loc.lng, address: loc.primary || '', lineCode: s.code }).unwrap();
      setAsked((prev) => new Set(prev).add(s.code));
      toast.success(`We will tell you when ${s.name.toLowerCase()} opens near you`);
    } catch (err) { toast.error(err?.data?.error || 'Could not save that. Try again.'); }
  }

  return (
    <section aria-labelledby="coming-soon" className="space-y-3">
      <div>
        <h2 id="coming-soon" className="text-[17px] font-extrabold tracking-[-0.01em] text-ink-900">Coming to your area</h2>
        <p className="mt-0.5 text-[13px] text-ink-500">Not bookable at this address yet. Tap the bell and we will tell you the day it opens.</p>
      </div>
      <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {services.map((s) => {
          const Icon = SERVICE_ICONS[s.icon] || Wrench;
          const done = asked.has(s.code);
          return (
            <li key={s.code} className="flex w-[148px] shrink-0 flex-col gap-2 rounded-card border border-line bg-surface p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunken"><Icon size={18} strokeWidth={1.7} className="text-ink-500" /></span>
              <span className="line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight text-ink-700">{s.name}</span>
              <button type="button" onClick={() => !done && ask(s)} disabled={done} aria-label={done ? `${s.name}: we will tell you` : `Notify me when ${s.name} opens here`}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-bold ${done ? 'bg-sunken text-ink-500' : 'bg-zappy-50 text-zappy-700 hover:bg-zappy-100'}`}>
                {done ? <><Check size={13} /> We will tell you</> : <><Bell size={13} /> Notify me</>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
