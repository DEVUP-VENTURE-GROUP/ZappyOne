/**
 * Zappy Service Catalog System — per-vertical configuration.
 *
 * This file is the ONLY thing that changes when a vertical is added or
 * re-skinned. Every catalog surface (`/services`, `/services/:category`,
 * `/service/:code`) renders from these objects, so Car Services, Phone Repair,
 * Plumbing, Cleaning… all get the identical premium layout with zero duplicated
 * UI code.
 *
 * ── Membership is not defined here ──────────────────────────────────────────
 * A category owns exactly the services that `groupKeyForService()` assigns to
 * it — the same first-match-wins partition the worker portal uses to build its
 * skills selector. That is deliberate and load-bearing: dispatch matches a
 * worker to an order by exact service-code equality, so if the customer catalog
 * grouped services differently from the worker portal, a customer could book
 * something out of a category no worker ever opted into from that category.
 * Using one function for both makes the two impossible to drift apart, and
 * makes every category an exclusive bucket (a service appears on exactly one
 * category page, never two).
 *
 * ── Copy rules ──────────────────────────────────────────────────────────────
 * Nothing in this file claims a fact about the business. No ratings, no
 * customer counts, no warranty/parts/vetting promises, no invented service
 * names. Titles and one-liners describe what the vertical *is*; every number
 * shown in the UI is measured from the live catalog (`categoryStats`) or comes
 * from the live promo API. Service names, prices and durations are only ever
 * the DB's own.
 */

import { groupKeyForService, getGroups } from '../lib/serviceCatalogGroups';
import { kw, isFeatured, fasterThan, cheaperThan } from '../lib/serviceFacets';

/* ── Themes ───────────────────────────────────────────────────────────────────
   Each vertical gets an accent drawn from the Zappy palette (primary blue is
   the hero; orange/green/violet are the sanctioned accents). Values are raw
   hex because they're injected as CSS custom properties on the page root —
   that keeps Tailwind's JIT happy (no dynamically-built class names) while
   still letting every component theme itself with `bg-[var(--cat-accent)]`.
─────────────────────────────────────────────────────────────────────────────*/
const THEMES = {
  blue:   { accent: '#2563EB', deep: '#1E3A8A', tint: '#EFF6FF', soft: '#DBEAFE', glow: 'rgba(37,99,235,0.20)' },
  teal:   { accent: '#0E9488', deep: '#134E4A', tint: '#F0FDFA', soft: '#CCFBF1', glow: 'rgba(14,148,136,0.20)' },
  violet: { accent: '#6D4DF6', deep: '#3B1E8F', tint: '#F5F3FF', soft: '#EDE9FE', glow: 'rgba(109,77,246,0.20)' },
  amber:  { accent: '#D97706', deep: '#7C2D12', tint: '#FFFBEB', soft: '#FEF3C7', glow: 'rgba(217,119,6,0.20)' },
  green:  { accent: '#16A34A', deep: '#14532D', tint: '#F0FDF4', soft: '#DCFCE7', glow: 'rgba(22,163,74,0.20)' },
  rose:   { accent: '#E11D48', deep: '#881337', tint: '#FFF1F2', soft: '#FFE4E6', glow: 'rgba(225,29,72,0.20)' },
  cyan:   { accent: '#0891B2', deep: '#164E63', tint: '#ECFEFF', soft: '#CFFAFE', glow: 'rgba(8,145,178,0.20)' },
  slate:  { accent: '#334155', deep: '#0F172A', tint: '#F8FAFC', soft: '#E2E8F0', glow: 'rgba(51,65,85,0.20)' },
};

/* ── Shared facets ────────────────────────────────────────────────────────────
   Data-derived and available to every vertical. They resolve against the live
   catalog, so a facet disappears when nothing matches it.
─────────────────────────────────────────────────────────────────────────────*/
const POPULAR = { key: 'popular', label: 'Popular', match: isFeatured };
const QUICK   = { key: 'quick',   label: 'Under 45 min', match: fasterThan(45) };
const BUDGET  = { key: 'budget',  label: 'Under ₹499',   match: cheaperThan(499) };

