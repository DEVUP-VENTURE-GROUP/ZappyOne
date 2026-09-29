/**
 * Asks for push permission where it's obviously useful: while the customer
 * is watching a job. Not on browsing screens — a permission prompt with no
 * context gets declined, and a "blocked" notice everywhere is just a nag.
 * Dismissing the blocked notice sticks; the enable prompt returns next visit.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, BellOff, X } from 'lucide-react';
import { useNotificationPermission } from '../../hooks/useFCM.jsx';

const PROMPT_KEY = 'notif_banner_dismissed';        // session — re-ask each visit
const DENIED_KEY = 'notif_banner_denied_dismissed'; // permanent — not fixable in-app

/** Screens where someone is following a job in progress. */
const JOB_SCREENS = /^\/(orders\/[^/]+$|repair\/bookings\/|pet\/bookings\/|helping\/tasks\/|events\/bookings\/)/;

export default function NotificationBanner() {
  const perm = useNotificationPermission();
  const { pathname } = useLocation();
  const isDenied = perm === 'denied';
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(isDenied ? localStorage.getItem(DENIED_KEY) === '1' : sessionStorage.getItem(PROMPT_KEY) === '1');
    } catch { /* storage blocked: show it */ }
  }, [isDenied]);

  if (!JOB_SCREENS.test(pathname)) return null;
  if (perm === 'granted' || perm === 'not_supported' || perm === 'not_configured' || dismissed) return null;

  function dismiss() {
    try {
      if (isDenied) localStorage.setItem(DENIED_KEY, '1');
      else sessionStorage.setItem(PROMPT_KEY, '1');
    } catch { /* storage blocked */ }
    setDismissed(true);
  }

  async function enable() {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      dismiss();
      window.dispatchEvent(new Event('focus')); // nudge useFCM to register
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 px-4" role="status">
      <div className="pointer-events-auto mx-auto flex w-full max-w-lg items-center gap-3 rounded-xl bg-navy px-4 py-3 text-white shadow-lg">
        {isDenied ? <BellOff size={18} className="shrink-0 text-slate-300" /> : <Bell size={18} className="shrink-0 text-zappy-300" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">
            {isDenied ? 'Notifications are off for ZappyOne' : 'Get updates on this job'}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-300">
            {isDenied ? 'Turn them on in your browser settings to hear when your pro arrives.' : 'We’ll tell you when your pro is on the way and when they arrive.'}
          </p>
        </div>
        {!isDenied && (
          <button type="button" onClick={enable} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-navy">
            Turn on
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
