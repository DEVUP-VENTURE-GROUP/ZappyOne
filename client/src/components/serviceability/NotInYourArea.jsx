import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPinOff, MapPin, BellRing, Check, Loader2 } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useNotifyLaunchMutation } from '@shared/services/api';

/**
 * Shown instead of the home page when ZappyOne cannot serve the chosen point:
 * nothing bookable is rendered, only ways forward — pick another location, see
 * where we operate, or ask to be told when we arrive here.
 */
export default function NotInYourArea({ place, lat, lng, address, areas = [], onChangeLocation }) {
  const nav = useNavigate();
  const { accessToken, role } = useSelector(selectAuth);
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);

  async function notify() {
    if (!accessToken || role !== 'user') {
      nav('/login', { state: { from: '/' } });
      return;
    }
    try {
      await notifyLaunch({ lat, lng, address: address || place || '' }).unwrap();
      setNotified(true);
      toast.success("We'll let you know as soon as we launch here");
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your request. Try again.');
    }
  }

  return (
    <section className="mx-auto w-full max-w-md px-6 pt-12 pb-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zappy-50">
        <MapPinOff size={28} className="text-zappy-600" strokeWidth={2} />
      </div>
      <h1 className="mt-5 text-2xl font-black tracking-tight text-navy">ZappyOne is growing</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        We're not in <span className="font-semibold text-slate-700">{place || 'this area'}</span> yet.
        Change your location, or ask us to tell you when we arrive.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        <button
          onClick={onChangeLocation}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-zappy-600 text-sm font-bold text-white shadow-sm transition hover:bg-zappy-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200"
        >
          <MapPin size={16} /> Change location
        </button>
        <button
          onClick={notify}
          disabled={notified || isLoading}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-zappy-300 disabled:cursor-default disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-100"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" />
            : notified ? <Check size={16} className="text-emerald-600" /> : <BellRing size={16} />}
          {notified ? "We'll let you know" : 'Notify me when you launch here'}
        </button>
      </div>

      {areas.length > 0 && (
        <div className="mt-10 text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Where we serve today</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {areas.map((a) => (
              <li key={`${a.city}-${a.name}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {a.name}{a.city ? `, ${a.city}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
