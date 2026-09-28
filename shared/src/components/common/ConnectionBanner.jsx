import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Global network status banner. Polished apps never leave you guessing whether
 * you're connected — this shows "You're offline" the moment the network drops
 * and a brief "Back online" confirmation when it returns.
 */
export default function ConnectionBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 2500);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          key="offline"
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
          className="fixed top-0 inset-x-0 z-[300] flex items-center justify-center gap-2 py-2 px-4 bg-slate-900 text-white text-xs font-semibold"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <WifiOff size={14} /> You're offline — we'll reconnect automatically
        </motion.div>
      )}
      {online && showBackOnline && (
        <motion.div
          key="online"
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
          className="fixed top-0 inset-x-0 z-[300] flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 text-white text-xs font-semibold"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <Wifi size={14} /> Back online
        </motion.div>
      )}
    </AnimatePresence>
  );
}
