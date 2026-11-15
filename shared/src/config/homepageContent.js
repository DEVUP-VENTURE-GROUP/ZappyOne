// Homepage content — how admin-managed banners map onto the EXISTING ads API.

export const HOME_PLACEMENT = 'home_banner';

/** The placement endpoint caps `limit` at 10 across all three sections. */
export const PLACEMENT_LIMIT = 10;

export const BANNER_KINDS = {
  hero: {
    type: 'banner',
    label: 'Hero banner',
    section: 'Hero carousel',
    hint: 'The large rotating banner at the top of Home.',
  },
  campaign: {
    type: 'home_card',
    label: 'Campaign banner',
    section: 'Campaign banners',
    hint: 'A wide promotional banner in the middle of Home.',
  },
  offer: {
    type: 'offer_card',
    label: 'Offer card',
    section: 'Offers & deals',
    hint: 'A compact card in the Offers & deals rail.',
  },
};

export const KIND_BY_TYPE = Object.fromEntries(
  Object.entries(BANNER_KINDS).map(([kind, def]) => [def.type, kind]),
);

/** Recommended artwork sizes — guidance, not a server constraint. */
export const IMAGE_SPECS = [
  { placement: 'Desktop hero', size: '1920 × 600 px', ratio: '3.2:1', kind: 'hero' },
  { placement: 'Mobile hero', size: '1080 × 540 px', ratio: '2:1', kind: 'hero' },
  { placement: 'Promotional desktop banner', size: '1440 × 480 px', ratio: '3:1', kind: 'campaign' },
  { placement: 'Promotional mobile banner', size: '1080 × 540 px', ratio: '2:1', kind: 'campaign' },
  { placement: 'Store promotional strip', size: '1200 × 400 px', ratio: '3:1', kind: 'campaign' },
  { placement: 'Service promotional card', size: '800 × 600 px', ratio: '4:3', kind: 'offer' },
];

// Customer routes a banner may link to.
export const BANNER_ROUTES = [
  { path: '/services', label: 'All services' },
  { path: '/nearby-shops', label: 'Local stores (verified shops)' },
  { path: '/promos', label: 'Offers & promo codes' },
  { path: '/plans', label: 'Plans' },
  { path: '/rewards', label: 'Rewards' },
  { path: '/referral', label: 'Refer a friend' },
  { path: '/wallet', label: 'Wallet' },
  { path: '/events', label: 'Events home' },
  { path: '/pet', label: 'Pet care' },
  { path: '/helping', label: 'Helping services' },
  { path: '/repair', label: 'Phone repair' },
  { path: '/repair/laptop', label: 'Laptop repair' },
  { path: '/repair/two-wheeler', label: '2-wheeler repair' },
  { path: '/repair/four-wheeler', label: '4-wheeler repair' },
  { path: '/repair/water-tank-care', label: 'Water & tank care' },
];

const KNOWN_PREFIXES = ['/shops/', '/events/', '/pet/book/', '/repair/category/', '/policy/'];

// Is a CTA destination usable?
export function checkBannerLink(link, extraRoutes = []) {
  const value = String(link || '').trim();
  if (!value) return { ok: true, kind: 'none', message: 'No destination: the banner is not tappable.' };
  if (value.startsWith('/')) {
    const path = value.split(/[?#]/)[0];
    const known = [...BANNER_ROUTES.map((r) => r.path), ...extraRoutes].includes(path)
      || KNOWN_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length);
    return known
      ? { ok: true, kind: 'internal', message: `Opens ${path} in the app.` }
      : { ok: false, kind: 'internal', message: `${path} is not a page in the customer app.` };
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return { ok: false, kind: 'external', message: 'External links must use https://' };
    return { ok: true, kind: 'external', message: `Opens ${url.host} in a new tab.` };
  } catch {
    return { ok: false, kind: 'external', message: 'Not a valid link. Use /a-page or https://…' };
  }
}

// An image URL the browser can load as-is: a signed or external https link, a bundled path, or a local preview of a file being uploaded.
export function isLoadableImage(src) {
  if (!src) return true;
  return /^https:\/\//i.test(src) || src.startsWith('/') || src.startsWith('blob:');
}

/** Newest-first within a priority; higher priority first. */
export function byPriority(a, b) {
  return (b.billing?.rate || 0) - (a.billing?.rate || 0)
    || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

/** Split one placement response into the three homepage sections. */
export function splitHomeAds(ads = []) {
  const out = { hero: [], campaign: [], offer: [] };
  for (const ad of ads) {
    const kind = KIND_BY_TYPE[ad.type];
    if (kind && ad.content?.headline) out[kind].push(ad);
  }
  for (const k of Object.keys(out)) out[k].sort(byPriority);
  return out;
}

// The homepage, section by section: what drives each one and where an admin changes it.
export const HOME_SECTIONS = [
  { id: 'header', title: 'Header & search', source: 'Account, notifications and the customer’s location', managedIn: null },
  { id: 'switch', title: 'Book a service / Local stores', source: 'Fixed navigation', managedIn: null },
  { id: 'hero', title: 'Hero carousel', source: 'Hero banners; falls back to the live service catalogue when none are running', managedIn: 'banners' },
  { id: 'services', title: 'Explore services', source: 'Live catalogue (service lines with verified providers)', managedIn: 'services' },
  { id: 'zappyone', title: 'Discover local stores on ZappyOne', source: 'Fixed promotion linking to verified shops', managedIn: null },
  { id: 'popular', title: 'Popular services near you', source: 'Live catalogue: services flagged popular, then those bookable here', managedIn: 'services' },
  { id: 'campaign', title: 'Campaign banners', source: 'Campaign banners', managedIn: 'banners' },
  { id: 'stores', title: 'Explore local stores', source: 'Verified, active shops within 10 km of the customer', managedIn: 'shops' },
  { id: 'offers', title: 'Offers & deals', source: 'Offer cards plus live promo codes the customer can use', managedIn: 'banners' },
  { id: 'again', title: 'Book again', source: 'The signed-in customer’s completed bookings', managedIn: null },
  { id: 'activity', title: 'Your recent activity', source: 'The signed-in customer’s latest bookings', managedIn: null },
];

// Service-area photos shipped in assets/web/hero, for services without their own photo.
export const AREA_PHOTO = {
  mobile_repair: '/hero/phone-repair.webp', laptop_repair: '/hero/phone-bench.webp',
  two_wheeler: '/hero/two-wheeler.webp', four_wheeler: '/hero/vehicle-care.webp',
  water_tank_care: '/hero/water-tank.webp', shopping_pickup: '/hero/helping.webp',
  returns_exchange: '/hero/helping.webp', pet_services: '/hero/pet-care.webp', events: '/hero/events.webp',
};

// Popular first (admin flag), then what can be booked at this address.
export function pickPopular(services, max = 8) {
  const rank = (s) => (s.isPopular ? 0 : 2) + (s.available === false ? 1 : 0);
  return [...services].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}
