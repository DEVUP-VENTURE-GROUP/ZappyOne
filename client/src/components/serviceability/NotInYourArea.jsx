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
export default function NotInYourArea({ place, lat, lng, address, areas = [], onChangeLocation, compact = false }) {
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

  if (compact) {
    return (
      <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-4 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-amber-50 text-amber-600">
          <MapPin size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink-900">We're launching in {place || 'your area'} soon</p>
          <p className="text-[13px] text-ink-500">Browse everything below. Tap “Tell me” and we'll message you the day we start here.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onChangeLocation} className="btn-outline flex-1 px-3 sm:flex-none">Change</button>
          <button onClick={notify} disabled={notified || isLoading} className="btn-primary flex-1 px-3 sm:flex-none">
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : notified ? <Check size={16} /> : <BellRing size={16} />}
            {notified ? 'Saved' : 'Tell me'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-lg py-6 sm:py-10">
      <MapPinOff size={32} className="text-slate-400" strokeWidth={1.6} aria-hidden="true" />
      <h1 className="mt-4 text-[24px] font-bold leading-tight text-navy sm:text-[28px]">
        We don’t serve {place || 'this area'} yet
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
        Try another address, or leave your number with us and we’ll tell you the day we start here.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onChangeLocation}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-zappy-600 text-[15px] font-semibold text-white transition hover:bg-zappy-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200"
        >
          <MapPin size={16} /> Change address
        </button>
        <button
          onClick={notify}
          disabled={notified || isLoading}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-navy transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-100"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" />
            : notified ? <Check size={16} className="text-emerald-600" /> : <BellRing size={16} />}
          {notified ? 'We’ll let you know' : 'Tell me when you’re here'}
        </button>
      </div>

      {areas.length > 0 && (
        <div className="mt-10">
          <p className="text-[14px] font-semibold text-navy">Where we serve today</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">
            {areas.map((a) => `${a.name}${a.city ? `, ${a.city}` : ''}`).join(' · ')}
          </p>
        </div>
      )}
    </section>
  );
}
