import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Clock, IndianRupee, Briefcase, Banknote, Loader2, X } from 'lucide-react';
import { kmBetween } from '../../utils/distance';
import PassReasonPicker from '../worker/PassReasonPicker';
import { startRinging } from '../../utils/alertSound';
import { formatPaise } from '../../utils/money';

/**
 * A job has arrived — the provider is rung, not nudged. Every kind uses this.
 *
 * A silent banner loses jobs. A provider with a phone in their pocket needs a
 * noise that keeps going, a screen that can't be missed, and enough on it to
 * decide without opening anything else: what it is, what it pays, how far,
 * where, and whether they'd have to front money.
 *
 * The window is the job's own (a repair or a chosen pet booking gives minutes
 * to think; an open job nearby is first-come). Passing is a real, blameless
 * button, never a timeout.
 *
 * offer: {
 *   heading, title, valueLabel, valuePaise, cash, howLabel, address, landmark,
 *   coordinates, whenLabel, frontPaise, expiresAt, windowSec, acceptLabel, askReason
 * }
 * onAccept() / onDecline(reason) are the kind's own calls; both may throw.
 */

/** A window this long is read as minutes, never as a count of seconds. */
function clock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const DEFAULT_WINDOW_SEC = 10 * 60;

export default function JobOfferAlert({ offer, myLocation, onAccept, onDecline, onClose, declineTitle }) {
  const [busy, setBusy] = useState(null); // 'accept' | 'decline'
  const [askingReason, setAskingReason] = useState(false);

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
    return startRinging();
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

  // Straight-line, from the one shared helper — a rough guide, not a route.
  const km = offer.km ?? kmBetween(myLocation, offer.coordinates);
  const pct = Math.max(0, Math.min(100, (left / windowSec) * 100));
  const urgent = left <= windowSec / 5;

  function openDirections() {
    const [lng, lat] = offer.coordinates || [];
    const url = lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(offer.address || '')}`;
    window.open(url, '_blank', 'noopener');
  }

  async function act(which, fn) {
    setBusy(which);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const pass = (reason) => act('decline', () => onDecline(reason));

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="alertdialog"
        aria-label={offer.heading}
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
                <p className="text-[12px] font-semibold text-zappy-700">{offer.heading}</p>
                <p className="mt-0.5 truncate text-[18px] font-bold capitalize text-navy">{offer.title}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                urgent ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
              }`}>
                {clock(left)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <IndianRupee size={11} /> {offer.valueLabel}
                </p>
                <p className="mt-0.5 text-[18px] font-bold tabular-nums text-navy">{formatPaise(offer.valuePaise)}</p>
                {offer.cash && (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <Banknote size={10} /> Collect in cash
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <Briefcase size={11} /> How
                </p>
                <p className="mt-0.5 text-[14px] font-semibold capitalize leading-tight text-navy">{offer.howLabel}</p>
                {km != null && <p className="text-[11px] font-medium text-slate-500">{Number(km).toFixed(1)} km away</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={openDirections}
              className="mt-2 flex w-full items-start gap-2 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-zappy-200"
            >
              <MapPin size={15} className="mt-0.5 shrink-0 text-zappy-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug text-navy">
                  {offer.address || 'Address shared after accepting'}
                </span>
                {offer.landmark && <span className="block text-[11px] text-slate-500">{offer.landmark}</span>}
              </span>
              <Navigation size={15} className="mt-0.5 shrink-0 text-zappy-500" />
            </button>

            {offer.whenLabel && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
                <Clock size={12} /> {offer.whenLabel}
              </p>
            )}

            {offer.frontPaise > 0 && (
              <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
                <Banknote size={13} /> You pay {formatPaise(offer.frontPaise)} at the shop; repaid against the receipt
              </p>
            )}

            {askingReason ? (
              <div className="mt-4">
                <PassReasonPicker title={declineTitle} busy={busy === 'decline'} onPick={pass} onCancel={() => setAskingReason(false)} />
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (offer.askReason ? setAskingReason(true) : pass(''))}
                  disabled={!!busy}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 disabled:opacity-50"
                >
                  {busy === 'decline' ? <Loader2 size={15} className="animate-spin" /> : 'Pass'}
                </button>
                <button
                  type="button"
                  onClick={() => act('accept', onAccept)}
                  disabled={!!busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy === 'accept' ? <Loader2 size={16} className="animate-spin" /> : (offer.acceptLabel || 'Accept job')}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onClose?.('dismissed')}
            className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2.5 text-[12px] font-medium text-slate-500"
          >
            <X size={12} /> Hide — it stays on your Work page
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
