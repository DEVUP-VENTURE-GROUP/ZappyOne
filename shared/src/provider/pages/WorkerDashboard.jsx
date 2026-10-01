import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, ChevronRight, ShieldCheck, X, Menu, Bell, BadgeIndianRupee, Briefcase,
  Clock, Star, MapPin, Radio,
} from 'lucide-react';
import {
  useGetWorkerMeQuery, useGoOnlineMutation, useGoOfflineMutation, useGetEarningsQuery,
  useGetKycStatusQuery, useListNotificationsQuery, useLogoutMutation, useProviderOnboardingStatusQuery,
} from '../../services/api';
import { setOnline } from '../../modules/worker/workerSlice';
import { selectAuth, logout } from '../../modules/auth/authSlice';
import { useGeolocation } from '../../hooks/useGeolocation';
import { reverseGeocode } from '../../utils/reverseGeocode';
import { getSocket } from '../../services/socket';
import { API_BASE } from '../../services/apiBase';
import { formatPaise } from '../../utils/money';
import { ZappyLogo } from '../../components/common/ZappyLogo';
import WorkerOnboarding from './WorkerOnboarding';
import ProviderServicesCard from '../../components/provider/ProviderServicesCard';
import { useLocationBroadcast } from '../useLocationBroadcast';
import { useProviderJobs } from '../useProviderJobs';
import {
  Avatar, GreetingCard, StatCard, Panel, EarningsOverview, QuickAccess,
  WorkerSidebar, WorkerBottomNav, OnlineControl, NAV_ITEMS, inr,
} from '../../components/worker/DashboardUI';
import toast from 'react-hot-toast';

/**
 * Rakshak home — the partner-app home every gig worker knows.
 *
 *   online switch → what's in your hands now → open work near you
 *   → today's money → the week → your tools
 *
 * Online is the master switch: while it's on, the app shares location and new
 * work rings (JobOfferHost); while it's off, nothing does. Work of every kind
 * (repair, pet, helping) comes from one source, useProviderJobs.
 */

const KINDS = ['repair', 'pet', 'helping'];

