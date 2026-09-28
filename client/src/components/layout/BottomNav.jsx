import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ClipboardList, MapPin, User } from 'lucide-react';
import ZappyMark from '../common/ZappyMark';
import { api, useListNotificationsQuery } from '@shared/services/api';
import { useSelector } from 'react-redux';
import { selectIsAuthed } from '@shared/modules/auth/authSlice';
import { motion } from 'framer-motion';
import { prefetchRoute } from '../../lib/routePrefetch';
import { useT } from '@shared/i18n/I18nProvider';

// 2 tabs each side + a big raised "Book Now" button in the middle.
// Wallet lives under Profile/Account.
const SIDE_TABS = [
  { key: 'home',     label: 'Home',     tKey: 'nav.home',     path: '/',        Icon: Home,          side: 'left'  },
  { key: 'bookings', label: 'Bookings', tKey: 'nav.bookings', path: '/orders',  Icon: ClipboardList, side: 'left'  },
  { key: 'track',    label: 'Track',    tKey: 'nav.track',    path: '/track',   Icon: MapPin,        side: 'right' },
  { key: 'profile',  label: 'Profile',  tKey: 'nav.profile',  path: '/profile', Icon: User,          side: 'right' },
];

function Tab({ t, isActive, onPress, onWarm, badge = 0 }) {
  const { label, Icon } = t;
  return (
    <button
      onClick={onPress}
      onPointerDown={onWarm}
      onMouseEnter={onWarm}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 outline-none active:opacity-70"
      aria-label={label}
    >
      <div className="relative">
        <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-zappy-600' : 'text-slate-400'} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none ring-2 ring-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-semibold ${isActive ? 'text-zappy-600' : 'text-slate-400'}`}>{label}</span>
    </button>
  );
}

export default function BottomNav({ active }) {
  const nav        = useNavigate();
  const loc        = useLocation();
  const tr         = useT();
  const isAuthed   = useSelector(selectIsAuthed);
  const path       = loc.pathname;
  const isBook     = path.startsWith('/book') || path.startsWith('/services');
  const currentKey = active || SIDE_TABS.find((t) => t.path === path)?.key || (isBook ? 'book' : 'home');

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

  const left  = SIDE_TABS.filter((t) => t.side === 'left');
  const right = SIDE_TABS.filter((t) => t.side === 'right');

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none">
      <nav
        className="w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-2px_12px_rgba(20,21,42,0.06)] h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] flex items-center pointer-events-auto relative"
      >
        <div className="flex flex-1">
          {left.map((t) => (
            <Tab key={t.key} t={{ ...t, label: tr(t.tKey, t.label) }} isActive={currentKey === t.key} onPress={() => nav(t.path)} onWarm={warm(t.path)} />
          ))}
        </div>

        {/* reserve space for the raised center button */}
        <div className="w-20 shrink-0" />

        <div className="flex flex-1">
          {right.map((t) => (
            <Tab
              key={t.key}
              t={{ ...t, label: tr(t.tKey, t.label) }}
              isActive={currentKey === t.key}
              onPress={() => nav(t.path)}
              onWarm={warm(t.path)}
              badge={t.key === 'profile' ? unreadCount : 0}
            />
          ))}
        </div>

        {/* Big raised center "Book Now" button */}
        <button
          onClick={() => nav('/services')}
          onPointerDown={warm('/services')}
          onMouseEnter={warm('/services')}
          aria-label="Book a service"
          className="absolute left-1/2 -translate-x-1/2 -top-6 flex flex-col items-center pointer-events-auto outline-none"
        >
          <motion.div
            whileTap={{ scale: 0.92 }}
            className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-white shadow-[0_8px_24px_-4px_rgba(37,99,235,0.35)] bg-zappy-gradient"
          >
            <ZappyMark size={34} />
          </motion.div>
          <span className={`text-[10px] font-bold mt-1 ${isBook ? 'text-zappy-700' : 'text-zappy-600'}`}>{tr('nav.book', 'Book Now')}</span>
        </button>
      </nav>
    </div>
  );
}
