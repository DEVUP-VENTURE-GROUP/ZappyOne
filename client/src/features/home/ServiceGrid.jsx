import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { areaPhoto, servicePhoto, tilePhoto } from '@shared/components/home/serviceArt';
import { AREA_PHOTO, pickPopular } from '@shared/config/homepageContent';
import { icon3dFor } from '@shared/config/icons3d';
import { problemPhoto } from '@shared/components/home/problemArt';

// The services, as one even grid on a single neutral surface.
// Soft tints, one per service area, so the grid reads in groups at a glance.
export const DOMAIN_TINT = {
  electronics: { bg: 'bg-violet-50', fg: 'text-violet-600' },
  vehicles: { bg: 'bg-sky-50', fg: 'text-sky-600' },
  home_services: { bg: 'bg-cyan-50', fg: 'text-cyan-600' },
  pet_services: { bg: 'bg-orange-50', fg: 'text-orange-500' },
  helping_services: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  family_assist: { bg: 'bg-rose-50', fg: 'text-rose-500' },
  events: { bg: 'bg-pink-50', fg: 'text-pink-500' },
};
const DEFAULT_TINT = { bg: 'bg-zappy-50', fg: 'text-zappy-600' };
export const tintFor = (domainCode) => DOMAIN_TINT[domainCode] || DEFAULT_TINT;

/*
 * Explore Services (the team's web design): twelve photo cards, six to a row on
 * a desktop, each a live service bookable at this address.
 *
 * The design's tiles, in its order, as the catalog's real services; any that is
 * not live here drops out and the next live service with a photo takes its place.
 */
const FEATURED = [
  'daily_cleaning', 'appliance_repair', 'water_tank_care', 'appliance_install', 'mobile_repair', 'four_wheeler',
  'two_wheeler', 'pet_grooming', 'salon_home', 'events', 'carpentry', 'pest_control',
];
// Short card names, as in the design; anything else shows its catalog name.
const SHORT_NAME = {
  daily_cleaning: 'Home Cleaning', appliance_repair: 'AC & Appliances', water_tank_care: 'Water Tank Care', appliance_install: 'Appliance Installation',
  mobile_repair: 'Phone Repair', laptop_repair: 'Laptop Repair', four_wheeler: 'Car Service', car_detailing: 'Car Wash & Detailing', two_wheeler: 'Bike Service',
  pet_grooming: 'Pet Care', pet_walk: 'Pet Walking', salon_home: 'Beauty & Salon', mens_grooming: "Men's Grooming", events: 'Events & Celebrations',
  carpentry: 'Carpentry', pest_control: 'Pest Control', painting: 'Painting', sofa_mattress: 'Sofa & Carpet Cleaning', ro_service: 'RO Service',
  bathroom_balcony: 'Bathroom Cleaning', shopping_pickup: 'Shopping Help', household_help: 'Household Help', massage_wellness: 'Massage & Wellness',
};
const EXPLORE_COUNT = 12;

/** A real photo for every card: the service's own, its tile, its area's. */
export const explorePhoto = (s) => servicePhoto(s) || tilePhoto(s.code) || AREA_PHOTO[s.code] || areaPhoto({ code: s.domainCode });

/** The design's tiles first (when live here), then the most popular of the rest, photos only, twelve in all. */
export function pickExplore(services) {
  const byCode = new Map(services.map((s) => [s.code, s]));
  const featured = FEATURED.map((c) => byCode.get(c)).filter(Boolean);
  const rest = pickPopular(services.filter((s) => !FEATURED.includes(s.code)), services.length).filter((s) => explorePhoto(s));
  return [...featured, ...rest].slice(0, EXPLORE_COUNT);
}

function ExploreCard({ service, onOpen }) {
  const photo = explorePhoto(service);
  return (
    <button type="button" onClick={onOpen} aria-label={service.name}
      className="group flex flex-col overflow-hidden rounded-[16px] bg-white p-1.5 text-center shadow-[0_2px_12px_-3px_rgba(16,24,40,0.12)] ring-1 ring-black/[0.04] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(16,24,40,0.22)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-600/25 sm:p-2">
      <span className="block aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-sunken">
        {photo
          ? <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
          : <span className="flex h-full items-center justify-center"><img src={icon3dFor(service)} alt="" loading="lazy" className="h-[62%] w-auto object-contain" /></span>}
      </span>
      <span className="flex min-h-[44px] flex-1 items-center justify-center px-1 pb-1 pt-2 text-[13px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance] sm:min-h-[56px] sm:text-[16px]">
        {SHORT_NAME[service.code] || service.name}
      </span>
    </button>
  );
}