function NotifBell({ token, onTap }) {
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !token, pollingInterval: 60000 });
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket(token);
    const handler = () => setBump((b) => b + 1);
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [token]);
  const count = (data?.unread ?? 0) + bump;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    >
      <Bell size={17} strokeWidth={2.2} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function last7(breakdown = []) {
  const byDate = Object.fromEntries(breakdown.map((d) => [d.date, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return byDate[key] || { date: key, earningsPaise: 0, jobs: 0 };
  });
}

const hm = (sec) => `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;

export default function WorkerDashboard() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { accessToken: token } = useSelector(selectAuth);

  const { data: meData, refetch: refetchMe } = useGetWorkerMeQuery(undefined, { pollingInterval: 60000, skip: !token });
  const { data: todayData } = useGetEarningsQuery('today', { skip: !token });
  const { data: weekData } = useGetEarningsQuery('week', { skip: !token });
  const { data: kycData } = useGetKycStatusQuery(undefined, { skip: !token });
  const { data: notifData } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !token, pollingInterval: 60000 });
  const { data: providerStatus } = useProviderOnboardingStatusQuery();
  const { mine, open, notApproved } = useProviderJobs({ kinds: KINDS });
  const [goOnline] = useGoOnlineMutation();
  const [goOffline] = useGoOfflineMutation();
  const [callLogout] = useLogoutMutation();
  const { getCurrent } = useGeolocation();

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [areaName, setAreaName] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [onlineSec, setOnlineSec] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const onlineStart = useRef(null);

  const me = meData?.worker;
  const isOnline = me?.isOnline ?? false;
  const kycStatus = kycData?.kyc?.status;
  const kycApproved = kycStatus === 'approved';
  const unreadCount = notifData?.unread ?? 0;
  // Service verification collects the same documents; don't ask twice while it's in flight.
  const verificationInFlight = (providerStatus?.enrolments || []).some((e) => ['pending_review', 'approved'].includes(e.status));

  // Profile photo through the API (works on the split prod origin).
  useEffect(() => {
    if (!token || !me?.profilePhotoKey) return undefined;
    let url;
    fetch(`${API_BASE}/api/workers/me/avatar`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => { if (blob) { url = URL.createObjectURL(blob); setAvatarUrl(url); } })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [token, me?.profilePhotoKey]);

  // Online clock, from the server's stamp so it survives a refresh.
  useEffect(() => {
    if (!isOnline) { onlineStart.current = null; setOnlineSec(0); return undefined; }
    const base = me?.onlineSince ? Date.parse(me.onlineSince) : (onlineStart.current ??= Date.now());
    const tick = () => setOnlineSec(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [isOnline, me?.onlineSince]);

  useEffect(() => { dispatch(setOnline(isOnline)); }, [isOnline, dispatch]);

  // Verification can be revoked while online.
  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket(token);
    const onRejected = ({ reason }) => {
      dispatch(setOnline(false));
      toast.error(reason ? `Verification rejected: ${reason}` : 'Your verification was not approved. Please resubmit.', { duration: 8000 });
      refetchMe?.();
    };
    socket.on('kyc.rejected', onRejected);
    return () => socket.off('kyc.rejected', onRejected);
  }, [token, dispatch, refetchMe]);

  useLocationBroadcast({ isOnline, token, currentOrderId: me?.currentOrderId });

  // After every hook, so the hook count never changes.
  if (meData && !me?.onboardingComplete) return <WorkerOnboarding onComplete={refetchMe} />;

  async function toggleOnline() {
    if (!kycApproved) { toast.error('Verification required before going online'); nav('/worker/kyc'); return; }
    setToggling(true);
    try {
      if (isOnline) {
        await goOffline().unwrap();
        setAreaName(null);
        toast.success('You are offline. No new work will ring.');
      } else {
        const pos = await getCurrent();
        // Worse than 500 m is an IP guess (laptops): say so before customers rely on it.
        if (pos.accuracy && pos.accuracy > 500) {
          toast('Your location is approximate. Use your phone so customers see where you really are.', { duration: 6000 });
        }
        await goOnline({ lat: pos.lat, lng: pos.lng }).unwrap();
        toast.success('You are online. New work near you will ring.');
        reverseGeocode(pos.lat, pos.lng)
          .then(({ primary, secondary }) => setAreaName(secondary ? `${primary}, ${secondary.split(',')[0]}` : primary))
          .catch(() => {});
      }
      refetchMe();
    } catch (err) {
      if (err?.data?.code === 'ON_TRIP') {
        toast.error(err.data.error);
        if (err.data.job?.link) nav(err.data.job.link);
      } else {
        toast.error(err?.data?.error || err?.message || 'Could not change your status');
      }
    } finally {
      setToggling(false);
    }
  }

  function handleNav(item) {
    setDrawerOpen(false);
    if (item?.to) nav(item.to);
  }

  async function signOut() {
    try { await callLogout().unwrap(); } catch { /* signing out locally either way */ }
    dispatch(logout());
    nav('/worker/login');
  }

  const firstName = (me?.name || 'there').trim().split(/\s+/)[0];
  const initials = (me?.name || 'W').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const rating = me?.completedJobs > 0 && me?.rating != null ? Number(me.rating).toFixed(1) : '—';

  const week = last7(weekData?.dailyBreakdown);
  const prevWeekPaise = (weekData?.dailyBreakdown || [])
    .filter((d) => { const age = (Date.now() - Date.parse(d.date)) / 86400000; return age >= 7 && age < 14; })
    .reduce((s, d) => s + d.earningsPaise, 0);
  const thisWeekPaise = week.reduce((s, d) => s + d.earningsPaise, 0);
  const deltaPct = prevWeekPaise > 0 ? Math.round(((thisWeekPaise - prevWeekPaise) / prevWeekPaise) * 100) : (thisWeekPaise > 0 ? 100 : 0);

  const stats = [
    { Icon: BadgeIndianRupee, tone: 'green', label: 'Today', value: inr(todayData?.earningsRupees ?? 0), sub: 'Earnings', onClick: () => nav('/worker/earnings') },
    { Icon: Briefcase, tone: 'blue', label: 'Jobs today', value: todayData?.jobs ?? 0, sub: 'Completed', onClick: () => nav('/worker/work') },
    { Icon: Clock, tone: 'cyan', label: 'Online', value: isOnline ? hm(onlineSec) : 'Off', sub: isOnline ? 'This session' : 'Go online' },
    { Icon: Star, tone: 'amber', label: 'Rating', value: rating, sub: `${me?.completedJobs ?? 0} jobs`, onClick: () => nav('/worker/appeals') },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] lg:pl-64">
      <WorkerSidebar activeKey="dashboard" unread={unreadCount} onNavigate={handleNav} onGoOnline={toggleOnline} isOnline={isOnline} />

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-white p-4 lg:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            >
              <div className="flex items-center justify-between px-2 py-2">
                <ZappyLogo size={22} />
                <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Close menu">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <nav className="mt-2 space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNav(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold ${item.key === 'dashboard' ? 'bg-zappy-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <item.Icon size={18} strokeWidth={2.2} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                ))}
                <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-rose-600 hover:bg-rose-50">
                  <LogOut size={18} /> <span>Sign out</span>
                </button>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={20} className="text-slate-700" />
            </button>
            <span className="lg:hidden"><ZappyLogo size={20} /></span>
            <h1 className="hidden truncate text-[18px] font-bold text-navy lg:block">Hello, {firstName}</h1>
          </div>
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="hidden lg:block">
              <OnlineControl isOnline={isOnline} busy={toggling} disabled={!kycApproved} onToggle={toggleOnline} />
            </div>
            <NotifBell token={token} onTap={() => nav('/worker/notifications')} />
            <button type="button" onClick={() => nav('/worker/profile')} aria-label="Profile">
              <Avatar url={avatarUrl} initials={initials} size={36} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-28 pt-4 lg:px-8 lg:pb-10">
        {token && kycData && !kycApproved && !verificationInFlight && (
          <button
            type="button"
            onClick={() => nav('/worker/kyc')}
            className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${kycStatus === 'rejected' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}
          >
            <ShieldCheck size={18} className={kycStatus === 'rejected' ? 'text-red-600' : 'text-amber-600'} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-navy">
                {kycStatus === 'pending_review' ? 'Your verification is under review'
                  : kycStatus === 'rejected' ? 'Verification rejected. Tap to resubmit'
                    : 'Get verified to start earning'}
              </span>
              <span className="block text-[12px] text-slate-500">You can go online once you are verified.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400" />
          </button>
        )}

        <div className="lg:hidden">
          <GreetingCard name={firstName} locationLabel={areaName} isOnline={isOnline} busy={toggling} disabled={!kycApproved} onToggle={toggleOnline} />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:gap-3">
          {stats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel
              title="In your hands"
              action={<button type="button" onClick={() => nav('/worker/work')} className="text-[13px] font-semibold text-zappy-600 hover:underline">All work</button>}
            >
              {mine.length ? (
                <div className="space-y-2">
                  {mine.slice(0, 3).map((j) => (
                    <button
                      key={`${j.kind}-${j.id}`}
                      type="button"
                      onClick={() => nav(j.to)}
                      className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-left hover:bg-slate-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold capitalize text-navy">{j.title}</span>
                        <span className="block truncate text-[12.5px] capitalize text-slate-500">{j.subtitle}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${j.attention ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-600'}`}>{j.status}</span>
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    </button>
                  ))}
                  {mine.length > 3 && <p className="text-[12.5px] text-slate-500">and {mine.length - 3} more on your Work page</p>}
                </div>
              ) : (
                <p className="text-[14px] text-slate-500">Nothing in hand. {isOnline ? 'New work will ring when it comes in.' : 'Go online to start getting work.'}</p>
              )}
            </Panel>

            <Panel
              title={`Open near you${open.length ? ` · ${open.length}` : ''}`}
              action={open.length > 0 && <button type="button" onClick={() => nav('/worker/work')} className="text-[13px] font-semibold text-zappy-600 hover:underline">See all</button>}
            >
              {!isOnline ? (
                <button type="button" onClick={toggleOnline} disabled={toggling} className="flex w-full items-center gap-3 rounded-xl bg-zappy-50 px-3.5 py-3 text-left">
                  <Radio size={18} className="text-zappy-600" />
                  <span className="flex-1 text-[14px] font-medium text-navy">Go online to see and take open work near you</span>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              ) : open.length ? (
                <div className="space-y-2">
                  {open.slice(0, 2).map((j) => (
                    <button
                      key={`${j.kind}-${j.id}`}
                      type="button"
                      onClick={() => nav('/worker/work')}
                      className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-left hover:bg-slate-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold capitalize text-navy">{j.service} · {j.title}</span>
                        <span className="flex items-center gap-1 truncate text-[12.5px] text-slate-500">
                          <MapPin size={12} /> {[j.km != null ? `${j.km} km` : null, j.where].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums text-emerald-700">{formatPaise(j.earningPaise)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-slate-500">
                  {notApproved.length ? 'Get verified for more services to see open work here.' : 'No open work near you right now.'}
                </p>
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <ProviderServicesCard />
            <EarningsOverview
              weekRupees={weekData?.earningsRupees ?? 0}
              deltaPct={deltaPct}
              points={week.map((d) => ({ label: new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }), value: Math.round(d.earningsPaise / 100) }))}
              onViewDetails={() => nav('/worker/earnings')}
            />
          </div>
        </div>

        <QuickAccess onOpen={(to) => nav(to)} />
      </main>

      <WorkerBottomNav activeKey="dashboard" onNavigate={handleNav} />
    </div>
  );
}
