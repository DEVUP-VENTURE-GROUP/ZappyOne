import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { kmBetween } from '../../utils/distance';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Clock, IndianRupee, Wrench, Banknote, Loader2, X,
} from 'lucide-react';
import {
  useTransitionRepairBookingMutation,
  useDeclineRepairBookingMutation,
} from '../../services/api';
import { startRinging } from '../../utils/alertSound';
import toast from 'react-hot-toast';
import { formatPaise } from '../../utils/money';

/**
 * A repair job has arrived — the provider is rung, not nudged.
 *
 * A silent banner loses jobs. A technician with a phone in their pocket and a
 * soldering iron in their hand needs a noise that keeps going, a screen that
 * cannot be missed, and enough on it to decide without opening anything else:
 * what the device is, what pays, how far, and where.
 *
 * Deliberately NOT a 30-second ride-hail ping. A repair is not an impulse —
 * the technician has to think about parts and travel — so the window is
 * longer, and declining is a real, blameless button rather than a timeout.
 */

const rupees = formatPaise;

/** A window this long is read as minutes, never as a count of seconds. */
function clock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Fallback only — the server sends the real window with every offer.
const DEFAULT_WINDOW_SEC = 10 * 60;

const MODE_LABEL = {
  doorstep: 'At the customer',
  workshop: 'Bring to workshop',
  pickup_repair: 'Pickup & return',
  diagnosis_only: 'Inspection only',
};

export default function RepairOfferAlert({ offer, myLocation, onClose }) {
  const nav = useNavigate();
  const [accept, { isLoading: accepting }] = useTransitionRepairBookingMutation();
  const [decline, { isLoading: declining }] = useDeclineRepairBookingMutation();

  /**
   * The window is TEN MINUTES, not ninety seconds.
   *
   * A repair is not a ride-hail ping: the technician has to think about the
   * part and the travel before answering. Everything here was still scaled to
   * 90 seconds, so the bar stayed full for the first eight and a half minutes
   * and then fell off a cliff, the badge read "587s", and the red warning fired
   * with 20 seconds left on a ten-minute clock.
   */
  const windowSec = offer?.windowSec || DEFAULT_WINDOW_SEC;
  const expiry = useMemo(
    () => (offer?.expiresAt ? new Date(offer.expiresAt).getTime() : Date.now() + windowSec * 1000),
    [offer, windowSec],
  );
  const [left, setLeft] = useState(() => Math.max(0, Math.round((expiry - Date.now()) / 1000)));

  // Ring for as long as it is on screen, and stop the moment it leaves —
  // a ringtone that outlives its alert is how an app gets uninstalled.
  useEffect(() => {
    if (!offer) return undefined;
    const stop = startRinging();
    return stop;
  }, [offer]);

  useEffect(() => {
    if (!offer) return undefined;
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiry - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) onClose?.('expired');
    }, 1000);
    return () => clearInterval(t);
  }, [offer, expiry, onClose]);

  if (!offer) return null;

  // Straight-line, from the one shared helper — honest about being a rough
  // guide rather than a driving route.
  const km = kmBetween(myLocation, offer.coordinates);
  const pct = Math.max(0, Math.min(100, (left / windowSec) * 100));
  // Last fifth of whatever the window is, so this scales with the window
  // instead of being a constant tuned to a length we no longer use.
  const urgent = left <= windowSec / 5;

  /** Hand the address to whatever maps app the provider actually uses. */
  function openDirections() {
    const [lng, lat] = offer.coordinates || [];
    const url = lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(offer.address || '')}`;
    window.open(url, '_blank', 'noopener');
  }

  async function take() {
    try {
      await accept({ id: offer.bookingId, status: 'WORKER_ACCEPTED' }).unwrap();
      toast.success('Job accepted');
      onClose?.('accepted');
      nav(`/worker/repair/${offer.bookingId}`);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not accept — it may have gone to someone else');
      onClose?.('failed');
    }
  }

  async function pass() {
    try {
      await decline({ id: offer.bookingId, reason: 'declined_by_provider' }).unwrap();
      toast('Passed on — we\'ll find someone else', { icon: '👍' });
    } catch {
      // Declining is courtesy; never block the provider on it failing.
    } finally {
      onClose?.('declined');
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full overflow-hidden rounded-3xl bg-white shadow-2xl sm:max-w-md"
          initial={{ y: 40, scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          {/* The clock is a bar, not a number to stare at. */}
          <div className="h-1.5 bg-slate-100">
            <motion.div
              className={`h-full ${urgent ? 'bg-red-500' : 'bg-emerald-500'}`}
              animate={{ width: `${pct}%` }}
              transition={{ ease: 'linear', duration: 0.9 }}
            />
          </div>

          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-indigo-600">
                  New repair job · {Math.round(windowSec / 60)} min to accept
                </p>
                <p className="mt-0.5 truncate text-lg font-black text-[#0F172A]">
                  {offer.device || 'Device repair'}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${
                urgent ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
              }`}>
                {clock(left)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                  <IndianRupee size={11} /> {offer.isEstimate ? 'Estimate' : 'Job value'}
                </p>
                <p className="mt-0.5 text-lg font-black text-[#0F172A]">{rupees(offer.totalPaise)}</p>
                {offer.paymentMethod === 'cash' && (
                  <p className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700">
                    <Banknote size={10} /> Collect in cash
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                  <Wrench size={11} /> How
                </p>
                <p className="mt-0.5 text-sm font-bold leading-tight text-[#0F172A]">
                  {MODE_LABEL[offer.serviceMode] || offer.serviceMode}
                </p>
                {km != null && (
                  <p className="text-[10.5px] font-semibold text-slate-500">{km.toFixed(1)} km away</p>
                )}
              </div>
            </div>

            <button
              onClick={openDirections}
              className="mt-2 flex w-full items-start gap-2 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-indigo-200"
            >
              <MapPin size={15} className="mt-0.5 shrink-0 text-indigo-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold leading-snug text-[#0F172A]">
                  {offer.address || 'Address shared after accepting'}
                </span>
                {offer.landmark && (
                  <span className="block text-[11px] text-slate-500">{offer.landmark}</span>
                )}
              </span>
              <Navigation size={15} className="mt-0.5 shrink-0 text-indigo-500" />
            </button>

            {offer.slotLabel && (
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
                <Clock size={12} /> {offer.slotLabel}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={pass}
                disabled={declining || accepting}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 disabled:opacity-50"
              >
                {declining ? <Loader2 size={15} className="animate-spin" /> : 'Pass'}
              </button>
              <button
                onClick={take}
                disabled={accepting || declining}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {accepting ? <Loader2 size={16} className="animate-spin" /> : 'Accept job'}
              </button>
            </div>
          </div>

          <button
            onClick={() => onClose?.('dismissed')}
            className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2.5 text-[11px] font-semibold text-slate-400"
          >
            <X size={12} /> Hide — it stays in your jobs list
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