export function ServiceGrid({ services, onOpen, onViewAll }) {
  const cards = pickExplore(services);
  if (!cards.length) return null;
  return (
    <section aria-labelledby="home-services">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-services" className="flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.02em] text-ink-900 sm:gap-3.5 sm:text-[30px]">
          <span aria-hidden="true" className="h-6 w-1 rounded-full bg-orange-500 sm:h-8 sm:w-1.5" />
          Explore Services
        </h2>
        <button type="button" onClick={onViewAll}
          className="flex shrink-0 items-center gap-1.5 text-[14px] font-bold text-zappy-700 transition-colors hover:text-zappy-900 sm:text-[17px]">
          View All <ArrowRight size={18} strokeWidth={2.4} />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
        {cards.map((s) => <ExploreCard key={s.code} service={s} onOpen={() => onOpen(s)} />)}
      </div>
    </section>
  );
}

// The fastest way in: a problem in the customer's own words, straight into the service that fixes it.
const DRIFT_PX_PER_S = 28;

export function ProblemChips({ services }) {
  const nav = useNavigate();
  const row = useRef(null);
  const hold = useRef(false);
  const resumeAt = useRef(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const chips = [];
  const seen = new Set();
  for (const s of services) {
    for (const h of s.highlights || []) {
      if (seen.has(h.name) || chips.length >= 10) continue;
      seen.add(h.name);
      chips.push({ ...h, service: s });
    }
  }
  const loops = !reduce && chips.length > 3;

  useEffect(() => {
    const el = row.current;
    if (!el || !loops) return undefined;
    let raf; let last = performance.now(); let carry = 0;
    const tick = (now) => {
      const dt = Math.min(64, now - last); last = now;
      if (!hold.current && now >= resumeAt.current && !document.hidden) {
        carry += (DRIFT_PX_PER_S * dt) / 1000;
        const step = Math.floor(carry);
        if (step) { el.scrollLeft += step; carry -= step; }
        // The list is drawn twice; past the first copy, jump back by one copy.
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) el.scrollLeft -= half;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loops]);

  const pause = (ms = 0) => { resumeAt.current = performance.now() + ms; };
  function stepBy(dir) {
    const el = row.current;
    if (!el) return;
    pause(4000);
    if (loops && dir < 0 && el.scrollLeft < 240) el.scrollLeft += el.scrollWidth / 2;
    el.scrollBy({ left: dir * 240, behavior: reduce ? 'auto' : 'smooth' });
  }

  if (!chips.length) return null;
  const list = loops ? [...chips, ...chips] : chips;

  return (
    <section aria-labelledby="home-problems">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-problems" className="text-[13px] font-semibold text-ink-500">Common problems</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => stepBy(-1)} aria-label="Previous problems"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-700 hover:border-line-strong">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => stepBy(1)} aria-label="More problems"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-700 hover:border-line-strong">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="relative -mx-4 mt-2 sm:mx-0">
        <div
          ref={row}
          className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:px-0"
          onMouseEnter={() => { hold.current = true; }}
          onMouseLeave={() => { hold.current = false; }}
          onTouchStart={() => { hold.current = true; }}
          onTouchEnd={() => { hold.current = false; pause(3000); }}
          onFocus={() => { hold.current = true; }}
          onBlur={() => { hold.current = false; }}
        >
          {list.map((c, i) => {
            const Icon = SERVICE_ICONS[c.service.icon] || Wrench;
            const photo = problemPhoto(c.service.artKey || c.service.code, c);
            const copy = i >= chips.length;
            return (
              <button
                key={`${c.service.code}:${c.code}:${copy ? 1 : 0}`}
                type="button"
                onClick={() => nav(c.service.path)}
                tabIndex={copy ? -1 : 0}
                aria-hidden={copy || undefined}
                className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-line bg-white pl-1.5 pr-3.5 text-[13px] font-medium text-ink-900 transition-colors duration-150 hover:border-line-strong active:bg-canvas"
              >
                {photo
                  ? <img src={photo} alt="" loading="lazy" decoding="async" className="h-7 w-7 rounded-full object-cover" />
                  : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zappy-50 text-zappy-600">
                      <Icon size={14} strokeWidth={2} />
                    </span>
                  )}
                {c.name}
              </button>
            );
          })}
        </div>
        {/* Soft edges say "there is more this way". */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-canvas to-transparent sm:w-10" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-canvas to-transparent sm:w-10" />
      </div>
    </section>
  );
}
