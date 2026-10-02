import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ClipboardList, MapPin, User, LayoutGrid } from 'lucide-react';
import { api, useListNotificationsQuery } from '@shared/services/api';
import { useSelector } from 'react-redux';
import { selectIsAuthed } from '@shared/modules/auth/authSlice';
import { prefetchRoute } from '../../lib/routePrefetch';
import { useT } from '@shared/i18n/I18nProvider';

// Five even tabs. Booking starts from Services (or search on Home) like any
// other destination; no raised button competing with the content above it.
const TABS = [
  { key: 'home',     label: 'Home',     tKey: 'nav.home',     path: '/',        Icon: Home },
  { key: 'services', label: 'Services', tKey: 'nav.services', path: '/services', Icon: LayoutGrid },
  { key: 'bookings', label: 'Bookings', tKey: 'nav.bookings', path: '/orders',  Icon: ClipboardList },
  { key: 'track',    label: 'Track',    tKey: 'nav.track',    path: '/track',   Icon: MapPin },
  { key: 'profile',  label: 'Profile',  tKey: 'nav.profile',  path: '/profile', Icon: User },
];

function Tab({ t, isActive, onPress, onWarm, badge = 0 }) {
  const { label, Icon } = t;
  return (
    <button
      onClick={onPress}
      onPointerDown={onWarm}
      onMouseEnter={onWarm}
      className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 outline-none"
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className="relative">
        <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? 'text-zappy-600' : 'text-ink-400'} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none ring-2 ring-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[11px] ${isActive ? 'font-semibold text-zappy-600' : 'font-medium text-ink-500'}`}>{label}</span>
    </button>
  );
}

export default function BottomNav({ active }) {
  const nav        = useNavigate();
  const loc        = useLocation();
  const tr         = useT();
  const isAuthed   = useSelector(selectIsAuthed);
  const path       = loc.pathname;
  const currentKey = active || TABS.find((t) => (t.path === '/' ? path === '/' || path === '/home' : path.startsWith(t.path)))?.key
    || (path.startsWith('/book') ? 'services' : 'home');

  const { data: notifData } = useListNotificationsQuery(
    { page: 1, unreadOnly: true },
    { skip: !isAuthed, pollingInterval: 60000 }
  );
  const unreadCount = notifData?.notifications?.length || 0;

  // Prefetch a tab's data into the RTK cache so the page shows real content,
  // not a skeleton, by the time the navigation completes.
  const prefetchOrders = api.usePrefetch('listOrders');
  const prefetchMe     = api.usePrefetch('getMe');

  // On touch/hover of a tab: warm its JS chunk + its first data query.
  const warm = (path) => () => {
    prefetchRoute(path);
    if (!isAuthed) return;
    if (path === '/orders') prefetchOrders(1);
    else if (path === '/profile') prefetchMe();
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[100] flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((t) => (
        <Tab
          key={t.key}
          t={{ ...t, label: tr(t.tKey, t.label) }}
          isActive={currentKey === t.key}
          onPress={() => nav(t.path)}
          onWarm={warm(t.path)}
          badge={t.key === 'profile' ? unreadCount : 0}
        />
      ))}
    </nav>
  );
}
