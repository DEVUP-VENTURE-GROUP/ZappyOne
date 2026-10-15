import { useMemo } from 'react';
import { fallingPetals, risingLanterns } from '../../../customer/season';

/** Spotlight scene: marigold petals drifting down and lanterns rising, behind the season's promise. */
export default function SpotlightPetals({ season, theme }) {
  const petals = useMemo(() => fallingPetals(['#F97316', '#FBBF24', '#EA580C', '#FDE047']), []);
  const lanterns = useMemo(() => risingLanterns(), []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {lanterns.map((l, i) => (
        <span key={`l${i}`} aria-hidden="true" className="fz-lantern absolute bottom-0" style={{ left: `${l.x}%`, animationDelay: `${l.delay}ms`, animationDuration: `${l.dur}ms` }}>
          <svg viewBox="0 0 20 28" width={l.size} height={l.size * 1.4}>
            <circle cx="10" cy="15" r="11" fill="#FDE68A" opacity="0.35" />
            <path d="M5,6 L15,6 L17,20 Q10,25 3,20 Z" fill={theme.accent} />
            <path d="M7,20 Q10,22 13,20 L12,24 L8,24 Z" fill="#FBBF24" />
            <rect x="6" y="3" width="8" height="3" rx="1" fill="#7C2D12" />
          </svg>
        </span>
      ))}
      {petals.map((p, i) => (
        <span key={`p${i}`} aria-hidden="true" className="fz-petal absolute top-0 rounded-[60%_40%_60%_40%]"
          style={{ left: `${p.x}%`, width: p.size, height: p.size * 0.7, background: p.color, '--drift': `${p.drift}px`, animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms` }} />
      ))}
      <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="fz-pop max-w-sm text-[21px] font-extrabold leading-tight tracking-[-0.02em] [text-wrap:balance] sm:text-[28px]" style={{ color: theme.ink, animationDelay: '.25s' }}>
          {season.subline}
        </p>
      </div>
    </div>
  );
}
