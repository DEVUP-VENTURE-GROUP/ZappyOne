import { useMemo } from 'react';
import { artFor, servicePhoto } from '../serviceArt';
import { FESTIVE_PHOTOS, seasonTiles, tileLayout } from '../../../customer/season';
import FestiveMotif from './FestiveMotif';
import FestiveOffer from './FestiveOffer';
import FestiveRays from './FestiveRays';
import FestiveTile from './FestiveTile';

/** Real photos first; a service's own picture or art otherwise. */
const artOf = (s) => FESTIVE_PHOTOS[s.code] || servicePhoto(s) || artFor(s.code, s.domainCode)?.still || null;

/**
 * The top of home during a festival (server content/season, Admin → Festive
 * home), in the manner of Blinkit's festive home: the festival's colours with
 * soft rays and a fine jhalar, its artwork when uploaded, a greeting, a full
 * grid of real-photo tiles (a tall feature tile when there are five), and its
 * offer. Only live services become tiles; with no season, no festive top.
 */
export default function FestiveHero({ season, theme, services, onOpen }) {
  const tiles = useMemo(() => seasonTiles(season, services, artOf), [season, services]);
  const { cols, feature } = tileLayout(tiles.length);

  return (
    <section aria-label={season.name} className="relative overflow-hidden rounded-b-sheet"
      style={{ background: `linear-gradient(180deg, ${theme.top} 0%, ${theme.bottom} 92%)` }}>
      {theme.rays && <FestiveRays />}
      <FestiveMotif theme={season.theme} />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-5 pt-12 sm:px-6 sm:pt-16">
        {season.artUrl && (
          <img src={season.artUrl} alt="" className="fz-drop mx-auto -mb-1 max-h-[120px] w-auto max-w-full object-contain sm:max-h-[150px]" />
        )}
        <div className="text-center">
          {season.greeting && (
            <p className="text-[11.5px] font-extrabold uppercase tracking-[0.2em]" style={{ color: theme.accent }}>{season.greeting}</p>
          )}
          {/* A slow light passes across the headline, in the festival's own accent. */}
          <h2 className="fz-shine mx-auto mt-1 max-w-md text-[24px] font-extrabold leading-[1.12] tracking-[-0.025em] [text-wrap:balance] sm:text-[32px]"
            style={{ backgroundImage: `linear-gradient(110deg, ${theme.ink} 42%, ${theme.accent} 50%, ${theme.ink} 58%)` }}>
            {season.headline}
          </h2>
          {season.subline && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed [text-wrap:balance] sm:max-w-md sm:text-[14px]" style={{ color: theme.sub }}>{season.subline}</p>}
        </div>

        {/* Phone: Blinkit's grid. Wide screens: every tile in one row. */}
        {tiles.length > 0 && (
          <div className="grid gap-2.5 [grid-template-columns:repeat(var(--cols),minmax(0,1fr))] sm:gap-3 lg:[grid-template-columns:repeat(var(--wide),minmax(0,1fr))]"
            style={{ '--cols': cols, '--wide': tiles.length }}>
            {tiles.map((t, i) => (
              <FestiveTile key={t.serviceCode + t.title} tile={t} theme={theme} index={i} feature={feature && i === 0} wide={cols < 3} onOpen={() => onOpen(t.service)} />
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
