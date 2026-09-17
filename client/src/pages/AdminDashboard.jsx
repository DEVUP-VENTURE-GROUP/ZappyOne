import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ShoppingBag, Users, Briefcase, Tag,
  Wallet, Scale, CreditCard, BarChart2, Gift, XCircle,
  FileText, LogOut, Menu, X, ChevronRight, FileCheck, Crown,
  Megaphone, Ticket, Server, ToggleRight, Bell, Repeat2,
  HeadphonesIcon, Radio, Globe, Layers, Zap, Sparkles, TrendingUp,
  Shield, PartyPopper, ShieldAlert, Map as MapIcon,
  AlertCircle, GraduationCap, Search, Store, ChevronDown, Smartphone, Laptop, Bike, Car, Droplets, PawPrint,
} from 'lucide-react';
import { logout } from '../modules/auth/authSlice';
import { useLogoutMutation } from '../services/api';
import { adminPath } from '../config/admin';

const Overview = lazy(() => import('./admin/Overview'));
const Helping = lazy(() => import('./admin/Helping'));
const Pet = lazy(() => import('./admin/Pet'));
const Orders = lazy(() => import('./admin/Orders'));
const AdminUsers = lazy(() => import('./admin/Users'));
const Workers = lazy(() => import('./admin/Workers'));
const Shops = lazy(() => import('./admin/Shops'));
// What providers may sign up to do, and the verification each service demands.
const ProviderOnboarding = lazy(() => import('./admin/ProviderOnboarding'));
// One generic console, rendered per vertical — see RepairVertical.jsx.
const RepairVertical = lazy(() => import('./admin/repair/RepairVertical'));
const RepairMobile = () => <RepairVertical vertical="mobile" label="Mobile Repair" />;
// Laptops are identified below model level, so the deep-catalog tabs apply.
const RepairLaptop = () => <RepairVertical vertical="laptop" label="Laptop Services" deepCatalog />;
// Two-wheelers identify at vehicle type -> brand -> model, so deep catalog applies.
const RepairTwoWheeler = () => <RepairVertical vertical="two_wheeler" label="Two-Wheeler Services" deepCatalog />;
const RepairFourWheeler = () => <RepairVertical vertical="four_wheeler" label="Four-Wheeler Services" deepCatalog />;
// Shallow catalog — tank type sits in the brand slot, capacity in the model
// slot, so there is no product-type tier to show.
const RepairWaterTankCare = () => <RepairVertical vertical="water_tank_care" label="Water & Tank Care" />;
const Pricing = lazy(() => import('./admin/Pricing'));
const AdminWallet = lazy(() => import('./admin/Wallet'));
const Disputes = lazy(() => import('./admin/Disputes'));
const Payouts = lazy(() => import('./admin/Payouts'));
const Analytics = lazy(() => import('./admin/Analytics'));
const Incentives = lazy(() => import('./admin/Incentives'));
const Cancellation = lazy(() => import('./admin/Cancellation'));
const Audit = lazy(() => import('./admin/Audit'));
const AdminKycReview = lazy(() => import('./AdminKycReview'));
const AdminPlans = lazy(() => import('./admin/Plans'));
const Ads = lazy(() => import('./admin/Ads'));
const Promos = lazy(() => import('./admin/Promos'));
const SystemHealth = lazy(() => import('./admin/SystemHealth'));
const Heatmap = lazy(() => import('./admin/Heatmap'));
const FeatureFlags = lazy(() => import('./admin/FeatureFlags'));
const Alerts = lazy(() => import('./admin/Alerts'));
const Retention = lazy(() => import('./admin/Retention'));
const Support = lazy(() => import('./admin/Support'));
const LiveOps = lazy(() => import('./admin/LiveOps'));
const Services = lazy(() => import('./admin/Services'));
const Rewards = lazy(() => import('./admin/Rewards'));
const BusinessIntelligence = lazy(() => import('./admin/BusinessIntelligence'));
const Intelligence = lazy(() => import('./admin/Intelligence'));
const NotificationsAdmin = lazy(() => import('./admin/Notifications'));
const ShieldFund = lazy(() => import('./admin/ShieldFund'));
const Events = lazy(() => import('./admin/Events'));
const Fraud = lazy(() => import('./admin/Fraud'));
const Zones = lazy(() => import('./admin/Zones'));
const Content = lazy(() => import('./admin/Content'));
const RewardsConfig = lazy(() => import('./admin/RewardsConfig'));
const WorkerOps = lazy(() => import('./admin/WorkerOps'));
const SearchIntel = lazy(() => import('./admin/SearchIntel'));
const Intervention = lazy(() => import('./admin/Intervention'));
const Cities = lazy(() => import('./admin/Cities'));
const Appeals = lazy(() => import('./admin/Appeals'));
const Training = lazy(() => import('./admin/Training'));

