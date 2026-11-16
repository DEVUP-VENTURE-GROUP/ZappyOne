import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BadgeIndianRupee, Car, ChevronLeft, ChevronRight, Droplets, House, MapPin, ShieldCheck, Smartphone, Wrench,
} from 'lucide-react';
import PromoBanner from '@shared/components/home/PromoBanner';
import { PITCH } from '@shared/components/home/serviceArt';
import { ZappyWordmark } from '@shared/components/common/ZappyLogo';

// What every booking gets (the site's own promise: verified pros, the price before work starts, live tracking).
const PROMISE = [
  [ShieldCheck, 'Verified', 'Professionals'],
  [BadgeIndianRupee, 'Price Before', 'Work Starts'],
  [MapPin, 'Live', 'Tracking'],
];

/*
 * The top of Home (the team's web design): a navy panel that fades into the photo,
 * the wordmark, a two-line title with an orange underline, three points and an
 * orange button. `services`: catalog codes the slide stands for; it opens the
 * first one offered here, and a slide with none live does not show.
 */
const SLIDES = [
  { key: 'car_wash', domain: 'vehicles', services: ['car_wash', 'car_detailing'], photo: '/hero/car-wash.webp',
    title: ['Car Wash', 'at Your Doorstep'], cta: 'Book Car Wash',
    points: [[Droplets, 'Exterior &', 'Interior Cleaning'], [ShieldCheck, 'Safe &', 'Reliable'], [Car, 'Professional', 'Service']] },
  { key: 'electronics', domain: 'electronics', services: ['mobile_repair', 'mobile', 'laptop_repair', 'laptop'], photo: '/hero/phone-repair.webp',
    title: ['Phone & Laptop', 'Repair at Your Door'], cta: 'Book a Repair',
    points: [[Smartphone, 'Fixed at', 'Your Door'], [BadgeIndianRupee, 'Price Before', 'Work Starts'], [ShieldCheck, 'Verified', 'Technicians']] },
  { key: 'two_wheeler', domain: 'vehicles', services: ['two_wheeler'], photo: '/hero/two-wheeler.webp',
    title: ['Bike Trouble,', 'Sorted'], cta: 'Book a Mechanic',
    points: [[House, 'At Home or', 'On the Road'], [Wrench, 'Mechanic', 'Comes to You'], [ShieldCheck, 'Verified', 'Mechanics']] },
  { key: 'four_wheeler', domain: 'vehicles', services: ['four_wheeler'], photo: '/hero/vehicle-care.webp',
    title: ['Car Care', 'at Your Door'], cta: 'Book Car Service',
    points: [[Car, 'Where Your Car', 'Is Parked'], [Wrench, 'Checks &', 'Repairs'], [ShieldCheck, 'Verified', 'Mechanics']] },
  { key: 'water_tank_care', domain: 'home_services', services: ['water_tank_care'], photo: '/hero/water-tank.webp',
    title: ['Water Tank', 'Cleaning at Home'], cta: 'Book Tank Cleaning' },
  { key: 'pet_services', domain: 'pet_services', photo: '/hero/pet-care.webp', path: '/pet', cta: 'Book Pet Care' },
  { key: 'helping_services', domain: 'helping_services', photo: '/hero/helping.webp', path: '/helping', cta: 'Get Help' },
  { key: 'events', domain: 'events', photo: '/hero/events.webp', path: '/events', cta: 'Plan an Event' },
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

/** The orange brush-stroke under the title. */
function Underline() {
  return (
    <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true" className="mt-1 h-2 w-[58%] max-w-[300px] sm:mt-2 sm:h-3">
      <path d="M4 10 C 80 2, 200 1, 296 6" fill="none" stroke="#F97316" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function CatalogSlide({ slide, domain, active, onOpen }) {
  const [pTitle] = PITCH[domain.code] || [domain.name];
  const [top, bottom] = slide.title || [slide.services ? slide.target.name : pTitle, ''];
  const points = slide.points || PROMISE;
  return (
    <div className="relative h-[230px] w-full shrink-0 snap-center overflow-hidden bg-zappy-900 sm:h-[340px] lg:h-[400px]" aria-hidden={!active}>
      <img src={slide.photo} alt="" loading={active ? 'eager' : 'lazy'} decoding="async"
        className="absolute inset-y-0 right-0 h-full w-[72%] object-cover object-center sm:w-[62%]" />
      {/* Navy on the left, fading into the photo, so the words always read. */}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-zappy-900 from-[30%] via-zappy-900/85 via-[48%] to-transparent to-[78%] sm:from-[36%] sm:via-[52%]" />
      <div className="relative flex h-full max-w-[68%] flex-col justify-center px-5 sm:max-w-[600px] sm:px-10 lg:px-12">
        <ZappyWordmark tone="dark" size={22} className="sm:hidden" />
        <ZappyWordmark tone="dark" size={34} className="hidden sm:inline-flex" />
        <h2 className="mt-3 text-[24px] font-extrabold italic leading-[1.05] tracking-[-0.02em] text-white sm:mt-5 sm:text-[44px] lg:text-[54px]">
          {top}{bottom && <><br />{bottom}</>}
        </h2>
        <Underline />
        <ul className="mt-5 hidden items-center divide-x divide-white/25 sm:flex">
          {points.map(([Icon, a, b]) => (
            <li key={a + b} className="flex items-center gap-2.5 px-4 first:pl-0 last:pr-0 lg:px-5">
              <Icon size={30} strokeWidth={1.8} className="shrink-0 text-white" />
              <span className="text-[14px] font-medium leading-[1.25] text-white/95 lg:text-[15px]">{a}<br />{b}</span>
            </li>
          ))}
        </ul>
        <button type="button" tabIndex={active ? 0 : -1} onClick={() => onOpen(slide.target, slide.path)}
          className="mt-4 inline-flex h-10 items-center gap-2 self-start rounded-full bg-orange-500 px-5 text-[14px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(249,115,22,0.6)] transition-colors hover:bg-orange-600 sm:mt-6 sm:h-14 sm:px-8 sm:text-[18px]">
          {slide.cta || 'Book Now'} <ArrowRight size={20} strokeWidth={2.4} />
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
