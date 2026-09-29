import { lazy } from 'react';
import {
  LayoutDashboard, ShoppingBag, Users, Briefcase, Wallet, Scale, CreditCard, Gift, XCircle,
  FileText, FileCheck, Crown, Megaphone as Campaign, Ticket, Server, ToggleRight, Bell, HeadphonesIcon,
  Radio, Globe, Layers, Zap, Sparkles, Shield, PartyPopper, ShieldAlert, Map as MapIcon,
  AlertCircle, GraduationCap, Store, IndianRupee, BellRing, Activity, Coins,
} from 'lucide-react';
import Hub from '../pages/Hub';

/**
 * The admin console, declared once: sidebar groups, the page behind each
 * entry, and the tabs of every hub. The shell reads this and nothing else, so
 * adding a screen is one line here.
 */
const page = (load) => lazy(load);

const P = {
  Overview: page(() => import('../pages/Overview')),
  Insights: page(() => import('../pages/Intelligence')),
  Services: page(() => import('../pages/services/ServicesHub')),
  Users: page(() => import('../pages/Users')),
  Bookings: page(() => import('../pages/Bookings')),
  Support: page(() => import('../pages/Support')),
  Disputes: page(() => import('../pages/Disputes')),
  Promos: page(() => import('../pages/Promos')),
  Cashback: page(() => import('../pages/Rewards')),
  Points: page(() => import('../pages/RewardsConfig')),
  Plans: page(() => import('../pages/Plans')),
  Verification: page(() => import('../pages/ProviderOnboarding')),
  Shops: page(() => import('../pages/Shops')),
  Workers: page(() => import('../pages/Workers')),
  WorkerOps: page(() => import('../pages/WorkerOps')),
  Appeals: page(() => import('../pages/Appeals')),
  Training: page(() => import('../pages/Training')),
  Incentives: page(() => import('../pages/Incentives')),
  Events: page(() => import('../pages/Events')),
  Ads: page(() => import('../pages/Ads')),
  Payments: page(() => import('../pages/money/Payments')),
  Payouts: page(() => import('../pages/Payouts')),
  Wallets: page(() => import('../pages/Wallet')),
  Shield: page(() => import('../pages/ShieldFund')),
  LiveOps: page(() => import('../pages/LiveOps')),
  Intervention: page(() => import('../pages/Intervention')),
  Zones: page(() => import('../pages/Zones')),
  LaunchDemand: page(() => import('../pages/areas/LaunchDemand')),
  Fraud: page(() => import('../pages/Fraud')),
  Cancellation: page(() => import('../pages/Cancellation')),
  Notifications: page(() => import('../pages/Notifications')),
  Content: page(() => import('../pages/Content')),
  Cities: page(() => import('../pages/Cities')),
  Alerts: page(() => import('../pages/Alerts')),
  Health: page(() => import('../pages/SystemHealth')),
  Flags: page(() => import('../pages/FeatureFlags')),
  Audit: page(() => import('../pages/Audit')),
  Team: page(() => import('../pages/Team')),
};

/** A sidebar entry that is several related screens as tabs. */
const hub = (title, subtitle, views) => {
  const Comp = () => <Hub title={title} subtitle={subtitle} views={views} />;
  Comp.views = views;
  return Comp;
};

const HUBS = {
  helpdesk: hub('Help desk', 'Customer tickets and disputes', [
    { id: 'tickets', label: 'Tickets', icon: HeadphonesIcon, Comp: P.Support },
    { id: 'disputes', label: 'Disputes', icon: Scale, Comp: P.Disputes },
  ]),
  rewards: hub('Rewards', 'Cashback, referrals and loyalty points', [
    { id: 'cashback', label: 'Cashback & referrals', icon: Coins, Comp: P.Cashback },
    { id: 'points', label: 'Points & cards', icon: Gift, Comp: P.Points },
  ]),
  money: hub('Money', 'Everything that moves money: in, out, held and owed', [
    { id: 'payments', label: 'Payments', icon: IndianRupee, Comp: P.Payments },
    { id: 'payouts', label: 'Payouts', icon: CreditCard, Comp: P.Payouts },
    { id: 'wallets', label: 'Wallets', icon: Wallet, Comp: P.Wallets },
    { id: 'shield', label: 'Shield fund', icon: Shield, Comp: P.Shield },
  ]),
  liveops: hub('Live operations', 'Jobs in progress right now, and the ones that need a hand', [
    { id: 'board', label: 'Live board', icon: Radio, Comp: P.LiveOps },
    { id: 'stuck', label: 'Stuck jobs', icon: Zap, Comp: P.Intervention },
  ]),
  areas: hub('Service areas', 'Where ZappyOne serves, and where customers are asking for it', [
    { id: 'zones', label: 'Zones', icon: MapIcon, Comp: P.Zones },
    { id: 'demand', label: 'Launch demand', icon: BellRing, Comp: P.LaunchDemand },
  ]),
  content: hub('Content & SEO', 'Help articles and the public city pages', [
    { id: 'help', label: 'Help content', icon: FileText, Comp: P.Content },
    { id: 'cities', label: 'SEO city pages', icon: Globe, Comp: P.Cities },
  ]),
  status: hub('System status', 'What needs attention now, and the health of the platform underneath', [
    { id: 'alerts', label: 'Alerts', icon: AlertCircle, Comp: P.Alerts },
    { id: 'infra', label: 'Infrastructure', icon: Server, Comp: P.Health },
  ]),
};

