import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Share, Plus, Check, X } from 'lucide-react';
import { ZappyAppIcon } from '@shared/components/common/ZappyLogo';

/**
 * IOSInstallModal — the manual "Add to Home Screen" walkthrough shown when the
 * browser can't offer a programmatic install (iOS/iPadOS Safari).
 *
 * Only ever rendered *after* the user taps Install, per spec. Presentational:
 * visibility + close are controlled by the parent.
 */
const STEPS = [
  { Icon: Share, title: 'Tap the Share button', body: 'It’s in Safari’s toolbar — the square with an upward arrow.' },
  { Icon: Plus,  title: 'Select “Add to Home Screen”', body: 'Scroll the share sheet until you find it.' },
  { Icon: Check, title: 'Tap “Add”', body: 'Zappy lands on your home screen like a native app.' },
];

export default function IOSInstallModal({ open, onClose }) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-navy-900/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            className="relative w-full max-w-sm rounded-3xl bg-white shadow-soft-lg p-6
                       pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid place-items-center w-8 h-8 rounded-full
                         text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center text-center mb-5">
              <ZappyAppIcon size={56} variant="light" />
              <h2 id="ios-install-title" className="mt-3 text-lg font-bold text-navy-900">
                Add Zappy to your Home Screen
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Three quick taps — no App Store needed.
              </p>
            </div>

            <ol className="space-y-3">
              {STEPS.map(({ Icon, title, body }, i) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="relative shrink-0">
                    <div className="grid place-items-center w-10 h-10 rounded-xl bg-white shadow-card text-zappy-600">
                      <Icon size={20} strokeWidth={2.25} />
                    </div>
                    <span className="absolute -top-1.5 -left-1.5 grid place-items-center w-5 h-5 rounded-full bg-zappy-600 text-white text-[11px] font-bold">
                      {i + 1}
                    </span>
                  </div>
                  <div className="pt-0.5">
                    <div className="text-sm font-semibold text-navy-900">{title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{body}</div>
                  </div>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-2xl bg-slate-100 text-navy-800 font-semibold text-sm
                         hover:bg-slate-200 transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
