/**
 * Live-catalog helpers — icon resolution and lookups.
 * ----------------------------------------------------------------------------
 * Shared by the three screens that render `GET /provider/onboarding/catalog`:
 * the services tab, the category screen and the service detail screen. The
 * lookups live here rather than in each screen because all three have to agree
 * on what "this code was not found" means — if they drifted, one screen would
 * show a service the next one claims does not exist.
 *
 * Nothing here invents catalog content. Every function either finds a real row
 * in the API response or returns `undefined` so the caller can render an
 * honest not-found state.
 * ----------------------------------------------------------------------------
 */

import {
  AirVent, Baby, Bike, Car, ClipboardCheck, Cpu, Droplet, Droplets, Footprints,
  HeartHandshake, Home, Laptop, PackageCheck, PawPrint, ScanLine, Scissors,
  ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Stethoscope, Truck, Users,
  Wrench, Zap,
} from 'lucide-react-native';
import type {
  LiveCatalogCategory, LiveCatalogDomain, LiveCatalogService,
} from '../../types/api';

export type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/**
 * `icon` is stored as a NAME on the catalog rows, so an operator can change
 * artwork without a deploy. This maps the names the seed data actually uses —
 * mirroring `ICONS` in `client/src/components/home/LiveServices.jsx` — and
 * falls back to a wrench rather than rendering nothing for an unknown name.
 */
const ICONS: Record<string, IconComponent> = {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench, ClipboardCheck, Footprints,
  PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope,
  ScanLine,
};

/** Never returns undefined — an unknown or blank name resolves to a wrench. */
export function iconFor(name?: string | null): IconComponent {
  return (name && ICONS[name]) || Wrench;
}

/** Every service across every domain, flattened. */
export function allServices(domains: LiveCatalogDomain[]): LiveCatalogService[] {
  return domains.flatMap((d) => d.services);
}

/**
 * Find a service by its catalog code.
 *
 * Matching is case-insensitive and also accepts `artKey`, because inbound deep
 * links are not all written by this screen — the home tab still links with the
 * older catalog's codes. That tolerance costs nothing and resolves a real link
 * where the codes happen to agree; where they genuinely do not, this returns
 * `undefined` and the screen says so instead of guessing.
 */
export function findService(
  domains: LiveCatalogDomain[],
  code?: string,
): { service: LiveCatalogService; domain: LiveCatalogDomain } | undefined {
  if (!code) return undefined;
  const needle = code.toLowerCase();
  for (const domain of domains) {
    for (const service of domain.services) {
      if (
        service.code.toLowerCase() === needle ||
        (service.artKey && service.artKey.toLowerCase() === needle)
      ) {
        return { service, domain };
      }
    }
  }
  return undefined;
}

/**
 * Find a coverage heading by its code.
 *
 * `serviceCode` scopes the search when supplied. It matters: heading codes are
 * unique per vertical, not globally — "display" is a legitimate heading for
 * BOTH phones and laptops (the server's own `{vertical, code}` unique index
 * exists for exactly this reason). Without the scope the first match wins and
 * a laptop link can land on the phone's heading.
 */
export function findCategory(
  domains: LiveCatalogDomain[],
  categoryCode?: string,
  serviceCode?: string,
):
  | { category: LiveCatalogCategory; service: LiveCatalogService; domain: LiveCatalogDomain }
  | undefined {
  if (!categoryCode) return undefined;
  const needle = categoryCode.toLowerCase();

  const scoped = serviceCode ? findService(domains, serviceCode) : undefined;
  const searchIn = scoped
    ? [{ domain: scoped.domain, services: [scoped.service] }]
    : domains.map((domain) => ({ domain, services: domain.services }));

  for (const { domain, services } of searchIn) {
    for (const service of services) {
      const category = service.coverage.find((c) => c.code.toLowerCase() === needle);
      if (category) return { category, service, domain };
    }
  }
  return undefined;
}

/** Total symptoms a service covers — used for the "N issues covered" line. */
export function problemCount(service: LiveCatalogService): number {
  return service.coverage.reduce((sum, c) => sum + c.problems.length, 0);
}
