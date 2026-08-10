import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, MapPin, Navigation, Loader2, Briefcase,
  Flame, ChevronRight, TrendingUp, CheckCircle,
  AlertTriangle, X, Star, Award, Target,
  Wifi, WifiOff, BadgeCheck, Trophy, Zap, Gem,
  Droplets, Bolt, Wind, Hammer, Users, Car,
  Sparkles, Paintbrush2, Wrench, Clock, BarChart2,
  ChevronDown, ChevronUp, ArrowRight, BadgeIndianRupee,
  ShieldCheck, TrendingDown, Siren, ArrowUpRight,
  ArrowDownRight, Minus, Smartphone, Battery, Layers,
  Home, Bike, Fuel, Pencil, Bell, Building2, ArrowRightLeft,
  GraduationCap, Scale, Wallet, Menu
} from 'lucide-react';
import {
  useGetWorkerMeQuery, useGoOnlineMutation, useGoOfflineMutation,
  useGetEarningsQuery, useWorkerAcceptMutation, useWorkerRejectMutation,
  useGetKycStatusQuery, useGetWorkerOrdersQuery, useGetDemandZonesQuery,
  useGetWorkerLeaderboardQuery, useListNotificationsQuery, useLogoutMutation, useRevokeAllSessionsMutation,
  useGetWorkerGoalsQuery, useGetZoneBenchmarkQuery,
} from '../services/api';
import { useWorkerOfferSocket } from '../hooks/useSocket';
import { setOffer, clearOffer, setOnline, selectWorker } from '../modules/worker/workerSlice';
import { selectAuth, logout } from '../modules/auth/authSlice';
import { useGeolocation } from '../hooks/useGeolocation';
import { reverseGeocode } from '../utils/reverseGeocode';
import { getSocket } from '../services/socket';
import { ZappyLogo } from '../components/common/ZappyLogo';
import WorkerOnboarding from './WorkerOnboarding';
import ReadyModeCard from '../components/worker/ReadyModeCard';
import {
  Avatar, GreetingCard, StatCard, Panel, EarningsOverview, PerformanceGrid,
  QuickAccess, JobRequests, TodaySchedule, RecentlyCompleted,
  WorkerSidebar, WorkerBottomNav, OnlineControl, NAV_ITEMS, inr,
} from '../components/worker/DashboardUI';
import toast from 'react-hot-toast';

/* ─── Constants (mirror backend incentive.service.js) ─────────── */

const MILESTONES = [
  { jobs: 10,  bonusRs: 200  },
  { jobs: 25,  bonusRs: 500  },
  { jobs: 50,  bonusRs: 1000 },
  { jobs: 100, bonusRs: 2500 },
  { jobs: 200, bonusRs: 5000 },
];

const BADGES = [
  { id: 'first',   label: 'Starter',     Icon: Zap,     threshold: 1   },
  { id: 'five',    label: '5 Jobs',       Icon: Star,    threshold: 5   },
  { id: 'twenty',  label: '25 Jobs',      Icon: Flame,   threshold: 25  },
  { id: 'fifty',   label: 'Elite',        Icon: Gem,     threshold: 50  },
  { id: 'century', label: 'Legend',       Icon: Trophy,  threshold: 100 },
];

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

/* ─── Notification bell with live unread count ───────────────── */
function NotifBell({ token, onTap }) {
  const { data } = useListNotificationsQuery(
    { page: 1, unreadOnly: true },
    { skip: !token, pollingInterval: 60000 }
  );
  const [bump, setBump] = useState(0); // real-time socket bumps

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const handler = () => setBump((b) => b + 1);
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [token]);

  const count = (data?.unread ?? 0) + bump;

  return (
    <motion.button
      onClick={onTap}
      aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
      whileTap={{ scale: 0.9 }}
    >
      <Bell size={17} strokeWidth={2.2} />
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 1.4 }}
          animate={{ scale: 1 }}
          className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-black text-white"
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      )}
    </motion.button>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getLast7Days(breakdown = []) {
  const byDate = Object.fromEntries(breakdown.map((d) => [d.date, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return byDate[key] || { date: key, earningsPaise: 0, jobs: 0 };
  });
}

/* ─── Offer alert sound ──────────────────────────────────────────────────────
 * Browsers create an AudioContext in the `suspended` state unless it is started
 * by a user gesture. An offer arrives over a socket (no gesture), so building a
 * fresh context per alert produced a SILENT beep every time. We keep ONE context
 * and unlock/resume it on the worker's first tap, then resume before each play. */
let _audioCtx = null;
function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx) _audioCtx = new AC();
  return _audioCtx;
}
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
}

