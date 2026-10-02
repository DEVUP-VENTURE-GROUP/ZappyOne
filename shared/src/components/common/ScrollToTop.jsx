import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Every new screen opens at its top; Back returns to where you were.
 *
 * The window is reset, and so is any layout that scrolls inside its own box
 * (marked `data-scroll-root`, e.g. a sidebar shell's main column). A link to
 * an anchor (#section) still lands on that anchor, and a change of query only
 * (a filter) keeps the place.
 *
 * The browser's own restore runs before our screens have loaded their data,
 * so it lands short; we remember each entry's position and put it back once
 * the page is tall enough to hold it.
 */
const positions = new Map(); // history entry key -> scrollY

export function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.querySelectorAll('[data-scroll-root]').forEach((el) => { el.scrollTop = 0; });
}

function restore(y) {
  let tries = 0;
  const tick = () => {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (room >= y || tries >= 40) { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); return; }
    tries += 1;
    setTimeout(tick, 50);
  };
  tick();
}

export default function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const type = useNavigationType();
  const lastPath = useRef(pathname);
  const current = useRef(key);

  // Remember where the current entry is scrolled to, for when someone comes
  // Back. One listener, keyed by whichever entry is current at the time.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const save = () => positions.set(current.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  useLayoutEffect(() => {
    const samePage = lastPath.current === pathname;
    lastPath.current = pathname;
    current.current = key;
    if (type === 'POP') {
      const y = positions.get(key);
      if (y) restore(y);
      return;
    }
    if (hash || samePage) return;
    scrollToTop();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/**
 * The same for a flow that changes step without changing the URL (brand →
 * model → problem): pass the step, and each new step opens at its top.
 */
export function useScrollTopOnChange(value) {
  useLayoutEffect(() => {
    scrollToTop();
  }, [value]);
}
