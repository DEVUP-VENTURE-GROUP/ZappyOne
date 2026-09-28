import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Bolt, Droplets, Wind, Hammer, Users, Car, Sparkles, Paintbrush2, Smartphone, Battery,
  Layers, Wrench, Home, Zap, Fuel, Bike, AlertTriangle, Clock, MapPin, Star, X, Flame,
  BadgeCheck, Loader2,
} from 'lucide-react';
import { useWorkerAcceptMutation, useWorkerRejectMutation } from '../services/api';
import { useWorkerOfferSocket } from '../hooks/useSocket';
import { setOffer, clearOffer, selectWorker } from '../modules/worker/workerSlice';
import { playOfferAlert } from '../utils/alertSound';

const SERVICE_ICON_MAP = {
  // Original
  electrical:            { Icon: Bolt,          bg: 'bg-amber-100',   color: 'text-amber-600'  },
  plumbing:              { Icon: Droplets,       bg: 'bg-blue-100',    color: 'text-blue-600'   },
  ac_repair:             { Icon: Wind,           bg: 'bg-cyan-100',    color: 'text-cyan-600'   },
  carpenter:             { Icon: Hammer,         bg: 'bg-orange-100',  color: 'text-orange-600' },
  helper:                { Icon: Users,          bg: 'bg-green-100',   color: 'text-green-600'  },
  puncture:              { Icon: Car,            bg: 'bg-slate-100',   color: 'text-slate-500'  },
  cleaning:              { Icon: Sparkles,       bg: 'bg-purple-100',  color: 'text-purple-600' },
  painting:              { Icon: Paintbrush2,    bg: 'bg-pink-100',    color: 'text-pink-600'   },
  // Mobile phone
  screen_replacement:    { Icon: Smartphone,     bg: 'bg-indigo-100',  color: 'text-indigo-600' },
  battery_replacement:   { Icon: Battery,        bg: 'bg-emerald-100', color: 'text-emerald-600'},
  charging_issue:        { Icon: Bolt,           bg: 'bg-yellow-100',  color: 'text-yellow-600' },
  speaker_mic_issue:     { Icon: Layers,         bg: 'bg-violet-100',  color: 'text-violet-600' },
  software_issue:        { Icon: Wrench,         bg: 'bg-red-100',     color: 'text-red-600'    },
  water_damage_check:    { Icon: Droplets,       bg: 'bg-sky-100',     color: 'text-sky-600'    },
  // Construction
  mason:                 { Icon: Home,           bg: 'bg-stone-100',   color: 'text-stone-600'  },
  // Car + Bike
  battery_jump_start:    { Icon: Zap,            bg: 'bg-yellow-100',  color: 'text-yellow-600' },
  fuel_delivery:         { Icon: Fuel,           bg: 'bg-orange-100',  color: 'text-orange-600' },
  bike_wash:             { Icon: Bike,           bg: 'bg-cyan-100',    color: 'text-cyan-600'   },
  car_wash:              { Icon: Car,            bg: 'bg-blue-100',    color: 'text-blue-600'   },
  minor_roadside_repair: { Icon: AlertTriangle,  bg: 'bg-red-100',     color: 'text-red-600'    },
};

/**
 * Dispatch offers for service orders: the socket listeners, the full-screen
 * offer, and accept / pass. Mounted by every worker home (independent and
 * shop technician) so both ring the same way.
 */
