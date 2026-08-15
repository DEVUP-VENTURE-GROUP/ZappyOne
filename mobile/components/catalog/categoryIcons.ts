/**
 * Category / service icon resolution.
 * ----------------------------------------------------------------------------
 * `Category.icon` on the backend stores a LUCIDE ICON NAME as a string
 * ("Smartphone", "Car", "PawPrint", …) — the model comments say the frontend
 * maps it to a component with a default fallback, which is exactly what the
 * website does.
 *
 * Mobile previously rendered a single hardcoded `Wrench` for every category,
 * so all 14 verticals looked identical. This restores their real identity.
 *
 * A string→component map is required because `lucide-react-native` exposes no
 * runtime name lookup, and importing all ~1000 icons to allow one would add
 * megabytes to the bundle. Only icons the catalog actually uses are imported —
 * the set below covers every name the live catalog currently returns, plus
 * likely near-neighbours so a new admin category still resolves.
 *
 * Unknown names fall back to `Wrench` rather than throwing, so adding a
 * category with an unmapped icon degrades gracefully. NEVER substitute an
 * emoji — the brief forbids emoji as production iconography.
 * ----------------------------------------------------------------------------
 */

import {
  AirVent,
  Bike,
  Bolt,
  Brush,
  Camera,
  Car,
  Cpu,
  Dog,
  Droplets,
  Fuel,
  Hammer,
  HeartHandshake,
  House,
  Laptop,
  Lightbulb,
  MonitorSmartphone,
  PartyPopper,
  PawPrint,
  Plug,
  Refrigerator,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Tv,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Lucide names the backend is known to emit. Verified against the live
 * `GET /api/catalog/categories` response.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  AirVent,
  Bike,
  Bolt,
  Brush,
  Camera,
  Car,
  Cpu,
  Dog,
  Droplets,
  Fuel,
  Hammer,
  HeartHandshake,
  House,
  Home: House, // lucide renamed Home → House; accept both
  Laptop,
  Lightbulb,
  MonitorSmartphone,
  PartyPopper,
  PawPrint,
  Plug,
  Refrigerator,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Tv,
  Users,
  Wifi,
  Wrench,
  Zap,
};

/** Fallbacks by category key, for records with no `icon` set. */
const KEY_FALLBACK: Record<string, LucideIcon> = {
  mobile: Smartphone,
  laptop: Laptop,
  car: Car,
  bike: Bike,
  vehicle: Car,
  commercial: Truck,
  event: PartyPopper,
  pet: PawPrint,
  family: HeartHandshake,
  helper: Users,
  smart: Wifi,
  appliance: Plug,
  electrical: Bolt,
  plumbing: Droplets,
  carpentry: Hammer,
  cleaning: Sparkles,
  home: House,
  other: Wrench,
};

/**
 * Resolve a category to its icon component.
 * Explicit Lucide name → key fallback → partial key match → Wrench.
 */
export function resolveCategoryIcon(
  iconName?: string | null,
  categoryKey?: string | null,
): LucideIcon {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];

  if (categoryKey) {
    const key = categoryKey.toLowerCase();
    if (KEY_FALLBACK[key]) return KEY_FALLBACK[key];
    const partial = Object.keys(KEY_FALLBACK).find((k) => key.includes(k));
    if (partial) return KEY_FALLBACK[partial];
  }

  return Wrench;
}

/** Same resolution for an individual service, using its code as the hint. */
export function resolveServiceIcon(
  iconName?: string | null,
  serviceCode?: string | null,
): LucideIcon {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
  if (!serviceCode) return Wrench;

  const code = serviceCode.toLowerCase();
  if (/puncture|tyre|towing/.test(code)) return Car;
  if (/bike|scooter/.test(code)) return Bike;
  if (/fuel/.test(code)) return Fuel;
  if (/car|vehicle|battery_jump/.test(code)) return Car;
  if (/laptop/.test(code)) return Laptop;
  if (/screen|charging|camera|software|water_damage|data_recovery|speaker|microphone|phone|glass/.test(code))
    return Smartphone;
  if (/\btv\b|smart_tv/.test(code)) return Tv;
  if (/cctv/.test(code)) return Camera;
  if (/router|wifi/.test(code)) return Wifi;
  if (/ac_|air_condition/.test(code)) return AirVent;
  if (/fridge|refrigerator|washing|geyser|appliance/.test(code)) return Refrigerator;
  if (/plumb|tap|pipe|tank|sump/.test(code)) return Droplets;
  if (/electric|fan|light|switch|wiring|mcb/.test(code)) return Bolt;
  if (/clean/.test(code)) return Sparkles;
  if (/paint/.test(code)) return Brush;
  if (/pet|dog|groom/.test(code)) return PawPrint;
  if (/event|birthday|wedding|decor/.test(code)) return PartyPopper;
  if (/elder|medicine|hospital|grocery|companion/.test(code)) return HeartHandshake;
  if (/lock|door|carpent/.test(code)) return Hammer;
  if (/automation/.test(code)) return Plug;

  return Wrench;
}

/** `screen_replacement` → `Screen replacement`. */
export function humanizeCode(code: string): string {
  const spaced = String(code || '').replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Catalog prices are stored in PAISE. */
export function paiseToRupees(paise?: number | null): number {
  return Math.round((paise ?? 0) / 100);
}
