import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Share2, Smartphone, Zap } from 'lucide-react';
import { PITCH } from '@shared/components/home/serviceArt';

/**
 * The top of home: a photo carousel of what we do (three quarters) beside one
 * featured service (a quarter). Slides and the card come from the live
 * catalog; a section with no services in it simply has no slide.
 *
 * Photos live in the global assets folder (assets/web/hero, served at /hero).
 */
const SLIDES = [
  { domain: 'electronics', tab: 'Phone repair', photo: '/hero/phone-repair.webp', phoneOnly: true },
  { domain: 'vehicles', tab: 'Bike & car', photo: '/hero/vehicle-care.webp' },
  { domain: 'events', tab: 'Events', photo: '/hero/events.webp' },
  { domain: 'pet_services', tab: 'Pet care', photo: '/hero/pet-care.webp' },
];
const FEATURED = { domain: 'electronics', service: ['mobile_repair', 'mobile'], photo: '/hero/phone-repair.webp' };
const SLIDE_MS = 6000;

function useMedia(query) {
  const read = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [on, setOn] = useState(read);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}

async function share(service) {
  const url = `${window.location.origin}${service.path || '/services'}`;
  try {
    if (navigator.share) { await navigator.share({ title: service.name, text: `Book ${service.name} on ZappyOne`, url }); return; }
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch (err) {
    if (err?.name !== 'AbortError') toast.error('Could not share this link');
  }
}

function Slide({ slide, domain, active, onOpen }) {
  const [title, line] = PITCH[domain.code] || [domain.name, domain.description];
  const target = domain.services.find((s) => s.available !== false) || domain.services[0];
  return (
    <div className="relative h-full w-full shrink-0 snap-center overflow-hidden" aria-hidden={!active}>
      <img src={slide.photo} alt="" className="absolute inset-0 h-full w-full object-cover" loading={active ? 'eager' : 'lazy'} />
      {/* Scrim for legible type over any photo. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />
      <div className="relative flex h-full max-w-[560px] flex-col justify-center gap-2 px-5 pb-12 sm:gap-3 sm:px-9">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80">{domain.name}</p>
        <h2 className="text-[24px] font-bold leading-[1.15] text-white [text-wrap:balance] sm:text-[36px]">{title}</h2>
        {line && <p className="hidden max-w-md text-[15px] leading-relaxed text-white/85 sm:block">{line}</p>}
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => onOpen(target, domain.code === 'events' ? '/events' : undefined)}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-btn bg-white px-4 text-[15px] font-semibold text-ink-900 transition-colors hover:bg-sunken">
          Book now <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function FeaturedCard({ service, photo, onOpen }) {
  const n = service.coverage?.length || 0;
  return (
    <article className="relative hidden h-full overflow-hidden rounded-card lg:block">
      <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-3 bottom-3 rounded-card bg-white p-4">
        <span aria-hidden="true"
          className="absolute -top-7 right-4 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-ink-900 text-white">
          <Smartphone size={22} />
        </span>
        <p className="flex items-center gap-2">
          <span className="chip bg-green-600 text-[11px] font-bold uppercase tracking-wide text-white">Covers</span>
          <span className="text-[19px] font-bold tabular-nums text-ink-900">{n ? `${n} problems` : service.name}</span>
        </p>
        <p className="mt-1 line-clamp-1 text-[14px] text-ink-500">{service.name}</p>
        <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
          <CheckCircle2 size={15} className="text-green-600" /> Verified pros
          <span className="text-ink-300" aria-hidden="true">·</span>
          <span className="text-zappy-600">Quote first</span>
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onOpen(service)} className="btn-primary flex-1 px-3">
            <Zap size={16} /> Book now
          </button>
          <button type="button" onClick={() => share(service)} aria-label={`Share ${service.name}`} className="btn-outline w-11 shrink-0 px-0">
            <Share2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HeroCarousel({ domains, onOpen }) {
  const wide = useMedia('(min-width: 1024px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const byCode = new Map(domains.map((d) => [d.code, d]));
  const slides = SLIDES.filter((s) => byCode.get(s.domain)?.services.length && !(wide && s.phoneOnly));
  const featuredDomain = byCode.get(FEATURED.domain);
  const featured = featuredDomain?.services.find((s) => FEATURED.service.includes(s.code)) || featuredDomain?.services[0];

  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const go = useCallback((i) => {
    const el = track.current;
    if (!el || !count) return;
    const next = (i + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: still ? 'auto' : 'smooth' });
  }, [count, still]);

  useEffect(() => {
    if (still || paused || count < 2) return undefined;
    const t = setInterval(() => { if (!document.hidden) go(index + 1); }, SLIDE_MS);
    return () => clearInterval(t);
  }, [index, paused, still, count, go]);

  // Slide set changes with the width (phone repair moves into the card): start over.
  useEffect(() => { setIndex(0); track.current?.scrollTo({ left: 0 }); }, [wide]);

  if (!count) return null;

  return (
    <section aria-label="What ZappyOne does" className="grid gap-4 lg:h-[340px] lg:grid-cols-[3fr_1fr]">
      <div
        aria-roledescription="carousel"
        className="relative h-[220px] overflow-hidden rounded-card bg-ink-900 sm:h-[300px] lg:h-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
      >
        <div ref={track} className="flex h-full snap-x snap-mandatory overflow-x-auto no-scrollbar"
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {slides.map((s, i) => (
            <Slide key={s.domain} slide={s} domain={byCode.get(s.domain)} active={i === index} onOpen={onOpen} />
          ))}
        </div>
        {count > 1 && (
          <div className="absolute bottom-3 left-5 right-5 flex gap-2 overflow-x-auto no-scrollbar sm:bottom-5 sm:left-9" role="tablist">
            {slides.map((s, i) => (
              <button key={s.domain} type="button" role="tab" aria-selected={i === index} onClick={() => go(i)}
                className={`min-h-[32px] shrink-0 rounded-btn px-3 text-[13px] font-semibold transition-colors ${
                  i === index ? 'bg-zappy-600 text-white' : 'bg-white/90 text-ink-900 hover:bg-white'}`}>
                {s.tab}
              </button>
            ))}
          </div>
        )}
      </div>
      {featured && <FeaturedCard service={featured} photo={FEATURED.photo} onOpen={onOpen} />}
    </section>
  );
}
