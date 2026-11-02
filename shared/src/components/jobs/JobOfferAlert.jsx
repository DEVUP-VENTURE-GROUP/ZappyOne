import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Clock, IndianRupee, Briefcase, Banknote, Loader2, X, Sparkles, Star } from 'lucide-react';
import { kmBetween } from '../../utils/distance';
import PassReasonPicker from '../worker/PassReasonPicker';
import { startRinging } from '../../utils/alertSound';
import { formatPaise } from '../../utils/money';
import { offerClock as clock, DEFAULT_WINDOW_SEC, customerRecordLine } from './jobOffers';
import { STAFF_PORTAL } from '../../provider/staffPortal';

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
 *   coordinates, whenLabel, frontPaise, expiresAt, windowSec, acceptLabel, askReason,
 *   boostPaise (what the customer added; already inside valuePaise)
 *   travelPaise, distanceKm (the journey fee and how far; inside valuePaise)
 * }
 * onAccept() / onDecline(reason) are the kind's own calls; both may throw.
 */

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
    return startRinging({ title: offer.heading || 'New job for you', body: offer.title || 'Open ZappyOne to accept' });
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
  const boost = offer.boostPaise > 0 ? offer.boostPaise : 0;

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
          className="w-full overflow-hidden rounded-card bg-white shadow-2xl sm:max-w-md"
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

          {/* A raised offer is the first thing they see, and it is all theirs. */}
          {boost > 0 && (
            <motion.div
              className="relative overflow-hidden bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 px-5 py-3 text-amber-950"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <motion.span
                aria-hidden
                className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                animate={{ x: ['0%', '400%'] }}
                transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
              />
              <p className="relative flex items-center gap-2 text-[13px] font-extrabold">
                <Sparkles size={16} /> Customer raised the offer by {formatPaise(boost)}
              </p>
              <p className="relative text-[11px] font-semibold text-amber-900">All of it is yours on top of the job price. Take it before someone else does.</p>
            </motion.div>
          )}

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
              <div className={`rounded-2xl p-3 ${boost ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-slate-50'}`}>
                <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <IndianRupee size={11} /> {offer.valueLabel}
                </p>
                <p className="mt-0.5 text-[18px] font-bold tabular-nums text-navy">{STAFF_PORTAL ? 'Salaried' : formatPaise(offer.valuePaise)}</p>
                {STAFF_PORTAL && <p className="text-[11px] font-semibold text-emerald-700">Tips are yours</p>}
                {offer.groupSize > 1 && (
                  <p className="text-[11px] font-bold text-zappy-700">1 of {offer.groupSize} items at this visit, your answer covers all</p>
                )}
                {!STAFF_PORTAL && offer.travelPaise > 0 && (
                  <p className="text-[11px] font-semibold tabular-nums text-emerald-700">incl. +{formatPaise(offer.travelPaise)} travel{offer.distanceKm != null ? ` (${Math.round(offer.distanceKm * 10) / 10} km)` : ''}, yours</p>
                )}
                {!STAFF_PORTAL && offer.surgePaise > 0 && (
                  <p className="text-[11px] font-semibold tabular-nums text-orange-600">incl. +{formatPaise(offer.surgePaise)} surge, yours</p>
                )}
                {!STAFF_PORTAL && boost > 0 && (
                  <p className="text-[11px] font-semibold tabular-nums text-amber-700">
                    <span className="text-slate-400 line-through">{formatPaise(offer.valuePaise - boost)}</span> + {formatPaise(boost)} extra
                  </p>
                )}
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

            {/* How other providers rated this customer (jobs/customer-rating). */}
            {offer.customer && (
              <p className={`mt-2 flex items-center gap-1.5 text-[12px] font-medium ${offer.customer.rating != null && offer.customer.rating < 3 ? 'text-red-700' : 'text-slate-600'}`}>
                <Star size={12} className={offer.customer.rating != null ? 'fill-amber-400 text-amber-400' : 'text-slate-400'} />
                {offer.customer.rating != null ? `Customer rated ${Number(offer.customer.rating).toFixed(1)} by ${offer.customer.count} provider${offer.customer.count === 1 ? '' : 's'}` : 'New customer'}
              </p>
            )}
            {customerRecordLine(offer.customer) && <p className="mt-1 text-[12px] font-bold text-amber-700">{customerRecordLine(offer.customer)}</p>}

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
            <X size={12} /> Hide - it stays on your Work page
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
