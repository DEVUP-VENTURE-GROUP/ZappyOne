/**
 * Home's service discovery — one panel per domain.
 * ----------------------------------------------------------------------------
 * Home's discovery layer. The deep catalog (domain → service → coverage →
 * problem) stays at /services; this is the layer above it.
 *
 * ── WHY PANELS AND NOT A FLAT GRID ─────────────────────────────────────────
 * The catalog is lopsided: seven pet services against one for home services. A
 * flat grid has to either truncate pet arbitrarily or let it dominate the page,
 * and it changes shape every time an operator adds a service. A panel per domain
 * lets each domain show its real depth, scroll on its own, and keep the page's
 * vertical rhythm steady no matter how many services a domain gains.
 *
 * ── TWO CARD SHAPES, CHOSEN BY DENSITY ─────────────────────────────────────
 * A domain with two services and a domain with seven do not want the same card.
 * Two narrow cards in a scrollable row look like a rail that failed to fill;
 * seven wide cards are a wall. So:
 *
 *   2–3 services → WIDE card   (artwork left, text right, arrow button)
 *   4+  services → COMPACT card (artwork on top, text beneath, scrolls)
 *
 * The threshold is on the data, not hardcoded per domain — a domain that grows
 * past three services changes shape on its own.
 *
 * ── DESKTOP IS NOT THE MOBILE RAIL STRETCHED ───────────────────────────────
 * Below `lg` a dense domain scrolls horizontally, which is the right gesture on
 * a phone. From `lg` up the same cards lay out as a grid, because a horizontal
 * scroll on a 1440px screen hides content behind an interaction nobody expects
 * to need there. Same cards, same proportions, different flow.
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

/** Above this many services a domain switches from wide cards to compact ones. */
const WIDE_MAX = 3;

/**
 * The panel wash behind each domain. Deliberately fainter than the card art:
 * five saturated panels stacked down a page stop reading as one product. The
 * tint identifies the domain; the cards on top stay white.
 */
const PANEL = {
  electronics:      'bg-indigo-50/60 ring-indigo-100/70',
  vehicles:         'bg-sky-50/60 ring-sky-100/70',
  home_services:    'bg-cyan-50/50 ring-cyan-100/70',
  helping_services: 'bg-amber-50/50 ring-amber-100/70',
  pet_services:     'bg-fuchsia-50/40 ring-fuchsia-100/70',
};
const PANEL_DEFAULT = 'bg-slate-50 ring-slate-200/70';

const secondLine = (service) => service.tagline || service.description || '';

/**
 * Fixed width, never a percentage — inside an `overflow-x` row a percentage
 * resolves against the VISIBLE width, so every card collapses to a fraction of
 * the phone screen instead of a fraction of the row.
 */
const COMPACT_W = 'w-[148px] sm:w-[164px] lg:w-auto';

const CARD_BASE =
  'group relative flex overflow-hidden rounded-[18px] bg-white text-left ring-1 ring-slate-200/80 ' +
  'shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-200 ' +
  'hover:-translate-y-0.5 hover:ring-indigo-200 hover:shadow-[0_16px_30px_-20px_rgba(79,70,229,0.5)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

/* ── Artwork ──────────────────────────────────────────────────────────────
   One element, one contract: the catalog's own image when it has one,
   otherwise the service's vector character. `ServiceCharacter` already routes
   a service code to its render when one exists and to its own vector when it
   does not, so nothing here has to know which is in play. */
