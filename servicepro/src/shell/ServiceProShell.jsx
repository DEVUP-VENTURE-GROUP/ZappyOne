import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  LayoutDashboard, Wrench, Users, IndianRupee, Store, ShieldCheck, PlusCircle, Bell, UserRound, Star, MessageSquareQuote, Scale, FileText, Wallet, Landmark, KanbanSquare, BarChart3, Repeat } from 'lucide-react';
import PortalShell from '@shared/components/worker/PortalShell';
import ProfileGate, { ALWAYS } from './ProfileGate';
import { STAFF_HELP_PHONE } from '@shared/provider/partnerPages';
import { selectAuth, logout } from '@shared/modules/auth/authSlice';
import {
  useShopMeQuery, useGetWorkerMeQuery, useGetMyShopQuery, useLogoutMutation, useProviderWorkspaceQuery, useProviderProfileStatusQuery, useAccountMeQuery,
} from '@shared/services/api';

// ServicePro's frame for a business and its technicians. Every partner has the core pages; the sections and words of their trades come from the server (onboarding/workspace), so a new kind of work changes data, not this file.
// The optional sections (pricereq, plans, insights) appear only when a trade asks for them; `labels` renames pages for that trade.
const OPTIONAL = new Set(['pricereq', 'plans', 'insights']);
export function ownerPages(workspace) {
  const on = new Set(workspace?.modules || []);
  const labels = workspace?.labels || {};
  return OWNER_PAGES.filter((p) => !OPTIONAL.has(p.key) || on.has(p.key)).map((p) => (labels[p.key] ? { ...p, label: labels[p.key] } : p));
}

const OWNER_PAGES = [
  { key: 'home', label: 'Home', Icon: LayoutDashboard, to: '/shop', primary: true },
  { key: 'work', label: 'Work & prices', Icon: Wrench, to: '/provider/services', primary: true },
  { key: 'pricereq', label: 'Price requests', Icon: MessageSquareQuote, to: '/shop/price-requests' },
  { key: 'orders', label: 'Orders', Icon: KanbanSquare, to: '/shop/orders' },
  { key: 'plans', label: 'Plans', Icon: Repeat, to: '/shop/plans' },
  { key: 'team', label: 'Team', Icon: Users, to: '/shop/workers', primary: true },
  { key: 'insights', label: 'Insights', Icon: BarChart3, to: '/shop/insights' },
  { key: 'earnings', label: 'Earnings', Icon: IndianRupee, to: '/shop/earnings', primary: true },
  { key: 'withdraw', label: 'Withdraw', Icon: Wallet, to: '/shop/withdraw' },
  { key: 'bank', label: 'Bank & UPI', Icon: Landmark, to: '/shop/bank' },
  { key: 'notifications', label: 'Notifications', Icon: Bell, to: '/shop/notifications' },
  { key: 'account', label: 'Profile', Icon: UserRound, to: '/shop/account' },
  { key: 'shop', label: 'Shop & hours', Icon: Store, to: '/shop/profile', primary: true },
  { key: 'reviews', label: 'Reviews', Icon: Star, to: '/shop/reviews' },
  { key: 'kyc', label: 'Verification', Icon: ShieldCheck, to: '/shop/kyc' },
  { key: 'appeals', label: 'Appeals', Icon: Scale, to: '/shop/appeals' },
  { key: 'services', label: 'Add a service', Icon: PlusCircle, to: '/provider/onboarding' },
];

// While the profile is unfinished every other page is locked and opens the next missing step instead.
function lockUntilComplete(items, status) {
  if (!status || status.complete || !status.missing?.length) return items;
  const next = status.missing[0].path;
  return items.map((p) => (ALWAYS.some((a) => p.to.startsWith(a)) ? p : { ...p, locked: true, to: next }));
}

const TECHNICIAN_PAGES = [
  { key: 'home', label: 'Home', Icon: LayoutDashboard, to: '/worker', primary: true },
  { key: 'alerts', label: 'Alerts', Icon: Bell, to: '/worker/notifications', primary: true },
  { key: 'profile', label: 'Profile', Icon: UserRound, to: '/worker/profile', primary: true },
  { key: 'kyc', label: 'ID check', Icon: ShieldCheck, to: '/worker/kyc', primary: true },
  { key: 'appeals', label: 'Appeals', Icon: Scale, to: '/worker/appeals' },
  { key: 'documents', label: 'My documents', Icon: FileText, to: '/provider/documents' },
];

export default function ServiceProShell() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { role, accessToken } = useSelector(selectAuth);
  const isOwner = role === 'shop';
  const isTech = role === 'worker';
  const { data: shopMe } = useShopMeQuery(undefined, { skip: !isOwner });
  const { data: workerMe } = useGetWorkerMeQuery(undefined, { skip: !isTech });
  const { data: myShop } = useGetMyShopQuery(undefined, { skip: !isTech });
  const { data: workspace } = useProviderWorkspaceQuery(undefined, { skip: !accessToken || (!isOwner && !isTech) });
  const { data: profile } = useProviderProfileStatusQuery(undefined, { skip: !accessToken || (!isOwner && !isTech), refetchOnMountOrArgChange: 30 });
  const { data: account } = useAccountMeQuery(undefined, { skip: !accessToken || (!isOwner && !isTech) });
  const [callLogout] = useLogoutMutation();

  async function signOut() {
    try { await callLogout().unwrap(); } catch { /* signing out locally regardless */ }
    dispatch(logout());
    nav('/login', { replace: true });
  }

  // Not signed in: the page's own guard sends them to login; no frame around that.
  if (!accessToken || (!isOwner && !isTech)) return <Outlet />;

  return (
    <PortalShell
      items={lockUntilComplete(isOwner ? ownerPages(workspace) : TECHNICIAN_PAGES, profile)}
      label={isOwner ? (workspace?.domains?.[0]?.name || 'ServicePro partner') : 'Team'}
      title={isOwner ? shopMe?.shop?.businessName : workerMe?.worker?.name}
      subtitle={isOwner ? shopMe?.shop?.phone : myShop?.shop?.name && `Working for ${myShop.shop.name}`}
      photo={account?.photoUrl}
      helpPhone={STAFF_HELP_PHONE}
      onSignOut={signOut}
    >
      <ProfileGate><Outlet /></ProfileGate>
    </PortalShell>
  );
}
