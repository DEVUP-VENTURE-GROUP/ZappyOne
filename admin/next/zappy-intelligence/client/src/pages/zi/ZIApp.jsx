import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Map, Brain, TrendingUp, Shield, DollarSign,
  Handshake, Users, BarChart3, Building2, Layers, Megaphone,
  LogOut, ChevronLeft, ChevronRight, Menu, X, Sun, Moon,
  Zap,
} from 'lucide-react';
import { ZI_SLUG, ziPath } from '../../config/zi';

const API_BASE = `/api/zi/${ZI_SLUG}`;

const NAV_ITEMS = [
  { label: 'Command Center',   icon: Activity,   path: ziPath(''),           end: true },
  { label: 'Expansion Engine', icon: Map,         path: ziPath('/expansion') },
  { label: 'AI Assistant',     icon: Brain,       path: ziPath('/ai') },
  { label: 'Forecasting',      icon: TrendingUp,  path: ziPath('/forecast') },
  { label: 'Fraud Center',     icon: Shield,      path: ziPath('/fraud') },
  { label: 'Pricing Engine',   icon: DollarSign,  path: ziPath('/pricing') },
  { label: 'Partner Intel',    icon: Handshake,   path: ziPath('/partners') },
  { label: 'Worker Intel',     icon: Users,       path: ziPath('/workers') },
  { label: 'Investor Boardroom', icon: BarChart3,  path: ziPath('/investor') },
  { label: 'City Simulator',   icon: Building2,   path: ziPath('/simulator') },
  { label: 'Heatmaps',         icon: Layers,      path: ziPath('/heatmaps') },
  { label: 'Ads Manager',      icon: Megaphone,   path: ziPath('/ads') },
];

const ROLE_BADGE_COLORS = {
  superadmin: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  admin:      'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  analyst:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  viewer:     'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export default function ZIApp() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  /* ── Auth check ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem('zi_token');
    if (!token) {
      navigate(ziPath('/login'), { replace: true });
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { 'x-zi-token': token },
    })
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem('zi_token');
          navigate(ziPath('/login'), { replace: true });
          return;
        }
        const data = await res.json();
        setUser(data.user || data);
        setAuthChecked(true);
      })
      .catch(() => {
        // Network error — still allow access with cached token
        setUser({ name: 'ZI User', role: 'admin', email: '' });
        setAuthChecked(true);
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('zi_token');
    navigate(ziPath('/login'), { replace: true });
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-lg">Z</span>
          </div>
          <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-slate-500 text-sm">Authenticating…</span>
        </div>
      </div>
    );
  }

  const sidebarW = sidebarOpen ? 240 : 64;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarW }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="fixed left-0 top-0 h-full bg-slate-900 border-r border-slate-800 z-40 flex flex-col overflow-hidden"
        style={{ width: sidebarW }}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-slate-800 flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
            <span className="text-white font-black text-sm">Z</span>
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="ml-3 overflow-hidden whitespace-nowrap"
              >
                <div className="text-white font-bold text-sm leading-none">Zappy Intelligence</div>
                <div className="text-indigo-400 text-xs mt-0.5">Operations Suite</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2 scrollbar-hide">
          {NAV_ITEMS.map(({ label, icon: Icon, path, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-medium transition-all duration-150 group relative ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-r" />
                  )}
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <AnimatePresence>
                    {sidebarOpen && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="whitespace-nowrap overflow-hidden"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* Tooltip when collapsed */}
                  {!sidebarOpen && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 border border-slate-700 rounded-md text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                      {label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="flex-shrink-0 border-t border-slate-800 p-3 space-y-2">
          {/* User role badge */}
          {user && sidebarOpen && (
            <div className="px-1">
              <div className="text-slate-500 text-xs mb-1 truncate">{user.email}</div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE_COLORS[user.role] || ROLE_BADGE_COLORS.viewer}`}>
                {user.role || 'viewer'}
              </span>
            </div>
          )}

          {/* Version */}
          {sidebarOpen && (
            <div className="text-slate-600 text-xs px-1">ZI v1.0</div>
          )}

          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all text-xs"
          >
            {sidebarOpen ? (
              <>
                <ChevronLeft className="w-4 h-4 flex-shrink-0" />
                <span>Collapse</span>
              </>
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0 mx-auto" />
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main content */}
      <motion.div
        animate={{ marginLeft: sidebarW }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="flex flex-col min-h-screen"
      >
        {/* Top header */}
        <header className="h-16 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Page title from location */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-slate-600 text-sm">/</span>
              <span className="text-slate-300 text-sm font-medium">
                {NAV_ITEMS.find((n) =>
                  n.end
                    ? location.pathname === n.path
                    : location.pathname.startsWith(n.path) && n.path !== ziPath('')
                )?.label || 'Command Center'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dark/Light toggle */}
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User avatar */}
            {user && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold select-none">
                  {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block">
                  <div className="text-sm font-medium text-white leading-none">{user.name || 'ZI User'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{user.role || 'admin'}</div>
                </div>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </motion.div>
    </div>
  );
}
