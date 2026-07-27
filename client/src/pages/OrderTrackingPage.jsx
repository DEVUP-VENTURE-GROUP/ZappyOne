import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, CheckCircle, MapPin, AlertCircle, Loader2, ShieldCheck, RefreshCw,
  X, Wallet, HeadphonesIcon, FileText,
  Repeat2, CheckCircle2, HelpCircle, Share2, ShieldAlert, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Data + state ─────────────────────────────────────────────────────────
import {
  useGetOrderQuery, useGetOrderTimelineQuery, useGetCancelPreviewQuery,
  useCancelOrderMutation, useRateOrderMutation, useGetPriceRevisionQuery,
  useGetPricingConfigQuery, useSendTipMutation, useGetWalletQuery,
} from '../services/api';
import { API_BASE } from '../services/apiBase';
import { useOrderSocket, useSocketStatus } from '../hooks/useSocket';
import { selectOrder, setActiveOrder, setWorkerLocation } from '../modules/order/orderSlice';
import { selectAuth } from '../modules/auth/authSlice';

// ── Existing tracking modules (preserved intact) ─────────────────────────
import LiveTrackingMap from '../modules/tracking/LiveTrackingMap';
import PageTransition from '../components/common/PageTransition';
import BoostOfferCard from '../components/tracking/BoostOfferCard';
import WorkerProfileSheet from '../components/worker/WorkerProfileSheet';
import TipCard from '../components/tracking/TipCard';
import StatusNotificationBanner from '../components/tracking/StatusNotificationBanner';
import PriceRevisionCard from '../components/tracking/PriceRevisionCard';
import WarrantyCard from '../components/tracking/WarrantyCard';
import SmartMatchSheet from '../components/tracking/SmartMatchSheet';
import QuickRebook from '../components/tracking/QuickRebook';
import CashbackCelebration from '../components/rewards/CashbackCelebration';

// ── The redesigned presentational pieces ─────────────────────────────────
import {
  TrackingHeader, MapETAChip, WorkerRichCard, PremiumTimeline,
  ActivityFeed, BookingSummary, RatingPanel, ProofPhoto, SearchingHero,
  STEPS, feedCopy, firstNameOf,
} from '../components/tracking/redesign';

import { staggerContainer, fadeInUp } from '../lib/animations';

const CANCEL_REASONS = [
  { id: 'changed_mind',      label: 'Changed my mind' },
  { id: 'booked_mistake',    label: 'Booked by mistake' },
  { id: 'taking_too_long',   label: 'Worker is taking too long' },
  { id: 'found_alternative', label: 'Found another solution' },
  { id: 'price_too_high',    label: 'Price seems too high' },
  { id: 'emergency',         label: 'Personal emergency' },
  { id: 'other',             label: 'Other reason' },
];

