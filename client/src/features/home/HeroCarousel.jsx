import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import PromoBanner from '@shared/components/home/PromoBanner';
import { PITCH } from '@shared/components/home/serviceArt';

/**
 * The top of Home: one full-width carousel.
 *
 *   banners  admin hero banners (Homepage → Banners), shown when any are live
 *   else     one slide per live service area, from the catalogue — every slide
 *            is tied to a service we offer; a slide whose service is not in the
 *            live catalogue is dropped.
 *
 * Auto-advances, pauses on hover/focus/touch, never moves for reduced motion;
 * dots and arrows step manually.
 */
const SLIDES = [
  { key: 'electronics', domain: 'electronics', services: ['mobile_repair', 'mobile', 'laptop_repair', 'laptop'], photo: '/hero/phone-repair.webp',
    title: 'Phone or laptop repair', line: 'Fixed at your door. You approve the price before work starts.' },
  { key: 'two_wheeler', domain: 'vehicles', services: ['two_wheeler'], photo: '/hero/two-wheeler.webp',
    title: 'Bike trouble, sorted', line: 'A mechanic comes to you, at home or on the road.' },
  { key: 'four_wheeler', domain: 'vehicles', services: ['four_wheeler'], photo: '/hero/vehicle-care.webp',
    title: 'Car care at your door', line: 'Checks and repairs where your car is parked.' },
  { key: 'water_tank_care', domain: 'home_services', services: ['water_tank_care'], photo: '/hero/water-tank.webp' },
  { key: 'pet_services', domain: 'pet_services', photo: '/hero/pet-care.webp', path: '/pet' },
  { key: 'helping_services', domain: 'helping_services', photo: '/hero/helping.webp', path: '/helping' },
  { key: 'events', domain: 'events', photo: '/hero/events.webp', path: '/events' },
];
const SLIDE_MS = 6000;

function useReducedMotionPref() {
  const q = '(prefers-reduced-motion: reduce)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);
  return on;
}

function CatalogSlide({ slide, domain, active, onOpen }) {
  const [pTitle, pLine] = PITCH[domain.code] || [domain.name, domain.description];
  const title = slide.title || (slide.services ? slide.target.name : pTitle);
  const line = slide.line || pLine;
  return (
    <div className="relative h-[188px] w-full shrink-0 snap-center overflow-hidden sm:h-[300px] lg:h-[340px]" aria-hidden={!active}>
      <img src={slide.photo} alt="" className="absolute inset-0 h-full w-full object-cover" loading={active ? 'eager' : 'lazy'} />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,#142F73F2_0%,#1A41B4CC_40%,#1F4FD800_78%)]" />
      <div className="relative flex h-full max-w-[72%] flex-col justify-center gap-1 p-4 sm:max-w-[560px] sm:gap-2.5 sm:p-8 lg:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75 sm:text-[12px]">{domain.name}</p>
        <h2 className="text-[20px] font-extrabold leading-[1.12] tracking-[-0.02em] text-white [text-wrap:balance] sm:text-[30px] lg:text-[36px]">{title}</h2>
        {line && <p className="hidden max-w-md text-[15px] leading-relaxed text-white/85 sm:block sm:text-[16px]">{line}</p>}
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => onOpen(slide.target, slide.path)}
          className="mt-2 inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-white px-3.5 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-zappy-50 sm:h-11 sm:px-5 sm:text-[14px]">
          Book a service <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default function HeroCarousel({ banners = [], domains = [], onOpen, onOpenBanner, onImageError }) {
  const still = useReducedMotionPref();
  const byCode = new Map(domains.map((d) => [d.code, d]));
  const catalogSlides = SLIDES.map((s) => {
    const services = byCode.get(s.domain)?.services || [];
    const target = s.services
      ? s.services.map((c) => services.find((x) => x.code === c)).find(Boolean)
      : services.find((x) => x.available !== false) || services[0];
    return target ? { ...s, target } : null;
  }).filter(Boolean);

  const useBanners = banners.length > 0;
  const count = useBanners ? banners.length : catalogSlides.length;

  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

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

  // A source switch (catalogue → banners once they load) starts from the first slide.
  useEffect(() => { track.current?.scrollTo({ left: 0 }); setIndex(0); }, [useBanners]);

  if (!count) return null;

  return (
    <section aria-label="Featured" aria-roledescription="carousel"
      className="group relative overflow-hidden rounded-[20px] bg-zappy-800 shadow-soft"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}>
      <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar"
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {useBanners
          ? banners.map((ad, i) => (
            <div key={ad._id} className="w-full shrink-0 snap-center">
              <PromoBanner ad={ad} variant="hero" active={i === index} onOpen={onOpenBanner} onImageError={onImageError} className="!rounded-none" />
            </div>
          ))
          : catalogSlides.map((s, i) => (
            <CatalogSlide key={s.key} slide={s} domain={byCode.get(s.domain)} active={i === index} onOpen={onOpen} />
          ))}
      </div>

      {count > 1 && (
        <>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 sm:bottom-4" role="tablist" aria-label="Slides">
            {Array.from({ length: count }).map((_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1} of ${count}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`} />
            ))}
          </div>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-900 opacity-0 shadow-soft transition group-hover:opacity-100 focus-visible:opacity-100 md:flex">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next slide"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-900 opacity-0 shadow-soft transition group-hover:opacity-100 focus-visible:opacity-100 md:flex">
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </section>
  );
}
