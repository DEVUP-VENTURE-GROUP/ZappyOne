/**
 * What Home shows, from the live catalog (the website's HomePage rules), as
 * plain functions: every service with whether it can be booked here, events as
 * their own section before pet care, the rotating search hints, and the
 * customer's own "book again" list.
 */
import { foldIntoHub } from '@zappy/core/shared/serviceArt';
import { eventPhoto, eventTone } from '../events/eventTones';

export interface HomeService {
  code: string; name: string; icon?: string; path: string; domainCode: string; available?: boolean; artKey?: string;
  tagline?: string; description?: string; highlights?: { code: string; name: string; categoryCode?: string }[];
  coverage?: { code: string; name: string; imageUrl?: string; problems?: { name: string }[] }[];
  options?: { code: string; name: string; icon?: string; imageUrl?: string; emoji?: string; toneColor?: string; path: string; service?: HomeService }[];
  countLabel?: string;
  fromPaise?: number | null;
}
export interface HomeDomain { code: string; name: string; description?: string; services: HomeService[] }

/** Every service shows; whether it can be booked HERE is serviceability's answer (unknown location: bookable). */
// What nobody covers at this address yet, for "Coming to your area".
export function comingSoonOf(catalogDomains: HomeDomain[], liveCodes: Set<string> | null): HomeService[] {
  if (!liveCodes) return [];
  return catalogDomains.flatMap((d) => d.services.filter((s) => !liveCodes.has(s.code)).map((s) => ({ ...s, domainCode: d.code })));
}

export function buildDomains(catalogDomains: HomeDomain[], liveCodes: Set<string> | null, eventCats: { slug: string; name: string; emoji?: string; coverImage?: string }[]): HomeDomain[] {
  const list = catalogDomains
    .map((d) => ({ ...d, services: d.services.map((s) => ({ ...s, domainCode: d.code, available: liveCodes ? liveCodes.has(s.code) : undefined })).filter((s) => s.available !== false) }))
    .filter((d) => d.services.length);
  if (!eventCats.length) return list;
  // Events run on their own module; they join as a section before pet care, each occasion a tile.
  const events: HomeDomain = {
    code: 'events', name: 'Events', description: 'Decor and event partners for every occasion.',
    services: [{
      code: 'events', domainCode: 'events', name: 'Events & décor', icon: 'PartyPopper', path: '/events',
      tagline: 'Birthdays, baby showers, anniversaries and more', highlights: [], coverage: [],
      options: eventCats.map((c) => ({
        code: c.slug, name: c.name, icon: 'PartyPopper', imageUrl: eventPhoto(c) || undefined, emoji: c.emoji, toneColor: eventTone(c), path: `/events/browse?category=${c.slug}`,
      })),
    }],
  };
  const at = list.findIndex((d) => d.code === 'pet_services');
  return at < 0 ? [...list, events] : [...list.slice(0, at), events, ...list.slice(at)];
}

/** The quick grid folds a section with its own page (pet care) into one tile. */
export const gridDomains = (all: HomeDomain[]): HomeDomain[] => all.map(foldIntoHub);

/** Real, bookable problems for the rotating search hint; never a service we don't offer. */
export function searchTerms(services: HomeService[]): string[] {
  const problems = services.flatMap((s) => (s.highlights || []).map((h) => h.name));
  return [...new Set(problems.length ? problems : services.map((s) => s.name))].slice(0, 8);
}

interface PastJob { outcome?: string; rebookHref?: string; title: string; createdAt?: string; raw?: { completedAt?: string } }

/** Up to three things they had done before, of any kind, each reopening its booking flow. */
export function quickRebooks(past: PastJob[]) {
  const seen = new Set<string>();
  const out: { key: string; title: string; href: string; date?: string }[] = [];
  for (const j of past) {
    if (j.outcome !== 'completed' || !j.rebookHref || seen.has(j.rebookHref)) continue;
    seen.add(j.rebookHref);
    out.push({ key: j.rebookHref, title: j.title, href: j.rebookHref, date: j.raw?.completedAt || j.createdAt });
    if (out.length === 3) break;
  }
  return out;
}
