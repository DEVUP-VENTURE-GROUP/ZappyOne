import { useRef } from 'react';
import { swapSparks } from '../../../customer/season';

// When the festival moves to its next look: a curtain in its colour sweeps down and sparks burst. Not on first paint.
export default function FestiveSwap({ theme }) {
  const start = useRef(theme.look);
  const moved = useRef(false);
  if (theme.look !== start.current) moved.current = true;
  if (!moved.current) return null;
  return (
    <span key={theme.look} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <span className="fz-swap absolute inset-x-0 top-0 h-full" style={{ background: theme.curtain }} />
      {swapSparks(theme).map((p, i) => (
        <span key={i} className="fz-spark absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.r * 2, height: p.r * 2, background: p.fill, animationDelay: `${p.delay}s`, '--dx': `${p.dx}px`, '--dy': `${p.dy}px` }} />
      ))}
    </span>
  );
}