/* ── How a Zappy booking actually works ──────────────────────────────────────
   Each step maps to a screen that exists in this app: BookingPage → dispatch
   assignment → OrderTrackingPage + ChatPage → payment + the rate-order
   mutation. Shown on the detail page instead of marketing promises.
─────────────────────────────────────────────────────────────────────────────*/
export const HOW_IT_WORKS = [
  { title: 'Book it', body: 'Pick the service, your address and a time that suits you.' },
  { title: 'Get matched', body: 'A professional with the right skills accepts the job.' },
  { title: 'Track and chat', body: 'Follow them on the map and message them in the app.' },
  { title: 'Pay and rate', body: 'Pay in the app, keep the invoice, rate the job.' },
];

/* ── Platform FAQs ────────────────────────────────────────────────────────────
   Only statements about how this app behaves — all verifiable in the codebase.
   Service-specific answers (duration, price, inspection fee) are generated on
   the detail page from that service's own catalog row.
─────────────────────────────────────────────────────────────────────────────*/
export const PLATFORM_FAQS = [
  {
    q: 'Who comes to do the job?',
    a: 'A Zappy professional whose registered skills match this service. Their name, photo and rating show up in the app as soon as they accept your booking.',
  },
  {
    q: 'Can I follow the booking?',
    a: 'Yes. Once the job is assigned you can track the professional on the map and message them in the app until the job is marked complete.',
  },
  {
    q: 'How do I pay?',
    a: 'Payment happens in the app when the job is done — a saved payment method or your Zappy wallet. The invoice stays on the order.',
  },
  {
    q: 'Something went wrong. What now?',
    a: 'Open the order and raise a dispute, or contact support from the same screen. Your rating on the job feeds back into who gets matched to you next time.',
  },
];

/* ── Illustration keys ────────────────────────────────────────────────────────
   Resolved by `components/catalog/ServiceIllustration`. Rules run in order
   against the service's own text (code, name, subcategory, description), so a
   drawing is only ever picked for a service that genuinely exists.
─────────────────────────────────────────────────────────────────────────────*/

export const CAR_ILLUSTRATION_RULES = [
  [kw('ac gas', 'gas refill', 'refrigerant', 'r134'), 'ac-gas'],
  [kw('ac ', ' ac', 'air conditioning', 'cooling'),   'car-ac'],
  [kw('periodic', 'general service', 'full service', 'maintenance', 'scheduled'), 'periodic-service'],
  [kw('jump', 'jumpstart', 'jump start'),             'jumpstart'],
  [kw('battery'),                                     'battery'],
  [kw('alignment', 'align'),                          'wheel-align'],
  [kw('balanc'),                                      'wheel-balance'],
  [kw('tyre', 'tire', 'puncture', 'wheel', 'stepney'), 'tyre'],
  [kw('foam wash', 'pressure wash'),                  'foam-wash'],
  [kw('interior', 'vacuum', 'upholstery'),            'interior-clean'],
  [kw('ceramic', 'coating', 'polish', 'teflon'),      'ceramic'],
  [kw('detail'),                                      'detailing'],
  [kw('wash', 'clean'),                               'car-wash'],
  [kw('scratch', 'buff'),                             'scratch'],
  [kw('dent', 'denting'),                             'dent'],
  [kw('paint'),                                       'paint'],
  [kw('windshield', 'windscreen', 'glass'),           'windshield'],
  // Not bare 'light' — it matches "taillight", "lighting", and any prose that
  // happens to mention lights.
  [kw('headlight', 'head lamp', 'head light'),        'headlight'],
  [kw('brake'),                                       'brake'],
  [kw('suspension', 'shock', 'strut'),                'suspension'],
  [kw('oil change', 'engine oil', 'lubric'),          'oil'],
  [kw('engine', 'diagnostic', 'scan'),                'engine'],
  [kw('insurance', 'claim'),                          'insurance'],
  [kw('towing', 'tow'),                               'towing'],
  [kw('fuel', 'petrol', 'diesel'),                    'fuel'],
  [kw('roadside', 'breakdown', 'emergency'),          'roadside'],
  [kw('inspection', 'inspect', 'pre-purchase', 'pre purchase', 'checkup', 'health'), 'inspection'],
];

