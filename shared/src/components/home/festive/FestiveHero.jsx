import FestiveMotif from './FestiveMotif';
import FestiveOffer from './FestiveOffer';
import FestiveRays from './FestiveRays';
import { servicePhoto, tilePhoto } from '../serviceArt';

// The top of home during a festival (Admin → Festive home), as Blinkit does it: one festive band, one line and the offer; the services stay in the grid below.
export default function FestiveHero({ season, theme, services = [], onOpen }) {
  // The festival's picked services that are live here, as tappable pills: the band always leads somewhere.
  const byCode = new Map(services.map((s) => [s.code, s]));
  const picks = (season.tiles || []).map((t) => ({ ...t, service: byCode.get(t.serviceCode) })).filter((t) => t.service).slice(0, 6);
  return (
    <section aria-label={season.name} className="relative overflow-hidden rounded-b-sheet" style={{ background: theme.bottom }}>
      {theme.rays && <FestiveRays />}
      <FestiveMotif theme={season.theme} />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-5 pt-[112px] sm:px-6 sm:pt-[120px]">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            {season.greeting && (
              <p className="fz-rise text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{season.greeting}</p>
            )}
            <h2 className="fz-rise mt-1 text-[24px] font-black leading-[1.08] tracking-[-0.025em] [text-wrap:balance] sm:text-[34px]"
              style={{ color: theme.ink, animationDelay: '.08s' }}>
              {season.headline}
            </h2>
            {season.subline && (
              <p className="fz-rise mt-1.5 max-w-md text-[13px] leading-snug sm:text-[15px]" style={{ color: theme.sub, animationDelay: '.16s' }}>{season.subline}</p>
            )}
          </div>
          {season.artUrl && (
            <img src={season.artUrl} alt="" className="fz-pop h-24 w-24 shrink-0 rounded-2xl object-cover shadow-[0_10px_30px_-12px_rgba(0,0,0,.5)] sm:h-32 sm:w-32" />
          )}
        </div>
        {picks.length > 0 && (
          <div className="fz-rise -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" style={{ animationDelay: '.2s' }}>
            {picks.map((t) => {
              const photo = t.imageUrl || tilePhoto(t.service.code) || servicePhoto(t.service);
              return (
                <button key={t.serviceCode} type="button" onClick={() => onOpen?.(t.service)}
                  className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13px] font-bold transition-transform active:scale-[0.97]"
                  style={{ background: theme.tile, color: theme.tileInk, boxShadow: `inset 0 0 0 1px ${theme.line}` }}>
                  {photo
                    ? <img src={photo} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" />
                    : <span className="h-8 w-8 rounded-full" style={{ background: theme.line }} />}
                  {t.title || t.service.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="fz-rise" style={{ animationDelay: '.28s' }}>
          <FestiveOffer offer={season.offer} theme={theme} />
        </div>
      </div>
    </section>
  );
}
