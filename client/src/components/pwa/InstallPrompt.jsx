import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { ZappyAppIcon } from '@shared/components/common/ZappyLogo';
import IOSInstallModal from './IOSInstallModal';

const HOME_PATHS = new Set(['/', '/home']);

// One slim row above the bottom bar, as Swiggy and Blinkit ask: it never covers the page it sits on.
export default function InstallPrompt() {
  const { pathname } = useLocation();
  const { canShow, isIOS, installing, promptInstall, dismiss } = usePWAInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);

  async function install() {
    if ((await promptInstall()) === 'ios') setIosModalOpen(true);
  }

  return (
    <>
      {HOME_PATHS.has(pathname) && canShow && (
        <div role="region" aria-label="Get the ZappyOne app"
          className="fixed inset-x-3 bottom-[calc(84px_+_env(safe-area-inset-bottom))] z-[110] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-900 py-2 pl-2 pr-2 text-white shadow-lg sm:bottom-6 sm:left-auto sm:right-6">
          <ZappyAppIcon size={36} variant="light" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-tight">Get the ZappyOne app</p>
            <p className="truncate text-[11.5px] text-white/60">Live tracking and instant updates</p>
          </div>
          <button type="button" onClick={install} disabled={installing} aria-busy={installing}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-white px-3 text-[12.5px] font-bold text-ink-900 disabled:opacity-70">
            {installing ? <Loader2 size={14} className="animate-spin" /> : null}{isIOS ? 'How to' : 'Install'}
          </button>
          <button type="button" onClick={dismiss} aria-label="Not now" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}
      <IOSInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </>
  );
}