export default function OrderOfferHost({ onJobChanged }) {
  const dispatch = useDispatch();
  const nav = useNavigate();
  const worker = useSelector(selectWorker);
  const [acceptOffer, { isLoading: accepting }] = useWorkerAcceptMutation();
  const [rejectOffer] = useWorkerRejectMutation();

  // offer socket + alert
  const handleOffer = useCallback((offer) => {
    // Map boostAmountPaise → boostedBy (rupees) so the boost badge renders immediately
    // even if the customer boosted before dispatch started broadcasting.
    const enriched = {
      ...offer,
      ...(offer.boostAmountPaise > 0 && { boostedBy: Math.round(offer.boostAmountPaise / 100) }),
      // High-demand accept bonus (platform-funded, paid on completion) — grows as search widens.
      ...(offer.urgencyBonusPaise > 0 && { urgencyBonusBy: Math.round(offer.urgencyBonusPaise / 100) }),
    };
    dispatch(setOffer(enriched));
    // Stronger vibration pattern for boosted offers (distinct from standard)
    const isBoosted = (offer.boostAmountPaise ?? 0) > 0;
    playOfferAlert();
    try { navigator.vibrate?.(isBoosted ? [100, 50, 150, 50, 250, 50, 150] : [200, 100, 200]); } catch {}
  }, [dispatch]);

  // offer taken by another worker — dismiss popup immediately
  const handleOfferCancelled = useCallback((p) => {
    if (worker.currentOffer && String(worker.currentOffer._id) === String(p?.orderId)) {
      dispatch(clearOffer());
    }
  }, [dispatch, worker.currentOffer]);

  // system auto-assigned a job to this worker (force-assign flow)
  const handleForceAssigned = useCallback((data) => {
    dispatch(clearOffer());
    onJobChanged?.();
    playOfferAlert();
    try { navigator.vibrate?.([300, 100, 300, 100, 300]); } catch {}
    toast.success(`Job assigned to you! ₹${data.price ?? ''}`, { duration: 6000 });
    setTimeout(() => nav(`/worker/jobs/${data.orderId}`), 1500);
  }, [dispatch, nav, onJobChanged]);

  // Customer boosted their offer while worker is viewing it — update price live
  const handleOfferBoosted = useCallback((data) => {
    if (worker.currentOffer && String(worker.currentOffer._id) === String(data?.orderId)) {
      dispatch(setOffer({ ...worker.currentOffer, price: data.newTotal, boostedBy: data.rupees }));
      playOfferAlert();
      try { navigator.vibrate?.([60, 40, 100, 40, 150]); } catch {}
    }
  }, [dispatch, worker.currentOffer]);

  // Active job pulled away (admin reassign or stale-watchdog) — clear banner immediately
  const handleJobPulled = useCallback(() => {
    onJobChanged?.();
    toast.error('Your job was reassigned. Stay online for the next one.', { duration: 5000 });
  }, [onJobChanged]);

  useWorkerOfferSocket(handleOffer, handleOfferCancelled, handleForceAssigned, handleOfferBoosted, handleJobPulled);

  async function onAccept() {
    if (!worker.currentOffer) return;
    try {
      await acceptOffer(worker.currentOffer._id).unwrap();
      const id = worker.currentOffer._id;
      dispatch(clearOffer());
      nav(`/worker/jobs/${id}`);
    } catch (err) {
      toast.error(err.data?.error || 'Could not accept');
      dispatch(clearOffer());
    }
  }

  async function onReject() {
    if (!worker.currentOffer) return;
    try { await rejectOffer(worker.currentOffer._id).unwrap(); } finally { dispatch(clearOffer()); }
  }

  return (
      <AnimatePresence>
        {worker.currentOffer && (
          <OfferModal
            offer={worker.currentOffer}
            onAccept={onAccept}
            onReject={onReject}
            accepting={accepting}
          />
        )}
      </AnimatePresence>
  );
}

// Seconds the worker has to accept an offer, by tier (express is fastest).
// Fallback is 35s (see `?? 35` below).
const TIER_DISPLAY_SEC = { express: 20, priority: 30, standard: 35 };

