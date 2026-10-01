import { memo } from 'react';
import { motion } from 'framer-motion';
import { LogOut,
  LayoutDashboard, IndianRupee, Wallet as WalletIcon, Bell, Star, User, ChevronRight, Wifi,
  TrendingUp, TrendingDown, Search, Radio, Loader2, Target, Building2, GraduationCap,
  ShieldCheck, ShoppingBag,
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

/* Navigation model
   Each item routes to a real worker route, or scrolls to an in-page section
   (`scroll`) for surfaces that live on the dashboard itself (My Jobs, Bookings).
   Keeping this as data means the sidebar and bottom bar can't drift apart.
 */
/**
 * Worker navigation — ONE list, three presentations.
 *
 * Every destination appears exactly once. The sidebar shows the full list on
 * desktop, the bottom bar shows the `primary` ones on mobile, and the Quick
 * Access panel shows only what is NOT in navigation. Repeating a link across
 * surfaces is how a worker ends up with three routes to Earnings and no idea
 * where anything lives.
 */
export const NAV_ITEMS = [
  // The bottom bar on a phone: the five places a worker goes every day.
  { key: 'dashboard', label: 'Home', Icon: LayoutDashboard, to: '/worker', primary: true },
  { key: 'work', label: 'Work', Icon: ShoppingBag, to: '/worker/work', primary: true },
  { key: 'earnings', label: 'Earnings', Icon: IndianRupee, to: '/worker/earnings', primary: true },
  { key: 'notifications', label: 'Alerts', Icon: Bell, to: '/worker/notifications', primary: true },
  { key: 'profile', label: 'Profile', Icon: User, to: '/worker/profile', primary: true },
  // Everything else: the menu on a phone; on a computer the sidebar shows all of it.
  { key: 'services', label: 'My services', Icon: ShieldCheck, to: '/provider/onboarding' },
  { key: 'withdraw', label: 'Withdraw', Icon: WalletIcon, to: '/worker/withdraw' },
  { key: 'bank', label: 'Bank & UPI', Icon: Building2, to: '/worker/bank' },
  { key: 'reviews', label: 'Reviews', Icon: Star, to: '/worker/appeals' },
  { key: 'training', label: 'Training', Icon: GraduationCap, to: '/worker/training' },
  { key: 'goals', label: 'Goals', Icon: Target, to: '/worker/goals' },
];

/** The phone menu: only what the bottom bar does not already show. */
export const MENU_ITEMS = NAV_ITEMS.filter((i) => !i.primary);

const BOTTOM_NAV = NAV_ITEMS.filter((i) => i.primary);


const TONE = {
  blue: { bg: 'bg-blue-50', fg: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-600' },
  green: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  violet: { bg: 'bg-violet-50', fg: 'text-violet-600' },
  cyan: { bg: 'bg-cyan-50', fg: 'text-cyan-600' },
  rose: { bg: 'bg-rose-50', fg: 'text-rose-600' },
};

/* Avatar */
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

/* Online / Offline toggle (shared web + mobile)
   Single control: the pill shows the current state AND flips it. (A second
   "Go Online" button here was redundant — same onToggle — so it was removed.) */
export function OnlineControl({ isOnline, busy, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={isOnline}
      aria-label={isOnline ? 'Go offline' : 'Go online'}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-2 shadow-sm transition-colors disabled:opacity-60 ${
        isOnline
          ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      {busy
        ? <Loader2 size={15} className="animate-spin text-slate-500" />
        : <Radio size={15} strokeWidth={2.6} className={isOnline ? 'text-emerald-600' : 'text-slate-400'} />}
      <span className={`text-[13px] font-bold ${isOnline ? 'text-emerald-600' : 'text-slate-600'}`}>
        {isOnline ? 'Online' : 'Go Online'}
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
  );
}

/* Web sidebar */
export const WorkerSidebar = memo(function WorkerSidebar({ activeKey, unread, onNavigate, onGoOnline, isOnline, onSignOut }) {
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

      {onSignOut && (
        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={18} strokeWidth={2.2} /> Sign out
          </button>
        </div>
      )}
    </aside>
  );
});

/* Mobile bottom nav */
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

/* Greeting / hero card */
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

/* Stat card */
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

/* Card shell */
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

/* Earnings line chart (SVG, no dependency) */
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

/* Earnings overview panel */
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

/* Performance grid */
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

/* Quick access — worker tools grid
   The full set of worker tools carried over from the original dashboard, each
   routing to a real, existing worker route. Shown on both web and mobile.
 */
