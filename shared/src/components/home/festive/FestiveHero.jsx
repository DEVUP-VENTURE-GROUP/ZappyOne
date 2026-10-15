import { useMemo } from 'react';
import { artFor, servicePhoto } from '../serviceArt';
import { FESTIVE_PHOTOS, seasonTiles, tileLayout } from '../../../customer/season';
import FestiveMotif from './FestiveMotif';
import FestiveOffer from './FestiveOffer';
import FestiveRays from './FestiveRays';
import FestiveSpotlight from './FestiveSpotlight';
import FestiveTile from './FestiveTile';

/** Real photos first; a service's own picture or art otherwise. */
const artOf = (s) => FESTIVE_PHOTOS[s.code] || servicePhoto(s) || artFor(s.code, s.domainCode)?.still || null;

/**
 * The top of home during a festival (server content/season, Admin → Festive
 * home), in the manner of Blinkit's and Zepto's festive homes: the festival's
 * colours with soft rays and a fine jhalar, a spotlight that changes scene
 * every few seconds (greeting on a stage, services, our promise, the offer),
 * a full grid of real-photo tiles (a tall feature tile at five), and its offer. Only live services become tiles; with no season, no festive top.
 */
export default function FestiveHero({ season, theme, services, onOpen }) {
  const tiles = useMemo(() => seasonTiles(season, services, artOf), [season, services]);
  const { cols, feature } = tileLayout(tiles.length);

  return (
    <section aria-label={season.name} className="relative overflow-hidden rounded-b-sheet"
      style={{ background: `linear-gradient(180deg, ${theme.top} 0%, ${theme.bottom} 92%)` }}>
      {theme.rays && <FestiveRays />}
      <FestiveMotif theme={season.theme} />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-5 pt-9 sm:px-6 sm:pt-12">
        <FestiveSpotlight season={season} theme={theme} />

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
