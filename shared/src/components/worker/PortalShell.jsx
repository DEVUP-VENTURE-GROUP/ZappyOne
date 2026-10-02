import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, LogOut, ChevronRight } from 'lucide-react';
import { ZappyLogo } from '../common/ZappyLogo';
import { WorkerSidebar, WorkerBottomNav } from './DashboardUI';

/**
 * The frame around a provider portal: sidebar on a computer; on a phone a top
 * bar, a bottom bar with the `primary` pages, and a menu with only the rest.
 * Every page appears once per screen size — never in two bars at the same time.
 *
 *   items     [{ key, label, Icon, to, primary? }]  — at most five primary
 *   label     small caps beside the logo ("Shop partner")
 *   title     who is signed in (shop or person name), subtitle under it
 *   onSignOut sign-out handler, shown in the sidebar and the phone menu
 */

/** The page you are on: the longest item path that the URL starts with. */
function activeKeyFor(items, pathname) {
  let best = null;
  for (const item of items) {
    const hit = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (hit && (!best || item.to.length > best.to.length)) best = item;
  }
  return best?.key || null;
}

function Account({ title, subtitle }) {
  if (!title) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zappy-600 text-sm font-bold text-white">
        {title.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-navy-900">{title}</span>
        {subtitle && <span className="block truncate text-[11.5px] text-slate-500">{subtitle}</span>}
      </span>
    </div>
  );
}

export default function PortalShell({ items, label, title, subtitle, onSignOut, children }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const activeKey = activeKeyFor(items, pathname);
  const primary = items.filter((i) => i.primary);
  const rest = items.filter((i) => !i.primary);
  const go = (item) => { setMenuOpen(false); nav(item.to); };

  return (
    // Pages with a fixed bar (Save, Continue) sit above the bottom bar and beside
    // the sidebar by reading these; outside a shell both are 0.
    <div className="min-h-screen bg-[#F8FAFC] [--frame-bottom:4.25rem] [--frame-left:0px] lg:[--frame-bottom:0px] lg:[--frame-left:16rem]">
      <WorkerSidebar
        items={items}
        label={label}
        account={<Account title={title} subtitle={subtitle} />}
        activeKey={activeKey}
        onNavigate={go}
        onSignOut={onSignOut}
      />

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 lg:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100">
          <Menu size={20} className="text-slate-700" />
        </button>
        {/* Who is signed in is in the menu and on the page itself; not repeated here. */}
        <ZappyLogo size={22} />
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
                <ZappyLogo size={22} />
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100">
                  <X size={18} className="text-slate-600" />
                </button>
              </div>
              <div className="px-4 pb-3"><Account title={title} subtitle={subtitle} /></div>
              <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
                {rest.map((item) => (
                  <button key={item.key} type="button" onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold ${
                      item.key === activeKey ? 'bg-zappy-50 text-zappy-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                    <item.Icon size={18} strokeWidth={2.2} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRight size={15} className="text-slate-300" />
                  </button>
                ))}
              </nav>
              {onSignOut && (
                <div className="border-t border-slate-200 p-3">
                  <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                    <LogOut size={18} strokeWidth={2.2} /> Sign out
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
