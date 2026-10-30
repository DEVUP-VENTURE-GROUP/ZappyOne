import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

// A number that climbs to its value ("₹1,240", "12", "4.8"): new money and jobs land with a beat. Text that is not a number shows as it is.
export default function CountUp({ value, duration = 0.9 }) {
  const m = typeof value === 'number' ? ['', String(value), ''] : /^(\D*)([\d,]+(?:\.\d+)?)(\D*)$/.exec(String(value ?? ''));
  const target = m ? Number(m[2].replace(/,/g, '')) : null;
  const decimals = m && m[2].includes('.') ? m[2].split('.')[1].length : 0;
  const still = useReducedMotion();
  const from = useRef(0);
  const [shown, setShown] = useState(still || target == null ? target : 0);
  useEffect(() => {
    if (target == null || still) { setShown(target); return undefined; }
    const c = animate(from.current, target, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    from.current = target;
    return () => c.stop();
  }, [target, still, duration]);
  if (!m) return value ?? null;
  const n = Number(shown || 0);
  const text = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-IN');
  return <span className="tabular-nums">{m[1]}{text}{m[3]}</span>;
}
