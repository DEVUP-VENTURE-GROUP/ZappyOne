import { useEffect, useMemo, useState } from 'react';
import { LOOK_MS, lookCount, lookIndex, lookOf } from './season';

/** The running festival's theme, moving to its next look every 30 s; `still` (reduced motion) keeps look 0. */
export default function useFestiveLook(key, still = false) {
  const [n, setN] = useState(() => (key && !still ? lookIndex(key) : 0));
  useEffect(() => {
    if (!key || still || lookCount(key) < 2) { setN(0); return undefined; }
    let t;
    const tick = () => {
      setN(lookIndex(key));
      t = setTimeout(tick, LOOK_MS - (Date.now() % LOOK_MS) + 50);
    };
    tick();
    return () => clearTimeout(t);
  }, [key, still]);
  return useMemo(() => (key ? lookOf(key, n) : null), [key, n]);
}
