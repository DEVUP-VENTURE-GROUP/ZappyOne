import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  LayoutDashboard, Wrench, Users, IndianRupee, Store, ShieldCheck, PlusCircle, Bell, UserRound, Star, MessageSquareQuote, Scale, FileText, Wallet, Landmark, KanbanSquare, BarChart3, Repeat, Headphones } from 'lucide-react';
import PortalShell from '@shared/components/worker/PortalShell';
import ProfileGate, { ALWAYS } from './ProfileGate';
import { STAFF_HELP_PHONE, ownerPages as sharedOwnerPages } from '@shared/provider/partnerPages';
import { selectAuth, logout } from '@shared/modules/auth/authSlice';
import {
  useShopMeQuery, useGetWorkerMeQuery, useGetMyShopQuery, useLogoutMutation, useProviderWorkspaceQuery, useProviderProfileStatusQuery, useAccountMeQuery,
} from '@shared/services/api';

// ServicePro's frame for a business and its technicians. Every partner has the core pages; the sections and words of their trades come from the server (onboarding/workspace), so a new kind of work changes data, not this file.
const ICONS = { LayoutDashboard, Wrench, Users, IndianRupee, Store, ShieldCheck, PlusCircle, Bell, UserRound, Star, MessageSquareQuote, Scale, Wallet, Landmark, KanbanSquare, BarChart3, Repeat, Headphones };
const ownerPages = (workspace) => sharedOwnerPages(workspace).map((p) => ({ ...p, Icon: ICONS[p.icon] }));

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
  { key: 'appeals', label: 'Ask us to recheck', Icon: Scale, to: '/worker/appeals' },
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
