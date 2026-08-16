/**
 * NotificationBanner — shown to users who haven't granted push permission.
 * Appears as a dismissible bottom strip on HomePage and OrderTrackingPage.
 * Disappears permanently once permission is granted.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, BellOff } from 'lucide-react';
import { useNotificationPermission, FIREBASE_CONFIGURED } from '../../hooks/useFCM.jsx';

const PROMPT_KEY = 'notif_banner_dismissed';        // session — re-ask each visit
const DENIED_KEY = 'notif_banner_denied_dismissed'; // permanent — not in-app fixable

export default function NotificationBanner() {
  const perm = useNotificationPermission();
  const isDenied = perm === 'denied';
  const [dismissed, setDismissed] = useState(false);
  // The worker portal's bottom nav is mobile-only (lg:hidden), so on worker
  // desktop there's nothing to clear at the bottom — the 104px offset would
  // leave the banner floating over content. There, dock it to a bottom-right
  // corner toast instead. Customer routes keep the bottom-nav clearance.
  const { pathname } = useLocation();
  const isWorkerDesktop = pathname.startsWith('/worker');

  // Evaluate dismissal against the right store once permission resolves. The
  // "blocked" (denied) banner isn't actionable inside the app — the user has to
  // change browser settings — so dismissing it should stick forever rather than
  // nag on every session. The "enable" prompt stays session-scoped so we can
  // re-ask on a later visit.
  useEffect(() => {
    const deniedDismissed = localStorage.getItem(DENIED_KEY) === '1';
    const promptDismissed = sessionStorage.getItem(PROMPT_KEY) === '1';
    setDismissed(isDenied ? deniedDismissed : promptDismissed);
  }, [isDenied]);

  // Don't render if: granted, not configured, not supported, or dismissed
  if (perm === 'granted' || perm === 'not_supported' || perm === 'not_configured' || dismissed) {
    return null;
  }

  function dismiss() {
    if (isDenied) localStorage.setItem(DENIED_KEY, '1');
    else sessionStorage.setItem(PROMPT_KEY, '1');
    setDismissed(true);
  }

  async function enableNotifications() {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      // useFCM will pick this up on next visibilitychange or remount
      dismiss();
      window.dispatchEvent(new Event('focus')); // nudge useFCM to re-init
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={`fixed bottom-[calc(104px_+_env(safe-area-inset-bottom))] inset-x-0 z-40 px-4 pointer-events-none ${isWorkerDesktop ? 'lg:bottom-6 lg:right-6 lg:left-auto lg:inset-x-auto lg:px-0' : ''}`}
      >
        <div
          className={`w-full max-w-lg mx-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl pointer-events-auto ${isWorkerDesktop ? 'lg:mx-0 lg:w-[380px]' : ''}`}
          style={{
            background: isDenied
              ? 'linear-gradient(135deg,#1e293b,#0f172a)'
              : 'linear-gradient(135deg,#4f46e5,#6366f1)',
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            {isDenied
              ? <BellOff size={16} strokeWidth={2} className="text-white" />
              : <Bell size={16} strokeWidth={2} className="text-white" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white leading-tight">
              {isDenied ? 'Notifications are blocked' : 'Enable order notifications'}
            </p>
            <p className="text-[10px] text-white/60 mt-0.5 leading-tight">
              {isDenied
                ? 'Go to browser settings → allow Zappy notifications'
                : "Get real-time updates on your worker's arrival"}
            </p>
          </div>

          {!isDenied && (
            <button
              onClick={enableNotifications}
              className="shrink-0 px-3 py-1.5 bg-white text-indigo-600 text-[11px] font-extrabold rounded-xl"
            >
              Enable
            </button>
          )}

          <button
            onClick={dismiss}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-white/60 hover:bg-white/20"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
