import { useEffect, useRef, useState } from 'react';

/**
 * A home section that rises into view as it scrolls up the screen, during a
 * festival (`on`). Off, or with no IntersectionObserver, it is just the section.
 */
export default function FestiveReveal({ on, children, className = '' }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!on || seen || !ref.current || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [on, seen]);
  if (!on) return children;
  // empty:hidden: a section with nothing to show (no offers yet) leaves no gap.
  return <div ref={ref} className={`fz-reveal empty:hidden ${seen ? 'fz-in' : ''} ${className}`}>{children}</div>;
}