/** Phone-repair keyword → illustration (identity-first, order matters). */
export const MOBILE_ILLUSTRATION_RULES = [
  [kw('camera', 'lens'),                                          'phone-camera'],
  // Board BEFORE audio: "Micro-soldering" contains "mic", and the board terms
  // are more specific. 'mic ' (trailing space) avoids matching "micro".
  [kw('motherboard', 'mother board', 'logic board', ' ic ', 'micro-solder', 'microsolder', 'chip'), 'phone-board'],
  [kw('charging', 'charge', 'wireless charg', 'charging port'),   'phone-charging'],
  [kw('microphone', 'mic ', 'speaker', 'earpiece', 'loudspeaker', 'audio', 'sound'), 'phone-audio'],
  [kw('water', 'liquid'),                                         'phone-water'],
  [kw('screen', 'display', 'touch', 'digitizer', 'glass', 'panel', 'line'), 'phone-screen'],
  [kw('battery'),                                                 'battery'],
  // software / os / data / buttons / dead device → the plain handset
  [kw('phone', 'device', 'software', 'os', 'data', 'button', 'volume', 'turning', 'power'), 'phone'],
];

/** Laptop-repair keyword → illustration. */
export const LAPTOP_ILLUSTRATION_RULES = [
  [kw('screen', 'display', 'panel'),                             'laptop-screen'],
  [kw('ssd', 'ram', 'nvme', 'storage', 'upgrade', 'memory'),    'laptop-storage'],
  // 'motherboard'/'logic board' — NOT bare 'board' (that matches "keyboard").
  [kw('motherboard', 'mother board', 'logic board', 'chip'),    'phone-board'],
  [kw('battery', 'charging', 'magsafe', 'adapter', 'power', 'port'), 'battery'],
  // keyboard / thermal / fan / slow / virus / data → the laptop body
  [kw('laptop', 'keyboard', 'trackpad', 'thermal', 'fan', 'dust', 'clean', 'slow', 'virus', 'malware', 'data', 'software'), 'laptop'],
];

/** Appliance / smart-device keyword → illustration. */
export const APPLIANCE_ILLUSTRATION_RULES = [
  [kw('cctv', 'surveillance', 'camera'),                        'cctv'],
  [kw('tv', 'television'),                                      'tv'],
  [kw('router', 'wifi', 'network', 'internet'),                'router'],
  [kw('washing', 'laundry', 'dryer', 'fridge', 'refrigerator', 'freezer', 'geyser', 'water heater', 'purifier', 'microwave', 'oven', 'chimney', 'stove', 'dishwasher'), 'appliance'],
];

/** Event-crew keyword → illustration (codes are event_*, so match on specifics first). */
export const EVENT_ILLUSTRATION_RULES = [
  [kw('sound', 'light', 'dj', ' av', 'lighting'),               'event-av'],
  [kw('photo', 'video', 'camera'),                             'cctv'],
  [kw('security', 'usher', 'guard'),                           'helper'],
  [kw('clean'),                                                'cleaning'],
];

export const GENERIC_ILLUSTRATION_RULES = [
  [kw('screen', 'display', 'touch'),          'phone-screen'],
  [kw('battery', 'charging', 'charger'),      'battery'],
  [kw('laptop', 'macbook', 'notebook'),       'laptop'],
  [kw('phone', 'mobile'),                     'phone'],
  [kw('tv', 'television'),                    'tv'],
  [kw('router', 'wifi', 'network', 'internet'), 'router'],
  [kw('cctv', 'camera', 'surveillance'),      'cctv'],
  [kw('lock', 'door'),                        'lock'],
  [kw('automation', 'smart home'),            'smart-home'],
  [kw('bike', 'scooter', 'motorcycle'),       'bike'],
  [kw('pet', 'dog', 'grooming'),              'pet'],
  [kw('event', 'decor', 'wedding', 'birthday'), 'event'],
  [kw('sound', 'light', 'dj'),                'event-av'],
  [kw('tank', 'sump', 'sofa', 'cleaning', 'wash'), 'cleaning'],
  [kw('tap', 'pipe', 'leak', 'plumb', 'drain'), 'plumbing'],
  [kw('wiring', 'switch', 'electric', 'fan', 'mcb'), 'electrical'],
  [kw('carpent', 'wood', 'furniture', 'hinge'), 'carpentry'],
  [kw('washing machine', 'fridge', 'refrigerator', 'microwave', 'geyser', 'appliance'), 'appliance'],
  [kw('elder', 'companion', 'hospital', 'medicine', 'grocery'), 'helper'],
  [kw('inspection', 'diagnostic', 'check'),   'inspection'],
];

/* ── Category configuration ──────────────────────────────────────────────────
   `title`/`subtitle`/`banner` describe the vertical. They make no claim about
   parts, staff vetting, warranties or volumes — those would be assertions the
   app can't back up. Numbers come from `categoryStats()` at render time.
─────────────────────────────────────────────────────────────────────────────*/

