import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Store, ShieldCheck, Clock, XCircle, ChevronRight, Users, IndianRupee,
  LogOut, Wrench, MapPin, Loader2, AlertTriangle, Briefcase, Star,
  UserPlus, CalendarClock, Settings,
} from 'lucide-react';
import {
  useShopMeQuery, useShopKycStatusQuery, useShopEarningsQuery, useLogoutMutation,
  useShopWorkersQuery, useRepairProviderJobsQuery, useRepairOnboardingStatusQuery,
  useProviderOnboardingStatusQuery,
} from '@shared/services/api';
import ProviderServicesCard from '@shared/components/provider/ProviderServicesCard';
import ShopRepairJobs from '../components/ShopRepairJobs';
import { StatCard, Panel, inr, EarningsOverview, PerformanceGrid } from '@shared/components/worker/DashboardUI';
import { logout } from '@shared/modules/auth/authSlice';

/**
 * The shop owner's dashboard.
 *
 * It used to be a status banner, an earnings number and four navigation rows —
 * a menu, not a dashboard — while the technician's screen had a stat grid, live
 * job tabs and a sidebar. The owner is running the business the technicians work
 * for, so having strictly less to look at made no sense.
 *
 * Built around the five questions an owner actually opens this to answer:
 *
 *   1. Can customers find me right now?          → the live pill and status band
 *   2. What needs doing?                          → jobs, unassigned ones first
 *   3. Who is on my team and who is free?         → the team panel
 *   4. What did we make today?                    → the stat row
 *   5. What is still blocking me?                 → the setup band, only when real
 *
 * It reuses the technician dashboard's StatCard/Panel kit rather than restating
 * the same design, so the two screens stay recognisably one product and a change
 * to the card style lands on both.
 */

const KYC_META = {
  not_submitted: { label: 'Verification pending', tone: 'bg-slate-100 text-slate-600', Icon: AlertTriangle },
  pending_review: { label: 'Under review', tone: 'bg-amber-50 text-amber-700', Icon: Clock },
  approved: { label: 'Verified', tone: 'bg-emerald-50 text-emerald-700', Icon: ShieldCheck },
  rejected: { label: 'Verification rejected', tone: 'bg-red-50 text-red-700', Icon: XCircle },
  suspended: { label: 'Verification suspended', tone: 'bg-red-50 text-red-700', Icon: XCircle },
};

