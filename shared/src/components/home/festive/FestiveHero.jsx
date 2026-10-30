import FestiveMotif from './FestiveMotif';
import FestiveOffer from './FestiveOffer';
import FestiveRays from './FestiveRays';

// The top of home during a festival (Admin → Festive home), as Blinkit does it: one festive band, one line and the offer; the services stay in the grid below.
export default function FestiveHero({ season, theme }) {
  return (
    <section aria-label={season.name} className="relative overflow-hidden rounded-b-sheet" style={{ background: theme.bottom }}>
      {theme.rays && <FestiveRays />}
      <FestiveMotif theme={season.theme} />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-5 pt-[120px] sm:px-6 sm:pt-[124px]">
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
        <div className="fz-rise" style={{ animationDelay: '.24s' }}>
          <FestiveOffer offer={season.offer} theme={theme} />
        </div>
      </div>
    </section>
  );
}
