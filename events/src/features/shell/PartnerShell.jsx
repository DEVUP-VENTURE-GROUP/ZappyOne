import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, CalendarCheck, Images, CalendarDays, Wallet, UserRound, Megaphone, Bell, Menu, X, LogOut, Lock,
} from 'lucide-react';
import { usePartnerMeQuery, usePartnerOverviewQuery, usePartnerNotificationsQuery, useLogoutMutation } from '@shared/services/api';
import { logout } from '@shared/modules/auth/authSlice';
import { ZappyLogo } from '@shared/components/common/ZappyLogo';
import NotificationPanel from './NotificationPanel';
import { Spinner } from '../../components/ui';

/**
 * The frame of the partner portal: a sidebar on a computer; on a phone a top
 * bar, a bottom bar with the daily pages, and a menu with the rest. Pages that
 * need a verified partner are shown locked (not hidden) until KYC is approved,
 * so a new partner can see what they are working towards.
 */
export const NAV = [
  { to: '/partner', label: 'Overview', Icon: LayoutDashboard, end: true, primary: true },
  { to: '/partner/bookings', label: 'Bookings', Icon: CalendarCheck, primary: true, gated: true },
  { to: '/partner/packages', label: 'Packages', Icon: Images, primary: true, gated: true },
  { to: '/partner/calendar', label: 'Calendar', Icon: CalendarDays, primary: true, gated: true },
  { to: '/partner/earnings', label: 'Earnings', Icon: Wallet, primary: true, gated: true },
  { to: '/partner/profile', label: 'Profile & KYC', Icon: UserRound },
  { to: '/partner/advertise', label: 'Advertise', Icon: Megaphone },
];

function Item({ item, locked, badge, onPick, compact = false }) {
  const { to, label, Icon, end } = item;
  if (locked) {
    return (
      <span className={`flex items-center gap-3 rounded-btn px-3 py-2.5 text-[14px] text-ink-400 ${compact ? 'flex-col gap-1 px-0 py-2 text-[11px]' : ''}`} title="Available after verification">
        <span className="relative"><Icon size={compact ? 21 : 18} /><Lock size={10} className="absolute -right-2 -top-1" /></span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <NavLink to={to} end={end} onClick={onPick}
      className={({ isActive }) => (compact
        ? `relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${isActive ? 'font-semibold text-zappy-600' : 'text-ink-500'}`
        : `flex items-center gap-3 rounded-btn px-3 py-2.5 text-[14px] font-medium ${isActive ? 'bg-zappy-50 text-zappy-700' : 'text-ink-700 hover:bg-sunken'}`)}>
      <span className="relative">
        <Icon size={compact ? 21 : 18} />
        {badge > 0 && <span className="absolute -right-2 -top-1.5 rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white">{badge > 9 ? '9+' : badge}</span>}
      </span>
      <span className={compact ? '' : 'flex-1'}>{label}</span>
    </NavLink>
  );
}

export default function PartnerShell() {
  const dispatch = useDispatch();
  const nav = useNavigate();
  const [doLogout] = useLogoutMutation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: meData } = usePartnerMeQuery();
  const { data: overview } = usePartnerOverviewQuery(undefined, { pollingInterval: 60000 });
  const { data: notifData } = usePartnerNotificationsQuery({ page: 1, unreadOnly: false }, { pollingInterval: 30000 });

  const partner = meData?.partner;
  const verified = partner?.kyc?.status === 'approved';
  const pending = overview?.stats?.pendingConfirmations || 0;
  const unread = notifData?.unread || 0;

  async function signOut() {
    try { await doLogout().unwrap(); } catch { /* signed out locally either way */ }
    dispatch(logout());
    nav('/partner/login', { replace: true });
  }

  const badgeFor = (item) => (item.to === '/partner/bookings' ? pending : 0);
  const lockedFor = (item) => item.gated && !verified;

  const account = partner && (
    <div className="flex items-center gap-3 rounded-btn border border-line px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zappy-50 text-[14px] font-bold text-zappy-700">
        {partner.businessName?.[0]?.toUpperCase() || 'P'}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink-900">{partner.businessName}</span>
        <span className={`block text-[12px] ${verified ? 'text-green-700' : 'text-amber-700'}`}>{verified ? 'Verified partner' : 'Verification pending'}</span>
      </span>
    </div>
  );

  const bell = (
    <button type="button" onClick={() => setNotifOpen(true)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative flex h-10 w-10 items-center justify-center rounded-btn border border-line bg-white text-ink-700 hover:bg-sunken">
      <Bell size={18} />
      {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Computer: sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <ZappyLogo size={28} />
          <span className="text-[13px] font-medium text-ink-500">Event partner</span>
        </div>
        <div className="px-4 pb-4">{account}</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Partner">
          {NAV.map((item) => <Item key={item.to} item={item} locked={lockedFor(item)} badge={badgeFor(item)} />)}
        </nav>
        <div className="border-t border-line p-3">
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-[14px] font-medium text-ink-500 hover:bg-red-50 hover:text-red-700">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 lg:h-16 lg:px-8">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-btn hover:bg-sunken lg:hidden"><Menu size={20} /></button>
            <span className="lg:hidden"><ZappyLogo size={24} /></span>
            <div className="ml-auto">{bell}</div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-7">
          <Suspense fallback={<Spinner />}>
            <Outlet context={{ partner, verified }} />
          </Suspense>
        </main>
      </div>

      {/* Phone: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Partner">
        {NAV.filter((n) => n.primary).map((item) => <Item key={item.to} item={item} locked={lockedFor(item)} badge={badgeFor(item)} compact />)}
      </nav>

      {/* Phone: menu with the rest */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex bg-ink-900/40 lg:hidden"
            onClick={(e) => e.target === e.currentTarget && setMenuOpen(false)}>
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="flex h-full w-72 flex-col bg-white">
              <div className="flex items-center justify-between px-4 py-4">
                <ZappyLogo size={24} />
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-btn hover:bg-sunken"><X size={18} /></button>
              </div>
              <div className="px-4 pb-3">{account}</div>
              <nav className="flex-1 space-y-0.5 px-3">
                {NAV.filter((n) => !n.primary).map((item) => <Item key={item.to} item={item} locked={lockedFor(item)} onPick={() => setMenuOpen(false)} />)}
              </nav>
              <div className="border-t border-line p-3">
                <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-[14px] font-medium text-ink-500 hover:bg-red-50 hover:text-red-700"><LogOut size={18} /> Sign out</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}</AnimatePresence>
    </div>
  );
}
