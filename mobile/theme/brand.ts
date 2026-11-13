/**
 * ZappyOne brand tokens — the SAME values as the web design system
 * (`shared/tailwind.preset.js`), so the redesigned Home looks like one product
 * on the website and in the app.
 * ----------------------------------------------------------------------------
 * The rest of this app still paints with `colors.primary` (indigo, see
 * colors.ts). Swapping that globally would restyle every screen at once, which
 * is out of scope for the Home redesign — so the redesigned surfaces (Home and
 * the tab bar) read from here, and other screens can move over one at a time.
 * ----------------------------------------------------------------------------
 */

/** The logo's own blue. 600 is the brand. */
export const brand = {
  50: '#EEF3FD',
  100: '#DCE6FB',
  200: '#B9CCF7',
  300: '#8EAAF0',
  400: '#5B82E6',
  500: '#3463DD',
  600: '#1F4FD8',
  700: '#1A41B4',
  800: '#173891',
  900: '#142F73',
} as const;

/** Neutrals: ink for text, canvas → surface → sunken, hairlines. */
export const ink = {
  900: '#101828',
  700: '#344054',
  500: '#5B6474',
  400: '#8A92A0',
  300: '#B4BAC4',
} as const;

export const surface = {
  page: '#F7F8FB',
  card: '#FFFFFF',
  sunken: '#EEF0F3',
  line: '#E3E6EB',
  lineStrong: '#D2D7DE',
} as const;

/** Soft tints per service area — the web's DOMAIN_TINT (ServiceGrid.jsx). */
export const domainTint: Record<string, { bg: string; fg: string }> = {
  electronics: { bg: '#F5F3FF', fg: '#7C3AED' },
  vehicles: { bg: '#F0F9FF', fg: '#0284C7' },
  home_services: { bg: '#ECFEFF', fg: '#0891B2' },
  pet_services: { bg: '#FFF7ED', fg: '#F97316' },
  helping_services: { bg: '#ECFDF5', fg: '#059669' },
  family_assist: { bg: '#FFF1F2', fg: '#F43F5E' },
  events: { bg: '#FDF2F8', fg: '#EC4899' },
};
export const defaultTint = { bg: brand[50], fg: brand[600] };
export const tintFor = (domainCode?: string) => (domainCode && domainTint[domainCode]) || defaultTint;

/** Web radii: 6 chips · 10 controls · 14 cards · 20 hero/sheets. */
export const brandRadius = { chip: 6, control: 10, card: 14, tile: 18, hero: 20, pill: 999 } as const;

export const amber = '#F59E0B';
export const successInk = '#15803D';
