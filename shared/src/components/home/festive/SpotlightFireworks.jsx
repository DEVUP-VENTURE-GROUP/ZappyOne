import { useMemo } from 'react';
import { fireworkBursts } from '../../../customer/season';

/** Spotlight scene: fireworks bursting in the festival's colours behind its greeting. */
export default function SpotlightFireworks({ season, theme }) {
  const bursts = useMemo(() => fireworkBursts([theme.accent, '#FDE68A', theme.dark ? '#F0ABFC' : '#FFFFFF', '#FB923C']), [theme]);
  return (
    <div className="absolute inset-0">
      <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
        {bursts.map((b, i) => (
          <g key={i} className="fz-burst" style={{ animationDelay: `${b.delay}s` }}>
            {b.sparks.map((s, k) => <line key={k} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={b.color} strokeWidth="2" strokeLinecap="round" />)}
            <circle cx={b.cx} cy={b.cy} r="2.4" fill="#FFFFFF" />
          </g>
        ))}
      </svg>
      <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="fz-pop text-[30px] font-black leading-[1.05] tracking-[-0.03em] [text-wrap:balance] sm:text-[40px]" style={{ color: theme.ink, animationDelay: '.3s' }}>
          {season.greeting || season.headline}
        </p>
      </div>
    </div>
  );
}
