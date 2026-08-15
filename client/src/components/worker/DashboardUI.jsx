import { memo } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, ClipboardList, CalendarDays, IndianRupee, Wallet as WalletIcon,
  Bell, Star, LifeBuoy, User, FileText, Home as HomeIcon, ChevronRight,
  Wifi, Clock, CheckCircle2, TrendingUp, TrendingDown, Search, Radio,
  BarChart2, Target, Building2, ArrowRightLeft, GraduationCap, Scale, Gem,
} from 'lucide-react';
import { ZappyLogo } from '../common/ZappyLogo';

/**
 * Presentational building blocks for the worker dashboard.
 *
 * Everything here is a pure, prop-driven view — no data fetching, no business
 * logic. The dashboard page owns all state (online status, earnings, orders)
 * and the job-offer socket flow; these components only render what it passes.
 * That split keeps the reference-matching layout readable and lets the page
 * stay the single source of truth for the worker's live state.
 *
 * Money helper: every rupee value shown on the dashboard flows through this so
 * grouping is consistent (₹1,299 not ₹1299). Callers pass whole rupees — paise
 * conversion happens in the page, close to the API shape.
 */
export const inr = (rupees) => `₹${Math.round(Number(rupees) || 0).toLocaleString('en-IN')}`;

/** Pretty label for a service code: `car_ac_gas_refill` → `Car Ac Gas Refill`. */
export function prettyService(code = '') {
  return String(code)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ── Navigation model ─────────────────────────────────────────────────────────
   Each item routes to a real worker route, or scrolls to an in-page section
   (`scroll`) for surfaces that live on the dashboard itself (My Jobs, Bookings).
   Keeping this as data means the sidebar and bottom bar can't drift apart.
──────────────────────────────────────────────────────────────────────────────*/
export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, to: '/worker' },
  { key: 'jobs', label: 'My Jobs', Icon: ClipboardList, scroll: 'job-requests' },
  { key: 'bookings', label: 'Bookings', Icon: CalendarDays, scroll: 'schedule' },
  { key: 'earnings', label: 'Earnings', Icon: IndianRupee, to: '/worker/earnings' },
  { key: 'wallet', label: 'Wallet', Icon: WalletIcon, to: '/wallet' },
  { key: 'notifications', label: 'Notifications', Icon: Bell, to: '/worker/notifications' },
  { key: 'reviews', label: 'Reviews', Icon: Star, to: '/worker/appeals' },
  { key: 'support', label: 'Support', Icon: LifeBuoy, to: '/faq' },
  { key: 'profile', label: 'Profile', Icon: User, to: '/worker/profile' },
  { key: 'documents', label: 'Documents', Icon: FileText, to: '/worker/kyc' },
];

const BOTTOM_NAV = [
  { key: 'dashboard', label: 'Home', Icon: HomeIcon, to: '/worker' },
  { key: 'jobs', label: 'My Jobs', Icon: ClipboardList, scroll: 'job-requests' },
  { key: 'earnings', label: 'Earnings', Icon: IndianRupee, to: '/worker/earnings' },
  { key: 'wallet', label: 'Wallet', Icon: WalletIcon, to: '/wallet' },
  { key: 'profile', label: 'Profile', Icon: User, to: '/worker/profile' },
];

export const QUICK_ACTIONS = [
  { key: 'jobs', label: 'My Jobs', Icon: ClipboardList, tone: 'blue', scroll: 'job-requests' },
  { key: 'bookings', label: 'Bookings', Icon: CalendarDays, tone: 'amber', scroll: 'schedule' },
  { key: 'earnings', label: 'Earnings', Icon: IndianRupee, tone: 'green', to: '/worker/earnings' },
  { key: 'documents', label: 'Documents', Icon: FileText, tone: 'violet', to: '/worker/kyc' },
  { key: 'support', label: 'Support', Icon: LifeBuoy, tone: 'cyan', to: '/faq' },
];

