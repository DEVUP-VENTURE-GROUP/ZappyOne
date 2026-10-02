import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BellRing } from 'lucide-react';
import { artFor, PITCH } from '@shared/components/home/serviceArt';

/**
 * One slide per kind of work we do in Telangana, each with its ZappyOne
 * character. The slide says what we do, in the customer's words, and the button
 * either books it (someone near you is verified) or offers to tell them when it
 * opens (nobody is yet — that tap is demand).
 *
 * Only the visible slide plays its loop; the rest show a still, so the page
 * loads one short video at a time. Reduced-motion users get stills only.
 */

/* Soft tints, one per slide in catalog order. */
const TINTS = ['bg-[#EAF1FD]', 'bg-[#E6F4EF]', 'bg-[#FDF1E4]', 'bg-[#FCEBEF]', 'bg-[#EEF0F6]'];
const SLIDE_MS = 6000;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function Slide({ domain, tint, active, still, onBook, onSoon }) {
  const art = artFor(domain.services[0]?.code, domain.code);
  const [title, sub] = PITCH[domain.code] || [domain.name, domain.description];
  const bookable = domain.services.find((s) => s.available !== false);

  return (
    <div className={`relative flex min-h-[184px] w-full shrink-0 snap-center items-stretch overflow-hidden rounded-3xl ${tint} sm:min-h-[248px]`}>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-2 py-5 pl-5 pr-2 sm:gap-3 sm:py-8 sm:pl-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{domain.name}</p>
        <h2 className="text-[19px] font-bold leading-tight text-navy [text-wrap:balance] sm:text-[30px]">{title}</h2>
        {sub && <p className="hidden max-w-md text-[14px] leading-relaxed text-slate-600 sm:block">{sub}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {bookable ? (
            <button type="button" onClick={() => onBook(bookable)} tabIndex={active ? 0 : -1}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-zappy-600 px-4 text-[14px] font-semibold text-white transition hover:bg-zappy-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200">
              Book {domain.services.length > 1 ? 'now' : bookable.name} <ArrowRight size={15} />
            </button>
          ) : (
            <button type="button" onClick={() => onSoon(domain.services[0])} tabIndex={active ? 0 : -1}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-navy ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200">
              <BellRing size={15} /> Coming soon · notify me
            </button>
          )}
        </div>
      </div>

      {art && (
        <div className="relative mr-3 mt-3 h-[172px] w-[104px] shrink-0 self-end overflow-hidden rounded-t-2xl bg-[#E9EAEC] sm:mr-8 sm:mt-6 sm:h-[236px] sm:w-[142px]">
          {active && !still ? (
            <video src={art.loop} poster={art.still} autoPlay muted loop playsInline preload="metadata"
              aria-label={art.alt} className="h-full w-full object-cover" />
          ) : (
            <img src={art.still} alt={art.alt} loading="lazy" className="h-full w-full object-cover" />
          )}
        </div>
      )}
    </div>
  );
}

export default function HeroCarousel({ domains, onBook, onSoon }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = prefersReducedMotion();
  const count = domains.length;

  const go = useCallback((i) => {
    const el = track.current;
    if (!el) return;
    const next = (i + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: still ? 'auto' : 'smooth' });
  }, [count, still]);

  // The dot follows whatever the customer swiped to.
  function onScroll() {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  useEffect(() => {
    if (still || paused || count < 2) return undefined;
    const t = setInterval(() => { if (!document.hidden) go(index + 1); }, SLIDE_MS);
    return () => clearInterval(t);
  }, [index, paused, still, count, go]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What ZappyOne does"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div ref={track} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar">
        {domains.map((d, i) => (
          <Slide key={d.code} domain={d} tint={TINTS[i % TINTS.length]} active={i === index} still={still} onBook={onBook} onSoon={onSoon} />
        ))}
      </div>
      {count > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {domains.map((d, i) => (
            <button key={d.code} type="button" onClick={() => go(i)} aria-label={`Show ${d.name}`} aria-current={i === index}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-zappy-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