/* ─── Navigation groups ────────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { id: 'overview',  label: 'Overview',    icon: LayoutDashboard },
      { id: 'orders',    label: 'Orders',       icon: ShoppingBag },
      { id: 'users',     label: 'Users',        icon: Users },
      { id: 'workers',   label: 'Workers',      icon: Briefcase },
      { id: 'shops',     label: 'Shops',        icon: Store },
      { id: 'onboarding', label: 'Provider Onboarding', icon: FileCheck },
      { id: 'workerops', label: 'Worker Ops',   icon: Briefcase },
      { id: 'kyc',       label: 'KYC Review',   icon: FileCheck },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { id: 'pricing',   label: 'Pricing',            icon: Tag },
      { id: 'services',  label: 'Service Catalog',     icon: Layers },
      { id: 'plans',     label: 'Plans',               icon: Crown },
      { id: 'rewards',   label: 'Rewards',             icon: Sparkles },
      { id: 'rewardpoints', label: 'Points & Cards',  icon: Gift },
      { id: 'wallet',      label: 'Wallet',              icon: Wallet },
      { id: 'payouts',     label: 'Payouts',             icon: CreditCard },
      { id: 'shield',      label: 'Shield Fund',         icon: Shield },
      { id: 'promos',      label: 'Promo Codes',         icon: Ticket },
      { id: 'ads',         label: 'Ad Campaigns',        icon: Megaphone },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'liveops',      label: 'Live Ops',         icon: Radio },
      { id: 'intervention', label: 'Intervention',     icon: Zap },
      { id: 'fraud',        label: 'Fraud Detection',  icon: ShieldAlert },
      { id: 'zones',        label: 'Zones',            icon: MapIcon },
      { id: 'cities',       label: 'Cities & Areas',   icon: Globe },
      { id: 'disputes',     label: 'Disputes',         icon: Scale },
      { id: 'appeals',      label: 'Worker Appeals',   icon: AlertCircle },
      { id: 'training',     label: 'Training',         icon: GraduationCap },
      { id: 'cancellation', label: 'Cancellation',     icon: XCircle },
      { id: 'incentives',   label: 'Incentives',       icon: Gift },
      { id: 'retention',    label: 'Retention',        icon: Repeat2 },
      { id: 'support',      label: 'Support',          icon: HeadphonesIcon },
      { id: 'content',      label: 'Content & Help',   icon: FileText },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'intelligence',   label: 'Intelligence & Expansion', icon: Sparkles },
      { id: 'searchintel',    label: 'Search Intel',       icon: Search },
      { id: 'notifications',  label: 'Notifications',      icon: Bell },
      { id: 'alerts',         label: 'Alerts',             icon: Bell },
      { id: 'audit',          label: 'Audit Logs',         icon: FileText },
    ],
  },
  {
    label: 'Events',
    items: [
      { id: 'events', label: 'Event Commerce', icon: PartyPopper },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'flags',        label: 'Feature Flags',    icon: ToggleRight },
      { id: 'health',       label: 'System Health',    icon: Server },
    ],
  },
];

/**
 * Expandable trees rendered above the flat groups.
 *
 * Each vertical gets its own console rather than being crammed into the shared
 * "Service Catalog" screen, because a vertical owns its own taxonomy, pricing
 * model and diagnostics — mobile repair has brands/models/problems that mean
 * nothing to plumbing. New verticals are added as children here.
 */
