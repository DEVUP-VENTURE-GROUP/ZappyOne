import { useMemo } from 'react';
import { rayShapes } from '../../../customer/season';

/** Soft sunburst rays behind a light festive band (shared rayShapes; the app draws the same). */
export default function FestiveRays() {
  const rays = useMemo(() => rayShapes(), []);
  return (
    <svg viewBox="0 0 360 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ maskImage: 'linear-gradient(180deg, #000 30%, transparent 85%)', WebkitMaskImage: 'linear-gradient(180deg, #000 30%, transparent 85%)' }}>
      {rays.map((r, i) => <path key={i} d={r.d} fill={r.fill} opacity={r.o} />)}
    </svg>
  );
}
