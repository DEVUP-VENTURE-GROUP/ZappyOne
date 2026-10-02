import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import BottomNav from './BottomNav';
import DesktopNav from './DesktopNav';
import InstallPrompt from '../pwa/InstallPrompt';

/** Phones: content + bottom bar. Tablet and up: top bar, no bottom bar. */
export default function MainLayout() {
  const location = useLocation();
  return (
    <div className="app-shell flex min-h-[100dvh] flex-col">
      <DesktopNav />
      {/* Room for the bottom bar only where it is shown. */}
      <main className="app-content flex-1 pb-[calc(env(safe-area-inset-bottom)+64px)] md:pb-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname} className="h-full">
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <InstallPrompt />
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