export default function OrderTrackingPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { accessToken: token } = useSelector(selectAuth);

  // ── Server state ───────────────────────────────────────────────────────
  // Socket delivers real-time state; REST poll is a safety net for missed events.
  const { data, isLoading, refetch } = useGetOrderQuery(id, { pollingInterval: 30000 });
  const [cancelOrder, { isLoading: cancelling }] = useCancelOrderMutation();
  const [rateOrder] = useRateOrderMutation();
  const liveOrder = useSelector(selectOrder);
  const { data: walletData } = useGetWalletQuery();
  const { data: pricingConfigData } = useGetPricingConfigQuery();
  const pricingConfig = pricingConfigData?.pricing ?? {};
  const [sendTip] = useSendTipMutation();

  // ── UI state ───────────────────────────────────────────────────────────
  const [showCancel, setShowCancel]         = useState(false);
  const [showProfile, setShowProfile]       = useState(false);
  const [cancelReason, setCancelReason]     = useState('');
  const [showMatchSheet, setShowMatchSheet] = useState(false);
  const [cashbackPop, setCashbackPop]       = useState(null);
  const [showShareTrip, setShowShareTrip]   = useState(false);
  const [showSOSConfirm, setShowSOSConfirm] = useState(false);
  const completionShownRef = useRef(false);
  const matchShownRef      = useRef(false);
  const mapAnchorRef       = useRef(null);

  // ── Worker-arrived confirmation flow ───────────────────────────────────
  // OTP is only revealed after the user explicitly confirms the worker is present.
  // sessionStorage key persists the confirmation across same-session refreshes.
  const ssKey = `wc:${id}`;
  const [workerConfirmed, setWorkerConfirmed] = useState(() => {
    try { return sessionStorage.getItem(ssKey) === '1'; } catch { return false; }
  });
  const [showArrivedSheet,  setShowArrivedSheet]  = useState(false);
  const [confirmCountdown,  setConfirmCountdown]  = useState(90);
  const [workerNotHereMode, setWorkerNotHereMode] = useState(false);
  const countdownRef    = useRef(null);
  const arrivedShownRef = useRef(workerConfirmed);

  // Cancel-fee preview — loaded lazily when the cancel sheet opens
  const { data: cancelPreview, isFetching: previewLoading } = useGetCancelPreviewQuery(id, {
    skip: !showCancel,
    refetchOnMountOrArgChange: true,
  });

  const order = data?.order;

  // Seed socket store from the initial REST payload
  useEffect(() => {
    if (!order) return;
    dispatch(setActiveOrder({ orderId: order._id, status: order.status }));
    if (order.workerCurrentLocation) dispatch(setWorkerLocation(order.workerCurrentLocation));
  }, [order?._id, dispatch]); // eslint-disable-line

  // Derive live status early — socket wins over REST when active
  const status = liveOrder.activeOrderId === order?._id
    ? liveOrder.status || order?.status
    : order?.status;

  // Real per-status timestamps (statusHistory) — powers timeline + activity feed
  const isLive = ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'].includes(status);
  const { data: timelineData } = useGetOrderTimelineQuery(id, {
    pollingInterval: isLive ? 20000 : 0,
  });

  // Show arrived-confirmation sheet once when worker first marks arrived
  useEffect(() => {
    if (status !== 'arrived' || workerConfirmed || arrivedShownRef.current) return;
    arrivedShownRef.current = true;
    setShowArrivedSheet(true);
    setConfirmCountdown(90);
    setWorkerNotHereMode(false);
  }, [status, workerConfirmed]);

  // Auto-confirm countdown — if user ignores the sheet for 90 s the OTP is revealed
  useEffect(() => {
    if (!showArrivedSheet) { clearInterval(countdownRef.current); return; }
    countdownRef.current = setInterval(() => {
      setConfirmCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current); confirmWorkerArrived(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [showArrivedSheet]); // eslint-disable-line

  function confirmWorkerArrived() {
    setWorkerConfirmed(true);
    setShowArrivedSheet(false);
    try { sessionStorage.setItem(ssKey, '1'); } catch {}
    toast.success('OTP revealed — share it with your worker to start');
  }

  useOrderSocket(order?._id);
  const socketStatus = useSocketStatus();

  // Price revision poll — safety net for missed socket events
  const { data: revisionData } = useGetPriceRevisionQuery(id, {
    skip: !['in_progress', 'arrived'].includes(status),
    pollingInterval: 30000,
  });
  const pendingRevision = revisionData?.revision;

  // Cashback celebration — fires once when order first hits 'completed'
  useEffect(() => {
    if (status !== 'completed' || !order?._id || completionShownRef.current) return;
    completionShownRef.current = true;
    const t = setTimeout(() => {
      const total = order?.pricing?.total || 0;
      const estimated = Math.round(total * 5); // ~5% in paise (server decides exact)
      if (estimated >= 100) setCashbackPop({ amountPaise: estimated });
    }, 1200);
    return () => clearTimeout(t);
  }, [status, order?._id]); // eslint-disable-line

  // SmartMatchSheet — slides up once when a worker is first assigned
  useEffect(() => {
    if (status === 'assigned' && order?.workerId && !matchShownRef.current) {
      matchShownRef.current = true;
      setShowMatchSheet(true);
    }
  }, [status, order?.workerId]);

  const displayStatus = status === 'created' ? 'searching' : status;
  const activeStepIdx = STEPS.findIndex((s) => s.key === displayStatus);

  const pickup = useMemo(() => {
    if (!order?.pickupLocation?.coordinates) return null;
    const [lng, lat] = order.pickupLocation.coordinates;
    return { lat, lng };
  }, [order]);

  // First-seen timestamp per status, from real statusHistory (via /timeline).
  const timesByStatus = useMemo(() => {
    const m = {};
    for (const e of timelineData?.timeline || []) {
      if (e?.status && e?.at && !m[e.status]) m[e.status] = e.at;
    }
    return m;
  }, [timelineData]);

  // Activity-feed events (newest first) built from real timeline entries.
  const feedEvents = useMemo(() => {
    const fn = firstNameOf(order?.workerName);
    const entries = (timelineData?.timeline || [])
      .filter((e) => e?.at && feedCopy(e.status, fn))
      .map((e) => ({ status: e.status, at: e.at, text: feedCopy(e.status, fn) }));
    return entries.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [timelineData, order?.workerName]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (isLoading || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1e293b 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Loader2 size={28} className="text-white animate-spin" />
          </div>
          <p className="text-sm text-white/60 font-medium">Loading order…</p>
        </div>
      </div>
    );
  }

  // ── Derived flags ──────────────────────────────────────────────────────
  const terminal  = ['completed', 'cancelled', 'failed'].includes(status);
  const canCancel = !terminal && !['arrived', 'in_progress'].includes(status);
  const eta         = liveOrder.etaMinutes;
  const distanceKm  = order.pricing?.distanceKm;
  const deviceLabel = [order.deviceBrand, order.deviceModel].filter(Boolean).join(' ');
  const workerVisible = order.workerId && !terminal && status !== 'searching' && status !== 'created';

  // ── Actions ────────────────────────────────────────────────────────────
  async function callWorker() {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/call`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const r = await res.json().catch(() => ({}));
      if (res.ok && r.proxyNumber) { window.location.href = `tel:${r.proxyNumber}`; return; }
      toast.error(r.error || 'Calling is available once a pro is assigned');
    } catch { toast.error('Could not start call'); }
  }

  async function onCancel() {
    try {
      const result = await cancelOrder({ id, reason: cancelReason || 'user_cancelled' }).unwrap();
      setShowCancel(false); setCancelReason('');
      if (result.feeRupees > 0) {
        toast(`Order cancelled — ₹${result.feeRupees} cancellation fee charged`,
          { id: 'order-cancel', icon: '💳', duration: 5000 });
      } else {
        toast.success('Order cancelled — no charge', { id: 'order-cancel' });
      }
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Could not cancel. Try again.');
    }
  }

  function triggerSOS() {
    setShowSOSConfirm(false);
    fetch(`${API_BASE}/api/orders/${id}/sos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: pickup?.lat, lng: pickup?.lng }),
    }).catch(() => {});
    window.location.href = 'tel:112';
    toast('SOS triggered — emergency services dialled', { icon: '🚨', duration: 6000 });
  }

  function shareTripLink() {
    const url = `${window.location.origin}/track?order=${id}`;
    if (navigator.share) {
      navigator.share({ title: 'Track my Zappy service', text: 'Follow my live service tracking', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url)
        .then(() => toast.success('Link copied to clipboard'))
        .catch(() => toast('Copy this link: ' + url, { duration: 8000 }));
    }
  }

  async function openInvoice() {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Invoice not available');
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast.error(err.message || 'Could not load invoice'); }
  }

  function focusMap() {
    mapAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const workerForSheet = order.workerId
    ? { name: order.workerName, rating: order.workerRating, completedJobs: order.workerJobs, etaMinutes: eta }
    : null;

  return (
    <PageTransition>
      {/* Full-screen status change notifications (fires on every status change) */}
      <StatusNotificationBanner
        status={status}
        workerName={order.workerName}
        workerRating={order.workerRating || order.workerJobs ? (order.workerRating ?? null) : null}
        workerJobs={order.workerJobs}
        etaMinutes={eta}
      />

      {cashbackPop && (
        <CashbackCelebration
          amountPaise={cashbackPop.amountPaise}
          totalEarnedPaise={walletData?.wallet?.lifetimeCreditedPaise}
          onClose={() => setCashbackPop(null)}
        />
      )}

      <div className="min-h-screen pb-[164px]" style={{
        background:
          'radial-gradient(1200px 600px at 15% -10%, #DDE6FB 0%, transparent 55%),' +
          'radial-gradient(1000px 700px at 110% 6%, #EDE7FB 0%, transparent 50%),' +
          'linear-gradient(180deg,#EEF2FB 0%, #F1F3FB 100%)',
      }}>
        {/* Socket-degraded banner */}
        <AnimatePresence>
          {socketStatus !== 'connected' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }} className="overflow-hidden"
            >
              <div className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold ${
                socketStatus === 'offline' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
              }`}>
                <Loader2 size={12} className="animate-spin shrink-0" />
                {socketStatus === 'offline'
                  ? 'Live updates unavailable — showing last known state'
                  : 'Reconnecting live updates…'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HEADER ── */}
        <TrackingHeader
          order={order} status={status} eta={eta} distanceKm={distanceKm} terminal={terminal}
          onBack={() => nav('/')} onShare={() => setShowShareTrip(true)}
          onSOS={() => setShowSOSConfirm(true)} onSupport={() => nav('/support')}
        />

        {/* ── BODY ── */}
        <motion.div
          className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-4 space-y-3.5 lg:space-y-0 lg:columns-2 lg:gap-4 lg:[&>*]:mb-3.5 lg:[&>*]:break-inside-avoid"
          variants={staggerContainer} initial="initial" animate="animate"
        >

          {/* Failed state — expansion hype card */}
          {status === 'failed' && (
            <motion.div variants={fadeInUp} className="rounded-[24px] overflow-hidden lg:[column-span:all]"
              style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1a1060 60%, #0f2a5e 100%)', boxShadow: '0 12px 40px rgba(15,23,42,0.45)' }}>
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899,#f59e0b)' }} />
              <div className="px-5 pt-5 pb-6">
                <motion.div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 mx-auto"
                  style={{ background: 'rgba(99,102,241,0.18)', border: '1.5px solid rgba(99,102,241,0.35)' }}
                  animate={{ y: [0, -5, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
                  <span className="text-3xl">🚀</span>
                </motion.div>
                <p className="text-center font-black text-white text-lg leading-snug mb-1">We're launching in your area soon!</p>
                <p className="text-center text-xs font-semibold text-indigo-300 mb-4">
                  You're one of our <span className="text-amber-400">early pioneers</span> in this location
                </p>
                <div className="rounded-xl px-4 py-3 mb-5 text-xs text-indigo-200 text-center leading-relaxed" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  No Zappy workers are in your zone <strong className="text-white">yet</strong> — but we're expanding fast.
                  <br /><span className="text-amber-300 font-semibold">Sit tight — it won't be long.</span>
                </div>
                <div className="space-y-2.5">
                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={() => toast("We'll notify you the moment workers go live in your area!", { icon: '🔔', duration: 4000, style: { fontWeight: 600 } })}
                    className="w-full h-12 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 text-white"
                    style={{ background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)', boxShadow: '0 6px 20px rgba(99,102,241,0.45)' }}>
                    <span>🔔</span> Notify me when live here
                  </motion.button>
                  <button onClick={() => nav(`/book/${order.service}`)}
                    className="w-full h-10 rounded-2xl border font-semibold text-xs flex items-center justify-center gap-1.5"
                    style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)' }}>
                    <RefreshCw size={12} /> Try again anyway
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* MAP HERO (with floating ETA chip) — full width on desktop */}
          {!terminal && (
            <motion.div variants={fadeInUp} ref={mapAnchorRef} className="relative lg:[column-span:all]">
              <LiveTrackingMap
                pickup={pickup}
                workerLocation={liveOrder.workerLocation || (status === 'arrived' && pickup ? pickup : null)}
                service={order.service}
                status={status}
                height="42vh"
                pickupLabel="📍 You're here"
              />
              <MapETAChip eta={eta} distanceKm={distanceKm} status={status} />
            </motion.div>
          )}

          {/* Cancelled terminal card */}
          {status === 'cancelled' && (
            <motion.div variants={fadeInUp} className="rounded-[24px] bg-white border border-slate-900/5 p-6 text-center lg:[column-span:all]"
              style={{ boxShadow: '0 12px 32px -4px rgba(15,23,42,0.08)' }}>
              <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={30} strokeWidth={2} className="text-red-500" />
              </div>
              <p className="font-black text-slate-900 text-lg">Order cancelled</p>
              <p className="text-sm text-slate-500 mt-1.5 max-w-xs mx-auto">This order was cancelled and is no longer being tracked.</p>
              {order.workerId && <p className="text-xs text-slate-400 mt-1">Your worker has been notified and released.</p>}
              <button onClick={() => nav(`/book/${order.service}`)} className="mt-5 w-full py-3 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-slate-800 transition">
                Book again
              </button>
            </motion.div>
          )}

          {/* SEARCHING hero — replaces the empty worker slot with a live-search visual */}
          {['searching', 'created'].includes(status) && (
            <SearchingHero etaMinutes={eta} />
          )}

          {/* WORKER card (rich) — full width on desktop */}
          {workerVisible && (
            <div className="lg:[column-span:all]">
              <WorkerRichCard
                order={order} eta={eta} status={status}
                onCall={callWorker} onChat={() => nav(`/orders/${id}/chat`)}
                onLive={focusMap} onProfile={() => setShowProfile(true)}
              />
            </div>
          )}

          {/* LIVE STATUS timeline */}
          {!['cancelled', 'failed'].includes(status) && (
            <PremiumTimeline activeStepIdx={activeStepIdx} timesByStatus={timesByStatus} />
          )}

          {/* LIVE UPDATES feed */}
          {!['cancelled', 'failed'].includes(status) && (
            <ActivityFeed events={feedEvents} />
          )}

          {/* OTP flow — three states: locked / confirm / revealed */}
          <AnimatePresence>
            {order.otp && (
              ['assigned', 'on_the_way'].includes(status) ? (
                <motion.div key="otp-locked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl overflow-hidden ring-1 ring-slate-100" style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }}>
                  <div className="px-4 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                      <ShieldCheck size={18} strokeWidth={2} className="text-slate-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-extrabold text-slate-700">Service OTP — locked</p>
                      <p className="text-xs text-slate-400 mt-0.5">Revealed when your worker marks arrival</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-7 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                          <span className="text-sm font-black text-slate-300 blur-[3px]">•</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : status === 'arrived' && !workerConfirmed ? (
                <motion.div key="otp-pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-[24px] overflow-hidden border border-violet-200/50" style={{ background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', boxShadow: '0 8px 24px -4px rgba(139, 92, 246, 0.15)' }}>
                  <div className="px-4 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                      <HelpCircle size={18} strokeWidth={2} className="text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-extrabold text-violet-900">Confirm the worker is here</p>
                      <p className="text-xs text-violet-500 mt-0.5">Your OTP will appear once you confirm</p>
                    </div>
                    <button onClick={() => setShowArrivedSheet(true)} className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold">Confirm</button>
                  </div>
                </motion.div>
              ) : status === 'arrived' && workerConfirmed ? (
                <motion.div key="otp-card" initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 260 }} className="rounded-[24px] overflow-hidden border border-white/10"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', boxShadow: '0 12px 32px -4px rgba(124,58,237,0.4)' }}>
                  <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                    <ShieldCheck size={15} strokeWidth={2} className="text-white/80" />
                    <p className="text-xs font-extrabold text-white/80 uppercase tracking-widest">Worker is here — share your OTP</p>
                  </div>
                  <div className="flex justify-center gap-3 px-4 pb-3">
                    {String(order.otp).split('').map((digit, i) => (
                      <div key={i} className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}>
                        <span className="text-4xl font-black text-white tracking-tight">{digit}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-white/70 text-center font-semibold pb-4 px-4">Tell this code to your worker to start the service</p>
                </motion.div>
              ) : null
            )}
          </AnimatePresence>

          {/* BOOST card — while searching */}
          {status === 'searching' && (pricingConfig.boostEnabled ?? true) && (
            <motion.div variants={fadeInUp}>
              <BoostOfferCard
                orderId={id} baseTotal={order.pricing?.total || 0} sendTip={sendTip}
                boostOptions={pricingConfig.boostOptions}
                boostMax={pricingConfig.boostMaxPaise ? Math.round(pricingConfig.boostMaxPaise / 100) : undefined}
                boostEnabled={pricingConfig.boostEnabled ?? true}
              />
            </motion.div>
          )}

          {/* Price revision alert */}
          {pendingRevision && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <PriceRevisionCard revision={{ ...pendingRevision, orderId: id }} onResolved={() => refetch()} />
            </motion.div>
          )}

          {/* BOOKING SUMMARY */}
          {status !== 'failed' && (
            <BookingSummary order={order} deviceLabel={deviceLabel} onReceipt={openInvoice} />
          )}

          {/* Completion proof photos */}
          {status === 'completed' && order.completionPhotos?.length > 0 && (
            <motion.div variants={fadeInUp} className="rounded-2xl bg-white ring-1 ring-slate-100 p-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <CheckCircle size={15} strokeWidth={2} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Work Completed</p>
                  <p className="text-sm font-bold text-[#0F172A]">Proof of work photos</p>
                </div>
              </div>
              <div className={`grid gap-2 ${order.completionPhotos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {order.completionPhotos.map((url, i) => <ProofPhoto key={i} url={url} index={i} />)}
              </div>
            </motion.div>
          )}

          {/* Completed: invoice + support */}
          {status === 'completed' && (
            <motion.div className="flex gap-2" variants={fadeInUp}>
              <button onClick={openInvoice} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white ring-1 ring-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
                <FileText size={15} strokeWidth={2} className="text-blue-600" /> Invoice
              </button>
              <button onClick={() => nav('/support')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white ring-1 ring-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
                <HeadphonesIcon size={15} strokeWidth={2} className="text-violet-600" /> Get Help
              </button>
            </motion.div>
          )}

          {/* Completed: book same worker again */}
          {status === 'completed' && order.workerId && (
            <motion.div variants={fadeInUp}>
              <motion.button onClick={() => nav(`/book/${order.service}?preferredWorker=${order.workerId}`)} whileTap={{ scale: 0.97 }}
                className="w-full h-14 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
                <Repeat2 size={18} strokeWidth={2.5} />
                Book {order.workerName ? firstNameOf(order.workerName) : 'Same Worker'} Again
              </motion.button>
            </motion.div>
          )}

          {/* Warranty */}
          {status === 'completed' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <WarrantyCard orderId={id} />
            </motion.div>
          )}

          {/* Tip */}
          {status === 'completed' && !order.userRating && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <TipCard orderId={id} onDone={refetch} tipOptions={pricingConfig.tipOptions}
                tipMax={pricingConfig.tipMaxPaise ? Math.round(pricingConfig.tipMaxPaise / 100) : undefined} />
            </motion.div>
          )}

          {/* Quick rebook */}
          {status === 'completed' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <QuickRebook service={order.service} workerName={order.workerName} workerRating={order.workerRating} lastTotal={order.pricing?.total} />
            </motion.div>
          )}

          {/* Trust strip */}
          {!terminal && (
            <div className="flex items-center justify-center gap-2 pt-1 text-[#647084] text-[11.5px] font-semibold">
              <ShieldCheck size={14} className="text-[#12A150]" />
              Payment protected · Verified professionals
            </div>
          )}

          {order.workerId && (
            <WorkerProfileSheet workerId={order.workerId} open={showProfile} onClose={() => setShowProfile(false)} />
          )}
        </motion.div>

        {/* ── FLOATING BOTTOM ACTION BAR ── */}
        <div className="fixed bottom-0 inset-x-0 z-30" style={{
          background: 'linear-gradient(180deg, rgba(241,243,251,0) 0%, rgba(241,243,251,.92) 26%, #F1F3FB 62%)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}>
          <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2.5">
            {status === 'completed' && !order.userRating && (
              <RatingPanel onRate={async (rating) => {
                try { await rateOrder({ id, rating }).unwrap(); toast.success('Thanks for your feedback!'); refetch(); }
                catch (err) { toast.error(err.data?.error || 'Could not submit rating'); }
              }} />
            )}

            {terminal ? (
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => nav('/')}
                className="w-full h-14 rounded-[18px] text-white font-extrabold text-base flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#2E86FF,#2563FF)', boxShadow: '0 12px 26px -8px rgba(37,99,235,.6)' }}>
                Back to Home
              </motion.button>
            ) : (
              <>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => nav('/support')}
                  className="w-full h-14 rounded-[18px] text-white font-extrabold text-base flex items-center justify-center gap-2.5"
                  style={{ background: 'linear-gradient(135deg,#2E86FF,#2563FF)', boxShadow: '0 12px 26px -8px rgba(37,99,235,.6)' }}>
                  <HeadphonesIcon size={19} strokeWidth={2.2} /> Need help?
                </motion.button>
                {canCancel && !showCancel && (
                  <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowCancel(true)}
                    className="w-full h-12 rounded-[16px] font-bold text-sm flex items-center justify-center gap-2"
                    style={{ border: '1.5px solid #DBE2EE', background: 'rgba(255,255,255,.7)', color: '#647084' }}>
                    <X size={16} strokeWidth={2.4} /> Cancel booking
                  </motion.button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── SHEETS ── */}
        {/* Cancel — with real fee preview + reason picker */}
        <AnimatePresence>
          {showCancel && (
            <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancel(false)} />
              <motion.div className="relative bg-white rounded-t-[28px] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-4" />
                <div className="flex items-center justify-between px-5 mb-4">
                  <p className="font-extrabold text-[#0F172A] text-lg">Cancel booking?</p>
                  <button onClick={() => setShowCancel(false)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                    <X size={16} strokeWidth={2.5} className="text-slate-500" />
                  </button>
                </div>

                <div className="mx-5 mb-4">
                  {previewLoading ? (
                    <div className="h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                      <Loader2 size={18} className="animate-spin text-slate-400" />
                    </div>
                  ) : cancelPreview ? (
                    <div className={`rounded-2xl p-4 flex items-center gap-3 ${cancelPreview.isFree ? 'bg-green-50 ring-1 ring-green-100' : 'bg-red-50 ring-1 ring-red-100'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cancelPreview.isFree ? 'bg-green-100' : 'bg-red-100'}`}>
                        {cancelPreview.isFree
                          ? <CheckCircle size={18} strokeWidth={2} className="text-green-600" />
                          : <Wallet size={18} strokeWidth={2} className="text-red-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm ${cancelPreview.isFree ? 'text-green-800' : 'text-red-800'}`}>
                          {cancelPreview.isFree
                            ? cancelPreview.secsLeft > 0
                              ? `Free cancel — ${Math.floor(cancelPreview.secsLeft / 60)}m ${cancelPreview.secsLeft % 60}s left`
                              : 'No cancellation fee'
                            : `₹${cancelPreview.feeRupees} cancellation fee`}
                        </p>
                        <p className={`text-xs mt-0.5 ${cancelPreview.isFree ? 'text-green-600' : 'text-red-600'}`}>{cancelPreview.message}</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <p className="px-5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Why are you cancelling?</p>
                <div className="px-5 space-y-1 mb-5 max-h-48 overflow-y-auto">
                  {CANCEL_REASONS.map((r) => (
                    <button key={r.id} onClick={() => setCancelReason(r.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition ${cancelReason === r.id ? 'bg-[#0F172A] text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                      <span className="text-sm font-semibold">{r.label}</span>
                      {cancelReason === r.id && <CheckCircle size={14} strokeWidth={2.5} className="text-white shrink-0" />}
                    </button>
                  ))}
                </div>

                <div className="px-5 flex gap-3">
                  <button onClick={() => setShowCancel(false)} className="flex-1 h-12 rounded-2xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 transition">Keep Booking</button>
                  <button onClick={onCancel} disabled={cancelling || !cancelReason}
                    className="flex-1 h-12 rounded-2xl bg-red-600 text-white font-extrabold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {cancelling && <Loader2 size={16} className="animate-spin" />}
                    {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showMatchSheet && <SmartMatchSheet worker={workerForSheet} onDismiss={() => setShowMatchSheet(false)} />}
        </AnimatePresence>

        {/* SOS */}
        <AnimatePresence>
          {showSOSConfirm && (
            <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSOSConfirm(false)} />
              <motion.div className="relative bg-white rounded-t-[28px] pb-[max(2rem,env(safe-area-inset-bottom))]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-5" />
                <div className="flex flex-col items-center px-6 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center" style={{ boxShadow: '0 8px 24px rgba(239,68,68,0.3)' }}>
                    <ShieldAlert size={28} strokeWidth={2} className="text-red-600" />
                  </div>
                  <p className="text-xl font-black text-[#0F172A] text-center">Emergency SOS?</p>
                  <p className="text-sm text-slate-500 text-center leading-relaxed">
                    This will call <strong>112 (Emergency Services)</strong> and notify Zappy support about your location. Only use in a genuine emergency.
                  </p>
                  <div className="w-full space-y-2.5 mt-2">
                    <motion.button onClick={triggerSOS} whileTap={{ scale: 0.97 }}
                      className="w-full h-14 rounded-2xl bg-red-600 text-white font-extrabold text-base flex items-center justify-center gap-2.5"
                      style={{ boxShadow: '0 8px 24px rgba(220,38,38,0.4)' }}>
                      <ShieldAlert size={20} strokeWidth={2.5} /> Call 112 — I Need Help
                    </motion.button>
                    <button onClick={() => setShowSOSConfirm(false)} className="w-full h-12 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
                      Cancel — I'm safe
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Share trip */}
        <AnimatePresence>
          {showShareTrip && (
            <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="absolute inset-0 bg-black/50" onClick={() => setShowShareTrip(false)} />
              <motion.div className="relative bg-white rounded-t-[28px] pb-[max(2rem,env(safe-area-inset-bottom))]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-5" />
                <div className="flex flex-col items-center px-6 gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Share2 size={24} strokeWidth={2} className="text-blue-600" />
                  </div>
                  <p className="text-lg font-black text-[#0F172A] text-center">Share Trip</p>
                  <p className="text-sm text-slate-500 text-center leading-relaxed">
                    Share your live tracking link with a trusted contact so they can follow your service in real time.
                  </p>
                  <div className="w-full flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-mono text-slate-600 flex-1 truncate">{window.location.origin}/track?order={id.slice(-8)}…</p>
                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/track?order=${id}`).then(() => toast.success('Link copied!')).catch(() => {})}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                      <Copy size={13} className="text-slate-500" />
                    </button>
                  </div>
                  <div className="w-full space-y-2.5">
                    <motion.button onClick={() => { shareTripLink(); setShowShareTrip(false); }} whileTap={{ scale: 0.97 }}
                      className="w-full h-14 rounded-2xl font-extrabold text-white flex items-center justify-center gap-2.5"
                      style={{ background: 'linear-gradient(135deg,#0F172A,#1e293b)', boxShadow: '0 8px 24px rgba(15,23,42,0.3)' }}>
                      <Share2 size={18} strokeWidth={2.5} /> Share Now
                    </motion.button>
                    <button onClick={() => setShowShareTrip(false)} className="w-full h-12 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">Close</button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Worker-arrived confirmation */}
        <AnimatePresence>
          {showArrivedSheet && (
            <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div className="relative bg-white rounded-t-[32px] pb-[max(1.75rem,env(safe-area-inset-bottom))]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-5" />
                <div className="flex flex-col items-center px-6 pb-2">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-black text-xl mb-3 shadow-lg"
                    style={{ boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}>
                    {(order.workerName || 'W').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-xl font-black text-[#0F172A] text-center leading-tight">
                    Is {order.workerName ? firstNameOf(order.workerName) : 'your worker'} at your door?
                  </p>
                  <p className="text-sm text-slate-400 mt-1.5 text-center">They've marked themselves as arrived. Confirm so your OTP unlocks.</p>
                </div>
                <div className="flex flex-col items-center mt-4 mb-5">
                  <div className="relative w-16 h-16">
                    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#7c3aed" strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 26}`} strokeDashoffset={`${2 * Math.PI * 26 * (1 - confirmCountdown / 90)}`}
                        style={{ transition: 'stroke-dashoffset 1s linear' }} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-violet-700">{confirmCountdown}s</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 font-medium">OTP auto-reveals in {confirmCountdown} s</p>
                </div>
                <div className="px-5 space-y-3">
                  {!workerNotHereMode ? (
                    <>
                      <motion.button onClick={confirmWorkerArrived} whileTap={{ scale: 0.97 }}
                        className="w-full h-14 rounded-2xl text-white font-extrabold text-base flex items-center justify-center gap-2.5"
                        style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}>
                        <CheckCircle2 size={20} strokeWidth={2.5} /> Yes, they're here — show OTP
                      </motion.button>
                      <button onClick={() => { clearInterval(countdownRef.current); setWorkerNotHereMode(true); }}
                        className="w-full h-12 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">
                        No, they haven't arrived yet
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl bg-red-50 ring-1 ring-red-100 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle size={18} strokeWidth={2} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-extrabold text-red-800">Worker hasn't arrived?</p>
                          <p className="text-xs text-red-500 mt-0.5">Call them first — sometimes GPS delay causes an early ping. If they're genuinely not there, report it.</p>
                        </div>
                      </div>
                      {order.workerId && (
                        <button onClick={callWorker} className="w-full h-11 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center justify-center gap-2">
                          <Phone size={15} strokeWidth={2} /> Call Worker
                        </button>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => setWorkerNotHereMode(false)} className="flex-1 h-10 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Back</button>
                        <button onClick={() => { setShowArrivedSheet(false); setWorkerNotHereMode(false); toast('Sheet closed — tap "Confirm" when ready', { icon: '⏳' }); }}
                          className="flex-1 h-10 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Wait & check later</button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
