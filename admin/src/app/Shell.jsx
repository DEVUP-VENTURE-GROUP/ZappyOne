import { useCallback, useEffect, useState, Suspense } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Menu, X, ChevronRight, Zap } from 'lucide-react';
import { logout } from '@shared/modules/auth/authSlice';
import { useLogoutMutation, useAdminAlertsQuery, useAdminMeQuery } from '@shared/services/api';
import { adminPath } from '@/config/admin';
import { NAV_GROUPS, SECTIONS, REDIRECTS } from '@/config/sections';

/** The sidebar status, from the live alert checks — never a hardcoded "all good". */
function useSystemStatus() {
  const { data, isError } = useAdminAlertsQuery(undefined, { pollingInterval: 60000 });
  if (isError) return { tone: 'rose', text: 'Status unavailable' };
  if (!data) return { tone: 'slate', text: 'Checking…' };
  const critical = data.alerts.filter((a) => a.severity === 'critical').length;
  const warning = data.alerts.filter((a) => a.severity === 'warning').length;
  if (critical) return { tone: 'rose', text: `${critical} critical alert${critical > 1 ? 's' : ''}` };
  if (warning) return { tone: 'amber', text: `${warning} warning${warning > 1 ? 's' : ''}` };
  return { tone: 'green', text: 'All systems normal' };
}

const TONES = {
  green: { dot: 'bg-green-400', text: 'text-green-400', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.15)' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  rose: { dot: 'bg-rose-400', text: 'text-rose-400', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.2)' },
  slate: { dot: 'bg-slate-400', text: 'text-slate-400', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
};

/* Sidebar nav item */
function NavItem({ item, isActive, onClick }) {
  const { icon: Icon, label } = item;
  return (
    <motion.button
      onClick={() => onClick(item.id)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left relative ${
        isActive
          ? 'text-white bg-white/10'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
      whileTap={{ scale: 0.98 }}
    >
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-zappy-400 rounded-full"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <Icon
        size={14}
        strokeWidth={isActive ? 2.5 : 1.75}
        className={isActive ? 'text-zappy-300' : 'text-slate-500'}
      />
      <span className="flex-1 truncate">{label}</span>
      {isActive && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-1.5 h-1.5 rounded-full bg-zappy-400"
        />
      )}
    </motion.button>
  );
}

/** Shown instead of a section the admin's role does not open. */
function NotAllowed() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-semibold text-slate-700">Your role doesn't include this section.</p>
      <p className="text-xs text-slate-400 mt-1">Ask a super admin if you need access.</p>
    </div>
  );
}

/* Main */
export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: me, isLoading: loadingMe } = useAdminMeQuery();
  // Only what this admin's role opens; the server enforces the same rule on every call.
  const allowed = new Set(me?.areas || []);
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed.has(i.area)) }))
    .filter((g) => g.items.length);
  const firstAllowed = groups[0]?.items[0]?.id;

  const requested = searchParams.get('tab') || firstAllowed || 'overview';
  const redirect = REDIRECTS[requested];
  const active = redirect ? redirect[0] : (SECTIONS[requested] ? requested : 'overview');
  const status = useSystemStatus();
  const tone = TONES[status.tone];

  // An old link lands where that screen lives now, and the URL says so.
  useEffect(() => {
    if (!redirect) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', redirect[0]);
    if (redirect[1]) next.set('sub', redirect[1]);
    setSearchParams(next, { replace: true });
  }, [redirect, searchParams, setSearchParams]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const [callLogout] = useLogoutMutation();

  const permitted = allowed.has(SECTIONS[active].area);
  const Section = permitted ? SECTIONS[active].Comp : NotAllowed;
  const activeLabel = SECTIONS[active].label;

  const handleNav = useCallback((id) => {
    setSearchParams({ tab: id }, { replace: true });
    setSidebarOpen(false);
  }, [setSearchParams]);

  async function doLogout() {
    try { await callLogout().unwrap(); } catch {}
    dispatch(logout());
    navigate(adminPath('/login'), { replace: true });
  }

  if (loadingMe) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-400" style={{ background: '#0f1117' }}>Loading…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f1117' }}>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-56 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:flex-shrink-0
      `} style={{ background: '#13151e', borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Logo + brand */}
        <div className="flex items-center justify-between h-13 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(#6366f1, #6366f1)' }}>
              <Zap size={14} strokeWidth={2.5} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none">Zappy</p>
              <p className="text-slate-500 text-[10px] font-medium leading-none mt-0.5">Admin Console</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        </div>

        {/* Live status */}
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button type="button" onClick={() => handleNav('status')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left"
            style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
            <motion.div
              className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}
              animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className={`text-[10px] font-bold ${tone.text}`}>{status.text}</span>
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: 'none' }}>
          {groups.map((group, gi) => (
            <div key={group.label} className={gi ? 'mt-4' : ''}>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.12em] px-3 mb-1">{group.label}</p>
              {group.items.map(item => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={active === item.id}
                  onClick={handleNav}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div className="px-2 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:text-slate-200 hover:bg-white/5 transition text-left"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">

        {/* Topbar */}
        <header className="h-13 bg-white flex items-center px-4 lg:px-6 gap-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', height: 52 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <Menu size={17} />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-slate-400">Admin</span>
            <ChevronRight size={13} className="text-slate-300" strokeWidth={2.5} />
            <span className="font-bold text-slate-800">{activeLabel}</span>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:block font-medium">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: 'linear-gradient(#6366f1, #6366f1)' }}>
              A
            </div>
          </div>
        </header>

        {/* Content */}
        <main data-scroll-root className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <div className="p-4 lg:p-6">
                <Suspense fallback={<div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>}>
                  <Section />
                </Suspense>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
