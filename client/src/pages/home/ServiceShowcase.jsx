import { Link } from 'react-router-dom';
import { ChevronRight, Wrench } from 'lucide-react';
import { SERVICE_ICONS, CategoryTile } from '@shared/components/home/LiveServices';
import { artFor, PITCH } from '@shared/components/home/serviceArt';

/**
 * Every service, section by section, with what is inside each one.
 *
 * One calm layout for all sections: a small avatar and plain heading, then a
 * white card per service with its contents as tiles (a repair's problem areas,
 * event categories, pet services, helping jobs). Each tile opens the booking
 * already set to it. No per-section colours; hierarchy comes from type.
 */

/** Where a section's own page is, for its single card's Book action. */
const SECTION_HOME = {
  pet_services: { name: 'Pet care', path: '/pet' },
  helping_services: { name: 'Helping services', path: '/helping' },
};

/**
 * The cards a section shows. Repairs: one card per service, its problem areas
 * as tiles. A section without headings (pet care, helping) reads the same way:
 * ONE card, its services as the tiles, or with only a couple of services the
 * jobs inside them (Buy for me, Pick up, Return, Exchange).
 */
function cardsFor(domain) {
  const { services } = domain;
  if (services.length === 1 || services.some((s) => s.coverage?.length)) return services;
  const home = SECTION_HOME[domain.code] || { name: domain.name, path: services[0].path };
  const asTiles = services.length >= 3;
  return [{
    code: domain.code,
    domainCode: domain.code,
    name: home.name,
    path: home.path,
    icon: services[0].icon,
    coverage: [],
    countLabel: asTiles ? 'services' : 'options',
    options: asTiles
      ? services.map((s) => ({ code: s.code, name: s.name, icon: s.icon, imageUrl: s.imageUrl, path: s.path, service: s }))
      : services.flatMap((s) => (s.options || []).map((o) => ({ ...o, service: s }))),
  }];
}

function ServiceCard({ service, onOpen }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  const repairTiles = (service.coverage || []).map((c) => ({
    tile: c, path: `/repair/category/${service.artKey || service.code}/${c.code}`,
  }));
  const optionTiles = (service.options || []).map((o) => ({
    tile: { code: o.code, name: o.name, icon: o.icon, imageUrl: o.imageUrl || '', subtitle: '' }, path: o.path, target: o.service,
  }));
  const tiles = repairTiles.length ? repairTiles : optionTiles;
  const count = repairTiles.length
    ? `${repairTiles.length} problem areas`
    : optionTiles.length ? `${optionTiles.length} ${service.countLabel || 'options'}` : '';

  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      <button type="button" onClick={() => onOpen(service)}
        className="flex w-full items-center gap-3 px-3.5 pt-3.5 text-left sm:px-4 sm:pt-4"
        aria-label={`Book ${service.name}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-sunken text-ink-700">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-ink-900">{service.name}</span>
          {count && <span className="block text-[13px] text-ink-500">{count}</span>}
        </span>
        <span className="flex shrink-0 items-center text-[14px] font-semibold text-zappy-600">
          Book <ChevronRight size={16} />
        </span>
      </button>
      {tiles.length > 0 ? (
        <div className="flex snap-x gap-2.5 overflow-x-auto scroll-px-3.5 px-3.5 pb-3.5 pt-3 no-scrollbar sm:scroll-px-4 sm:px-4 sm:pb-4">
          {tiles.map(({ tile, path, target }) => (
            <CategoryTile key={tile.code} category={tile} large={!!tile.imageUrl} onOpen={() => onOpen(target || service, path)} />
          ))}
        </div>
      ) : (
        <p className="px-4 pb-4 pt-2 text-[13px] leading-relaxed text-ink-500">{service.tagline || service.description}</p>
      )}
    </div>
  );
}

function Section({ domain, onOpen }) {
  const art = artFor(domain.services[0]?.code, domain.code);
  const [title, line] = PITCH[domain.code] || [domain.name, domain.description];
  return (
    <section aria-labelledby={`band-${domain.code}`} className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
      <div className="flex items-center gap-3 lg:items-start">
        {art && (
          <img src={art.still} alt="" loading="lazy"
            className="h-12 w-12 shrink-0 rounded-full bg-sunken object-contain mix-blend-multiply lg:h-16 lg:w-16" />
        )}
        <div className="min-w-0">
          <h3 id={`band-${domain.code}`} className="text-[17px] font-bold leading-snug text-ink-900">{domain.name}</h3>
          <p className="text-[13px] leading-snug text-ink-500">{line || title}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {cardsFor(domain).map((s) => <ServiceCard key={s.code} service={s} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

export default function ServiceShowcase({ domains, onOpen }) {
  if (!domains.length) return null;
  return (
    <section aria-labelledby="showcase-title" className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="showcase-title" className="h-section">All services</h2>
        <Link to="/services" className="flex shrink-0 items-center text-[14px] font-semibold text-zappy-600">
          See all <ChevronRight size={16} />
        </Link>
      </div>
      {domains.map((d) => <Section key={d.code} domain={d} onOpen={onOpen} />)}
    </section>
  );
}
