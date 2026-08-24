/**
 * Category page identity — the copy and filters the catalog page is built from.
 * ----------------------------------------------------------------------------
 * A mirror of the per-category config in
 * `client/src/constants/catalogCategories.js`, generated from that file so the
 * two cannot drift by transcription.
 *
 * ── WHY THIS IS NOT FETCHED ────────────────────────────────────────────────
 * `GET /catalog/categories` returns `key`, `customerLabel`, `icon`, `theme` and
 * `brands` — verified against the live response. It has no eyebrow, no subtitle
 * and no facet definitions; those are product copy and filter rules that live
 * in the web client's own constants. Mirroring them is what makes the mobile
 * category page read as the same page. The SERVICES are still entirely from the
 * API — this file only decides how they are labelled and grouped.
 *
 * A key with no entry here falls back to the server's `customerLabel` and the
 * three generic facets, so a category added server-side still renders.
 * ----------------------------------------------------------------------------
 */

import {
  cheaperThan,
  fasterThan,
  isFeatured,
  kw,
  type FacetDef,
} from '../components/catalog/facets';

export interface CategoryPageConfig {
  title: string;
  subtitle: string;
  eyebrow: string;
  facets: FacetDef[];
}

/** Generic facets, shared by every vertical on the website. */
const POPULAR: FacetDef = { key: 'popular', label: 'Popular', match: isFeatured };
const QUICK: FacetDef = { key: 'quick', label: 'Under 45 min', match: fasterThan(45) };
const BUDGET: FacetDef = { key: 'budget', label: 'Under \u20B9499', match: cheaperThan(499) };

/** Fallback for a category with no entry below. */
export const DEFAULT_FACETS: FacetDef[] = [POPULAR, QUICK, BUDGET];

