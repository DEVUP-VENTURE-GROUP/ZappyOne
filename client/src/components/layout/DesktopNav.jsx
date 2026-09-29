import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Bell, UserRound } from 'lucide-react';
import { selectAuth, selectIsAuthed } from '@shared/modules/auth/authSlice';
import { useListNotificationsQuery } from '@shared/services/api';
import { useT } from '@shared/i18n/I18nProvider';
import ZappyMark from '../common/ZappyMark';
import { prefetchRoute } from '../../lib/routePrefetch';

/**
 * Top navigation from tablet width up; phones keep the bottom bar.
 * On Home it takes the brand blue so it and the home header read as one
 * header; everywhere else it is a plain white bar.
 */
const LINKS = [
  { to: '/', label: 'Home', tKey: 'nav.home', end: true },
  { to: '/services', label: 'All services', tKey: 'nav.services' },
  { to: '/orders', label: 'Bookings', tKey: 'nav.bookings' },
  { to: '/track', label: 'Track', tKey: 'nav.track' },
];

export default function DesktopNav() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const t = useT();
  const isAuthed = useSelector(selectIsAuthed);
  const { profile } = useSelector(selectAuth);
  const { data } = useListNotificationsQuery({ page: 1, unreadOnly: true }, { skip: !isAuthed, pollingInterval: 60000 });
  const unread = data?.unread ?? data?.notifications?.length ?? 0;

  const onBrand = pathname === '/';
  const bar = onBrand ? 'bg-zappy-600 text-white' : 'bg-white text-navy border-b border-slate-200';
  const link = (active) => (onBrand
    ? `${active ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white'}`
    : `${active ? 'bg-zappy-50 text-zappy-700' : 'text-slate-600 hover:text-navy'}`);
  const iconBtn = onBrand ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-100 hover:bg-slate-200';

  return (
    <header className={`hidden md:block ${bar}`}>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <NavLink to="/" className="flex items-center gap-2" aria-label="ZappyOne home">
          <ZappyMark size={26} />
          <span className="text-[17px] font-bold">ZappyOne</span>
        </NavLink>

        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onMouseEnter={() => prefetchRoute(l.to)}
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors ${link(isActive)}`}
            >
              {t(l.tKey, l.label)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => nav('/notifications')}
            aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full transition ${iconBtn}`}>
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {isAuthed ? (
            <button type="button" onClick={() => nav('/profile')} aria-label="Your profile"
              className={`h-9 w-9 overflow-hidden rounded-full transition ${iconBtn}`}>
              {profile?.avatar
                ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full items-center justify-center"><UserRound size={17} /></span>}
            </button>
          ) : (
            <button type="button" onClick={() => nav('/login')}
              className={`rounded-lg px-3.5 py-1.5 text-[14px] font-semibold ${onBrand ? 'bg-white text-zappy-700' : 'bg-zappy-600 text-white'}`}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
