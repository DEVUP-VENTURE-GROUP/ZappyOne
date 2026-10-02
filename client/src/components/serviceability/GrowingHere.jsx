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
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white" aria-labelledby="growing-title">
      <div className="flex items-end gap-4 bg-[linear-gradient(135deg,#EAF1FD_0%,#F3EEFD_100%)] px-5 pt-5">
        <div className="min-w-0 flex-1 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zappy-700">ZappyOne is growing</p>
          <h2 id="growing-title" className="mt-1 text-[19px] font-bold leading-snug text-navy [text-wrap:balance]">
            We’re not at this address yet
          </h2>
        </div>
        {art && <img src={art.still} alt="" className="h-24 w-24 shrink-0 object-contain mix-blend-multiply" />}
      </div>
      <div className="space-y-4 p-5">
        <p className="text-[14px] leading-relaxed text-slate-600">
          ZappyOne is growing area by area across Telangana — and yours is next on our list.
          <span className="font-semibold text-navy"> We’re verifying {service?.name ? `${service.name.toLowerCase()} pros` : 'pros'} near you right now.</span>{' '}
          Ask us, and we’ll message you the day you can book here.
        </p>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={notify}
            disabled={notified || isLoading}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-zappy-600 text-[15px] font-semibold text-white transition hover:bg-zappy-700 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : notified ? <Check size={16} /> : <BellRing size={16} />}
            {notified ? 'We’ll let you know' : 'Notify me'}
          </button>
          {onChangeLocation && (
            <button type="button" onClick={onChangeLocation}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[15px] font-semibold text-navy transition hover:bg-slate-50">
              <MapPin size={16} /> Try another address
            </button>
          )}
        </div>
        <button type="button" onClick={() => nav('/')} className="w-full text-center text-[13px] font-semibold text-slate-500 hover:text-navy">
          See what’s available near you
        </button>
      </div>
    </section>
  );
}
