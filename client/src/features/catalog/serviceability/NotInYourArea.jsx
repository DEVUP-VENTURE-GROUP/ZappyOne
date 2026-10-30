import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BellRing, Check, Loader2, MapPin, MapPinOff } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useNotifyLaunchMutation } from '@shared/services/api';

// Nothing bookable here: say so plainly, offer another address or a launch alert, and show where we are live today.
export default function NotInYourArea({ place, lat, lng, address, areas = [], onChangeLocation, soon = false }) {
  const nav = useNavigate();
  const { accessToken, role } = useSelector(selectAuth);
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);
  const cities = [...areas.reduce((m, a) => m.set(a.city || 'Our areas', [...(m.get(a.city || 'Our areas') || []), a.name]), new Map())];

  async function notify() {
    if (!accessToken || role !== 'user') { nav('/login', { state: { from: '/' } }); return; }
    try {
      await notifyLaunch({ lat, lng, address: address || place || '' }).unwrap();
      setNotified(true);
      toast.success('We will tell you the day we start here');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your request. Try again.');
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg pt-4 text-center">
      <span className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-zappy-50 text-zappy-600">
        <MapPinOff size={40} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 [text-wrap:balance]">
        {soon ? `Pros are joining near ${place || 'you'}` : 'Not available in your area yet'}
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-500">
        {soon ? 'Nobody is verified at this address yet. We are adding pros every week.' : `We are launching new areas fast and will be in ${place || 'yours'} soon.`}
      </p>

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <button type="button" onClick={notify} disabled={notified || isLoading} className="btn-primary flex-1 disabled:opacity-70">
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : notified ? <Check size={16} /> : <BellRing size={16} />}
          {notified ? 'We will tell you' : 'Notify me when live'}
        </button>
        <button type="button" onClick={onChangeLocation} className="btn-outline flex-1"><MapPin size={16} /> Change address</button>
      </div>

      {cities.length > 0 && (
        <div className="mt-10 text-left">
          <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-ink-900">We are live in</h2>
          <div className="mt-3 space-y-3">
            {cities.map(([city, names]) => (
              <div key={city} className="rounded-card bg-sunken p-4">
                <p className="text-[15px] font-bold text-ink-900">{city}</p>
                <p className="mt-0.5 text-[13px] text-ink-500">Serving {names.length} {names.length === 1 ? 'area' : 'areas'}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {names.map((n) => <li key={n} className="rounded-lg border border-line bg-white px-3.5 py-2 text-[14px] text-ink-900">{n}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