const TONE = {
  blue: { bg: 'bg-blue-50', fg: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-600' },
  green: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  violet: { bg: 'bg-violet-50', fg: 'text-violet-600' },
  cyan: { bg: 'bg-cyan-50', fg: 'text-cyan-600' },
  rose: { bg: 'bg-rose-50', fg: 'text-rose-600' },
};

/* ── Avatar ───────────────────────────────────────────────────────────────── */
export function Avatar({ url, initials, size = 40, ring = true }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zappy-600 font-bold text-white ${
        ring ? 'ring-2 ring-white' : ''
      }`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

/* ── Online pill + Go Online button (shared web + mobile) ─────────────────── */
export function OnlineControl({ isOnline, busy, disabled, onToggle, compact = false }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'gap-3'}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={isOnline}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm transition-colors disabled:opacity-60"
      >
        <span className={`text-[13px] font-bold ${isOnline ? 'text-emerald-600' : 'text-slate-500'}`}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
        <span
          className={`relative h-5 w-9 rounded-full transition-colors ${
            isOnline ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              isOnline ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </span>
      </button>
      {!isOnline && !compact && (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy || disabled}
          className="flex items-center gap-2 rounded-xl bg-zappy-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-zappy-700 active:scale-95 disabled:opacity-60"
        >
          <Radio size={15} strokeWidth={2.6} />
          Go Online
        </button>
      )}
    </div>
  );
}

/* ── Web sidebar ──────────────────────────────────────────────────────────── */
export const WorkerSidebar = memo(function WorkerSidebar({ activeKey, unread, onNavigate, onGoOnline, isOnline }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-2 px-6 py-5">
        <ZappyLogo size={24} />
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Worker</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item)}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                active
                  ? 'bg-zappy-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900'
              }`}
            >
              <item.Icon size={18} strokeWidth={2.2} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === 'notifications' && unread > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? 'bg-white/25 text-white' : 'bg-zappy-600 text-white'}`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {!isOnline && (
        <div className="m-3 rounded-2xl bg-zappy-50 p-4">
          <p className="text-[12.5px] font-semibold text-navy-900">Go online to get more jobs</p>
          <button
            type="button"
            onClick={onGoOnline}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-zappy-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-zappy-700 active:scale-95"
          >
            <Radio size={15} strokeWidth={2.6} /> Go Online
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => onNavigate({ to: '/faq' })}
        className="m-3 mt-0 flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zappy-50">
          <LifeBuoy size={17} className="text-zappy-600" />
        </span>
        <span>
          <span className="block text-[12.5px] font-bold text-navy-900">Need Help?</span>
          <span className="block text-[11px] font-medium text-slate-500">24x7 Support</span>
        </span>
      </button>
    </aside>
  );
});