/** Statuses where the shop holds the job but nobody is doing it yet. */
const NEEDS_ATTENTION = ['PROVIDER_ASSIGNED', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING', 'READY_FOR_RETURN'];
const CLOSED = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'];

function NavCard({ icon: Icon, title, sub, onClick, badge }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-indigo-200 hover:bg-indigo-50/30">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
        <Icon size={18} className="text-indigo-600" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[#0F172A]">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-slate-400">{sub}</span>
      </span>
      {badge}
      <ChevronRight size={16} className="shrink-0 text-slate-300" />
    </button>
  );
}

/**
 * The team, and what each of them is holding.
 *
 * An owner's next question after "what came in?" is always "who can take it?",
 * so the count alone is not enough — this shows who is on the team and how many
 * open jobs each is carrying, which is what makes an assignment decision.
 */
function TeamPanel({ workers, jobs, onManage }) {
  const loadByWorker = useMemo(() => {
    const map = new Map();
    for (const job of jobs) {
      if (CLOSED.includes(job.status) || !job.workerId) continue;
      const key = String(job.workerId);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [jobs]);

  return (
    <Panel
      title="Your team"
      action={(
        <button onClick={onManage} className="flex items-center gap-1 text-[12px] font-bold text-indigo-600">
          Manage <ChevronRight size={13} strokeWidth={3} />
        </button>
      )}
    >
      {!workers.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
          <UserPlus size={20} className="mx-auto text-slate-300" />
          <p className="mt-2 text-[13px] font-bold text-slate-700">No technicians yet</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
            Add your technicians so you can hand jobs to them instead of doing every one yourself.
          </p>
          <button onClick={onManage} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-[12px] font-bold text-white">
            Add a technician
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {workers.slice(0, 5).map((w) => {
            const load = loadByWorker.get(String(w._id)) || 0;
            return (
              <div key={w._id} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[12px] font-bold text-white">
                  {(w.name || '?').charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-[#0F172A]">{w.name}</span>
                  <span className="text-[11px] text-slate-400">{w.phone}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                  load ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {load ? `${load} job${load === 1 ? '' : 's'}` : 'Free'}
                </span>
              </div>
            );
          })}
          {workers.length > 5 && (
            <button onClick={onManage} className="w-full pt-1 text-[11.5px] font-bold text-indigo-600">
              +{workers.length - 5} more
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

export default function ShopDashboard() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { data, isLoading } = useShopMeQuery();
  const { data: kycData } = useShopKycStatusQuery();
  const { data: earnings } = useShopEarningsQuery('today');
  const { data: weekEarnings } = useShopEarningsQuery('week');
  const { data: teamData } = useShopWorkersQuery();
  const { data: jobsData } = useRepairProviderJobsQuery({});
  const { data: setup } = useRepairOnboardingStatusQuery('mobile');
  const [callLogout] = useLogoutMutation();

  /**
   * Service verification already collected the owner ID, storefront photo
   * and selfie. Sending the shop to a second documents screen after that
   * is asking for the same papers twice — so the separate prompt only
   * appears when nothing is under review.
   */
  const { data: providerStatus } = useProviderOnboardingStatusQuery();
  const verificationInFlight = (providerStatus?.enrolments || [])
    .some((e) => ['pending_review', 'approved'].includes(e.status));

  const shop = data?.shop;
  const workers = teamData?.workers || [];
  const jobs = jobsData?.bookings || jobsData?.jobs || [];

  const kycStatus = kycData?.kyc?.status || shop?.kyc?.status || 'not_submitted';
  const meta = KYC_META[kycStatus] || KYC_META.not_submitted;
  const hasPin = shop?.address?.location?.coordinates?.length === 2;
  const isDiscoverable = shop?.isActive && kycStatus === 'approved' && hasPin
    && Array.isArray(shop?.services) && shop.services.length > 0;

  /*
   * Straight from the server, never recomputed here.
   *
   * This screen used to work out `openNow` itself from `shop.hours` using the
   * BROWSER's clock, while customers were shown the server's answer from
   * India's clock. An owner on a device in another timezone saw "Open" while
   * every customer saw "Closed". One rule, one answer — see shop.service.
   *
   * `null` means the shop has never stated its hours, which is different from
   * being shut.
   */
  const isOpen = shop?.openNow ?? null;
  const liveNow = isDiscoverable && isOpen !== false;

  const openJobs = jobs.filter((j) => !CLOSED.includes(j.status));
  const needsAction = openJobs.filter((j) => NEEDS_ATTENTION.includes(j.status) || !j.workerId);
  const pendingApprovals = (setup?.pending?.skillVerifications || 0) + (setup?.pending?.priceApprovals || 0);

  async function handleLogout() {
    try { await callLogout().unwrap(); } catch { /* ignore */ }
    dispatch(logout());
    nav('/shop/login');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  /*
   * Earnings trend + performance, brought over from the worker dashboard.
   *
   * The shop had six stat cards and no trend at all, while a technician saw a
   * weekly chart and their completion/acceptance figures. An owner running a
   * business deserves at least what their own technician sees.
   */
  const byDatePaise = Object.fromEntries((weekEarnings?.dailyBreakdown ?? []).map((d) => [d.date, d.earningsPaise]));
  const sumDays = (from, to) => {
    let acc = 0;
    for (let i = from; i < to; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      acc += byDatePaise[d.toISOString().slice(0, 10)] || 0;
    }
    return acc;
  };
  const thisWeekPaise = sumDays(0, 7);
  const lastWeekPaise = sumDays(7, 14);
  const deltaPct = lastWeekPaise > 0
    ? Math.round(((thisWeekPaise - lastWeekPaise) / lastWeekPaise) * 100)
    : (thisWeekPaise > 0 ? 100 : 0);
  const chartPoints = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      value: Math.round((byDatePaise[key] || 0) / 100),
    };
  });
  const weekRs = Math.round(thisWeekPaise / 100);

  const perfItems = [
    { label: 'Jobs This Week', value: weekEarnings?.jobs ?? 0, sub: `${earnings?.jobs ?? 0} today` },
    { label: 'Technicians', value: workers.length, sub: 'On your team' },
    { label: 'Rating', value: shop?.rating ? Number(shop.rating).toFixed(1) : '—', sub: `${shop?.reviewCount || 0} reviews` },
    { label: 'Completed', value: shop?.completedJobs ?? 0, sub: 'All time' },
  ];

  const statCards = [
    { Icon: IndianRupee, tone: 'green', label: "Today's Earnings", value: inr(earnings?.earningsRupees || 0), sub: 'View details', onClick: () => nav('/shop/earnings') },
    { Icon: Briefcase, tone: 'amber', label: "Today's Jobs", value: earnings?.jobs || 0, sub: 'View all', onClick: () => nav('/shop/earnings') },
    { Icon: Wrench, tone: 'blue', label: 'Needs action', value: needsAction.length, sub: needsAction.length ? 'Assign now' : null, subTone: 'text-indigo-600' },
    { Icon: Users, tone: 'violet', label: 'Technicians', value: workers.length, sub: 'Manage team', onClick: () => nav('/shop/workers') },
    { Icon: Star, tone: 'cyan', label: 'Rating', value: shop?.rating ? Number(shop.rating).toFixed(1) : '—', sub: `${shop?.reviewCount || 0} reviews` },
    { Icon: ShieldCheck, tone: 'rose', label: 'Awaiting approval', value: pendingApprovals, sub: pendingApprovals ? 'Skills & prices' : null },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12">
      {/* Ring the owner when a job lands, exactly as a technician is rung. */}

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600">
            <Store size={18} className="text-white" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-slate-400">Shop Partner</p>
            <p className="truncate text-[17px] font-black tracking-tight text-[#0F172A]">{shop?.businessName}</p>
          </div>

          {/* Whether customers can find you, stated where it cannot be missed. */}
          <span className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 sm:flex ${
            liveNow ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
          }`}>
            <span className={`h-2 w-2 rounded-full ${liveNow ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className={`text-[12px] font-bold ${liveNow ? 'text-emerald-700' : 'text-slate-500'}`}>
              {liveNow ? 'Live' : isOpen === false ? 'Closed now' : 'Not live'}
            </span>
          </span>

          <button
            onClick={handleLogout}
            title="Log out"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4">

        {/* Only shown when something genuinely blocks the shop */}
        {!isDiscoverable && (
          <div className={`mb-4 rounded-2xl border p-4 ${
            kycStatus === 'rejected' || kycStatus === 'suspended'
              ? 'border-red-200 bg-red-50/60'
              : 'border-amber-200 bg-amber-50/60'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}>
                <meta.Icon size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black text-[#0F172A]">
                  {kycStatus === 'approved' ? 'Almost there' : meta.label}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
                  {kycStatus === 'approved'
                    ? 'Your documents are approved. Finish your profile so customers can find you.'
                    : kycStatus === 'pending_review' || verificationInFlight
                      ? "We'll notify you within 24 hours."
                      : 'Submit your documents to start receiving bookings.'}
                </p>

                {/* What exactly is missing — a checklist beats "complete your profile". */}
                {kycStatus === 'approved' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {!hasPin && <Gap label="Shop address" onClick={() => nav('/shop/profile')} />}
                    {!shop?.services?.length && <Gap label="Services" onClick={() => nav('/provider/onboarding')} />}
                    {!shop?.hours?.length && <Gap label="Opening hours" onClick={() => nav('/shop/profile')} />}
                  </div>
                )}
              </div>

              {(kycStatus === 'not_submitted' || kycStatus === 'rejected') && !verificationInFlight && (
                <button onClick={() => nav('/shop/kyc')} className="shrink-0 rounded-xl bg-[#0F172A] px-4 py-2.5 text-[12.5px] font-bold text-white">
                  Verify
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        {/* Main grid */}
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel
              title="Repair jobs"
              action={needsAction.length ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                  {needsAction.length} need{needsAction.length === 1 ? 's' : ''} you
                </span>
              ) : null}
            >
              <ShopRepairJobs />
            </Panel>

            <ProviderServicesCard />

            <EarningsOverview
              weekRupees={weekRs}
              deltaPct={deltaPct}
              points={chartPoints}
              onViewDetails={() => nav('/shop/earnings')}
            />

            <Panel title="Performance">
              <PerformanceGrid items={perfItems} />
            </Panel>
          </div>

          <div className="space-y-5">
            <TeamPanel workers={workers} jobs={jobs} onManage={() => nav('/shop/workers')} />

            <div className="space-y-2">
              <NavCard
                icon={Settings}
                title="Choose what you work on"
                sub="Brands, jobs, area and your prices"
                onClick={() => nav('/worker/repair/setup')}
              />
              <NavCard
                icon={CalendarClock}
                title="Opening hours"
                sub={shop?.hours?.length ? 'Set — customers see when you are open' : 'Not set yet'}
                onClick={() => nav('/shop/profile')}
              />
              <NavCard icon={Store} title="Shop Profile" sub="Business info, address & category" onClick={() => nav('/shop/profile')} />
              <NavCard icon={ShieldCheck} title="Verification (KYC)" sub={meta.label} onClick={() => nav('/shop/kyc')} />
              <NavCard icon={Users} title="Technicians" sub={`${workers.length} on your team`} onClick={() => nav('/shop/workers')} />
              <NavCard icon={IndianRupee} title="Earnings" sub="Today, this week & this month" onClick={() => nav('/shop/earnings')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One missing piece of the storefront, tappable straight to where it is fixed. */
function Gap({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800"
    >
      <MapPin size={10} /> {label}
    </button>
  );
}