function playOfferAlert() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // Resume if the browser suspended it (backgrounded tab / not yet unlocked).
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    [[0, 880], [0.2, 1100], [0.4, 880]].forEach(([delay, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch {}
}

function computeTrustScore(acceptRate, rating, completedJobs) {
  return Math.min(100, Math.round(
    (acceptRate * 0.35) +
    ((rating / 5) * 100 * 0.45) +
    (Math.min(completedJobs / 20, 1) * 100 * 0.20),
  ));
}

/* ─── Main ───────────────────────────────────────────────────── */

export default function WorkerDashboard() {
  const nav      = useNavigate();
  const dispatch = useDispatch();
  const worker   = useSelector(selectWorker);
  const { accessToken: token } = useSelector(selectAuth);

  // 60s poll — profile/availability rarely changes mid-session; socket events drive
  // job-offer state changes, so there's no user-visible lag from a slower REST poll.
  const { data: meData, refetch: refetchMe } = useGetWorkerMeQuery(undefined, { pollingInterval: 60000, skip: !token });
  const { data: todayData }   = useGetEarningsQuery('today',  { skip: !token });
  const { data: weekData }    = useGetEarningsQuery('week',   { skip: !token });
  const { data: kycData }     = useGetKycStatusQuery(undefined, { skip: !token });
  const { data: jobsData }    = useGetWorkerOrdersQuery(1,    { skip: !token });
  const { data: notifData }   = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !token, pollingInterval: 60000 });
  const unreadCount = notifData?.unread ?? 0;

  // Profile avatar — fetched from server proxy (permanent, no URL expiry)
  const [avatarUrl, setAvatarUrl] = useState(null);
  useEffect(() => {
    if (!token || !meData?.worker?.profilePhotoKey) return;
    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/workers/me/avatar`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => blob && setAvatarUrl(URL.createObjectURL(blob)))
      .catch(() => {});
  }, [token, meData?.worker?.profilePhotoKey]);

  const [goOnline]  = useGoOnlineMutation();
  const [goOffline] = useGoOfflineMutation();
  const [acceptOffer, { isLoading: accepting }] = useWorkerAcceptMutation();
  const [rejectOffer] = useWorkerRejectMutation();
  const [callLogout]     = useLogoutMutation();
  const [revokeAll]      = useRevokeAllSessionsMutation();

  const { getCurrent, watch } = useGeolocation();
  const watchRef   = useRef(null);
  const [myLat, setMyLat] = useState(null);
  const [myLng, setMyLng] = useState(null);
  const [gpsOn,        setGpsOn]        = useState(false);
  const [areaName,     setAreaName]     = useState(null);
  const [toggling,     setToggling]     = useState(false);
  const [onlineTimer,  setOnlineTimer]  = useState(0); // seconds online this session
  const [jobTab,       setJobTab]       = useState('new');
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const onlineStart = useRef(null);

  const me          = meData?.worker;
  const isOnline    = me?.isOnline ?? false;
  const isBusy      = isOnline && !!me?.currentOrderId;
  const kycApproved = kycData?.kyc?.status === 'approved';
  const kycStatus   = kycData?.kyc?.status;
  const canGoOnline = kycApproved;

  const completedJobs = me?.completedJobs ?? 0;
  const rating        = me?.rating ?? null; // null until first real rating
  const penalties     = me?.penalties ?? {};
  const totalOffers   = penalties.totalOffers ?? 0;
  const totalRejects  = penalties.totalRejects ?? 0;
  const totalCancels  = penalties.totalCancels ?? 0;

  const hasOfferData  = totalOffers > 0;
  const hasJobData    = completedJobs > 0;
  const hasRatingData = hasJobData && rating !== null;

  const acceptRate  = hasOfferData ? Math.round(((totalOffers - totalRejects) / totalOffers) * 100) : null;
  const cancelRate  = hasJobData   ? Math.round((totalCancels / completedJobs) * 100)               : null;
  const trustScore  = (hasOfferData || hasJobData)
    ? computeTrustScore(acceptRate ?? 100, rating ?? 5, completedJobs)
    : null;

  const chart7d  = getLast7Days(weekData?.dailyBreakdown);
  const chartMax = Math.max(...chart7d.map((d) => d.earningsPaise), 1);
  const hasChartData = chart7d.some((d) => d.earningsPaise > 0);

  const nextMilestone  = MILESTONES.find((m) => m.jobs > completedJobs) ?? null;
  const prevMilestone  = [...MILESTONES].reverse().find((m) => m.jobs <= completedJobs);
  const msProgress     = nextMilestone
    ? Math.round(((completedJobs - (prevMilestone?.jobs ?? 0)) /
        (nextMilestone.jobs - (prevMilestone?.jobs ?? 0))) * 100)
    : 100;

  const todayRs      = todayData?.earningsRupees ?? 0;
  const todayJobs    = todayData?.jobs ?? 0;
  const weekRs       = weekData?.earningsRupees ?? 0;
  const weekAvgRs    = weekData?.avgEarningPerJobRupees ?? 0;
  const totalWallet  = Math.round((me?.wallet?.totalEarnings ?? 0) / 100);

  // Online timer. Prefer the server `onlineSince` so the clock is accurate
  // across a page refresh or a switch between phone and web; fall back to a
  // local session start only if the server hasn't stamped it yet.
  useEffect(() => {
    if (!isOnline) { onlineStart.current = null; setOnlineTimer(0); return undefined; }
    const serverBase = me?.onlineSince ? Date.parse(me.onlineSince) : null;
    const base = serverBase || (onlineStart.current ?? (onlineStart.current = Date.now()));
    const tick = () => setOnlineTimer(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOnline, me?.onlineSince]);

  useEffect(() => { dispatch(setOnline(isOnline)); }, [isOnline, dispatch]);

  // Real-time KYC rejection — admin can revoke while worker is online
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const handleKycRejected = ({ status, reason }) => {
      dispatch(setOnline(false));
      toast.error(
        reason ? `KYC rejected: ${reason}` : 'Your KYC was not approved. Please resubmit.',
        { duration: 8000 }
      );
      // Refetch worker profile so KYC banner re-appears immediately
      refetchMe?.();
    };
    socket.on('kyc.rejected', handleKycRejected);
    return () => socket.off('kyc.rejected', handleKycRejected);
  }, [token, dispatch]);

  // GPS permission probe
  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' }).then((r) => {
      setGpsOn(r.state === 'granted');
      r.onchange = () => setGpsOn(r.state === 'granted');
    }).catch(() => {});
  }, []);

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
    refetchMe();
    playOfferAlert();
    try { navigator.vibrate?.([300, 100, 300, 100, 300]); } catch {}
    toast.success(`Job assigned to you! ₹${data.price ?? ''}`, { duration: 6000 });
    setTimeout(() => nav(`/worker/jobs/${data.orderId}`), 1500);
  }, [dispatch, nav, refetchMe]);

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
    refetchMe();
    toast.error('Your job was reassigned. Stay online for the next one.', { duration: 5000 });
  }, [refetchMe]);

  useWorkerOfferSocket(handleOffer, handleOfferCancelled, handleForceAssigned, handleOfferBoosted, handleJobPulled);

  // Continuous location broadcast — socket (fast) + REST fallback (reliable)
  // Client-side gates: 4s time throttle + 10m distance threshold.
  // Server enforces its own 1s throttle and 5m threshold as a second layer.
  const lastRestRef   = useRef(0);
  const lastSentPosRef = useRef(null); // { lat, lng } of last actually-sent position
  useEffect(() => {
    if (!isOnline || !token) { watchRef.current?.(); watchRef.current = null; return; }
    const socket = getSocket(token);
    let lastSocket = 0;

    function haverMetres(a, b) {
      const R = 6371000;
      const dLat = (b.lat - a.lat) * Math.PI / 180;
      const dLng = (b.lng - a.lng) * Math.PI / 180;
      const x = Math.sin(dLat / 2) ** 2
        + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    let stationaryState = { lastMovedAt: Date.now() };

    watchRef.current = watch(
      (pos) => {
        setGpsOn(true);
        setMyLat(pos.lat);
        setMyLng(pos.lng);
        const now = Date.now();
        const cur = { lat: pos.lat, lng: pos.lng };

        const distMoved = lastSentPosRef.current ? haverMetres(lastSentPosRef.current, cur) : 999;
        const moved = distMoved >= 15;
        if (moved) stationaryState.lastMovedAt = now;

        // Parked workers: heartbeat every 60s. Moving workers: every 4s.
        const isParked = (now - stationaryState.lastMovedAt) > 45000;
        const minInterval = isParked ? 60000 : 4000;

        if (moved || now - lastSocket >= minInterval) {
          lastSocket = now;
          if (moved) lastSentPosRef.current = cur;
          socket.emit('worker:location', {
            lat: pos.lat,
            lng: pos.lng,
            orderId: me?.currentOrderId,
            hdg: pos.heading ?? null,
            spd: pos.speed ?? null,
            acc: pos.accuracy ?? null,
          });
        }

        // REST backup: every 30s (Mongo alive heartbeat, survives socket reconnect)
        if (now - lastRestRef.current >= 30000) {
          lastRestRef.current = now;
          const locBody = { lat: pos.lat, lng: pos.lng };
          if (me?.currentOrderId) locBody.orderId = me.currentOrderId;
          const baseUrl = import.meta.env.VITE_API_URL || '';
          fetch(`${baseUrl}/api/workers/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(locBody),
          }).catch(() => {});
        }
      },
      () => setGpsOn(false),
    );
    return () => { watchRef.current?.(); watchRef.current = null; };
  }, [isOnline, token, watch, me?.currentOrderId]);

  // Onboarding gate — placed AFTER all hooks so React's hook count stays constant
  if (meData && !me?.onboardingComplete) {
    return <WorkerOnboarding onComplete={refetchMe} />;
  }

  async function toggleOnline() {
    if (!canGoOnline) { toast.error('KYC required'); nav('/worker/kyc'); return; }
    if (isBusy) { toast('Finish your active job first'); return; }
    setToggling(true);
    try {
      if (isOnline) {
        await goOffline().unwrap();
        setAreaName(null);
        toast.success('You are now offline');
      } else {
        const pos = await getCurrent();
        setGpsOn(true);
        // Poor accuracy (>500m = IP-based location on laptops) — warn the worker
        // so they know their position in the dispatch system may be wrong.
        if (pos.accuracy && pos.accuracy > 500) {
          toast('⚠️ GPS accuracy is low — your location may be off. Use a phone for accurate dispatch.', {
            duration: 6000,
            icon: null,
          });
        }
        await goOnline({ lat: pos.lat, lng: pos.lng }).unwrap();
        toast.success('You are now online');
        // Reverse geocode in background — non-blocking
        reverseGeocode(pos.lat, pos.lng).then(({ primary, secondary }) => {
          setAreaName(secondary ? `${primary}, ${secondary.split(',')[0]}` : primary);
        }).catch(() => {});
      }
      refetchMe();
    } catch (err) {
      toast.error(err.data?.error || err.message || 'Failed');
    } finally {
      setToggling(false);
    }
  }

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

  /* ── Derived view state (all from real API data) ─────────────────────── */
  const firstName   = (me?.name || 'Worker').trim().split(/\s+/)[0];
  const initials    = (me?.name || 'W').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const walletBalanceRs = Math.round((me?.wallet?.balance ?? 0) / 100);
  const totalJobs   = me?.totalJobs ?? 0;
  const completionRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : null;
  const hoursLabel  = isOnline
    ? `${String(Math.floor(onlineTimer / 3600)).padStart(2, '0')}h ${String(Math.floor((onlineTimer % 3600) / 60)).padStart(2, '0')}m`
    : '00h 00m';

  // Buckets from the worker's own order list + the live socket offer.
  const orders       = jobsData?.orders ?? [];
  const ONGOING      = ['on_the_way', 'arrived', 'in_progress'];
  const acceptedJobs = orders.filter((o) => o.status === 'assigned');
  const ongoingJobs  = orders.filter((o) => ONGOING.includes(o.status));
  const doneJobs     = orders.filter((o) => o.status === 'completed');
  const newJobs      = worker.currentOffer ? [worker.currentOffer] : [];
  const startToday   = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday     = new Date(startToday.getTime() + 86400000);
  const scheduledToday = orders.filter((o) =>
    o.scheduledAt && new Date(o.scheduledAt) >= startToday && new Date(o.scheduledAt) < endToday
    && !['completed', 'cancelled'].includes(o.status));

  const jobTabs = [
    { key: 'new',       label: 'New',       count: newJobs.length },
    { key: 'accepted',  label: 'Accepted',  count: acceptedJobs.length },
    { key: 'ongoing',   label: 'Ongoing',   count: ongoingJobs.length },
    { key: 'completed', label: 'Completed', count: doneJobs.length },
  ];
  const jobsForTab = ({ new: newJobs, accepted: acceptedJobs, ongoing: ongoingJobs, completed: doneJobs }[jobTab]) ?? [];

  // Week-over-week from the 30-day daily breakdown the earnings API returns.
  const byDatePaise = Object.fromEntries((weekData?.dailyBreakdown ?? []).map((d) => [d.date, d.earningsPaise]));
  const sumDays = (from, to) => {
    let s = 0;
    for (let i = from; i < to; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      s += byDatePaise[d.toISOString().slice(0, 10)] || 0;
    }
    return s;
  };
  const thisWeekPaise = sumDays(0, 7);
  const lastWeekPaise = sumDays(7, 14);
  const deltaPct = lastWeekPaise > 0
    ? Math.round(((thisWeekPaise - lastWeekPaise) / lastWeekPaise) * 100)
    : (thisWeekPaise > 0 ? 100 : 0);
  const chartPoints = chart7d.map((d) => ({
    label: new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }),
    value: Math.round(d.earningsPaise / 100),
  }));

  const perfItems = [
    { label: 'Completion Rate', value: completionRate != null ? `${completionRate}%` : '—', sub: `${completedJobs} jobs` },
    { label: 'Acceptance Rate', value: acceptRate != null ? `${acceptRate}%` : '—', sub: hasOfferData ? `${totalOffers} offers` : 'No offers yet' },
    { label: 'Jobs Completed',  value: weekData?.jobs ?? 0, sub: 'This week' },
    { label: 'Total Earnings',  value: inr(weekRs), sub: 'This week' },
  ];

  const ratingDisplay = hasRatingData ? Number(rating).toFixed(1) : '0.0';
  const locationLabel = areaName || null;
  const openJob = (j) => nav(`/worker/jobs/${j._id}`);

  function goSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function handleNav(item) {
    setDrawerOpen(false);
    if (item?.scroll) {
      if (item.scroll === 'job-requests') setJobTab(newJobs.length ? 'new' : 'accepted');
      goSection(item.scroll);
      return;
    }
    if (item?.to) nav(item.to);
  }

  const statCards = [
    { Icon: Wallet,           tone: 'blue',   label: 'Wallet Balance',   value: inr(walletBalanceRs), sub: 'View balance', onClick: () => nav('/wallet') },
    { Icon: BadgeIndianRupee, tone: 'green',  label: "Today's Earnings", value: inr(todayRs),         sub: 'View details', onClick: () => nav('/worker/earnings') },
    { Icon: Briefcase,        tone: 'amber',  label: "Today's Jobs",     value: todayJobs,            sub: 'View all',     onClick: () => handleNav({ scroll: 'job-requests' }) },
    { Icon: Star,             tone: 'violet', label: 'Your Rating',      value: ratingDisplay,        sub: 'Reviews',      onClick: () => nav('/worker/appeals') },
    { Icon: Clock,            tone: 'cyan',   label: "Today's Hours",    value: hoursLabel,           sub: null },
    { Icon: CheckCircle,      tone: 'rose',   label: 'Acceptance Rate',  value: acceptRate != null ? `${acceptRate}%` : '0%', sub: 'View details', onClick: () => goSection('performance') },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans lg:pl-64">
      <WorkerSidebar
        activeKey="dashboard"
        unread={unreadCount}
        onNavigate={handleNav}
        onGoOnline={toggleOnline}
        isOnline={isOnline}
      />

      {/* Mobile slide-over drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-white p-4 lg:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            >
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center gap-2">
                  <ZappyLogo size={22} />
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Worker</span>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Close menu">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <nav className="mt-2 space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handleNav(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold ${
                      item.key === 'dashboard' ? 'bg-zappy-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <item.Icon size={18} strokeWidth={2.2} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.key === 'notifications' && unreadCount > 0 && (
                      <span className="rounded-full bg-zappy-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={async () => { try { await callLogout().unwrap(); } catch { /* ignore */ } dispatch(logout()); nav('/worker/login'); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <LogOut size={18} /> <span>Sign Out</span>
                </button>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} className="text-slate-700" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <ZappyLogo size={20} />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Worker</span>
            </div>
            <div className="hidden min-w-0 lg:block">
              <h1 className="truncate text-[19px] font-black tracking-tight text-navy-900">Hello, {firstName} 👋</h1>
              <p className="truncate text-[12.5px] font-medium text-slate-500">
                Complete more jobs to earn more and grow with Zappy.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="hidden lg:block">
              <OnlineControl isOnline={isOnline} busy={toggling} disabled={!canGoOnline} onToggle={toggleOnline} />
            </div>
            <NotifBell token={token} onTap={() => nav('/worker/notifications')} />
            <button onClick={() => nav('/worker/profile')} className="flex items-center gap-2">
              <Avatar url={avatarUrl} initials={initials} size={36} />
              <span className="hidden text-[13px] font-bold text-navy-900 lg:block">{firstName}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:px-8 lg:pb-10">
        {/* KYC gate banner */}
        {token && !kycApproved && (
          <button
            onClick={() => nav('/worker/kyc')}
            className={`mb-4 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
              kycStatus === 'rejected' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${kycStatus === 'rejected' ? 'bg-red-100' : 'bg-amber-100'}`}>
              <ShieldCheck size={17} className={kycStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] font-bold ${kycStatus === 'rejected' ? 'text-red-700' : 'text-amber-800'}`}>
                {kycStatus === 'pending_review' ? 'KYC under review'
                  : kycStatus === 'rejected' ? 'KYC rejected — tap to resubmit'
                  : 'Complete KYC to start earning'}
              </span>
              <span className="block text-[11.5px] font-medium text-slate-500">Verification is required before you can go online.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400" />
          </button>
        )}

        {/* Active job banner */}
        {isBusy && (
          <button
            onClick={() => nav(`/worker/jobs/${me.currentOrderId}`)}
            className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-zappy-600 p-3.5 text-left text-white shadow-[0_12px_28px_-16px_rgba(37,99,235,0.9)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <Navigation size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold">Active job in progress</span>
              <span className="block text-[11.5px] font-medium text-white/80">Tap to open your current job</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-white/80" />
          </button>
        )}

        {/* Mobile greeting / online control */}
        <div className="lg:hidden">
          <GreetingCard
            name={firstName}
            locationLabel={locationLabel}
            isOnline={isOnline}
            busy={toggling}
            disabled={!canGoOnline}
            onToggle={toggleOnline}
          />
        </div>

        {/* Stat cards — 4 on mobile, 6 on web */}
        <div className="mt-4 grid grid-cols-4 gap-2.5 lg:grid-cols-6 lg:gap-3">
          {statCards.map((s, i) => (
            <div key={s.label} className={i >= 4 ? 'hidden lg:block' : ''}>
              <StatCard {...s} />
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <JobRequests
              tabs={jobTabs}
              activeTab={jobTab}
              onTab={setJobTab}
              jobs={jobsForTab}
              isOnline={isOnline}
              onGoOnline={toggleOnline}
              onOpenJob={openJob}
            />
            {isOnline && <ReadyModeCard />}
            <div className="hidden lg:block">
              <RecentlyCompleted jobs={doneJobs.slice(0, 5)} onOpenJob={openJob} onViewAll={() => setJobTab('completed')} />
            </div>
          </div>

          <div className="space-y-5">
            <TodaySchedule jobs={scheduledToday} onOpenJob={openJob} onViewCalendar={() => nav('/worker/goals')} />
            <EarningsOverview weekRupees={weekRs} deltaPct={deltaPct} points={chartPoints} onViewDetails={() => nav('/worker/earnings')} />
            <Panel
              id="performance"
              title="Performance"
              action={<button type="button" onClick={() => nav('/worker/earnings')} className="text-[12.5px] font-bold text-zappy-600 hover:underline">View details</button>}
            >
              <PerformanceGrid items={perfItems} />
            </Panel>
          </div>
        </div>

        {/* Quick access — worker tools */}
        <div className="mt-5">
          <QuickAccess onOpen={(to) => nav(to)} walletRs={walletBalanceRs} />
        </div>
      </main>

      <WorkerBottomNav activeKey="dashboard" onNavigate={handleNav} />

      {/* Job offer modal — preserved from the live dispatch flow */}
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
    </div>
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
            <span className={`flex items-center gap-1 text-sm font-bold ${isExpress || isPriority ? 'text-white/80' : 'text-[#0F172A]'}`}>
              <Star size={14} strokeWidth={0} className="fill-amber-400" />
              4.9
            </span>
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

          {/* ── Job Details — always visible ──────────────────────────── */}
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
