import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ShoppingBag, Users, Briefcase,
  Wallet, Scale, CreditCard, BarChart2, Gift, XCircle,
  FileText, LogOut, Menu, X, ChevronRight, FileCheck, Crown,
  Megaphone, Ticket, Server, ToggleRight, Bell, Repeat2,
  HeadphonesIcon, Radio, Globe, Layers, Zap, Sparkles, TrendingUp,
  Shield, PartyPopper, ShieldAlert, Map as MapIcon,
  AlertCircle, GraduationCap, Search, Store,
} from 'lucide-react';
import { logout } from '@shared/modules/auth/authSlice';
import { useLogoutMutation } from '@shared/services/api';
import { adminPath } from '@/config/admin';

const Overview = lazy(() => import('./pages/Overview'));
const Bookings = lazy(() => import('./pages/Bookings'));
const AdminUsers = lazy(() => import('./pages/Users'));
const Workers = lazy(() => import('./pages/Workers'));
const Shops = lazy(() => import('./pages/Shops'));
// What providers may sign up to do, and the verification each service demands.
const ProviderOnboarding = lazy(() => import('./pages/ProviderOnboarding'));
// Domains → services → each service's own console (repair, pet, helping), all data-driven.
const ServicesHub = lazy(() => import('./pages/services/ServicesHub'));
const AdminWallet = lazy(() => import('./pages/Wallet'));
const Disputes = lazy(() => import('./pages/Disputes'));
const Payouts = lazy(() => import('./pages/Payouts'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Incentives = lazy(() => import('./pages/Incentives'));
const Cancellation = lazy(() => import('./pages/Cancellation'));
const Audit = lazy(() => import('./pages/Audit'));
const AdminPlans = lazy(() => import('./pages/Plans'));
const Ads = lazy(() => import('./pages/Ads'));
const Promos = lazy(() => import('./pages/Promos'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const Heatmap = lazy(() => import('./pages/Heatmap'));
const FeatureFlags = lazy(() => import('./pages/FeatureFlags'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Retention = lazy(() => import('./pages/Retention'));
const Support = lazy(() => import('./pages/Support'));
const LiveOps = lazy(() => import('./pages/LiveOps'));
const Rewards = lazy(() => import('./pages/Rewards'));
const BusinessIntelligence = lazy(() => import('./pages/BusinessIntelligence'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const NotificationsAdmin = lazy(() => import('./pages/Notifications'));
const ShieldFund = lazy(() => import('./pages/ShieldFund'));
const Events = lazy(() => import('./pages/Events'));
const Fraud = lazy(() => import('./pages/Fraud'));
const Zones = lazy(() => import('./pages/Zones'));
const Content = lazy(() => import('./pages/Content'));
const RewardsConfig = lazy(() => import('./pages/RewardsConfig'));
const WorkerOps = lazy(() => import('./pages/WorkerOps'));
const SearchIntel = lazy(() => import('./pages/SearchIntel'));
const Intervention = lazy(() => import('./pages/Intervention'));
const Cities = lazy(() => import('./pages/Cities'));
const Appeals = lazy(() => import('./pages/Appeals'));
const Training = lazy(() => import('./pages/Training'));

/**
 * Navigation, organised around who the platform serves: customers, ServicePro
 * shops, Rakshak workers and event partners — plus the catalog, money and ops
 * that sit across all four.
 */
const NAV_GROUPS = [
  {
    label: 'Insights',
    items: [
      { id: 'overview',      label: 'Overview',                 icon: LayoutDashboard },
      { id: 'intelligence',  label: 'Intelligence & Expansion', icon: Sparkles },
      { id: 'searchintel',   label: 'Search Intel',             icon: Search },
      { id: 'retention',     label: 'Retention',                icon: Repeat2 },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { id: 'services', label: 'Services', icon: Layers },
    ],
  },
  {
    label: 'Customers',
    items: [
      { id: 'users',        label: 'Customers',      icon: Users },
      { id: 'bookings',     label: 'Bookings',       icon: ShoppingBag },
      { id: 'support',      label: 'Support',        icon: HeadphonesIcon },
      { id: 'disputes',     label: 'Disputes',       icon: Scale },
      { id: 'promos',       label: 'Promo Codes',    icon: Ticket },
      { id: 'rewards',      label: 'Rewards',        icon: Sparkles },
      { id: 'rewardpoints', label: 'Points & Cards', icon: Gift },
      { id: 'plans',        label: 'Plans',          icon: Crown },
    ],
  },
  {
    label: 'Providers',
    items: [
      { id: 'verification', label: 'Verification', icon: FileCheck },
    ],
  },
  {
    label: 'ServicePro',
    items: [
      { id: 'shops', label: 'Shops', icon: Store },
    ],
  },
  {
    label: 'Rakshak',
    items: [
      { id: 'workers',    label: 'Workers',    icon: Briefcase },
      { id: 'workerops',  label: 'Worker Ops', icon: Briefcase },
      { id: 'appeals',    label: 'Appeals',    icon: AlertCircle },
      { id: 'training',   label: 'Training',   icon: GraduationCap },
      { id: 'incentives', label: 'Incentives', icon: Gift },
    ],
  },
  {
    label: 'Events',
    items: [
      { id: 'events', label: 'Event Commerce', icon: PartyPopper },
      { id: 'ads',    label: 'Ad Campaigns',   icon: Megaphone },
    ],
  },
  {
    label: 'Money',
    items: [
      { id: 'payouts', label: 'Payouts',     icon: CreditCard },
      { id: 'wallet',  label: 'Wallet',      icon: Wallet },
      { id: 'shield',  label: 'Shield Fund', icon: Shield },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'liveops',       label: 'Live Ops',        icon: Radio },
      { id: 'intervention',  label: 'Intervention',    icon: Zap },
      { id: 'zones',         label: 'Zones',           icon: MapIcon },
      { id: 'cities',        label: 'Cities & Areas',  icon: Globe },
      { id: 'fraud',         label: 'Fraud Detection', icon: ShieldAlert },
      { id: 'cancellation',  label: 'Cancellation',    icon: XCircle },
      { id: 'notifications', label: 'Notifications',   icon: Bell },
      { id: 'content',       label: 'Content & Help',  icon: FileText },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'flags',  label: 'Feature Flags', icon: ToggleRight },
      { id: 'health', label: 'System Health', icon: Server },
      { id: 'alerts', label: 'Alerts',        icon: Bell },
      { id: 'audit',  label: 'Audit Logs',    icon: FileText },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap(g => g.items);

const SECTION_MAP = {
  overview: Overview, bookings: Bookings, orders: Bookings, users: AdminUsers, workers: Workers, shops: Shops,
  verification: ProviderOnboarding,
  // Old links (?tab=onboarding / ?tab=kyc) still land on the one Verification page.
  onboarding: ProviderOnboarding, kyc: ProviderOnboarding,
  services: ServicesHub, wallet: AdminWallet,
  disputes: Disputes, payouts: Payouts, intelligence: Intelligence,
  analytics: Analytics, business: BusinessIntelligence, notifications: NotificationsAdmin, heatmap: Heatmap,
  incentives: Incentives, cancellation: Cancellation, ads: Ads, promos: Promos,
  rewards: Rewards, shield: ShieldFund,
  audit: Audit, plans: AdminPlans, liveops: LiveOps, alerts: Alerts,
  retention: Retention, support: Support, flags: FeatureFlags, health: SystemHealth,
  events: Events,
  fraud: Fraud, zones: Zones, intervention: Intervention, cities: Cities,
  appeals: Appeals, training: Training, content: Content, rewardpoints: RewardsConfig,
  workerops: WorkerOps,
  searchintel: SearchIntel,
};

/* Sidebar nav item */
function NavItem({ item, isActive, onClick }) {
  const { icon: Icon, label } = item;
  return (
    <motion.button
      onClick={() => onClick(item.id)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left relative ${
        isActive
          ? 'text-white bg-white/10'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
      whileTap={{ scale: 0.98 }}
    >
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-indigo-400 rounded-full"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <Icon
        size={14}
        strokeWidth={isActive ? 2.5 : 1.75}
        className={isActive ? 'text-indigo-300' : 'text-slate-500'}
      />
      <span className="flex-1 truncate">{label}</span>
      {isActive && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-1.5 h-1.5 rounded-full bg-indigo-400"
        />
      )}
    </motion.button>
  );
}

/* Main */
export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('tab') || 'overview';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const [callLogout] = useLogoutMutation();

  const Section = SECTION_MAP[active] || Overview;
  const activeLabel = ALL_NAV.find(n => n.id === active)?.label || 'Dashboard';

  const handleNav = useCallback((id) => {
    setSearchParams({ tab: id }, { replace: true });
    setSidebarOpen(false);
  }, [setSearchParams]);

  async function doLogout() {
    try { await callLogout().unwrap(); } catch {}
    dispatch(logout());
    navigate(adminPath('/login'), { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f1117' }}>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-56 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:flex-shrink-0
      `} style={{ background: '#13151e', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo + brand */}
        <div className="flex items-center justify-between h-13 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
              <Zap size={14} strokeWidth={2.5} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none">Zappy</p>
              <p className="text-slate-500 text-[10px] font-medium leading-none mt-0.5">Admin Console</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        </div>

        {/* Live status */}
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-green-400"
              animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="text-[10px] font-bold text-green-400">All systems operational</span>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: 'none' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi ? 'mt-4' : ''}>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.12em] px-3 mb-1">{group.label}</p>
              {group.items.map(item => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={active === item.id}
                  onClick={handleNav}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-2 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:text-slate-200 hover:bg-white/5 transition text-left"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">

        {/* Topbar */}
        <header className="h-13 bg-white flex items-center px-4 lg:px-6 gap-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', height: 52 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <Menu size={17} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-slate-400">Admin</span>
            <ChevronRight size={13} className="text-slate-300" strokeWidth={2.5} />
            <span className="font-bold text-slate-800">{activeLabel}</span>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:block font-medium">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
              A
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <Suspense fallback={<div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>}>
                <Section />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