const CONFIG = {
  car: {
    title: 'Car Services',
    subtitle: 'Professional doorstep car care',
    eyebrow: 'Zappy Auto Care',
    theme: THEMES.blue,
    illustration: 'periodic-service',
    illustrationRules: CAR_ILLUSTRATION_RULES,
    searchPlaceholder: 'What service are you looking for?',
    banner: {
      eyebrow: 'Doorstep, not the workshop',
      title: 'Car care that\ncomes to your address',
      body: 'Servicing, AC, batteries, tyres, cleaning and roadside help — booked and tracked in the app.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'periodic',   label: 'Periodic Service',  match: kw('periodic', 'general service', 'full service', 'maintenance') },
      { key: 'ac',         label: 'AC Service',        match: kw('ac gas', ' ac ', 'air conditioning', 'cooling') },
      { key: 'battery',    label: 'Battery',           match: kw('battery', 'jump') },
      { key: 'tyres',      label: 'Tyres & Wheels',    match: kw('tyre', 'tire', 'puncture', 'wheel', 'alignment', 'balanc') },
      { key: 'cleaning',   label: 'Cleaning',          match: kw('wash', 'clean', 'detail', 'polish', 'ceramic', 'vacuum') },
      { key: 'painting',   label: 'Denting & Painting', match: kw('dent', 'paint', 'scratch', 'buff') },
      { key: 'brakes',     label: 'Brakes',            match: kw('brake') },
      { key: 'engine',     label: 'Engine & Oil',      match: kw('engine', 'oil', 'diagnostic', 'clutch') },
      { key: 'suspension', label: 'Suspension',        match: kw('suspension', 'shock', 'strut', 'fitment') },
      { key: 'electrical', label: 'Electrical',        match: kw('electric', 'wiring', 'light', 'horn', 'alternator') },
      { key: 'glass',      label: 'Glass & Lights',    match: kw('windshield', 'windscreen', 'glass', 'headlight', 'mirror') },
      { key: 'roadside',   label: 'Roadside',          match: kw('roadside', 'breakdown', 'tow', 'fuel', 'emergency', 'puncture') },
      { key: 'inspection', label: 'Inspection',        match: kw('inspection', 'inspect', 'health', 'checkup', 'pre-purchase') },
      { key: 'insurance',  label: 'Insurance',         match: kw('insurance', 'claim') },
      QUICK,
    ],
  },

  bike: {
    title: 'Bike Services',
    subtitle: 'Doorstep care for bikes and scooters',
    eyebrow: 'Zappy Two-Wheeler',
    theme: THEMES.green,
    illustration: 'bike',
    illustrationRules: CAR_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'Parked at home?',
      title: 'Bike service\nwithout the garage run',
      body: 'Engine service, tyres, chain, brakes and washes — done where your bike is parked.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'service',  label: 'Periodic Service', match: kw('service', 'tuning', 'periodic') },
      { key: 'tyres',    label: 'Tyres',            match: kw('tyre', 'tire', 'puncture', 'wheel') },
      { key: 'chain',    label: 'Chain & Brakes',   match: kw('chain', 'brake') },
      { key: 'battery',  label: 'Battery',          match: kw('battery', 'jump') },
      { key: 'wash',     label: 'Wash & Polish',    match: kw('wash', 'polish', 'clean') },
      { key: 'roadside', label: 'Roadside',         match: kw('breakdown', 'roadside', 'fuel', 'tow') },
      QUICK, BUDGET,
    ],
  },

  mobile: {
    title: 'Phone Repair',
    subtitle: 'Doorstep repairs for your phone',
    eyebrow: 'Zappy Device Care',
    theme: THEMES.violet,
    illustration: 'phone',
    illustrationRules: MOBILE_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'No shop drop-off',
      title: 'Phone repairs\nat your address',
      body: 'Screens, batteries, charging ports, cameras, water damage and data recovery.',
      cta: 'Browse repairs',
    },
    facets: [
      POPULAR,
      { key: 'screen',   label: 'Screen',        match: kw('screen', 'display', 'touch', 'glass') },
      { key: 'battery',  label: 'Battery',       match: kw('battery') },
      { key: 'charging', label: 'Charging',      match: kw('charging', 'charger', 'port') },
      { key: 'camera',   label: 'Camera',        match: kw('camera') },
      { key: 'audio',    label: 'Speaker & Mic', match: kw('speaker', 'mic', 'audio', 'sound') },
      { key: 'water',    label: 'Water Damage',  match: kw('water', 'liquid') },
      { key: 'software', label: 'Software',      match: kw('software', 'os', 'update', 'virus') },
      { key: 'data',     label: 'Data Recovery', match: kw('data', 'recovery', 'backup') },
      QUICK,
    ],
  },

  laptop: {
    title: 'Laptop Repair',
    subtitle: 'Diagnostics, upgrades and repairs',
    eyebrow: 'Zappy Device Care',
    theme: THEMES.slate,
    illustration: 'laptop',
    illustrationRules: LAPTOP_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'Desk-side service',
      title: 'Laptop repairs\nwhere you work',
      body: 'Slow machines, screens, keyboards, batteries, boards, software and data recovery.',
      cta: 'Browse repairs',
    },
    facets: [
      POPULAR,
      { key: 'performance', label: 'Slow & Hanging', match: kw('slow', 'hang', 'performance') },
      { key: 'upgrade',     label: 'SSD & RAM',      match: kw('ssd', 'ram', 'upgrade', 'storage') },
      { key: 'screen',      label: 'Screen',         match: kw('screen', 'display', 'panel', 'hinge') },
      { key: 'keyboard',    label: 'Keyboard',       match: kw('keyboard', 'trackpad', 'key') },
      { key: 'battery',     label: 'Battery & Power', match: kw('battery', 'charging', 'adapter', 'power') },
      { key: 'board',       label: 'Motherboard',    match: kw('motherboard', 'board', 'chip') },
      { key: 'software',    label: 'Software',       match: kw('software', 'virus', 'os', 'windows') },
      { key: 'data',        label: 'Data Recovery',  match: kw('data', 'recovery') },
    ],
  },

  smart: {
    title: 'Smart Home & Devices',
    subtitle: 'Setup and troubleshooting at home',
    eyebrow: 'Zappy Smart Home',
    theme: THEMES.cyan,
    illustration: 'smart-home',
    illustrationRules: APPLIANCE_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'Out of the box to online',
      title: 'Smart devices,\nset up at home',
      body: 'Routers, networks and home automation — installed, configured and demonstrated.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'tv',       label: 'TV',           match: kw('tv', 'television') },
      { key: 'network',  label: 'WiFi & Network', match: kw('router', 'wifi', 'network', 'internet') },
      { key: 'security', label: 'Cameras',      match: kw('cctv', 'camera', 'surveillance') },
      { key: 'locks',    label: 'Smart Locks',  match: kw('lock') },
      { key: 'auto',     label: 'Automation',   match: kw('automation', 'smart') },
      QUICK,
    ],
  },

  appliance: {
    title: 'Appliance Repair',
    subtitle: 'Home appliances, repaired on site',
    eyebrow: 'Zappy Home Care',
    theme: THEMES.amber,
    illustration: 'appliance',
    illustrationRules: APPLIANCE_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'No hauling it to a shop',
      title: 'Appliance repair\nat home',
      body: 'Washing machines, fridges, microwaves, geysers and more — diagnosed and repaired on site.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'laundry',  label: 'Washing Machine', match: kw('washing', 'laundry', 'dryer') },
      { key: 'cooling',  label: 'Fridge & AC',     match: kw('fridge', 'refrigerator', 'ac', 'cooling') },
      { key: 'kitchen',  label: 'Kitchen',         match: kw('microwave', 'oven', 'chimney', 'stove', 'dishwasher') },
      { key: 'water',    label: 'Geyser & Purifier', match: kw('geyser', 'water heater', 'purifier', 'ro ') },
      QUICK,
    ],
  },

  electrical: {
    title: 'Electrician',
    subtitle: 'Wiring, switches, fans and fittings',
    eyebrow: 'Zappy Home Care',
    theme: THEMES.amber,
    illustration: 'electrical',
    banner: {
      eyebrow: 'Tripping, sparking, flickering?',
      title: 'An electrician,\nbooked in the app',
      body: 'Switchboards, wiring, fans, lights and inverters.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'wiring',   label: 'Wiring',        match: kw('wiring', 'cable', 'circuit') },
      { key: 'switch',   label: 'Switches & MCB', match: kw('switch', 'socket', 'mcb', 'board') },
      { key: 'fans',     label: 'Fans & Lights', match: kw('fan', 'light', 'chandelier', 'lamp') },
      { key: 'inverter', label: 'Inverter',      match: kw('inverter', 'ups', 'stabilizer') },
      QUICK, BUDGET,
    ],
  },

  plumbing: {
    title: 'Plumbing',
    subtitle: 'Leaks, blockages and fittings',
    eyebrow: 'Zappy Home Care',
    theme: THEMES.cyan,
    illustration: 'plumbing',
    banner: {
      eyebrow: 'Water where it shouldn’t be?',
      title: 'A plumber,\nat your door',
      body: 'Taps, drains, bathroom fittings, tanks and motors.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'leaks',    label: 'Leaks',      match: kw('leak', 'drip', 'seep') },
      { key: 'blockage', label: 'Blockages',  match: kw('block', 'drain', 'clog', 'choke') },
      { key: 'taps',     label: 'Taps & Mixers', match: kw('tap', 'mixer', 'faucet', 'shower') },
      { key: 'toilet',   label: 'Bathroom',   match: kw('toilet', 'commode', 'flush', 'bathroom', 'washbasin') },
      { key: 'tanks',    label: 'Tanks & Motors', match: kw('tank', 'sump', 'motor', 'pump') },
      QUICK, BUDGET,
    ],
  },

  carpentry: {
    title: 'Carpentry & Locks',
    subtitle: 'Doors, furniture and fittings',
    eyebrow: 'Zappy Home Care',
    theme: THEMES.amber,
    illustration: 'carpentry',
    banner: {
      eyebrow: 'Sticking, sagging, jammed',
      title: 'Carpentry and\nlock work',
      body: 'Door alignment, lock fitting, furniture repair and hardware replacement.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'doors',     label: 'Doors & Locks', match: kw('door', 'lock', 'latch', 'hinge') },
      { key: 'furniture', label: 'Furniture',     match: kw('furniture', 'bed', 'sofa', 'table', 'chair', 'wardrobe') },
      { key: 'fittings',  label: 'Fittings',      match: kw('shelf', 'rack', 'curtain', 'mount', 'drawer') },
      QUICK,
    ],
  },

  cleaning: {
    title: 'Cleaning & Tank Care',
    subtitle: 'Deep cleaning for homes and tanks',
    eyebrow: 'Zappy Home Care',
    theme: THEMES.teal,
    illustration: 'cleaning',
    banner: {
      eyebrow: 'Beyond a surface wipe',
      title: 'Deep cleaning,\nbooked in minutes',
      body: 'Homes, kitchens, bathrooms, sofas and water tanks.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'home',     label: 'Full Home',    match: kw('home', 'apartment', 'flat', 'full') },
      { key: 'kitchen',  label: 'Kitchen',      match: kw('kitchen', 'chimney') },
      { key: 'bathroom', label: 'Bathroom',     match: kw('bathroom', 'toilet') },
      { key: 'sofa',     label: 'Sofa & Carpet', match: kw('sofa', 'carpet', 'mattress', 'upholstery') },
      { key: 'tank',     label: 'Water Tanks',  match: kw('tank', 'sump', 'sintex', 'overhead') },
      { key: 'pest',     label: 'Pest Control', match: kw('pest', 'termite', 'cockroach') },
    ],
  },

  family: {
    title: 'Family & Elder Assist',
    subtitle: 'A helper for errands and visits',
    eyebrow: 'Zappy Care',
    theme: THEMES.rose,
    illustration: 'helper',
    banner: {
      eyebrow: 'When you can’t be there',
      title: 'A helper for\nthe things that matter',
      body: 'Hospital visits, medicine and grocery runs, paperwork and home check-ins.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'medical',  label: 'Hospital & Medicine', match: kw('hospital', 'medicine', 'doctor', 'pharmacy') },
      { key: 'errands',  label: 'Errands',   match: kw('grocery', 'bill', 'document', 'submission', 'pickup') },
      { key: 'company',  label: 'Companion', match: kw('companion', 'visit', 'check') },
      { key: 'transport', label: 'Transport', match: kw('transport', 'drop', 'travel') },
    ],
  },

  event: {
    title: 'Event Crew',
    subtitle: 'Setup, staff and clean-up',
    eyebrow: 'Zappy Events',
    theme: THEMES.violet,
    illustration: 'event',
    illustrationRules: EVENT_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'Hosting soon?',
      title: 'Crew for\nyour event',
      body: 'Decor, sound, lighting, security, catering help and the clean-up afterwards.',
      cta: 'Browse crew',
    },
    facets: [
      POPULAR,
      { key: 'decor',    label: 'Decor',      match: kw('decor', 'balloon', 'flower', 'stage', 'birthday', 'wedding') },
      { key: 'av',       label: 'Sound & Light', match: kw('sound', 'light', 'dj', 'av') },
      { key: 'staff',    label: 'Staff',      match: kw('helper', 'crew', 'waiter', 'catering', 'security', 'setup') },
      { key: 'cleanup',  label: 'Clean-up',   match: kw('cleaning', 'clean') },
      { key: 'capture',  label: 'Photography', match: kw('photo', 'video', 'camera') },
    ],
  },

  pet: {
    title: 'Pet Care',
    subtitle: 'Grooming, walks and vet runs',
    eyebrow: 'Zappy Pet Care',
    theme: THEMES.amber,
    illustration: 'pet',
    banner: {
      eyebrow: 'At home, not the salon',
      title: 'Pet care\nat your place',
      body: 'Grooming, walking, sitting, vet visits and training help.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'grooming',  label: 'Grooming',  match: kw('groom', 'bath', 'trim', 'nail') },
      { key: 'walking',   label: 'Walking',   match: kw('walk', 'exercise') },
      { key: 'sitting',   label: 'Sitting',   match: kw('sit', 'boarding', 'day care') },
      { key: 'vet',       label: 'Vet Visits', match: kw('vet', 'doctor', 'vaccination') },
      { key: 'training',  label: 'Training',  match: kw('training', 'train') },
    ],
  },

  commercial: {
    title: 'Commercial & Fleet',
    subtitle: 'Support for business vehicles',
    eyebrow: 'Zappy for Business',
    theme: THEMES.slate,
    illustration: 'fleet',
    illustrationRules: CAR_ILLUSTRATION_RULES,
    banner: {
      eyebrow: 'Vehicles off the road cost money',
      title: 'Fleet support,\nbooked per job',
      body: 'Scheduled maintenance and emergency callouts for commercial vehicles.',
      cta: 'Browse services',
    },
    facets: [
      POPULAR,
      { key: 'emergency',  label: 'Emergency',  match: kw('emergency', 'breakdown', 'roadside') },
      { key: 'scheduled',  label: 'Scheduled',  match: kw('scheduled', 'maintenance', 'periodic') },
      { key: 'repair',     label: 'Repair',     match: kw('repair') },
    ],
  },

  other_services: {
    title: 'More Services',
    subtitle: 'Everything else in the catalog',
    eyebrow: 'Zappy Catalog',
    theme: THEMES.slate,
    illustration: 'tools',
    facets: [POPULAR, QUICK, BUDGET],
  },
};

