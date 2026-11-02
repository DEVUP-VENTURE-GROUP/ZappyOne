import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, LogOut, ChevronRight, Lock, Bell, PhoneCall } from 'lucide-react';
import { useListNotificationsQuery } from '../../services/api';
import { ZappyWordmark } from '../common/ZappyLogo';
import { WorkerSidebar, WorkerBottomNav } from './DashboardUI';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { useT } from '../../i18n/I18nProvider';
import { labelKey } from '../../i18n/translations';

/**
 * The frame around a provider portal: sidebar on a computer; on a phone a top
 * bar, a bottom bar with the `primary` pages, and a menu with only the rest.
 * Every page appears once per screen size — never in two bars at the same time.
 *
 *   items     [{ key, label, Icon, to, primary?, locked? }]  — at most five primary; a locked page shows a lock and its `to` is where it opens from
 *   label     small caps beside the logo ("Shop partner")
 *   title     who is signed in (shop or person name), subtitle under it
 *   onSignOut sign-out handler, shown in the sidebar and the phone menu
 */

/** The page you are on: the longest item path that the URL starts with. */
function activeKeyFor(items, pathname) {
  let best = null;
  for (const item of items) {
    const hit = !item.locked && (pathname === item.to || pathname.startsWith(`${item.to}/`));
    if (hit && (!best || item.to.length > best.to.length)) best = item;
  }
  return best?.key || null;
}

// A photo when the account has one (a shop's storefront, a person's picture), else their initial.
function Avatar({ name, photo, className }) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} className={`${className} object-cover`} />;
  return <span className={`${className} flex items-center justify-center bg-zappy-600 font-bold text-white`}>{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

function Account({ title, subtitle, photo }) {
  if (!title) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
      <Avatar name={title} photo={photo} className="h-9 w-9 shrink-0 rounded-full text-sm" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-navy-900">{title}</span>
        {subtitle && <span className="block truncate text-[11.5px] text-slate-500">{subtitle}</span>}
      </span>
    </div>
  );
}

export { Avatar };

export default function PortalShell({ items, label, title, subtitle, photo, helpPhone = null, onSignOut, children }) {
  const nav = useNavigate();
  const t = useT();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const activeKey = activeKeyFor(items, pathname);
  // Notifications live behind the bell at the top on a phone, not in the menu or the bottom bar.
  const bell = items.find((i) => i.key === 'notifications' || i.key === 'alerts') || null;
  const { data: notifs } = useListNotificationsQuery({ page: 1, unreadOnly: false }, { skip: !bell, pollingInterval: 120000 });
  const unread = notifs?.unread ?? 0;
  const primary = items.filter((i) => i.primary && i !== bell);
  const rest = items.filter((i) => !i.primary && i !== bell);
  const go = (item) => { setMenuOpen(false); nav(item.to); };

  return (
    // Pages with a fixed bar (Save, Continue) sit above the bottom bar and beside
    // the sidebar by reading these; outside a shell both are 0.
    <div className="min-h-screen bg-[#F8FAFC] [--frame-bottom:4.25rem] [--frame-left:0px] lg:[--frame-bottom:0px] lg:[--frame-left:16rem]">
      <WorkerSidebar
        items={items}
        label={label}
        account={<Account title={title} subtitle={subtitle} photo={photo} />}
        activeKey={activeKey}
        unread={unread}
        helpPhone={helpPhone}
        onNavigate={go}
        onSignOut={onSignOut}
      />

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 lg:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100">
          <Menu size={20} className="text-slate-700" />
        </button>
        {/* Who is signed in is in the menu and on the page itself; not repeated here. */}
        <ZappyWordmark size={22} />
        {bell && (
          <button type="button" onClick={() => go(bell)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            className={`relative ml-auto flex h-9 w-9 items-center justify-center rounded-lg ${bell.key === activeKey ? 'bg-zappy-50 text-zappy-700' : 'text-slate-700 hover:bg-slate-100'}`}>
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black tabular-nums text-white ring-2 ring-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        )}
      </header>

      {/* Phone menu: who you are, the pages the bottom bar does not show, sign out */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white lg:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              aria-label="Menu"
            >
              <div className="flex items-center justify-between px-4 py-4">
                <ZappyWordmark size={22} />
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100">
                  <X size={18} className="text-slate-600" />
                </button>
              </div>
              <div className="px-4 pb-3"><Account title={title} subtitle={subtitle} photo={photo} /></div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
                {rest.map((item) => (
                  <button key={item.key} type="button" onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold ${
                      item.key === activeKey ? 'bg-zappy-50 text-zappy-700' : item.locked ? 'text-slate-400 hover:bg-slate-50' : 'text-slate-600 hover:bg-slate-100'}`}>
                    <item.Icon size={18} strokeWidth={2.2} />
                    <span className="flex-1 text-left">{t(labelKey(item.label), item.label)}</span>
                    {item.locked ? <Lock size={14} className="text-slate-300" aria-label="Locked" /> : <ChevronRight size={15} className="text-slate-300" />}
                  </button>
                ))}
              </nav>
              {helpPhone && (
                <div className="px-3 pb-2">
                  <a href={`tel:+91${helpPhone}`} className="flex w-full items-center gap-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[14px] font-bold text-rose-700">
                    <PhoneCall size={18} strokeWidth={2.2} /> {t('sp.call_zappyone_help', 'Call ZappyOne help')}
                  </a>
                </div>
              )}
              {onSignOut && (
                <div className="border-t border-slate-200 p-3">
                  <LanguageSwitcher className="mb-2 px-1" />
                  <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                    <LogOut size={18} strokeWidth={2.2} /> {t('sp.sign_out', 'Sign out')}
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="pb-20 lg:pb-0 lg:pl-64">{children}</div>

      <WorkerBottomNav items={primary} activeKey={activeKey} onNavigate={go} />
    </div>
  );
}
