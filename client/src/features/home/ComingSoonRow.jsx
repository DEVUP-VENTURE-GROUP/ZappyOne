import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronDown, Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { useNotifyLaunchMutation } from '@shared/services/api';
import { selectIsAuthed } from '@shared/modules/auth/authSlice';

const FIRST = 8;

// Services nobody covers at this address yet: one quiet row, the rest by category on "See all"; each bell tells recruiting what this area wants.
export default function ComingSoonRow({ groups = [], loc }) {
  const nav = useNavigate();
  const isAuthed = useSelector(selectIsAuthed);
  const [notify] = useNotifyLaunchMutation();
  const [asked, setAsked] = useState(() => new Set());
  const [all, setAll] = useState(false);
  if (!groups.length || loc?.lat == null) return null;
  const flat = groups.flatMap((g) => g.services);

  async function ask(s) {
    if (!isAuthed) { nav('/login', { state: { from: '/' } }); return; }
    try {
      await notify({ lat: loc.lat, lng: loc.lng, address: loc.primary || '', lineCode: s.code }).unwrap();
      setAsked((prev) => new Set(prev).add(s.code));
      toast.success(`We will tell you when ${s.name.toLowerCase()} opens near you`);
    } catch (err) { toast.error(err?.data?.error || 'Could not save that. Try again.'); }
  }

  const card = (s) => {
    const Icon = SERVICE_ICONS[s.icon] || Wrench;
    const done = asked.has(s.code);
    return (
      <li key={s.code} className="flex w-[104px] shrink-0 flex-col items-center gap-1.5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken"><Icon size={22} strokeWidth={1.6} className="text-ink-500" /></span>
        <span className="line-clamp-2 min-h-[2.5em] text-[12px] font-semibold leading-tight text-ink-700">{s.name}</span>
        <button type="button" onClick={() => !done && ask(s)} disabled={done} aria-label={done ? `${s.name}: we will tell you` : `Notify me when ${s.name} opens here`}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${done ? 'bg-sunken text-ink-500' : 'bg-zappy-50 text-zappy-700 hover:bg-zappy-100'}`}>
          {done ? <><Check size={11} /> Noted</> : <><Bell size={11} /> Notify me</>}
        </button>
      </li>
    );
  };

  return (
    <section aria-labelledby="coming-soon" className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="coming-soon" className="text-[15px] font-extrabold text-ink-900">Coming to your area</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-500">Not here yet. Tap the bell and we will tell you the day it opens.</p>
        </div>
        {flat.length > FIRST && (
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
            className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-zappy-700">
            {all ? 'Less' : `See all ${flat.length}`} <ChevronDown size={14} className={`transition-transform ${all ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {all ? (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.code}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-400">{g.name}</p>
              <ul className="flex flex-wrap gap-y-3">{g.services.map(card)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="-mx-4 mt-3 flex overflow-x-auto px-2 [scrollbar-width:none]">{flat.slice(0, FIRST).map(card)}</ul>
      )}
    </section>
  );
}