/* ── Public API ───────────────────────────────────────────────────────────── */

/** The "All Services" view — the whole catalog in one grid. */
export const ALL_CATEGORY = {
  key: 'all',
  title: 'All Services',
  subtitle: 'Every Zappy service, one place',
  eyebrow: 'Zappy Catalog',
  theme: THEMES.blue,
  illustration: 'tools',
  searchPlaceholder: 'What service are you looking for?',
  cardStyle: 'mosaic',
  match: () => true,
  banner: {
    eyebrow: 'One app, every job',
    title: 'Book a professional\nfrom the catalog',
    body: 'Cars, bikes, phones, laptops, homes, events and pets — the same booking and tracking for all of them.',
    cta: 'Explore categories',
  },
  facets: [POPULAR, QUICK, BUDGET],
};

/**
 * Every configurable vertical, in display order.
 *
 * `match` is derived from `groupKeyForService` rather than the group's own
 * predicate: the raw predicates overlap (event services are stored with
 * `category: 'other'`, which is also the Smart Home predicate), and only the
 * first-match-wins resolution produces the exclusive partition the worker
 * portal already uses. A group with no entry in CONFIG still gets a working
 * page from the defaults — it just isn't individually art-directed yet.
 */
/**
 * Build a display config for one group. Built-in verticals use their rich CONFIG
 * (facets, art direction); an admin-created category falls back to its DB theme +
 * label + generic facets/illustration — a working, on-brand page with no code.
 */
