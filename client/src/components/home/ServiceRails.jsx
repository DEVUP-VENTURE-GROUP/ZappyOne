/**
 * Home's service discovery — one rail per domain.
 * ----------------------------------------------------------------------------
 * Home's discovery layer. The deep catalog (domain → service → coverage →
 * problem) stays at /services; this is the layer above it.
 *
 * ── WHY RAILS AND NOT A GRID ───────────────────────────────────────────────
 * The catalog is lopsided: seven pet services against two for electronics. A
 * flat grid has to either truncate pet arbitrarily or let it dominate the page,
 * and it changes shape every time an operator adds a service. A rail per domain
 * lets each domain show its real depth, scroll on its own, and keep the page's
 * vertical height constant no matter how many services a domain gains.
 *
 * ── DESKTOP IS NOT THE MOBILE RAIL STRETCHED ───────────────────────────────
 * Below `lg` each domain scrolls horizontally, which is the right gesture on a
 * phone. From `lg` up the same cards lay out as a 4-up grid, because a
 * horizontal scroll on a 1440px screen hides content behind an interaction
 * nobody expects to need there. Same cards, same dimensions, different flow.
 *
 * ── NOTHING HERE IS INVENTED ───────────────────────────────────────────────
 * Domain membership, service order, names and copy all come from the live
 * catalog. The second line is the service's own `tagline`, falling back to its
 * `description`. There is no price, no provider count, no rating and no
 * availability, because the catalog carries none of those and this file will
 * not make them up.
 * ----------------------------------------------------------------------------
 */

import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useLiveCatalogQuery } from '../../services/api';
import { ServiceCharacter } from '../catalog/serviceCharacters';
import { artFor, iconFor } from './LiveServices';

/**
 * Fixed, never a percentage — a % width inside an overflow row collapses.
 *
 * 164 rather than 150: at the narrower width a two-line clamp held about forty
 * characters, and real taglines run longer than that — "Logistics support for a
 * vet visit, not a substitute for one" lost its second half on a phone. The
 * extra fourteen pixels buy roughly four characters a line across two lines,
 * which is the difference between most taglines fitting and most not. Two cards
 * plus a peek still show at 390px, so the rail still reads as scrollable.
 */
const CARD = 'w-[164px] sm:w-[180px] lg:w-auto';

function ServiceCard({ service, art, onOpen }) {
  const line = service.tagline || service.description || '';

  return (
    <motion.button
      onClick={onOpen}
      whileTap={{ scale: 0.97 }}
      className={`group flex ${CARD} shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white text-left ring-1 ring-slate-200/80 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:ring-indigo-300 hover:shadow-[0_18px_34px_-22px_rgba(79,70,229,0.55)]`}
    >
      {/* Fixed-height artwork band. A 1:1 band would be 150px tall on a phone
          and push a four-domain page past the horizon before anything else. */}
      <span
        className={`flex h-[92px] w-full shrink-0 items-center justify-center bg-gradient-to-br md:h-[104px] ${art.art}`}
      >
        {service.imageUrl ? (
          <img src={service.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ServiceCharacter
            code={service.code}
            size={72}
            className="transition-transform duration-200 group-hover:scale-105"
          />
        )}
      </span>

      {/* Grows with its content; the row stretches to match, so a two-line
          name cannot land on top of the line beneath it. */}
      <span className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2.5">
        <span className="line-clamp-2 text-[13px] font-bold leading-[1.3] tracking-[-0.01em] text-[#0F172A]">
          {service.name}
        </span>
        {line ? (
          <span className="line-clamp-2 text-[11px] leading-[1.35] text-slate-500">{line}</span>
        ) : null}
      </span>
    </motion.button>
  );
}

function DomainRail({ domain, onOpenService, onSeeAll }) {
  const Icon = iconFor(domain.icon);
  const art = artFor(domain.code);
  const services = domain.services || [];
  if (!services.length) return null;

  return (
    <section className="mt-7 first:mt-0">
      <div className="flex items-center gap-2.5 px-4 md:px-0">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${art.chip}`}>
          <Icon size={17} strokeWidth={2} className={art.fg} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-black leading-tight tracking-tight text-[#0F172A]">
            {domain.name}
          </h2>
          {domain.description ? (
            <p className="truncate text-xs text-slate-500">{domain.description}</p>
          ) : null}
        </div>
        <button
          onClick={onSeeAll}
          className="group flex shrink-0 items-center gap-1 text-[13px] font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
        >
          See all
          <ArrowRight size={14} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Scrolls below lg, lays out as a grid from lg up. */}
      <div className="mt-3 flex snap-x scroll-smooth gap-3 overflow-x-auto px-4 pb-1 no-scrollbar lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {services.map((service) => (
          <ServiceCard
            key={service.code}
            service={service}
            art={art}
            onOpen={() => onOpenService(service)}
          />
        ))}
      </div>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section className="mt-7 first:mt-0">
      <div className="flex items-center gap-2.5 px-4 md:px-0">
        <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="mt-3 flex gap-3 overflow-hidden px-4 lg:grid lg:grid-cols-4 lg:px-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD} shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80`}>
            <div className="h-[92px] w-full animate-pulse bg-slate-100 md:h-[104px]" />
            <div className="px-3 pb-3 pt-2.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-2.5 w-full animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ServiceRails() {
  const nav = useNavigate();
  const { data, isLoading } = useLiveCatalogQuery();
  const domains = data?.domains || [];

  if (isLoading) {
    return (
      <div>
        <RailSkeleton />
        <RailSkeleton />
      </div>
    );
  }

  // An empty catalog is a real state: a service appears only once a provider is
  // verified for it. Say so plainly rather than filling the space.
  if (!domains.length) {
    return (
      <div className="mx-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center md:mx-0">
        <p className="text-sm font-bold text-slate-700">No services available yet</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Services appear here as soon as we have verified providers for them.
        </p>
      </div>
    );
  }

  return (
    <div>
      {domains.map((domain) => (
        <DomainRail
          key={domain.code}
          domain={domain}
          onOpenService={(service) => nav(service.path)}
          onSeeAll={() => nav('/services')}
        />
      ))}
    </div>
  );
}
