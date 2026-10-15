import { useMemo } from 'react';
import { curtainShapes, fairyLights } from '../../../customer/season';

/**
 * Spotlight scene: the festival greeting on a stage. The curtains sweep open
 * from both corners, fairy lights twinkle, then the greeting rises in.
 */
export default function SpotlightGreeting({ season, theme }) {
  const curtains = useMemo(() => curtainShapes(theme.curtain), [theme.curtain]);
  const lights = useMemo(() => fairyLights(), []);
  const side = (s) => curtains.filter((c) => c.side === s);
  const draw = (c, i) => <path key={i} d={c.d} fill={c.fill || 'none'} stroke={c.stroke || 'none'} strokeWidth={c.sw || 0} strokeLinecap="round" opacity={c.o ?? 1} />;

  return (
    <div className="absolute inset-0">
      <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMin slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
        {lights.map((l, i) => (
          <g key={i} className="fz-twinkle" style={{ animationDelay: `${l.delay}s` }}>
            <circle cx={l.cx} cy={l.cy} r={l.r * 3.2} fill={theme.dark ? '#FDE68A' : '#FFFFFF'} opacity="0.25" />
            <circle cx={l.cx} cy={l.cy} r={l.r} fill={theme.dark ? '#FDE68A' : '#FFFFFF'} />
          </g>
        ))}
        <g className="fz-curtain-l">{side('left').map(draw)}</g>
        <g className="fz-curtain-r">{side('right').map(draw)}</g>
      </svg>
      <div className="relative flex h-full flex-col items-center justify-center px-10 text-center">
        {season.artUrl && <img src={season.artUrl} alt="" className="fz-pop mb-1 max-h-[64px] w-auto object-contain sm:max-h-[84px]" style={{ animationDelay: '.5s' }} />}
        {season.greeting && (
          <p className="fz-rise text-[11.5px] font-extrabold uppercase tracking-[0.22em]" style={{ color: theme.accent, animationDelay: '.55s' }}>{season.greeting}</p>
        )}
        <h2 className="fz-rise fz-shine mt-1 max-w-md text-[24px] font-extrabold leading-[1.1] tracking-[-0.025em] [text-wrap:balance] sm:text-[32px]"
          style={{ animationDelay: '.7s', backgroundImage: `linear-gradient(110deg, ${theme.ink} 42%, ${theme.accent} 50%, ${theme.ink} 58%)` }}>
          {season.headline}
        </h2>
        {season.subline && (
          <p className="fz-rise mt-1 max-w-sm text-[12.5px] leading-snug [text-wrap:balance] sm:text-[14px]" style={{ color: theme.sub, animationDelay: '.85s' }}>{season.subline}</p>
        )}
      </div>
    </div>
  );
}
