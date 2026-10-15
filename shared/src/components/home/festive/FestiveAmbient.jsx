import { useMemo } from 'react';
import { ambientParticles } from '../../../customer/season';

/** One particle's look: a petal, an ember, a puff of gulal, a kite, a star or a snowflake. */
function Particle({ p }) {
  if (p.shape === 'kite') {
    return (
      <svg viewBox="0 0 20 30" width={p.size} height={p.size * 1.5}>
        <path d="M10,0 L20,11 L10,24 L0,11 Z" fill={p.color} />
        <path d="M10,24 Q14,27 9,30" stroke={p.color} strokeWidth="1" fill="none" />
      </svg>
    );
  }
  if (p.shape === 'star') {
    return <svg viewBox="0 0 20 20" width={p.size} height={p.size} className="fz-glint"><path d="M10,0 L12.4,7.6 L20,10 L12.4,12.4 L10,20 L7.6,12.4 L0,10 L7.6,7.6 Z" fill={p.color} /></svg>;
  }
  const round = { petal: '60% 40% 60% 40%', ember: '50%', gulal: '50%', snow: '50%' }[p.shape];
  return (
    <span className="block" style={{
      width: p.size, height: p.shape === 'petal' ? p.size * 0.7 : p.size, borderRadius: round, background: p.color,
      opacity: p.shape === 'gulal' ? 0.45 : 0.85,
      boxShadow: p.shape === 'ember' ? `0 0 ${p.size}px ${p.color}` : undefined, filter: p.shape === 'gulal' ? 'blur(1.5px)' : undefined,
    }} />
  );
}

/**
 * The festival drifting across the whole page while it is on: petals
 * falling, embers rising, gulal, kites, stars or snow, by festival. Behind
 * nothing a customer taps; still when motion is reduced.
 */
export default function FestiveAmbient({ theme }) {
  const particles = useMemo(() => ambientParticles(theme), [theme]);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
      {particles.map((p, i) => (
        <span key={i} className={`${p.up ? 'fz-ascend' : 'fz-drift'} absolute top-0`}
          style={{ left: `${p.x}%`, '--drift': `${p.drift}px`, animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms` }}>
          <Particle p={p} />
        </span>
      ))}
    </div>
  );
}