function buildCategoryConfig(group) {
  const conf = CONFIG[group.key] || {};
  return {
    key: group.key,
    match: (service) => groupKeyForService(service) === group.key,
    title: conf.title || group.label,
    subtitle: conf.subtitle || 'Booked in the app, done at your address',
    eyebrow: conf.eyebrow || 'Zappy Catalog',
    theme: conf.theme || group.theme || THEMES.blue,
    illustration: conf.illustration || 'tools',
    illustrationRules: conf.illustrationRules || GENERIC_ILLUSTRATION_RULES,
    searchPlaceholder: conf.searchPlaceholder || 'What service are you looking for?',
    cardStyle: conf.cardStyle || 'mosaic',
    banner: conf.banner || null,
    facets: conf.facets || [POPULAR, QUICK, BUDGET],
    showInCustomer: group.showInCustomer !== false,
  };
}

/**
 * Every configurable vertical, in display order — built LIVE from the runtime
 * category store so admin-managed categories are included. A group with no CONFIG
 * entry still gets a working page from the defaults; it just isn't art-directed yet.
 */
export function buildCatalogCategories() {
  return [
    ...getGroups(),
    { key: 'other_services', label: 'Other Services' },
  ].map(buildCategoryConfig);
}

/**
 * Legacy / cross-surface keys that must keep resolving.
 * `categoryMap.catalogKey` uses `smart_device`; ServicesPage's old query param
 * used `helper` and `vehicle`; home tiles use plural ids.
 */
