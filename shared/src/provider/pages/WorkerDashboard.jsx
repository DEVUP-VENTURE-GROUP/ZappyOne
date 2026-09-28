import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, MapPin, Navigation, Loader2, Briefcase, ShoppingBag, PawPrint,
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
  useGetEarningsQuery,
  useGetKycStatusQuery, useGetWorkerOrdersQuery, useGetDemandZonesQuery,
  useGetWorkerLeaderboardQuery, useListNotificationsQuery, useLogoutMutation, useRevokeAllSessionsMutation,
  useGetWorkerGoalsQuery, useGetZoneBenchmarkQuery,
} from '../../services/api';
import { setOnline, selectWorker } from '../../modules/worker/workerSlice';
import { selectAuth, logout } from '../../modules/auth/authSlice';
import { useGeolocation } from '../../hooks/useGeolocation';
import { reverseGeocode } from '../../utils/reverseGeocode';
import { getSocket } from '../../services/socket';
import { ZappyLogo } from '../../components/common/ZappyLogo';
import WorkerOnboarding from './WorkerOnboarding';
import ProviderServicesCard from '../../components/provider/ProviderServicesCard';
import { useProviderOnboardingStatusQuery } from '../../services/api';
import RepairOfferHost from '../../components/repair/RepairOfferHost';
import OrderOfferHost from '../OrderOfferHost';
import { useLocationBroadcast } from '../useLocationBroadcast';
import ReadyModeCard from '../../components/worker/ReadyModeCard';
import RepairJobsPanel from '../../components/worker/RepairJobsPanel';
import {
  Avatar, GreetingCard, StatCard, Panel, EarningsOverview, PerformanceGrid,
  QuickAccess, JobRequests, TodaySchedule, RecentlyCompleted,
  WorkerSidebar, WorkerBottomNav, OnlineControl, NAV_ITEMS, inr,
} from '../../components/worker/DashboardUI';
import toast from 'react-hot-toast';

/* Constants (mirror backend incentive.service.js) */

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


/* Notification bell with live unread count */
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

/* Helpers */

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



function computeTrustScore(acceptRate, rating, completedJobs) {
  return Math.min(100, Math.round(
    (acceptRate * 0.35) +
    ((rating / 5) * 100 * 0.45) +
    (Math.min(completedJobs / 20, 1) * 100 * 0.20),
  ));
}

/* Main */

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
  const [callLogout]     = useLogoutMutation();
  const [revokeAll]      = useRevokeAllSessionsMutation();

  const { getCurrent } = useGeolocation();
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

  /**
   * Do not ask for documents twice.
   *
   * Service verification collects the same Aadhaar and live selfie the old
   * standalone KYC screen asks for. A worker who has just submitted those
   * and then sees "Complete KYC to start earning" concludes the app lost
   * their upload — so the banner stands down once a verification is in
   * flight, and the services card carries the status instead.
   */
  const { data: providerStatus } = useProviderOnboardingStatusQuery();
  const verificationInFlight = (providerStatus?.enrolments || [])
    .some((e) => ['pending_review', 'approved'].includes(e.status));
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

  useLocationBroadcast({
    isOnline,
    token,
    currentOrderId: me?.currentOrderId,
    onPosition: (pos) => { setGpsOn(true); setMyLat(pos.lat); setMyLng(pos.lng); },
    onLost: () => setGpsOn(false),
  });

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

  /* Derived view state (all from real API data) */
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
    // The sidebar carries this on desktop, but it is `lg:` only — most workers
    // are on a phone, so the errand queue needs a reachable tile here too.
    { Icon: ShoppingBag,      tone: 'blue',   label: 'Helping Errands',  value: 'Open',               sub: 'Shopping & returns', onClick: () => nav('/worker/helping') },
    { Icon: PawPrint,         tone: 'violet', label: 'Pet Jobs',         value: 'Open',               sub: 'Grooming, walks & care', onClick: () => nav('/worker/pet') },
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
        {/* KYC gate banner — only when nothing is already being verified. */}
        {token && !kycApproved && !verificationInFlight && (
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

        {/* What this technician is verified for, and what is still blocking them. */}
        <ProviderServicesCard className="mb-4" />
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
            <RepairJobsPanel />
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
          <QuickAccess onOpen={(to) => nav(to)} />
        </div>
      </main>

      {/* Repair work rings through here, wherever the worker is on this screen. */}
      <RepairOfferHost myLocation={me?.currentLocation?.coordinates} />

      <WorkerBottomNav activeKey="dashboard" onNavigate={handleNav} />

      <OrderOfferHost onJobChanged={refetchMe} />

    </div>
  );
}
