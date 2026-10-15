import { useMemo } from 'react';
import { artFor, servicePhoto } from '../serviceArt';
import { seasonTiles } from '../../../customer/season';
import FestiveMotif from './FestiveMotif';
import FestiveOffer from './FestiveOffer';

const artOf = (s) => servicePhoto(s) || artFor(s.code, s.domainCode)?.still || null;

/**
 * The top of home during a festival (server content/season, set in Admin →
 * Festive home): the festival's colours and decoration, a greeting, the
 * services worth booking for it as tiles, and its offer. Only live services
 * become tiles; with no season running, home has no festive top at all.
 */
export default function FestiveHero({ season, theme, services, onOpen }) {
  const tiles = useMemo(() => seasonTiles(season, services, artOf), [season, services]);

  return (
    <section aria-label={season.name} className="relative overflow-hidden rounded-b-sheet"
      style={{ background: `linear-gradient(180deg, ${theme.top} 0%, ${theme.bottom} 100%)` }}>
      <FestiveMotif theme={season.theme} />
      {/* A soft glow behind the greeting, like light from the decoration. */}
      <div aria-hidden="true" className="fz-breathe pointer-events-none absolute inset-x-0 top-16 mx-auto h-56 w-56 rounded-full blur-3xl"
        style={{ background: theme.accent, opacity: theme.dark ? 0.28 : 0.18 }} />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-5 pt-[104px] sm:px-6 sm:pt-[132px]">
        <div className="text-center">
          {season.greeting && (
            <p className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{season.greeting}</p>
          )}
          {/* A slow light passes across the headline, in the festival's own accent. */}
          <h2 className="fz-shine mx-auto mt-1 max-w-xl text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] [text-wrap:balance] sm:text-[34px]"
            style={{ backgroundImage: `linear-gradient(110deg, ${theme.ink} 42%, ${theme.accent} 50%, ${theme.ink} 58%)` }}>
            {season.headline}
          </h2>
          {season.subline && <p className="mx-auto mt-1.5 max-w-lg text-[14px] leading-relaxed" style={{ color: theme.sub }}>{season.subline}</p>}
        </div>

        {tiles.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-6">
            {tiles.map((t, i) => (
              <button key={t.serviceCode + t.title} type="button" onClick={() => onOpen(t.service)}
                className="fz-rise fz-tile group relative flex flex-col overflow-hidden rounded-2xl text-left active:scale-[0.97]"
                style={{
                  background: theme.tile, animationDelay: `${0.15 + i * 0.07}s`,
                  boxShadow: `inset 0 0 0 1px ${theme.line}, 0 10px 24px -18px ${theme.dark ? '#000' : theme.accent}`,
                }}>
                <span className="block min-h-[2.6em] px-2.5 pt-2.5 text-center text-[13px] font-bold leading-tight sm:text-[14px]" style={{ color: theme.tileInk }}>
                  {t.title}
                </span>
                <span className="relative mt-1 block aspect-square w-full">
                  {t.image
                    ? <img src={t.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-105" />
                    : <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold" style={{ color: theme.sub }}>{t.service.name}</span>}
                </span>
                {t.badge && (
                  <span className="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white" style={{ background: theme.accent }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="fz-rise" style={{ animationDelay: `${0.25 + tiles.length * 0.07}s` }}>
          <FestiveOffer offer={season.offer} theme={theme} />
        </div>
      </div>
    </section>
  );
}
