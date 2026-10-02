/**
 * ZappyOne's characters — one per kind of work, a still and a short loop.
 *
 * Files live in the global assets folder (assets/web/characters, served at
 * /characters in every app). A service an admin has given its own picture keeps
 * it; everything else gets its character, so a new service looks deliberate on
 * day one. Matched by the service's own code first, then its domain.
 */
const CHARACTERS = {
  phones: 'Phone expert',
  laptops: 'Laptop expert',
  cars: 'Vehicle mechanic',
  home: 'Home service pro',
  pets: 'Pet carer',
  more: 'Zappy helper',
  events: 'Event planner',
  elders: 'Care companion',
};

const BY_SERVICE = {
  mobile_repair: 'phones',
  laptop_repair: 'laptops',
  two_wheeler: 'cars',
  four_wheeler: 'cars',
  water_tank_care: 'home',
};

const BY_DOMAIN = {
  electronics: 'phones',
  vehicles: 'cars',
  home_services: 'home',
  pet_services: 'pets',
  helping_services: 'more',
  events: 'events',
  family_assist: 'elders',
};

/** { still, loop, alt } for a service (and its domain code), or null. */
export function artFor(code, domainCode) {
  const key = BY_SERVICE[code] || BY_DOMAIN[domainCode] || (CHARACTERS[code] ? code : null);
  if (!key) return null;
  return { still: `/characters/${key}.webp`, loop: `/characters/${key}.mp4`, alt: CHARACTERS[key] };
}

/**
 * Art per service for one section, or null where a character would repeat:
 * seven identical pet carers in a row reads as a placeholder, not a choice.
 * Repeated ones fall back to the service's own icon.
 */
export function distinctArt(services, domainCode) {
  const arts = services.map((s) => (s.imageUrl ? null : artFor(s.code, domainCode || s.domainCode)));
  const uses = new Map();
  for (const a of arts) if (a) uses.set(a.still, (uses.get(a.still) || 0) + 1);
  return new Map(services.map((s, i) => [s.code, arts[i] && uses.get(arts[i].still) === 1 ? arts[i] : null]));
}

/**
 * Sections shown on the home grid as ONE tile that opens their own page, where
 * the customer picks the exact service. Seven pet tiles in a row buried the
 * rest of the grid; one "Pet care" tile says the same thing in a glance.
 */
export const HUBS = {
  pet_services: { name: 'Pet care', path: '/pet' },
};

/** A domain's services, folded into its hub tile when it has one. */
export function foldIntoHub(domain) {
  const hub = HUBS[domain.code];
  if (!hub || domain.services.length < 2) return domain;
  const anyAvailable = domain.services.some((s) => s.available !== false);
  const unknown = domain.services.every((s) => s.available === undefined);
  return {
    ...domain,
    services: [{
      code: domain.code, name: hub.name, path: hub.path, icon: domain.services[0].icon, imageUrl: '',
      domainCode: domain.code, highlights: [], available: unknown ? undefined : anyAvailable,
    }],
  };
}

/** What each section does, in the customer's words: [headline, one line]. */
export const PITCH = {
  electronics: ['Phone or laptop acting up?', 'A verified technician fixes it at your door, at a price fixed before work starts.'],
  vehicles: ['Bike or car won’t start?', 'A mechanic comes to you — roadside or at home.'],
  home_services: ['Clean, safe water at home', 'Tank and sump cleaning, photographed before and after.'],
  pet_services: ['Care your pet will love', 'Grooming, walks and stays by verified pet carers.'],
  helping_services: ['Shopping, pickups and returns', 'A trusted helper does the trip, with photos at every step.'],
  events: ['Celebrations, planned for you', 'Decor and event partners for every occasion.'],
};
