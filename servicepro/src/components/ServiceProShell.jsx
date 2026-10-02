import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  LayoutDashboard, Wrench, Users, IndianRupee, Store, ShieldCheck, PlusCircle, Bell, UserRound,
} from 'lucide-react';
import PortalShell from '@shared/components/worker/PortalShell';
import { selectAuth, logout } from '@shared/modules/auth/authSlice';
import {
  useShopMeQuery, useGetWorkerMeQuery, useGetMyShopQuery, useLogoutMutation,
} from '@shared/services/api';

/**
 * ServicePro's frame for both people who use it. The owner runs the shop; a
 * technician only works the jobs the owner gives them, so each sees their own
 * pages — each page once: bottom bar on a phone, menu for the rest, sidebar on
 * a computer.
 */
const OWNER_PAGES = [
  { key: 'home', label: 'Home', Icon: LayoutDashboard, to: '/shop', primary: true },
  { key: 'work', label: 'Work & prices', Icon: Wrench, to: '/provider/services', primary: true },
  { key: 'team', label: 'Team', Icon: Users, to: '/shop/workers', primary: true },
  { key: 'earnings', label: 'Earnings', Icon: IndianRupee, to: '/shop/earnings', primary: true },
  { key: 'shop', label: 'Shop & hours', Icon: Store, to: '/shop/profile', primary: true },
  { key: 'kyc', label: 'Verification', Icon: ShieldCheck, to: '/shop/kyc' },
  { key: 'services', label: 'Add a service', Icon: PlusCircle, to: '/provider/onboarding' },
];

const TECHNICIAN_PAGES = [
  { key: 'home', label: 'Home', Icon: LayoutDashboard, to: '/worker', primary: true },
  { key: 'alerts', label: 'Alerts', Icon: Bell, to: '/worker/notifications', primary: true },
  { key: 'profile', label: 'Profile', Icon: UserRound, to: '/worker/profile', primary: true },
  { key: 'kyc', label: 'ID check', Icon: ShieldCheck, to: '/worker/kyc', primary: true },
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
  const [callLogout] = useLogoutMutation();

  async function signOut() {
    try { await callLogout().unwrap(); } catch { /* signing out locally regardless */ }
    dispatch(logout());
    nav(isOwner ? '/shop/login' : '/shop/worker/login', { replace: true });
  }

  // Not signed in: the page's own guard sends them to login; no frame around that.
  if (!accessToken || (!isOwner && !isTech)) return <Outlet />;

  return (
    <PortalShell
      items={isOwner ? OWNER_PAGES : TECHNICIAN_PAGES}
      label={isOwner ? 'Shop partner' : 'Shop team'}
      title={isOwner ? shopMe?.shop?.businessName : workerMe?.worker?.name}
      subtitle={isOwner ? shopMe?.shop?.phone : myShop?.shop?.name && `Working for ${myShop.shop.name}`}
      onSignOut={signOut}
    >
      <Outlet />
    </PortalShell>
  );
}
