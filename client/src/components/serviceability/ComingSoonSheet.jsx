import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BellRing, Check, Loader2, MapPin, X } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { useNotifyLaunchMutation } from '@shared/services/api';
import { artFor } from '@shared/components/home/serviceArt';

/**
 * A service we show but nobody near this customer is verified for yet.
 *
 * Taking the booking would promise a visit nobody can make, so instead we say
 * so plainly and offer to tell them the day it opens. The tap itself is
 * recorded by the caller as demand (which service, where) — that is the point
 * of showing it at all.
 */
export default function ComingSoonSheet({ service, place, lat, lng, onClose, onChangeLocation }) {
  const nav = useNavigate();
  const { accessToken, role } = useSelector(selectAuth);
  const [notifyLaunch, { isLoading }] = useNotifyLaunchMutation();
  const [notified, setNotified] = useState(false);
  if (!service) return null;
  const art = service.imageUrl ? { still: service.imageUrl, alt: '' } : artFor(service.code, service.domainCode);

  async function notify() {
    if (!accessToken || role !== 'user') { nav('/login', { state: { from: '/' } }); return; }
    try {
      await notifyLaunch({ lat, lng, address: place || '' }).unwrap();
      setNotified(true);
      toast.success(`We’ll tell you when ${service.name} opens near you`);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your request. Try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-soon-title"
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {art && <img src={art.still} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-[#F1F5FB] object-contain" />}
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Coming soon</span>
            <h2 id="coming-soon-title" className="mt-1.5 text-[18px] font-bold leading-snug text-navy">
              {service.name} isn’t near you yet
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
          We’re verifying pros for this across Telangana. Ask us to tell you, and we’ll message you the day it opens{place ? ` near ${place}` : ''}.
        </p>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
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
            <button
              type="button"
              onClick={onChangeLocation}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 text-[15px] font-semibold text-navy transition hover:bg-slate-50"
            >
              <MapPin size={16} /> Another address
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
