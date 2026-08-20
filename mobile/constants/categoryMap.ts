/**
 * The 3D helper characters — mobile mirror of `client/src/constants/categoryMap.js`.
 * ----------------------------------------------------------------------------
 * The website calls that file "the single source of truth for the 3D Helper
 * character assets", and this is the same eight entries in the same order, with
 * the same labels, prices and tints. Keeping the order and copy identical is the
 * point: a customer who used the site and then installs the app should see the
 * same grid.
 *
 * ── WHY THE STILLS AND NOT THE .mp4s ───────────────────────────────────────
 * The web grid renders a looping <video> per tile with `thumb` as its poster.
 * Eight simultaneous videos is a bad trade on a phone — it needs a native
 * player dependency this project deliberately does not carry, and it costs
 * battery and memory for decoration. `characters/thumb/*.png` exists precisely
 * as the still frame of each clip, so the tiles use those and get the same
 * artwork. The gentle float below supplies the life the video was providing.
 *
 * ── ROUTE KEYS ─────────────────────────────────────────────────────────────
 * The web `catalogKey`s map 1:1 onto the keys `GET /catalog/categories`
 * returns, with one exception: `smart_device` is `smart` on this route. `more`
 * has no key and opens the unfiltered catalog, exactly as it does on the web.
 * ----------------------------------------------------------------------------
 */

import type { ImageSourcePropType } from 'react-native';

export interface CharacterCategory {
  id: string;
  label: string;
  /** Copy under the label. "View all" for `more`, a "From ₹x" price otherwise. */
  price: string;
  /** Background wash behind the character. Straight from the web map. */
  tint: string;
  thumb: ImageSourcePropType;
  /** Key for `/category/[key]`; null opens the full catalog. */
  routeKey: string | null;
}

export const CHARACTER_CATEGORIES: CharacterCategory[] = [
  {
    id: 'phones',
    label: 'Phones',
    price: '₹99',
    tint: 'rgba(37, 99, 235, 0.1)',
    thumb: require('../assets/characters/phones.png'),
    routeKey: 'mobile',
  },
  {
    id: 'laptops',
    label: 'Laptops',
    price: '₹149',
    tint: 'rgba(109, 77, 246, 0.1)',
    thumb: require('../assets/characters/laptops.png'),
    routeKey: 'laptop',
  },
  {
    id: 'cars',
    label: 'Car Service',
    price: '₹199',
    tint: 'rgba(14, 165, 160, 0.1)',
    thumb: require('../assets/characters/cars.png'),
    routeKey: 'car',
  },
  {
    // The web map deliberately reuses the car artwork here — there is no
    // separate bike character in the asset set.
    id: 'bikes',
    label: 'Bike Repair',
    price: '₹149',
    tint: 'rgba(5, 150, 105, 0.1)',
    thumb: require('../assets/characters/cars.png'),
    routeKey: 'bike',
  },
  {
    id: 'pets',
    label: 'Pets',
    price: '₹149',
    tint: 'rgba(245, 158, 11, 0.1)',
    thumb: require('../assets/characters/pets.png'),
    routeKey: 'pet',
  },
  {
    id: 'events',
    label: 'Events',
    price: '₹499',
    tint: 'rgba(192, 38, 211, 0.1)',
    thumb: require('../assets/characters/events.png'),
    routeKey: 'event',
  },
  {
    id: 'home',
    label: 'Home',
    price: '₹99',
    tint: 'rgba(8, 145, 178, 0.1)',
    thumb: require('../assets/characters/home.png'),
    routeKey: 'smart',
  },
  {
    id: 'more',
    label: 'More',
    price: 'View all',
    // The web uses a lighter blue wash behind the More tile than its own tint.
    tint: 'rgba(37, 99, 235, 0.08)',
    thumb: require('../assets/characters/more.png'),
    routeKey: null,
  },
];
