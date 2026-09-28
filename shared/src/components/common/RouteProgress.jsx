import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

// A thin gradient bar that shoots across the top on every route change — the
// "something is arriving fast" cue used by Uber / YouTube / linear. Purely
// cosmetic: it runs for ~0.6s regardless of actual load (the page itself is
// prewarmed), so navigation always feels responsive and intentional.
export default function RouteProgress() {
  const location = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 620);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="route-progress"
          className="fixed top-0 left-0 right-0 z-[200] h-[3px] pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          <motion.div
            className="h-full rounded-r-full"
            style={{
              background: 'linear-gradient(90deg, #3B82F6 0%, #22D3EE 100%)',
              boxShadow: '0 0 10px rgba(34,211,238,0.7)',
            }}
            initial={{ width: '0%' }}
            animate={{ width: ['0%', '55%', '82%', '100%'] }}
            transition={{ duration: 0.6, ease: 'easeOut', times: [0, 0.35, 0.65, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