export const CATEGORY_PAGE_CONFIG: Record<string, CategoryPageConfig> = {
  car: {
    title: 'Car Services',
    subtitle: 'Professional doorstep car care',
    eyebrow: 'Zappy Auto Care',
    facets: [
      POPULAR,
      { key: 'periodic', label: 'Periodic Service', match: kw('periodic', 'general service', 'full service', 'maintenance') },
      { key: 'ac', label: 'AC Service', match: kw('ac gas', ' ac ', 'air conditioning', 'cooling') },
      { key: 'battery', label: 'Battery', match: kw('battery', 'jump') },
      { key: 'tyres', label: 'Tyres & Wheels', match: kw('tyre', 'tire', 'puncture', 'wheel', 'alignment', 'balanc') },
      { key: 'cleaning', label: 'Cleaning', match: kw('wash', 'clean', 'detail', 'polish', 'ceramic', 'vacuum') },
      { key: 'painting', label: 'Denting & Painting', match: kw('dent', 'paint', 'scratch', 'buff') },
      { key: 'brakes', label: 'Brakes', match: kw('brake') },
      { key: 'engine', label: 'Engine & Oil', match: kw('engine', 'oil', 'diagnostic', 'clutch') },
      { key: 'suspension', label: 'Suspension', match: kw('suspension', 'shock', 'strut', 'fitment') },
      { key: 'electrical', label: 'Electrical', match: kw('electric', 'wiring', 'light', 'horn', 'alternator') },
      { key: 'glass', label: 'Glass & Lights', match: kw('windshield', 'windscreen', 'glass', 'headlight', 'mirror') },
      { key: 'roadside', label: 'Roadside', match: kw('roadside', 'breakdown', 'tow', 'fuel', 'emergency', 'puncture') },
      { key: 'inspection', label: 'Inspection', match: kw('inspection', 'inspect', 'health', 'checkup', 'pre-purchase') },
      { key: 'insurance', label: 'Insurance', match: kw('insurance', 'claim') },
      QUICK,
    ],
  },
  bike: {
    title: 'Bike Services',
    subtitle: 'Doorstep care for bikes and scooters',
    eyebrow: 'Zappy Two-Wheeler',
    facets: [
      POPULAR,
      { key: 'service', label: 'Periodic Service', match: kw('service', 'tuning', 'periodic') },
      { key: 'tyres', label: 'Tyres', match: kw('tyre', 'tire', 'puncture', 'wheel') },
      { key: 'chain', label: 'Chain & Brakes', match: kw('chain', 'brake') },
      { key: 'battery', label: 'Battery', match: kw('battery', 'jump') },
      { key: 'wash', label: 'Wash & Polish', match: kw('wash', 'polish', 'clean') },
      { key: 'roadside', label: 'Roadside', match: kw('breakdown', 'roadside', 'fuel', 'tow') },
      QUICK,
      BUDGET,
    ],
  },
  mobile: {
    title: 'Phone Repair',
    subtitle: 'Doorstep repairs for your phone',
    eyebrow: 'Zappy Device Care',
    facets: [
      POPULAR,
      { key: 'screen', label: 'Screen', match: kw('screen', 'display', 'touch', 'glass') },
      { key: 'battery', label: 'Battery', match: kw('battery') },
      { key: 'charging', label: 'Charging', match: kw('charging', 'charger', 'port') },
      { key: 'camera', label: 'Camera', match: kw('camera') },
      { key: 'audio', label: 'Speaker & Mic', match: kw('speaker', 'mic', 'audio', 'sound') },
      { key: 'water', label: 'Water Damage', match: kw('water', 'liquid') },
      { key: 'software', label: 'Software', match: kw('software', 'os', 'update', 'virus') },
      { key: 'data', label: 'Data Recovery', match: kw('data', 'recovery', 'backup') },
      QUICK,
    ],
  },
  laptop: {
    title: 'Laptop Repair',
    subtitle: 'Diagnostics, upgrades and repairs',
    eyebrow: 'Zappy Device Care',
    facets: [
      POPULAR,
      { key: 'performance', label: 'Slow & Hanging', match: kw('slow', 'hang', 'performance') },
      { key: 'upgrade', label: 'SSD & RAM', match: kw('ssd', 'ram', 'upgrade', 'storage') },
      { key: 'screen', label: 'Screen', match: kw('screen', 'display', 'panel', 'hinge') },
      { key: 'keyboard', label: 'Keyboard', match: kw('keyboard', 'trackpad', 'key') },
      { key: 'battery', label: 'Battery & Power', match: kw('battery', 'charging', 'adapter', 'power') },
      { key: 'board', label: 'Motherboard', match: kw('motherboard', 'board', 'chip') },
      { key: 'software', label: 'Software', match: kw('software', 'virus', 'os', 'windows') },
      { key: 'data', label: 'Data Recovery', match: kw('data', 'recovery') },
    ],
  },
  smart: {
    title: 'Smart Home & Devices',
    subtitle: 'Setup and troubleshooting at home',
    eyebrow: 'Zappy Smart Home',
    facets: [
      POPULAR,
      { key: 'tv', label: 'TV', match: kw('tv', 'television') },
      { key: 'network', label: 'WiFi & Network', match: kw('router', 'wifi', 'network', 'internet') },
      { key: 'security', label: 'Cameras', match: kw('cctv', 'camera', 'surveillance') },
      { key: 'locks', label: 'Smart Locks', match: kw('lock') },
      { key: 'auto', label: 'Automation', match: kw('automation', 'smart') },
      QUICK,
    ],
  },
  appliance: {
    title: 'Appliance Repair',
    subtitle: 'Home appliances, repaired on site',
    eyebrow: 'Zappy Home Care',
    facets: [
      POPULAR,
      { key: 'laundry', label: 'Washing Machine', match: kw('washing', 'laundry', 'dryer') },
      { key: 'cooling', label: 'Fridge & AC', match: kw('fridge', 'refrigerator', 'ac', 'cooling') },
      { key: 'kitchen', label: 'Kitchen', match: kw('microwave', 'oven', 'chimney', 'stove', 'dishwasher') },
      { key: 'water', label: 'Geyser & Purifier', match: kw('geyser', 'water heater', 'purifier', 'ro ') },
      QUICK,
    ],
  },
  electrical: {
    title: 'Electrician',
    subtitle: 'Wiring, switches, fans and fittings',
    eyebrow: 'Zappy Home Care',
    facets: [
      POPULAR,
      { key: 'wiring', label: 'Wiring', match: kw('wiring', 'cable', 'circuit') },
      { key: 'switch', label: 'Switches & MCB', match: kw('switch', 'socket', 'mcb', 'board') },
      { key: 'fans', label: 'Fans & Lights', match: kw('fan', 'light', 'chandelier', 'lamp') },
      { key: 'inverter', label: 'Inverter', match: kw('inverter', 'ups', 'stabilizer') },
      QUICK,
      BUDGET,
    ],
  },
  plumbing: {
    title: 'Plumbing',
    subtitle: 'Leaks, blockages and fittings',
    eyebrow: 'Zappy Home Care',
    facets: [
      POPULAR,
      { key: 'leaks', label: 'Leaks', match: kw('leak', 'drip', 'seep') },
      { key: 'blockage', label: 'Blockages', match: kw('block', 'drain', 'clog', 'choke') },
      { key: 'taps', label: 'Taps & Mixers', match: kw('tap', 'mixer', 'faucet', 'shower') },
      { key: 'toilet', label: 'Bathroom', match: kw('toilet', 'commode', 'flush', 'bathroom', 'washbasin') },
      { key: 'tanks', label: 'Tanks & Motors', match: kw('tank', 'sump', 'motor', 'pump') },
      QUICK,
      BUDGET,
    ],
  },
  carpentry: {
    title: 'Carpentry & Locks',
    subtitle: 'Doors, furniture and fittings',
    eyebrow: 'Zappy Home Care',
    facets: [
      POPULAR,
      { key: 'doors', label: 'Doors & Locks', match: kw('door', 'lock', 'latch', 'hinge') },
      { key: 'furniture', label: 'Furniture', match: kw('furniture', 'bed', 'sofa', 'table', 'chair', 'wardrobe') },
      { key: 'fittings', label: 'Fittings', match: kw('shelf', 'rack', 'curtain', 'mount', 'drawer') },
      QUICK,
    ],
  },
  cleaning: {
    title: 'Cleaning & Tank Care',
    subtitle: 'Deep cleaning for homes and tanks',
    eyebrow: 'Zappy Home Care',
    facets: [
      POPULAR,
      { key: 'home', label: 'Full Home', match: kw('home', 'apartment', 'flat', 'full') },
      { key: 'kitchen', label: 'Kitchen', match: kw('kitchen', 'chimney') },
      { key: 'bathroom', label: 'Bathroom', match: kw('bathroom', 'toilet') },
      { key: 'sofa', label: 'Sofa & Carpet', match: kw('sofa', 'carpet', 'mattress', 'upholstery') },
      { key: 'tank', label: 'Water Tanks', match: kw('tank', 'sump', 'sintex', 'overhead') },
      { key: 'pest', label: 'Pest Control', match: kw('pest', 'termite', 'cockroach') },
    ],
  },
  family: {
    title: 'Family & Elder Assist',
    subtitle: 'A helper for errands and visits',
    eyebrow: 'Zappy Care',
    facets: [
      POPULAR,
      { key: 'medical', label: 'Hospital & Medicine', match: kw('hospital', 'medicine', 'doctor', 'pharmacy') },
      { key: 'errands', label: 'Errands', match: kw('grocery', 'bill', 'document', 'submission', 'pickup') },
      { key: 'company', label: 'Companion', match: kw('companion', 'visit', 'check') },
      { key: 'transport', label: 'Transport', match: kw('transport', 'drop', 'travel') },
    ],
  },
  event: {
    title: 'Event Crew',
    subtitle: 'Setup, staff and clean-up',
    eyebrow: 'Zappy Events',
    facets: [
      POPULAR,
      { key: 'decor', label: 'Decor', match: kw('decor', 'balloon', 'flower', 'stage', 'birthday', 'wedding') },
      { key: 'av', label: 'Sound & Light', match: kw('sound', 'light', 'dj', 'av') },
      { key: 'staff', label: 'Staff', match: kw('helper', 'crew', 'waiter', 'catering', 'security', 'setup') },
      { key: 'cleanup', label: 'Clean-up', match: kw('cleaning', 'clean') },
      { key: 'capture', label: 'Photography', match: kw('photo', 'video', 'camera') },
    ],
  },
  pet: {
    title: 'Pet Care',
    subtitle: 'Grooming, walks and vet runs',
    eyebrow: 'Zappy Pet Care',
    facets: [
      POPULAR,
      { key: 'grooming', label: 'Grooming', match: kw('groom', 'bath', 'trim', 'nail') },
      { key: 'walking', label: 'Walking', match: kw('walk', 'exercise') },
      { key: 'sitting', label: 'Sitting', match: kw('sit', 'boarding', 'day care') },
      { key: 'vet', label: 'Vet Visits', match: kw('vet', 'doctor', 'vaccination') },
      { key: 'training', label: 'Training', match: kw('training', 'train') },
    ],
  },
  commercial: {
    title: 'Commercial & Fleet',
    subtitle: 'Support for business vehicles',
    eyebrow: 'Zappy for Business',
    facets: [
      POPULAR,
      { key: 'emergency', label: 'Emergency', match: kw('emergency', 'breakdown', 'roadside') },
      { key: 'scheduled', label: 'Scheduled', match: kw('scheduled', 'maintenance', 'periodic') },
      { key: 'repair', label: 'Repair', match: kw('repair') },
    ],
  },
  other_services: {
    title: 'More Services',
    subtitle: 'Everything else in the catalog',
    eyebrow: 'Zappy Catalog',
    facets: [
    ],
  },
};

export function categoryPageConfig(key?: string | null): CategoryPageConfig | null {
  if (!key) return null;
  return CATEGORY_PAGE_CONFIG[key] ?? null;
}
