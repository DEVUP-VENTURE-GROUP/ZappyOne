import { useMemo } from 'react';
import { fairyLights, fallingPetals } from '../../../customer/season';

/**
 * Spotlight scene: a real photograph of the celebration (a woman carrying
 * her Bathukamma, a girl with her dandiya sticks, a garba twirl), slowly
 * zooming like film, warm light over it, fairy lights twinkling along the top
 * and marigold petals drifting down, the line rising in at the bottom.
 */
export default function SpotlightPhoto({ scene, theme }) {
  const lights = useMemo(() => fairyLights().filter((l) => l.cy < 30), []);
  const petals = useMemo(() => fallingPetals(['#F97316', '#FBBF24', '#EA580C', '#FDE047'], 12), []);
  return (
    <div className="absolute inset-x-3 inset-y-1.5 overflow-hidden rounded-[24px] sm:inset-x-4"
      style={{ boxShadow: `0 16px 34px -18px ${theme.dark ? '#000' : '#7a4a00'}, inset 0 0 0 1px rgba(255,255,255,.35)` }}>
      <img src={scene.photo} alt="" className="fz-kenburns absolute inset-0 h-full w-full object-cover" style={{ objectPosition: scene.focus }} />
      {/* Warm festival light from the top, and shade at the foot for the words. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,170,40,.28) 0%, rgba(0,0,0,0) 38%, rgba(40,12,0,.78) 100%)' }} />
      <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
        {lights.map((l, i) => (
          <g key={i} className="fz-twinkle" style={{ animationDelay: `${l.delay}s` }}>
            <circle cx={l.cx} cy={l.cy} r={l.r * 3.4} fill="#FDE68A" opacity="0.35" />
            <circle cx={l.cx} cy={l.cy} r={l.r} fill="#FFF7D6" />
          </g>
        ))}
      </svg>
      {petals.map((p, i) => (
        <span key={i} aria-hidden="true" className="fz-petal absolute top-0 rounded-[60%_40%_60%_40%]"
          style={{ left: `${p.x}%`, width: p.size, height: p.size * 0.7, background: p.color, '--drift': `${p.drift}px`, animationDelay: `${p.delay}ms`, animationDuration: `${p.dur}ms` }} />
      ))}
      <div className="absolute inset-x-4 bottom-3.5 sm:inset-x-6 sm:bottom-5">
        <p className="fz-rise text-[11px] font-extrabold uppercase tracking-[0.22em]" style={{ color: '#FDE68A', animationDelay: '.3s' }}>{scene.kicker}</p>
        <p className="fz-rise mt-0.5 max-w-[22ch] text-[21px] font-extrabold leading-[1.12] tracking-[-0.02em] text-white [text-wrap:balance] sm:max-w-[28ch] sm:text-[28px]"
          style={{ animationDelay: '.45s', textShadow: '0 2px 12px rgba(0,0,0,.35)' }}>
          {scene.title}
        </p>
      </div>
    </div>
  );
}