const NAV_TREES = [
  {
    id: 'services',
    label: 'Services',
    icon: Layers,
    children: [
      { id: 'repair-mobile', label: 'Mobile', icon: Smartphone },
      { id: 'repair-laptop', label: 'Laptop', icon: Laptop },
      { id: 'repair-two-wheeler', label: 'Two-Wheeler', icon: Bike },
      { id: 'repair-four-wheeler', label: 'Four-Wheeler', icon: Car },
      { id: 'repair-water-tank-care', label: 'Water & Tank Care', icon: Droplets },
      { id: 'helping', label: 'Helping Services', icon: ShoppingBag },
      { id: 'pet', label: 'Pet Services', icon: PawPrint },
    ],
  },
];

const ALL_NAV = [
  ...NAV_GROUPS.flatMap(g => g.items),
  ...NAV_TREES.flatMap(t => t.children),
];

const SECTION_MAP = {
  overview: Overview, orders: Orders, users: AdminUsers, workers: Workers, shops: Shops,
  onboarding: ProviderOnboarding,
  'repair-mobile': RepairMobile,
  'repair-laptop': RepairLaptop,
  'repair-two-wheeler': RepairTwoWheeler,
  'repair-four-wheeler': RepairFourWheeler,
  'repair-water-tank-care': RepairWaterTankCare,
  helping: Helping,
  pet: Pet,
  kyc: AdminKycReview, pricing: Pricing, services: Services, wallet: AdminWallet,
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

/* ─── Sidebar nav item ─────────────────────────────────────────────────── */
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

/* ─── Expandable nav group ─────────────────────────────────────────────────
 * "Services" is a container, not a destination — clicking it reveals the
 * verticals underneath rather than navigating anywhere itself. Each vertical
 * (Mobile today, others as they launch) is its own console section.
 * Expansion is derived from whether a child is active, so deep-linking to
 * ?tab=repair-mobile opens the tree already unfolded rather than looking
 * like the item was reached from nowhere.
 */
function NavTree({ group, active, onClick }) {
  const containsActive = group.children.some((c) => c.id === active);
  const [open, setOpen] = useState(containsActive);

  useEffect(() => { if (containsActive) setOpen(true); }, [containsActive]);

  const { icon: Icon } = group;
  return (
    <div>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
          containsActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
        whileTap={{ scale: 0.98 }}
        aria-expanded={open}
      >
        <Icon size={14} strokeWidth={containsActive ? 2.5 : 1.75} className={containsActive ? 'text-indigo-300' : 'text-slate-500'} />
        <span className="flex-1 truncate">{group.label}</span>
        <ChevronDown
          size={13}
          className={`text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="ml-4 pl-2 mt-0.5 space-y-0.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
              {group.children.map((child) => {
                const ChildIcon = child.icon;
                const isActive = active === child.id;
                return (
                  <button
                    key={child.id}
                    onClick={() => onClick(child.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium transition-all text-left ${
                      isActive ? 'text-white bg-indigo-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <ChildIcon size={13} strokeWidth={isActive ? 2.5 : 1.75} className={isActive ? 'text-indigo-300' : 'text-slate-500'} />
                    <span className="flex-1 truncate">{child.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────────── */
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

      {/* ─── Sidebar ───────────────────────────────────────────────── */}
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
          {/* Verticals — expandable, sits above the flat groups */}
          <div>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.12em] px-3 mb-1">Verticals</p>
            {NAV_TREES.map((tree) => (
              <NavTree key={tree.id} group={tree} active={active} onClick={handleNav} />
            ))}
          </div>

          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className="mt-4">
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

      {/* ─── Main panel ────────────────────────────────────────────── */}
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
