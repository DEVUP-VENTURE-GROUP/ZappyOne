import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Share2, Smartphone, Zap } from 'lucide-react';
import { PITCH } from '@shared/components/home/serviceArt';

/**
 * The top of home: a photo carousel of everything we do (three quarters)
 * beside one featured service (a quarter, wide screens only). Every slide is
 * tied to the live catalog: a slide whose services are not offered is dropped.
 *
 * Photos live in the global assets folder (assets/web/hero, served at /hero).
 */
/** `services`: catalog codes the slide stands for; it opens the first one offered. */
const SLIDES = [
  { key: 'electronics', domain: 'electronics', services: ['mobile_repair', 'mobile', 'laptop_repair', 'laptop'], tab: 'Phone & laptop', photo: '/hero/phone-repair.webp',
    title: 'Phone or laptop repair', line: 'Fixed at your door. You approve the price before work starts.' },
  { key: 'two_wheeler', domain: 'vehicles', services: ['two_wheeler'], tab: '2-Wheeler', photo: '/hero/two-wheeler.webp',
    title: 'Bike trouble, sorted', line: 'A mechanic comes to you, at home or on the road.' },
  { key: 'four_wheeler', domain: 'vehicles', services: ['four_wheeler'], tab: '4-Wheeler', photo: '/hero/vehicle-care.webp',
    title: 'Car care at your door', line: 'Checks and repairs where your car is parked.' },
  { key: 'water_tank_care', domain: 'home_services', services: ['water_tank_care'], tab: 'Water tank', photo: '/hero/water-tank.webp' },
  { key: 'pet_services', domain: 'pet_services', tab: 'Pet care', photo: '/hero/pet-care.webp', path: '/pet' },
  { key: 'helping_services', domain: 'helping_services', tab: 'Shopping & returns', photo: '/hero/helping.webp', path: '/helping' },
  { key: 'events', domain: 'events', tab: 'Events', photo: '/hero/events.webp', path: '/events' },
];
const FEATURED = { domain: 'electronics', service: ['mobile_repair', 'mobile'], photo: '/hero/phone-bench.webp' };
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

function Slide({ slide, domain, target, active, onOpen }) {
  const [pTitle, pLine] = PITCH[domain.code] || [domain.name, domain.description];
  const title = slide.title || (slide.services ? target.name : pTitle);
  const line = slide.line || pLine;
  return (
    <div className="relative h-full w-full shrink-0 snap-center overflow-hidden" aria-hidden={!active}>
      <img src={slide.photo} alt="" className="absolute inset-0 h-full w-full object-cover" loading={active ? 'eager' : 'lazy'} />
      {/* Scrim for legible type over any photo. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent sm:from-black/70 sm:via-black/35" />
      <div className="relative flex h-full max-w-[85%] flex-col justify-center gap-1.5 px-4 sm:max-w-[560px] sm:gap-3 sm:px-9 sm:pb-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 sm:text-[12px]">{domain.name}</p>
        <h2 className="text-[21px] font-bold leading-[1.15] text-white [text-wrap:balance] sm:text-[34px]">{title}</h2>
        {line && <p className="line-clamp-2 max-w-md text-[13px] leading-snug text-white/85 sm:text-[15px] sm:leading-relaxed">{line}</p>}
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => onOpen(target, slide.path)}
          className="mt-1.5 inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-btn bg-white px-3.5 text-[14px] font-semibold text-ink-900 transition-colors hover:bg-sunken sm:min-h-[44px] sm:px-4 sm:text-[15px]">
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
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const byCode = new Map(domains.map((d) => [d.code, d]));
  const slides = SLIDES.map((s) => {
    const services = byCode.get(s.domain)?.services || [];
    const target = s.services
      ? s.services.map((c) => services.find((x) => x.code === c)).find(Boolean)
      : services.find((x) => x.available !== false) || services[0];
    return target ? { ...s, target } : null;
  }).filter(Boolean);
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

  // Keep the active tab in view when the row scrolls (phones show a few at a time).
  const tabs = useRef(null);
  useEffect(() => {
    const row = tabs.current; const tab = row?.children[index];
    if (row && tab) row.scrollTo({ left: tab.offsetLeft - row.offsetLeft - 16, behavior: still ? 'auto' : 'smooth' });
  }, [index, still]);

  if (!count) return null;

  const tabRow = (className, overlay = false) => (
    <div ref={overlay ? undefined : tabs} className={`gap-2 overflow-x-auto no-scrollbar ${className}`} role="tablist">
      {slides.map((s, i) => (
        <button key={s.key} type="button" role="tab" aria-selected={i === index} onClick={() => go(i)}
          className={`min-h-[34px] shrink-0 rounded-btn px-3 text-[13px] font-semibold transition-colors ${
            i === index ? 'bg-zappy-600 text-white'
              : overlay ? 'bg-white/90 text-ink-900 hover:bg-white' : 'border border-line bg-white text-ink-700'}`}>
          {s.tab}
        </button>
      ))}
    </div>
  );

  return (
    <section aria-label="What ZappyOne does" className="grid gap-4 lg:h-[340px] lg:grid-cols-[3fr_1fr]">
      <div
        aria-roledescription="carousel"
        className="relative h-[210px] overflow-hidden rounded-card bg-ink-900 sm:h-[300px] lg:h-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
      >
        <div ref={track} className="flex h-full snap-x snap-mandatory overflow-x-auto no-scrollbar"
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {slides.map((s, i) => (
            <Slide key={s.key} slide={s} domain={byCode.get(s.domain)} target={s.target} active={i === index} onOpen={onOpen} />
          ))}
        </div>
        {count > 1 && tabRow('absolute bottom-5 left-9 right-5 hidden sm:flex', true)}
      </div>
      {count > 1 && tabRow('-mx-4 -mt-2 flex px-4 sm:hidden')}
      {featured && <FeaturedCard service={featured} photo={FEATURED.photo} onOpen={onOpen} />}
    </section>
  );
}