const ALIASES = {
  smart_device: 'smart',
  smart_devices: 'smart',
  helper: 'family',
  elder: 'family',
  vehicle: 'commercial',
  cars: 'car',
  car_service: 'car',
  'car-services': 'car',
  bikes: 'bike',
  phones: 'mobile',
  phone: 'mobile',
  laptops: 'laptop',
  home: 'smart',
  pets: 'pet',
  events: 'event',
  appliances: 'appliance',
  electrician: 'electrical',
  plumber: 'plumbing',
};

/** Normalise any incoming key (route param, query string, home tile) to a config key. */
export function normalizeCategoryKey(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  if (key === 'all') return 'all';
  const cats = buildCatalogCategories();
  if (cats.some((c) => c.key === key)) return key;
  const aliased = ALIASES[key];
  return aliased && cats.some((c) => c.key === aliased) ? aliased : null;
}

/** Config for a category key, or the All-Services config. Never returns null. */
export function getCategoryConfig(raw) {
  const key = normalizeCategoryKey(raw);
  if (!key || key === 'all') return ALL_CATEGORY;
  return buildCatalogCategories().find((c) => c.key === key) || ALL_CATEGORY;
}

/** The one category a service belongs to — same answer the worker portal gives. */
export function getCategoryForService(service) {
  if (!service) return ALL_CATEGORY;
  const key = groupKeyForService(service);
  return buildCatalogCategories().find((c) => c.key === key) || ALL_CATEGORY;
}