export const NAV_GROUPS = [
  { label: 'Insights', items: [
    { id: 'overview', area: 'overview', label: 'Overview', icon: LayoutDashboard, Comp: P.Overview },
    { id: 'insights', area: 'insights', label: 'Insights', icon: Sparkles, Comp: P.Insights },
  ] },
  { label: 'Catalog', items: [
    { id: 'services', area: 'catalog', label: 'Services', icon: Layers, Comp: P.Services },
  ] },
  { label: 'Customers', items: [
    { id: 'users', area: 'customers', label: 'Customers', icon: Users, Comp: P.Users },
    { id: 'bookings', area: 'bookings', label: 'Bookings', icon: ShoppingBag, Comp: P.Bookings },
    { id: 'helpdesk', area: 'support', label: 'Help desk', icon: HeadphonesIcon, Comp: HUBS.helpdesk },
    { id: 'promos', area: 'marketing', label: 'Promo codes', icon: Ticket, Comp: P.Promos },
    { id: 'rewards', area: 'marketing', label: 'Rewards', icon: Gift, Comp: HUBS.rewards },
    { id: 'plans', area: 'marketing', label: 'Plans', icon: Crown, Comp: P.Plans },
  ] },
  { label: 'Providers', items: [
    { id: 'verification', area: 'providers', label: 'Verification', icon: FileCheck, Comp: P.Verification },
  ] },
  { label: 'ServicePro', items: [
    { id: 'shops', area: 'providers', label: 'Shops', icon: Store, Comp: P.Shops },
  ] },
  { label: 'Rakshak', items: [
    { id: 'workers', area: 'providers', label: 'Workers', icon: Briefcase, Comp: P.Workers },
    { id: 'workerops', area: 'providers', label: 'Worker ops', icon: Activity, Comp: P.WorkerOps },
    { id: 'appeals', area: 'providers', label: 'Appeals', icon: AlertCircle, Comp: P.Appeals },
    { id: 'training', area: 'providers', label: 'Training', icon: GraduationCap, Comp: P.Training },
    { id: 'incentives', area: 'providers', label: 'Incentives', icon: Gift, Comp: P.Incentives },
  ] },
  { label: 'Events', items: [
    { id: 'events', area: 'events', label: 'Event commerce', icon: PartyPopper, Comp: P.Events },
    { id: 'ads', area: 'marketing', label: 'Ad campaigns', icon: Campaign, Comp: P.Ads },
  ] },
  { label: 'Money', items: [
    { id: 'money', area: 'money', label: 'Money', icon: IndianRupee, Comp: HUBS.money },
  ] },
  { label: 'Operations', items: [
    { id: 'liveops', area: 'operations', label: 'Live operations', icon: Radio, Comp: HUBS.liveops },
    { id: 'areas', area: 'operations', label: 'Service areas', icon: MapIcon, Comp: HUBS.areas },
    { id: 'fraud', area: 'operations', label: 'Fraud detection', icon: ShieldAlert, Comp: P.Fraud },
    { id: 'cancellation', area: 'operations', label: 'Cancellation policy', icon: XCircle, Comp: P.Cancellation },
    { id: 'notifications', area: 'marketing', label: 'Notifications', icon: Bell, Comp: P.Notifications },
    { id: 'content', area: 'marketing', label: 'Content & SEO', icon: FileText, Comp: HUBS.content },
  ] },
  { label: 'System', items: [
    { id: 'status', area: 'system', label: 'System status', icon: Server, Comp: HUBS.status },
    { id: 'flags', area: 'system', label: 'Feature flags', icon: ToggleRight, Comp: P.Flags },
    { id: 'audit', area: 'system', label: 'Audit logs', icon: FileText, Comp: P.Audit },
    { id: 'team', area: 'admins', label: 'Admin team', icon: Users, Comp: P.Team },
  ] },
];

export const SECTIONS = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.id, i]));

/**
 * Old `?tab=` values (bookmarks, links inside pages, notification deep links)
 * → where that screen lives now. Resolved once, then the URL is rewritten.
 */
export const REDIRECTS = {
  orders: ['bookings'],
  onboarding: ['verification'], kyc: ['verification'],
  intelligence: ['insights'], searchintel: ['insights', 'search'], retention: ['insights', 'retention'],
  analytics: ['insights', 'analytics'], business: ['insights', 'business'], heatmap: ['insights', 'geo'],
  support: ['helpdesk', 'tickets'], disputes: ['helpdesk', 'disputes'],
  rewardpoints: ['rewards', 'points'],
  payouts: ['money', 'payouts'], wallet: ['money', 'wallets'], shield: ['money', 'shield'],
  intervention: ['liveops', 'stuck'],
  zones: ['areas', 'zones'], cities: ['content', 'cities'],
  health: ['status', 'infra'], alerts: ['status', 'alerts'],
};
