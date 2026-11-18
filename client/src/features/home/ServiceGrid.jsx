import { ArrowRight } from 'lucide-react';
import { areaPhoto, servicePhoto, tilePhoto } from '@shared/components/home/serviceArt';
import { AREA_PHOTO, pickPopular } from '@shared/config/homepageContent';
import { icon3dFor } from '@shared/config/icons3d';

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
export const SHORT_NAME = {
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
