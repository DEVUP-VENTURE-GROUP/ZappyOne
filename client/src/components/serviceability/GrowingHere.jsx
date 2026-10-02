import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BellRing, Check, Loader2, MapPin } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useNotifyLaunchMutation } from '@shared/services/api';
import { artFor } from '@shared/components/home/serviceArt';
import { trackSearch } from '../../hooks/useTelemetry';

/**
 * Shown at the booking step when nobody verified covers the address yet.
 *
 * The customer has come all the way in, so this is the strongest demand signal
 * we get: it is recorded (service + location, stage "booking") the moment it
 * shows. No booking is created — taking one would promise a visit nobody can
 * make — but they can ask to be told the day it opens, or try another address.
 *
 *   service     { code, name } — what they were booking (a line code or vertical)
 *   lat, lng    the booking address
 *   onChangeLocation  optional: reopen the address picker
 */
export default function GrowingHere({ service, lat, lng, address = '', onChangeLocation }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { accessToken, role } = useSelector(selectAuth);
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);
  const art = artFor(service?.code, service?.domainCode);

  useEffect(() => {
    if (lat == null || !service?.code) return;
    trackSearch({ category: service.code, query: 'booking_step', lat, lng, result: 'no_service', userType: 'user' });
  }, [service?.code, lat, lng]);

  async function notify() {
    if (!accessToken || role !== 'user') { nav('/login', { state: { from: pathname } }); return; }
    try {
      await notifyLaunch({ lat, lng, address }).unwrap();
      setNotified(true);
      toast.success('We’ll tell you the day it opens here');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your request. Try again.');
    }
  }

  return (
    <section className="overflow-hidden rounded-card border border-line bg-white" aria-labelledby="growing-title">
      <div className="flex items-center gap-4 border-b border-line px-5 py-4">
        {art && <img src={art.still} alt="" className="h-16 w-16 shrink-0 rounded-full bg-sunken object-contain mix-blend-multiply" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-500">Not available here yet</p>
          <h2 id="growing-title" className="mt-0.5 text-[17px] font-bold leading-snug text-ink-900">
            No verified {service?.name ? service.name.toLowerCase() : 'pro'} near this address
          </h2>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-[15px] leading-relaxed text-ink-700">
          ZappyOne is opening across Telangana area by area, and we are verifying pros near you now.
          Tap Notify me and we’ll message you the day you can book here. Nothing is charged.
        </p>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={notify}
            disabled={notified || isLoading}
            className="btn-primary flex-1"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : notified ? <Check size={16} /> : <BellRing size={16} />}
            {notified ? 'We’ll let you know' : 'Notify me'}
          </button>
          {onChangeLocation && (
            <button type="button" onClick={onChangeLocation}
              className="btn-outline flex-1">
              <MapPin size={16} /> Try another address
            </button>
          )}
        </div>
        <button type="button" onClick={() => nav('/')} className="w-full text-center text-[14px] font-semibold text-zappy-600">
          See what’s available near you
        </button>
      </div>
    </section>
  );
}
