import FestiveOffer from './FestiveOffer';
import FestiveSwap from './FestiveSwap';
import { ARCH, archEdge, archLights, festivePicks, tileTag } from '../../../customer/season';
import { servicePhoto, tilePhoto } from '../serviceArt';

// One big tile with the rest beside it, as Blinkit lays out its festive picks; the grid follows how many are live.
const GRID = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2', 4: 'grid-cols-2', 5: 'grid-cols-3', 6: 'grid-cols-3' };
const bigFirst = (n) => n === 3 || n === 5;

function Tile({ t, theme, big, i, onOpen }) {
  const ink = theme.dark ? theme.top : theme.ink;
  const tag = tileTag(t, t.service);
  const photo = t.imageUrl || tilePhoto(t.service.code) || servicePhoto(t.service);
  return (
    <button type="button" onClick={() => onOpen?.(t.service)}
      className={`fz-rise group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-[0_8px_22px_-16px_rgba(0,0,0,.45)] ring-1 ring-black/5 transition-transform active:scale-[0.97] ${big ? 'row-span-2 min-h-[352px]' : 'min-h-[170px]'}`}
      style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
      {tag && (
        <span className="fz-sheen self-start rounded-br-xl px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-white" style={{ background: theme.dark ? theme.bottom : theme.accent }}>
          {tag}
        </span>
      )}
      <span className={`block px-2.5 font-extrabold leading-[1.15] tracking-[-0.01em] [text-wrap:balance] ${tag ? 'pt-1.5' : 'pt-3'} ${big ? 'text-center text-[17px]' : 'text-center text-[13.5px]'}`} style={{ color: ink }}>
        {t.title || t.service.name}
      </span>
      <span className={`relative mx-2 mb-2 mt-2 flex-1 overflow-hidden rounded-xl ${big ? 'min-h-[220px]' : 'min-h-[82px]'}`} style={{ background: theme.wash }}>
        {photo && <img src={photo} alt="" loading="lazy" className="fz-zoom absolute inset-0 h-full w-full object-cover" style={{ animationDelay: `${i * 0.7}s` }} />}
      </span>
    </button>
  );
}

// The festive panel under the festive header (Admin → Festive home): an arch edged with chasing lights, the line, the picks and the offer.
export default function FestiveHero({ season, theme, services = [], onOpen }) {
  const picks = festivePicks(season.tiles, services, (sv) => tilePhoto(sv.code) || servicePhoto(sv));
  const ink = theme.dark ? theme.top : theme.ink;
  const big = bigFirst(picks.length);
  return (
    <section aria-label={season.name} className="relative" style={{ background: theme.top }}>
      <FestiveSwap theme={theme} />
      <div className="fz-settle mx-auto w-full max-w-5xl px-3 pt-2 sm:px-6">
        <svg viewBox={`0 0 ${ARCH.w} ${ARCH.h}`} preserveAspectRatio="none" className="fz-drop block h-10 w-full" aria-hidden="true">
          <path d={`${archEdge} Z`} fill={theme.wash} />
          <path d={archLights} fill="none" stroke={theme.accent} strokeWidth="4" className="fz-marquee" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="-mt-px rounded-b-3xl px-3 pb-4 sm:px-5" style={{ background: theme.wash }}>
          {/* Keyed on the look, so the words rise in again when the festival changes look. */}
          <div key={theme.look || 0} className="text-center">
            {season.greeting && (
              <p className="fz-rise text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: theme.dark ? theme.bottom : theme.accent }}>{season.greeting}</p>
            )}
            <h2 className="fz-rise mt-0.5 text-[27px] font-black uppercase leading-[1.02] tracking-[-0.02em] [text-wrap:balance] sm:text-[38px]" style={{ color: ink, animationDelay: '.08s' }}>
              {season.headline}
            </h2>
            {season.subline && (
              <p className="fz-rise mx-auto mt-1.5 max-w-md text-[13px] font-semibold leading-snug opacity-80 sm:text-[15px]" style={{ color: ink, animationDelay: '.14s' }}>{season.subline}</p>
            )}
          </div>
          {picks.length > 0 && (
            <div className={`mt-4 grid gap-2.5 ${GRID[picks.length]}`}>
              {picks.map((t, i) => <Tile key={t.serviceCode} t={t} theme={theme} big={big && i === 0} i={i} onOpen={onOpen} />)}
            </div>
          )}
          {season.offer && <div className="fz-rise mt-3" style={{ animationDelay: '.5s' }}><FestiveOffer offer={season.offer} theme={theme} /></div>}
        </div>
      </div>
      <div className="h-4" />
    </section>
  );
}