/**
 * Catalog category → the `category` value used by the Brand collection.
 *
 * Only these verticals have a brand/model catalog behind them; everything else
 * returns null and the brand picker doesn't render. Commercial vehicles reuse
 * the car brand list, which is what the seeded data has.
 */
const BRAND_CATEGORIES = {
  mobile: 'mobile',
  laptop: 'laptop',
  car: 'car',
  bike: 'bike',
  commercial: 'car',
};

/** What to call the thing being branded, for the picker's question. */
const BRAND_NOUNS = {
  mobile: 'phone',
  laptop: 'laptop',
  car: 'car',
  bike: 'bike or scooter',
  commercial: 'vehicle',
};

export function brandCategoryFor(categoryKey) {
  return BRAND_CATEGORIES[categoryKey] || null;
}

export function brandNounFor(categoryKey) {
  return BRAND_NOUNS[categoryKey] || 'device';
}

/** CSS custom properties that theme an entire catalog surface. */
export function themeVars(theme = ALL_CATEGORY.theme) {
  return {
    '--cat-accent': theme.accent,
    '--cat-deep': theme.deep,
    '--cat-tint': theme.tint,
    '--cat-soft': theme.soft,
    '--cat-glow': theme.glow,
    // Alpha-blended accent for hover borders — a CSS var can't take Tailwind's
    // `/35` opacity modifier, so the tinted variant is its own token.
    '--cat-border': theme.glow,
    '--ill-ink': theme.deep,
    '--ill-body': theme.accent,
    '--ill-tint': theme.soft,
    '--ill-pale': theme.tint,
  };
}
