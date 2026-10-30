import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { servicePhoto, tilePhoto } from '@shared/components/home/serviceArt';
import { useNotifyLaunchMutation } from '@shared/services/api';
import { selectIsAuthed } from '@shared/modules/auth/authSlice';

// Services nobody covers at this address yet, one row per category; each "Notify me" tells recruiting what this area wants.
export default function ComingSoonRow({ groups = [], loc }) {
  const nav = useNavigate();
  const isAuthed = useSelector(selectIsAuthed);
  const [notify] = useNotifyLaunchMutation();
  const [asked, setAsked] = useState(() => new Set());
  if (!groups.length || loc?.lat == null) return null;

  async function ask(s) {
    if (!isAuthed) { nav('/login', { state: { from: '/' } }); return; }
    try {
      await notify({ lat: loc.lat, lng: loc.lng, address: loc.primary || '', lineCode: s.code }).unwrap();
      setAsked((prev) => new Set(prev).add(s.code));
      toast.success(`We will tell you when ${s.name.toLowerCase()} opens near you`);
    } catch (err) { toast.error(err?.data?.error || 'Could not save that. Try again.'); }
  }

  return (
    <section aria-labelledby="coming-soon" className="space-y-4">
      <div>
        <h2 id="coming-soon" className="text-[17px] font-extrabold tracking-[-0.01em] text-ink-900">Coming to your area</h2>
        <p className="mt-0.5 text-[13px] text-ink-500">Not bookable at this address yet. Tap the bell and we will tell you the day it opens.</p>
      </div>
      {groups.map((g) => (
        <div key={g.code}>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">{g.name}</p>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {g.services.map((s) => {
              const Icon = SERVICE_ICONS[s.icon] || Wrench;
              const photo = s.imageUrl || tilePhoto(s.code) || servicePhoto(s);
              const done = asked.has(s.code);
              return (
                <li key={s.code} className="flex w-[132px] shrink-0 flex-col gap-1.5">
                  <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-card bg-zappy-50 ring-1 ring-line">
                    {photo
                      ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover grayscale-[35%]" />
                      : <span className="flex h-full w-full items-center justify-center"><Icon size={28} strokeWidth={1.5} className="text-zappy-600" /></span>}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-700">Soon</span>
                  </span>
                  <span className="line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight text-ink-900">{s.name}</span>
                  <button type="button" onClick={() => !done && ask(s)} disabled={done} aria-label={done ? `${s.name}: we will tell you` : `Notify me when ${s.name} opens here`}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-bold ${done ? 'bg-sunken text-ink-500' : 'bg-zappy-50 text-zappy-700 hover:bg-zappy-100'}`}>
                    {done ? <><Check size={13} /> We will tell you</> : <><Bell size={13} /> Notify me</>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