function OfferModal({ offer, onAccept, onReject, accepting }) {
  const isExpress  = offer.tier === 'express';
  const isPriority = offer.tier === 'priority';

  // Fresh countdown from the moment the worker RECEIVES the offer.
  // Server's expiresAt is used as a hard upper bound only — we never show
  // a stale timer caused by network/queue delay between dispatch and delivery.
  const displayDuration = TIER_DISPLAY_SEC[offer.tier] ?? 35;
  const hardDeadline = offer.expiresAt
    ? new Date(offer.expiresAt).getTime()
    : Date.now() + displayDuration * 1000;
  // Receipt time: mount time. Give the full display duration from NOW, but cap at hard deadline.
  const receiptExpiry = Date.now() + displayDuration * 1000;
  const effectiveExpiry = Math.min(receiptExpiry, hardDeadline);
  const initialLeft = Math.round((effectiveExpiry - Date.now()) / 1000);

  const [left, setLeft] = useState(initialLeft);
  const totalRef = useRef(initialLeft);

  useEffect(() => {
    const tick = () => {
      const l = Math.max(0, Math.ceil((effectiveExpiry - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) onReject();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [offer._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = Math.max(0, left / Math.max(totalRef.current, 1));
  const urgent   = left <= 6;

  const svc     = SERVICE_ICON_MAP[offer.service] || { Icon: Wrench, bg: 'bg-slate-100', color: 'text-slate-600' };
  const SvcIcon = svc.Icon;

  /* Static map of the pickup — shown as map background.
     The bottom card covers the lower ~60% of the popup, so a map centred on
     the pickup would bury the pin behind the card. We push the map centre
     SOUTH of the pickup so the actual location renders in the visible top
     band (~26% from top), where we also draw a live pulsing marker on it. */
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const [pickLng, pickLat] = offer.pickupCoords || [0, 0];
  const MAP_ZOOM = 15;                 // closer = exact location
  const PIN_TOP_FRAC = 0.26;           // where the pin should sit (from top)
  const IMG_H = 500;                   // logical static-map height
  // metres-per-pixel at this latitude/zoom, then south-shift so pin moves up
  const mpp = (156543.03392 * Math.cos((pickLat * Math.PI) / 180)) / 2 ** MAP_ZOOM;
  const shiftPx = (0.5 - PIN_TOP_FRAC) * IMG_H;        // logical px to move pin up
  const centerLat = pickLat - (shiftPx * mpp) / 111320; // move centre south
  const mapUrl = mapboxToken && pickLng && pickLat
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
      `pin-l+1d4ed8(${pickLng},${pickLat})/` +
      `${pickLng},${centerLat},${MAP_ZOOM},0/800x500@2x` +
      `?access_token=${mapboxToken}&attribution=false&logo=false`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col items-center sm:justify-center sm:p-6 sm:bg-black/80 sm:backdrop-blur-sm"
    >
      <div className="w-full max-w-md flex flex-col h-full sm:h-[90vh] sm:max-h-[850px] relative overflow-hidden sm:rounded-[2.5rem] shadow-2xl">
        {/* Map fills the entire background */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background: isExpress
              ? 'linear-gradient(135deg, #1e1b4b, #312e81)'
              : isPriority
                ? 'linear-gradient(135deg, #1c1007, #78350f)'
                : 'linear-gradient(135deg, #0f172a, #1e293b)',
          }}
        >
          {mapUrl ? (
            <>
              <img src={mapUrl} alt="map" className="w-full h-full object-cover" />
              {/* Live pulsing marker sitting exactly over the pickup pin */}
              <div
                className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: '50%', top: '26%' }}
              >
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ width: 90, height: 90, background: 'radial-gradient(circle, rgba(29,78,216,0.35), transparent 70%)' }}
                  animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                />
                <span className="block w-3.5 h-3.5 rounded-full bg-blue-600 ring-[3px] ring-white shadow-lg" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <motion.div
                className="w-32 h-32 rounded-full"
                style={{
                  background: isExpress
                    ? 'radial-gradient(circle, rgba(99,102,241,0.5), transparent)'
                    : isPriority
                      ? 'radial-gradient(circle, rgba(251,191,36,0.4), transparent)'
                      : 'radial-gradient(circle, rgba(99,102,241,0.3), transparent)',
                }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <MapPin size={36} strokeWidth={1.5} className={isExpress ? 'text-indigo-300 absolute' : isPriority ? 'text-amber-300 absolute' : 'text-indigo-400 absolute'} />
            </div>
          )}
          {/* Subtle vignette — keep the map (and pin) readable up top, darken toward the card */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0.45) 100%)' }} />
          {/* Countdown pill */}
          <motion.div
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl backdrop-blur-md"
            style={{ background: urgent ? 'rgba(239,68,68,0.9)' : 'rgba(15,23,42,0.8)', border: `1px solid ${urgent ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}` }}
            animate={urgent ? { scale: [1, 1.04, 1] } : {}}
            transition={{ duration: 0.4, repeat: Infinity }}
          >
            <Clock size={13} strokeWidth={2.5} className="text-white" />
            <span className="text-white font-black text-base tabular-nums">{left}s</span>
          </motion.div>
          {/* Tier banner — NEW JOB / EXPRESS / PRIORITY */}
          <motion.div
            className="absolute top-4 left-4 px-3.5 py-2 rounded-2xl backdrop-blur-md"
            style={
              isExpress
                ? { background: 'rgba(79,70,229,0.9)', border: '1px solid rgba(99,102,241,0.6)' }
                : isPriority
                  ? { background: 'rgba(180,83,9,0.9)', border: '1px solid rgba(251,191,36,0.5)' }
                  : { background: 'rgba(99,102,241,0.8)', border: '1px solid rgba(99,102,241,0.4)' }
            }
            animate={{
              boxShadow: isExpress
                ? ['0 0 0 0px rgba(99,102,241,0.6)', '0 0 0 16px rgba(99,102,241,0)', '0 0 0 0px rgba(99,102,241,0)']
                : isPriority
                  ? ['0 0 0 0px rgba(251,191,36,0.5)', '0 0 0 14px rgba(251,191,36,0)', '0 0 0 0px rgba(251,191,36,0)']
                  : ['0 0 0 0px rgba(99,102,241,0.4)', '0 0 0 12px rgba(99,102,241,0)', '0 0 0 0px rgba(99,102,241,0)'],
            }}
            transition={{ duration: isExpress ? 1.0 : 1.5, repeat: Infinity }}
          >
            <span className="text-white font-black text-xs tracking-widest">
              {isExpress ? '⚡ EXPRESS JOB' : isPriority ? '⭐ PRIORITY JOB' : '⚡ NEW JOB'}
            </span>
          </motion.div>
        </div>

        {/* Spacer to push card to bottom */}
        <div className="flex-1 relative z-10 pointer-events-none" />

        {/* Bottom card — design changes completely per tier */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 360 }}
        className="relative z-10 rounded-t-[32px] mt-auto"
        style={
          isExpress
            ? { background: 'linear-gradient(160deg,#1e1b4b 0%,#312e81 60%,#1e1b4b 100%)', boxShadow: '0 -20px 80px rgba(79,70,229,0.5)' }
            : isPriority
              ? { background: 'linear-gradient(160deg,#1c1007 0%,#3b1f02 60%,#1c1007 100%)', boxShadow: '0 -20px 80px rgba(180,83,9,0.45)' }
              : { background: 'white', boxShadow: '0 -16px 60px rgba(0,0,0,0.25)' }
        }
      >
        {/* Animated progress bar */}
        <div className={`absolute top-0 inset-x-0 h-1.5 rounded-t-[32px] overflow-hidden ${isExpress || isPriority ? 'bg-white/10' : 'bg-slate-100'}`}>
          <motion.div
            className="h-full absolute left-0 top-0 rounded-full"
            style={{
              background: urgent
                ? 'linear-gradient(90deg, #ef4444, #f97316)'
                : isExpress
                  ? 'linear-gradient(90deg, #a5b4fc, #818cf8, #c7d2fe)'
                  : isPriority
                    ? 'linear-gradient(90deg, #fbbf24, #f59e0b, #fcd34d)'
                    : 'linear-gradient(90deg, #6366f1, #0ea5e9)',
            }}
            animate={{ width: `${Math.max(0, progress * 100)}%` }}
            transition={{ duration: 0.25, ease: 'linear' }}
          />
        </div>

        {/* Drag handle */}
        <div className={`w-10 h-1 rounded-full mx-auto mt-3 mb-0 ${isExpress || isPriority ? 'bg-white/20' : 'bg-slate-200'}`} />

        <div className="px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">

          {/* Express / Priority tier header strip */}
          {(isExpress || isPriority) && (
            <motion.div
              className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-2xl"
              style={{
                background: isExpress ? 'rgba(165,180,252,0.12)' : 'rgba(251,191,36,0.12)',
                border: isExpress ? '1px solid rgba(165,180,252,0.25)' : '1px solid rgba(251,191,36,0.25)',
              }}
              animate={{ opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{isExpress ? '⚡' : '⭐'}</span>
                <div>
                  <p className={`text-[13px] font-black ${isExpress ? 'text-indigo-200' : 'text-amber-300'}`}>
                    {isExpress ? 'Express Booking' : 'Priority Booking'}
                  </p>
                  <p className={`text-[10px] ${isExpress ? 'text-indigo-400' : 'text-amber-500'}`}>
                    {isExpress ? 'Nearest worker · Instant match · Higher pay' : '4.5★+ workers only · Premium rate'}
                  </p>
                </div>
              </div>
              <div className={`text-[11px] font-black px-2 py-1 rounded-full ${isExpress ? 'bg-indigo-500/30 text-indigo-200' : 'bg-amber-500/30 text-amber-200'}`}>
                {offer.tierMultiplier > 1 ? `${offer.tierMultiplier}× rate` : ''}
              </div>
            </motion.div>
          )}

          {/* Service label + dismiss */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isExpress || isPriority ? 'bg-white/15' : svc.bg}`}
                animate={{ rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <SvcIcon size={22} strokeWidth={1.75} className={isExpress || isPriority ? 'text-white' : svc.color} />
              </motion.div>
              <div>
                <p className={`font-black text-lg capitalize leading-tight ${isExpress || isPriority ? 'text-white' : 'text-slate-900'}`}>
                  {offer.service.replace(/_/g, ' ')}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {isExpress && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full ring-1 ring-indigo-300"
                    >
                      <Zap size={9} strokeWidth={2.5} />
                      Express — Fast Accept
                    </motion.span>
                  )}
                  {isPriority && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ring-1 ${isPriority ? 'text-amber-200 bg-amber-500/20 ring-amber-500/30' : 'text-amber-700 bg-amber-100 ring-amber-300'}`}
                    >
                      <Star size={9} strokeWidth={2.5} />
                      Priority Request
                    </motion.span>
                  )}
                  {offer.surgeMultiplier > 1 && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: [1, 1.08, 1], opacity: 1 }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-300 px-2 py-0.5 rounded-full ring-1 ring-amber-400"
                    >
                      <Zap size={9} strokeWidth={2.5} />
                      {offer.surgeMultiplier}× Surge
                    </motion.span>
                  )}
                  {offer.boostedBy ? (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-1 text-[10px] font-black text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded-full ring-1 ring-orange-500/30"
                    >
                      <Flame size={9} strokeWidth={2.5} />
                      Customer boosted!
                    </motion.span>
                  ) : !isExpress && !isPriority ? (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-100">
                      Exclusive to you
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <motion.button
              onClick={onReject}
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isExpress || isPriority ? 'bg-white/10' : 'bg-slate-100'}`}
              whileTap={{ scale: 0.9 }}
            >
              <X size={18} strokeWidth={2.5} className={isExpress || isPriority ? 'text-white/60' : 'text-slate-500'} />
            </motion.button>
          </div>

          {/* Price */}
          <div className="flex items-center gap-2 mb-1">
            <motion.p
              key={offer.price}
              className={`font-black leading-none tabular-nums ${
                urgent ? 'text-red-400'
                : offer.boostedBy ? 'text-orange-400'
                : isExpress ? 'text-indigo-100'
                : isPriority ? 'text-amber-200'
                : 'text-slate-900'
              }`}
              style={{ fontSize: 52 }}
              animate={offer.boostedBy
                ? { scale: [1, 1.18, 1] }
                : urgent ? { scale: [1, 1.03, 1] } : {}}
              transition={offer.boostedBy ? { duration: 0.5 } : { duration: 0.4, repeat: Infinity }}
            >
              ₹{offer.price}
            </motion.p>
            {offer.boostedBy ? (
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                className="flex flex-col items-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1], boxShadow: ['0 0 0 0 rgba(249,115,22,0.6)', '0 0 0 12px rgba(249,115,22,0)', '0 0 0 0 rgba(249,115,22,0)'] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="flex items-center gap-1 bg-orange-500 text-white text-[10px] font-black px-2 py-1 rounded-full"
                >
                  <Flame size={10} strokeWidth={2.5} />
                  +₹{offer.boostedBy} BOOST
                </motion.div>
                <span className={`text-[9px] font-bold mt-0.5 ${isExpress || isPriority ? 'text-orange-400' : 'text-orange-500'}`}>Customer boosted offer!</span>
              </motion.div>
            ) : (
              <Zap size={24} strokeWidth={2.5} className={urgent ? 'text-red-400' : isExpress ? 'text-indigo-300' : isPriority ? 'text-amber-300' : 'text-blue-600'} />
            )}
          </div>

          {/* High-demand accept bonus — platform-funded, paid on completion, grows as search widens */}
          {offer.urgencyBonusBy > 0 && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-1.5 mb-4 bg-emerald-500/15 text-emerald-600 text-[11px] font-black px-3 py-1.5 rounded-full self-center"
            >
              <Sparkles size={12} strokeWidth={2.5} />
              +₹{offer.urgencyBonusBy} HIGH-DEMAND BONUS · paid on completion
            </motion.div>
          )}

          {/* Rating + Verified */}
          <div className="flex items-center gap-3 mb-5">
            <span className={`flex items-center gap-1 text-sm font-bold ${isExpress ? 'text-indigo-300' : isPriority ? 'text-amber-300' : 'text-blue-600'}`}>
              <BadgeCheck size={15} strokeWidth={2.5} />
              Verified
            </span>
          </div>

          {/* Route stops */}
          <div className="mb-4">
            {offer.etaMinutes || offer.distanceKm ? (
              <div className="flex gap-3 items-start mb-3">
                <div className="flex flex-col items-center pt-1 shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full ring-2 ${isExpress || isPriority ? 'bg-white/40 ring-white/20' : 'bg-slate-400 ring-slate-200'}`} />
                  <div className={`w-px flex-1 my-1 min-h-[20px] ${isExpress || isPriority ? 'bg-white/15' : 'bg-slate-200'}`} />
                </div>
                <div className={`flex-1 min-w-0 pb-3 ${isExpress || isPriority ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
                  <p className={`font-bold text-sm ${isExpress || isPriority ? 'text-white' : 'text-[#0F172A]'}`}>
                    {[offer.etaMinutes && `${offer.etaMinutes} min`, offer.distanceKm && `(${offer.distanceKm} km)`]
                      .filter(Boolean).join(' ')} away
                  </p>
                  <p className={`text-xs mt-0.5 leading-snug line-clamp-1 ${isExpress || isPriority ? 'text-white/40' : 'text-slate-500'}`}>
                    {offer.pickupAddress}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex gap-3 items-start">
              <div className={`w-2.5 h-2.5 rounded-full ring-2 mt-1 shrink-0 ${isExpress || isPriority ? 'bg-white ring-white/30' : 'bg-[#0F172A] ring-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${isExpress || isPriority ? 'text-white' : 'text-[#0F172A]'}`}>Service location</p>
                <p className={`text-xs mt-0.5 leading-snug line-clamp-1 ${isExpress || isPriority ? 'text-white/40' : 'text-slate-500'}`}>
                  {offer.pickupAddress}
                </p>
              </div>
            </div>
          </div>

          {/* Job Details — always visible */}
          {(() => {
            const dark = isExpress || isPriority;
            const cardBg = dark ? 'rgba(255,255,255,0.07)' : '#f8fafc';
            const cardBorder = dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
            const labelCls = dark ? 'text-white/40' : 'text-slate-400';
            const valueCls = dark ? 'text-white/90' : 'text-slate-700';
            const hasExtra = offer.description || offer.requiredTools?.length > 0 || offer.images?.length > 0;
            return (
            <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              {/* Urgency banner */}
              {(offer.diagnosisUrgency === 'urgent' || offer.diagnosisUrgency === 'high') && (
                <div className={`px-3 py-2 flex items-center gap-2 border-b ${
                  offer.diagnosisUrgency === 'urgent'
                    ? 'bg-red-500/20 border-red-500/20'
                    : 'bg-amber-500/20 border-amber-500/20'
                }`}>
                  <AlertTriangle size={12} strokeWidth={2.5} className={offer.diagnosisUrgency === 'urgent' ? 'text-red-400' : 'text-amber-400'} />
                  <span className={`text-[11px] font-black uppercase tracking-wide ${offer.diagnosisUrgency === 'urgent' ? 'text-red-300' : 'text-amber-300'}`}>
                    {offer.diagnosisUrgency === 'urgent' ? '⚠️ Urgent — prepare for emergency service' : '⚡ High priority — customer needs fast help'}
                  </span>
                </div>
              )}

              <div className="p-3 space-y-2">
                {/* Always-visible service context row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${labelCls}`}>Service</span>
                    <span className={`text-[12px] font-bold capitalize ${valueCls}`}>
                      {offer.service?.replace(/_/g, ' ')}
                      {(offer.vehicleType || offer.deviceBrand) ? ` · ${offer.vehicleType || offer.deviceBrand}` : ''}
                    </span>
                  </div>
                  {offer.distanceKm && (
                    <span className={`text-[11px] font-bold ${dark ? 'text-white/50' : 'text-slate-400'}`}>{offer.distanceKm} km away</span>
                  )}
                </div>

                {/* Customer description */}
                {offer.description ? (
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${labelCls}`}>Customer note</p>
                    <p className={`text-[12px] leading-relaxed line-clamp-3 ${valueCls}`}>{offer.description}</p>
                  </div>
                ) : !hasExtra && (
                  <p className={`text-[11px] italic ${dark ? 'text-white/30' : 'text-slate-400'}`}>No additional details — standard service job</p>
                )}

                {/* Required tools */}
                {offer.requiredTools?.length > 0 && (
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide mb-1.5 ${labelCls}`}>Bring these tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {offer.requiredTools.map(t => (
                        <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 capitalize ${dark ? 'bg-blue-400/15 text-blue-300 ring-blue-400/25' : 'bg-blue-50 text-blue-700 ring-blue-100'}`}>
                          {t.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer photos */}
                {offer.images?.length > 0 && (
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide mb-1.5 ${labelCls}`}>Photos from customer</p>
                    <div className="flex gap-2">
                      {offer.images.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className="w-16 h-16 rounded-xl object-cover ring-1 ring-white/20"
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* Accept button */}
          <motion.button
            onClick={onAccept}
            disabled={accepting}
            className="w-full h-[60px] text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 transition-transform"
            style={
              isExpress
                ? { background: 'linear-gradient(135deg,#4338ca,#6366f1,#818cf8)', boxShadow: '0 8px 32px rgba(99,102,241,0.55)' }
                : isPriority
                  ? { background: 'linear-gradient(135deg,#92400e,#b45309,#d97706)', boxShadow: '0 8px 32px rgba(180,83,9,0.5)' }
                  : { background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', boxShadow: '0 6px 20px rgba(37,99,235,0.4)' }
            }
            whileTap={{ scale: 0.97 }}
            animate={
              isExpress
                ? { boxShadow: ['0 8px 32px rgba(99,102,241,0.55)', '0 8px 48px rgba(99,102,241,0.8)', '0 8px 32px rgba(99,102,241,0.55)'] }
                : isPriority
                  ? { boxShadow: ['0 8px 32px rgba(180,83,9,0.5)', '0 8px 48px rgba(217,119,6,0.75)', '0 8px 32px rgba(180,83,9,0.5)'] }
                  : {}
            }
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {accepting
              ? <Loader2 size={20} className="animate-spin" />
              : isExpress
                ? <><Zap size={18} strokeWidth={2.5} /> Accept Express Job</>
                : isPriority
                  ? <><Star size={18} strokeWidth={0} className="fill-white" /> Accept Priority Job</>
                  : 'Accept'}
          </motion.button>

          {/* Decline text link */}
          <button
            onClick={onReject}
            className={`w-full mt-2 py-2 text-[12px] font-semibold transition ${isExpress || isPriority ? 'text-white/35 hover:text-white/55' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Not available right now
          </button>
        </div>
      </motion.div>
      </div>
    </motion.div>
  );
}