function Art({ service, art, className, size }) {
  return (
    <span className={`flex shrink-0 items-center justify-center bg-gradient-to-br ${art.art} ${className}`}>
      {service.imageUrl ? (
        <img src={service.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ServiceCharacter
          code={service.code}
          size={size}
          className="transition-transform duration-200 group-hover:scale-105"
        />
      )}
    </span>
  );
}

/** 2–3 services: artwork left, text right, arrow bottom-right. */
function WideCard({ service, art, onOpen }) {
  const line = secondLine(service);
  return (
    <motion.button onClick={onOpen} whileTap={{ scale: 0.975 }} className={`${CARD_BASE} items-stretch`}>
      <Art service={service} art={art} size={54} className="w-[56px] sm:w-[88px] lg:w-[84px] xl:w-[96px]" />

      {/* The arrow is a row in this column, not an absolute overlay.
          Overlaid, its `pr-8` left about 48px of text on a 390px screen and
          "Mobile Phones" rendered as "Mobile Phone:" with the rest cut off.
          Stacking it also matches the reference, where the arrow sits under
          the copy rather than beside it. */}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2.5 py-2.5 sm:px-3">
        {/* `break-words` on both lines. Catalog copy is not written to a width:
            "Photographed" alone is wider than the text column on a 390px
            screen, and without it the word overflowed the card instead of
            breaking — it rendered as "Photographec" with the rest cut off. */}
        {/* Three lines throughout. A service whose NAME is cut off is a
            different failure from a tagline that is, and "Returns & Exchange
            Assistant" needs three lines at 390px AND at 1024px, where the
            four-column grid gives each card 229px. Short names still take one
            line; the clamp only spends what it needs. */}
        <span className="line-clamp-3 break-words text-[12.5px] font-bold leading-[1.25] tracking-[-0.02em] text-[#0F172A] sm:text-[15px]">
          {service.name}
        </span>
        {line ? (
          // Five lines on a phone, four from `sm`. The four-column grid at
          // 1024px is the second-tightest case, not the widest — it gives the
          // same tagline a 121px column, so `sm` cannot drop below four.
          // The longest real tagline — "We handle the physical trip, not the
          // merchant's decision", 55 characters — gets an 82px column in a
          // two-up card at 390px, which is about thirteen characters a line.
          // It needs all five. The clamp is still a guard against an operator
          // pasting a paragraph; it just is not a guard against our own
          // catalog. The row is `items-stretch`, so the cost is one taller row
          // in one domain — the alternative was writing shorter copy than the
          // catalog supplies, which is the invention this page exists to
          // remove.
          <span className="line-clamp-5 break-words text-[10px] font-medium leading-[1.35] text-slate-500 sm:line-clamp-4 sm:text-[12px]">
            {line}
          </span>
        ) : null}
        {/* Affordance, not a second target — the whole card is the button. */}
        <span
          aria-hidden="true"
          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-full bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white sm:h-7 sm:w-7"
        >
          <ArrowRight size={13} strokeWidth={2.6} />
        </span>
      </span>
    </motion.button>
  );
}

/** 4+ services: artwork on top, text beneath. */
function CompactCard({ service, art, onOpen }) {
  const line = secondLine(service);
  return (
    <motion.button
      onClick={onOpen}
      whileTap={{ scale: 0.975 }}
      className={`${CARD_BASE} ${COMPACT_W} shrink-0 snap-start flex-col`}
    >
      <Art service={service} art={art} size={66} className="h-[88px] w-full sm:h-[96px]" />
      {/* Grows with its content; the row stretches to match, so a two-line name
          cannot land on top of the line beneath it. */}
      <span className="flex flex-1 flex-col gap-0.5 px-2.5 pb-3 pt-2">
        <span className="line-clamp-2 text-[12.5px] font-bold leading-[1.28] tracking-[-0.015em] text-[#0F172A] sm:text-[13.5px]">
          {service.name}
        </span>
        {line ? (
          // Three lines for the same reason the wide card takes four: the pet
          // domain's copy comes from `description`, which runs to fifty-odd
          // characters — "Overnight boarding and daytime care while you
          // travel" — and lost its ending at two. The rail is `items-stretch`,
          // so every card in it matches the tallest and the row stays even.
          <span className="line-clamp-3 break-words text-[10.5px] font-medium leading-[1.35] text-slate-500 sm:text-[11.5px]">
            {line}
          </span>
        ) : null}
      </span>
    </motion.button>
  );
}

function DomainPanel({ domain, onOpenService, onSeeAll }) {
  const Icon = iconFor(domain.icon);
  const art = artFor(domain.code);
  const services = domain.services || [];
  if (!services.length) return null;

  const wide = services.length <= WIDE_MAX;

  return (
    <section className={`rounded-[22px] ring-1 ${PANEL[domain.code] || PANEL_DEFAULT}`}>
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-white shadow-sm`}>
          <Icon size={19} strokeWidth={2.1} className={art.fg} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-black leading-tight tracking-[-0.02em] text-[#0F172A] sm:text-[18px]">
            {domain.name}
          </h3>
          {domain.description ? (
            <p className="truncate text-[11px] font-medium text-slate-500 sm:text-[12.5px]">
              {domain.description}
            </p>
          ) : null}
        </div>
        <button
          onClick={onSeeAll}
          className="group flex shrink-0 items-center gap-1 rounded-lg px-1 py-1 text-[12.5px] font-bold text-indigo-600 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-[13.5px]"
          aria-label={`See all ${domain.name} services`}
        >
          See all
          <ArrowRight size={14} strokeWidth={2.6} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </header>

      <div
        className={
          wide
            ? // A lone service in a two-column grid is an orphan half-card
              // beside an empty half — Water & Tank Care rendered exactly that
              // way. One service takes the full row, which also gives its copy
              // twice the width.
              //
              // From `lg` everything drops onto the same four-column grid the
              // dense domains use, so one column rhythm runs down the whole
              // page. Left as two columns, a two-service domain rendered cards
              // 600px wide on a 1440px screen — a 104px character beside an
              // acre of empty white. A domain simply fills as many cells as it
              // has services; the empty cells to the right are the truth.
              `grid items-stretch gap-2.5 px-4 pb-4 lg:grid-cols-4 ${
                services.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
              }`
            : // Scrolls below lg, grid from lg up.
              'flex snap-x scroll-smooth items-stretch gap-2.5 overflow-x-auto px-4 pb-4 no-scrollbar lg:grid lg:grid-cols-4 lg:overflow-visible'
        }
      >
        {services.map((service) =>
          wide ? (
            <WideCard key={service.code} service={service} art={art} onOpen={() => onOpenService(service)} />
          ) : (
            <CompactCard key={service.code} service={service} art={art} onOpen={() => onOpenService(service)} />
          ),
        )}
      </div>
    </section>
  );
}

function PanelSkeleton({ wide }) {
  return (
    <section className={`rounded-[22px] ring-1 ${PANEL_DEFAULT}`}>
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="h-10 w-10 animate-pulse rounded-[13px] bg-white" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-32 animate-pulse rounded bg-white" />
          <div className="h-2.5 w-44 animate-pulse rounded bg-white/70" />
        </div>
      </header>
      <div className={wide ? 'grid grid-cols-2 gap-2.5 px-4 pb-4' : 'flex gap-2.5 overflow-hidden px-4 pb-4 lg:grid lg:grid-cols-4'}>
        {(wide ? [0, 1] : [0, 1, 2, 3]).map((i) =>
          wide ? (
            <div key={i} className="flex h-[92px] overflow-hidden rounded-[18px] bg-white ring-1 ring-slate-200/80">
              <div className="w-[72px] animate-pulse bg-slate-100 sm:w-[88px]" />
              <div className="flex-1 space-y-2 p-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ) : (
            <div key={i} className={`${COMPACT_W} shrink-0 overflow-hidden rounded-[18px] bg-white ring-1 ring-slate-200/80`}>
              <div className="h-[88px] w-full animate-pulse bg-slate-100 sm:h-[96px]" />
              <div className="space-y-2 px-2.5 pb-3 pt-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ),
        )}
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
      <div className="space-y-3.5">
        <PanelSkeleton wide />
        <PanelSkeleton />
      </div>
    );
  }

  // An empty catalog is a real state: a service appears only once a provider is
  // verified for it. Say so plainly rather than filling the space.
  if (!domains.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white p-6 text-center">
        <p className="text-sm font-bold text-slate-700">No services available yet</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Services appear here as soon as we have verified providers for them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {domains.map((domain) => (
        <DomainPanel
          key={domain.code}
          domain={domain}
          onOpenService={(service) => nav(service.path)}
          onSeeAll={() => nav('/services')}
        />
      ))}
    </div>
  );
}