/* ── Mobile bottom nav ────────────────────────────────────────────────────── */
export function WorkerBottomNav({ activeKey, onNavigate }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {BOTTOM_NAV.map((item) => {
          const active = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item)}
              className="flex flex-1 flex-col items-center gap-1 py-2.5"
            >
              <item.Icon
                size={21}
                strokeWidth={active ? 2.6 : 2}
                className={active ? 'text-zappy-600' : 'text-slate-400'}
              />
              <span className={`text-[10px] font-bold ${active ? 'text-zappy-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Greeting / hero card ─────────────────────────────────────────────────── */
export function GreetingCard({ name, locationLabel, isOnline, busy, disabled, onToggle }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-zappy-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-navy-900 sm:text-[26px]">
            Hello, {name} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-slate-500">
            {isOnline ? 'You’re online — new jobs will ring in.' : 'Go online to get more jobs'}
          </p>
          {locationLabel && (
            <p className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-slate-600">
              <Wifi size={13} className="text-emerald-500" /> {locationLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <OnlineControl isOnline={isOnline} busy={busy} disabled={disabled} onToggle={onToggle} />
        </div>
      </div>
    </section>
  );
}

/* ── Stat card ────────────────────────────────────────────────────────────── */
export const StatCard = memo(function StatCard({ Icon, tone = 'blue', label, value, sub, subTone, onClick }) {
  const t = TONE[tone] || TONE.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-[transform,box-shadow] duration-200 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_16px_30px_-22px_rgba(15,23,42,0.4)] disabled:cursor-default sm:p-4"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.bg}`}>
        <Icon size={19} strokeWidth={2.3} className={t.fg} />
      </span>
      <span className="mt-3 text-[11.5px] font-semibold text-slate-500">{label}</span>
      <span className="mt-0.5 text-[22px] font-black leading-none text-navy-900">{value}</span>
      {sub && (
        <span className={`mt-2 flex items-center gap-0.5 text-[11.5px] font-bold ${subTone || 'text-zappy-600'}`}>
          {sub} <ChevronRight size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
});

/* ── Card shell ───────────────────────────────────────────────────────────── */
export function Panel({ title, action, children, id, className = '' }) {
  return (
    <section id={id} className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-[15px] font-black tracking-tight text-navy-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ Icon = Search, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zappy-50">
        <Icon size={26} className="text-zappy-500" strokeWidth={1.8} />
      </span>
      <p className="mt-3 text-[14px] font-bold text-navy-900">{title}</p>
      {sub && <p className="mt-1 max-w-xs text-[12.5px] font-medium text-slate-500">{sub}</p>}
      {action}
    </div>
  );
}

/* ── Earnings line chart (SVG, no dependency) ─────────────────────────────── */
export function EarningsChart({ points }) {
  // `points` = [{ label, value }] for the last 7 days. Pure SVG so there's no
  // charting library to ship; the shape mirrors the reference exactly.
  const W = 320;
  const H = 120;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = max <= 1 ? 1 : Math.ceil(max / 100) * 100;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (innerW * i) / (points.length - 1 || 1);
  const y = (v) => padT + innerH - (innerH * v) / niceMax;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly earnings">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth="1" />
          <text x={0} y={y(t) + 3} fontSize="9" fill="#94A3B8" fontWeight="600">
            {t >= 1000 ? `₹${(t / 1000).toFixed(1)}k` : `₹${t % 1 === 0 ? t : t.toFixed(1)}`}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#earn-fill)" opacity="0.5" />
      <defs>
        <linearGradient id="earn-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={line} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke="#2563EB" strokeWidth="2" />
          <text x={x(i)} y={H - 6} fontSize="9" fill="#94A3B8" fontWeight="600" textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Earnings overview panel ──────────────────────────────────────────────── */
export function EarningsOverview({ weekRupees, deltaPct, points, onViewDetails }) {
  const up = deltaPct >= 0;
  return (
    <Panel
      id="earnings"
      title="Earnings Overview"
      action={
        <button type="button" onClick={onViewDetails} className="text-[12.5px] font-bold text-zappy-600 hover:underline">
          View details
        </button>
      }
    >
      <p className="text-[11.5px] font-semibold text-slate-500">This Week</p>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[26px] font-black leading-tight text-navy-900">{inr(weekRupees)}</p>
          <p className={`mt-0.5 flex items-center gap-1 text-[12px] font-bold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {up ? '+' : ''}{deltaPct}% from last week
          </p>
        </div>
      </div>
      <div className="mt-3">
        <EarningsChart points={points} />
      </div>
    </Panel>
  );
}

/* ── Performance grid ─────────────────────────────────────────────────────── */
export function PerformanceGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[20px] font-black leading-none text-navy-900">{it.value}</p>
          <p className="mt-1 text-[11.5px] font-bold text-navy-900">{it.label}</p>
          <p className="text-[10.5px] font-medium text-slate-400">{it.sub}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Quick access — worker tools grid ─────────────────────────────────────────
   The full set of worker tools carried over from the original dashboard, each
   routing to a real, existing worker route. Shown on both web and mobile.
──────────────────────────────────────────────────────────────────────────────*/
const QUICK_ACCESS_TOOLS = [
  { to: '/worker/earnings', Icon: BarChart2,     tone: 'blue',   label: 'Earnings',  sub: 'Job breakdown' },
  { to: '/worker/goals',    Icon: Target,        tone: 'violet', label: 'Goals',     sub: 'Daily & weekly' },
  { to: '/worker/bank',     Icon: Building2,     tone: 'blue',   label: 'Bank & UPI', sub: 'Add accounts' },
  { to: '/worker/withdraw', Icon: ArrowRightLeft, tone: 'green', label: 'Withdraw',  sub: 'Transfer to bank' },
  { to: '/worker/skills',   Icon: Star,          tone: 'amber',  label: 'Skills',    sub: 'Specialise & earn' },
  { to: '/worker/training', Icon: GraduationCap, tone: 'rose',   label: 'Training',  sub: 'Get certified' },
  { to: '/worker/appeals',  Icon: Scale,         tone: 'amber',  label: 'Appeals',   sub: 'Contest ratings' },
  { to: '/plans',           Icon: Gem,           tone: 'cyan',   label: 'Go Pro',    sub: 'Lower commission' },
  { to: '/wallet',          Icon: WalletIcon,    tone: 'green',  label: 'Wallet',    sub: null },
];

export function QuickAccess({ onOpen, walletRs }) {
  return (
    <Panel title="Quick Access">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {QUICK_ACCESS_TOOLS.map((t) => {
          const tone = TONE[t.tone] || TONE.blue;
          const sub = t.label === 'Wallet' ? `${inr(walletRs)} available` : t.sub;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => onOpen(t.to)}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-20px_rgba(15,23,42,0.4)] active:scale-[0.98]"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.bg}`}>
                <t.Icon size={17} strokeWidth={2.3} className={tone.fg} />
              </span>
              <span className="mt-2.5 text-[13px] font-bold leading-tight text-navy-900">{t.label}</span>
              {sub && <span className="mt-0.5 text-[10.5px] font-medium leading-tight text-slate-500">{sub}</span>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── Quick actions (mobile) ───────────────────────────────────────────────── */
export function QuickActions({ onAction }) {
  return (
    <Panel title="Quick Actions" className="lg:hidden">
      <div className="grid grid-cols-5 gap-2">
        {QUICK_ACTIONS.map((a) => {
          const t = TONE[a.tone] || TONE.blue;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => onAction(a)}
              className="flex flex-col items-center gap-1.5"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t.bg}`}>
                <a.Icon size={20} strokeWidth={2.2} className={t.fg} />
              </span>
              <span className="text-[10.5px] font-bold text-slate-600">{a.label}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── Job requests (tabbed) ────────────────────────────────────────────────── */
export function JobRequests({ tabs, activeTab, onTab, jobs, isOnline, onGoOnline, onOpenJob }) {
  return (
    <Panel id="job-requests" title="Job Requests">
      <div className="no-scrollbar -mt-2 mb-3 flex gap-2 overflow-x-auto">
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                active ? 'bg-zappy-50 text-zappy-700' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t.label} ({t.count})
            </button>
          );
        })}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          Icon={ClipboardList}
          title="No new job requests"
          sub={isOnline ? 'You’re online — new jobs will appear here.' : 'Go online to receive new job requests'}
          action={
            !isOnline && (
              <button
                type="button"
                onClick={onGoOnline}
                className="mt-4 flex items-center gap-2 rounded-xl bg-zappy-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-zappy-700 active:scale-95"
              >
                <Radio size={15} strokeWidth={2.6} /> Go Online
              </button>
            )
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {jobs.map((job) => (
            <li key={job._id}>
              <button
                type="button"
                onClick={() => onOpenJob(job)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zappy-50">
                  <ClipboardList size={18} className="text-zappy-600" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-navy-900">
                    {prettyService(job.service)}
                  </span>
                  <span className="block truncate text-[11.5px] font-medium text-slate-500">
                    {job.pickupLocation?.address || job.address || 'Location shared on accept'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13.5px] font-black text-navy-900">{inr(job.pricing?.total)}</span>
                  <span className="block text-[11px] font-bold text-zappy-600">View</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Today's schedule ─────────────────────────────────────────────────────── */
export function TodaySchedule({ jobs, onOpenJob, onViewCalendar }) {
  return (
    <Panel
      id="schedule"
      title="Today's Schedule"
      action={
        <button type="button" onClick={onViewCalendar} className="text-[12.5px] font-bold text-zappy-600 hover:underline">
          View calendar
        </button>
      }
    >
      {jobs.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zappy-50">
            <CalendarDays size={20} className="text-zappy-600" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-navy-900">No jobs scheduled for today</p>
            <p className="text-[11.5px] font-medium text-slate-500">Jobs will appear here once scheduled</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {jobs.map((job) => (
            <li key={job._id}>
              <button
                type="button"
                onClick={() => onOpenJob(job)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 flex-col items-center justify-center rounded-xl bg-zappy-50 text-zappy-700">
                  <Clock size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-navy-900">
                    {prettyService(job.service)}
                  </span>
                  <span className="block text-[11.5px] font-medium text-slate-500">
                    {job.scheduledAt
                      ? new Date(job.scheduledAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
                      : 'Now'}
                  </span>
                </span>
                <CheckCircle2 size={16} className="text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Recently completed (web) ─────────────────────────────────────────────── */
export function RecentlyCompleted({ jobs, onOpenJob, onViewAll }) {
  return (
    <Panel
      title="Recently Completed"
      action={
        <button type="button" onClick={onViewAll} className="text-[12.5px] font-bold text-zappy-600 hover:underline">
          View all
        </button>
      }
    >
      {jobs.length === 0 ? (
        <EmptyState
          Icon={CheckCircle2}
          title="No completed jobs yet"
          sub="Your completed jobs will appear here"
        />
      ) : (
        <ul className="space-y-2.5">
          {jobs.map((job) => (
            <li key={job._id}>
              <button
                type="button"
                onClick={() => onOpenJob(job)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-navy-900">
                    {prettyService(job.service)}
                  </span>
                  <span className="block text-[11.5px] font-medium text-slate-500">
                    {job.completedAt ? new Date(job.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </span>
                <span className="text-[13.5px] font-black text-navy-900">{inr(job.pricing?.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
