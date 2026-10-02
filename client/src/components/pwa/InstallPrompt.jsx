import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, BadgeCheck, Zap, MapPin, Bell, ShieldCheck } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { ZappyAppIcon } from '@shared/components/common/ZappyLogo';
import InstallButton from './InstallButton';
import IOSInstallModal from './IOSInstallModal';

const FEATURES = [
  { Icon: Zap,         label: 'Faster Experience' },
  { Icon: MapPin,      label: 'Live Tracking' },
  { Icon: Bell,        label: 'Instant Notifications' },
  { Icon: ShieldCheck, label: 'Secure Payments' },
];

// Paths that count as the Home Page. Never render anywhere else.
const HOME_PATHS = new Set(['/', '/home']);

/**
 * InstallPrompt — the premium "Install Zappy" card.
 *
 * Renders only on the Home Page, only when installable and not dismissed.
 * Floats above the bottom nav on mobile / bottom-right on desktop. All install
 * behavior is delegated to `usePWAInstall`; this file is composition + motion.
 */
export default function InstallPrompt() {
  const { pathname } = useLocation();
  const { canShow, isIOS, installing, promptInstall, dismiss } = usePWAInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);

  const onHome = HOME_PATHS.has(pathname);

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result === 'ios') setIosModalOpen(true);
    // 'accepted' / 'dismissed' / 'unavailable' are handled inside the hook.
  };

  const visible = onHome && canShow;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="install-prompt"
            role="dialog"
            aria-label="Install the Zappy app"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[110] pointer-events-none
                       left-3 right-3 sm:left-auto sm:right-6 sm:w-[400px]
                       bottom-[calc(104px_+_env(safe-area-inset-bottom))]
                       sm:bottom-6"
          >
            <div
              className="pointer-events-auto relative overflow-hidden rounded-card
                         border border-white/60 bg-white
                         shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)]
                         p-4 sm:p-5"
            >
              {/* Ambient brand glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-40 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.5), transparent 70%)' }}
              />

              {/* Close */}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss install prompt"
                className="absolute right-3 top-3 grid place-items-center w-7 h-7 rounded-full
                           text-slate-400 hover:text-slate-600 hover:bg-slate-900/5 transition-colors z-10"
              >
                <X size={16} />
              </button>

              {/* Header: logo + title + verified badge */}
              <div className="relative flex items-start gap-3 pr-6">
                <ZappyAppIcon size={52} variant="light" className="shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-navy-900 leading-tight">Install Zappy</h3>
                    <BadgeCheck size={16} className="text-zappy-600 shrink-0" aria-label="Verified" />
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-slate-500">
                    Book trusted professionals, track your services in real time, receive instant
                    updates, and enjoy a faster app-like experience.
                  </p>
                </div>
              </div>

              {/* Feature chips */}
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {FEATURES.map(({ Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-900/[0.04]
                               px-2.5 py-1 text-[11px] font-medium text-slate-600"
                  >
                    <Icon size={12} className="text-zappy-600" strokeWidth={2.25} />
                    {label}
                  </span>
                ))}
              </div>

              {/* Primary CTA */}
              <div className="relative mt-4">
                <InstallButton onClick={handleInstall} loading={installing} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <IOSInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </>
  );
}
