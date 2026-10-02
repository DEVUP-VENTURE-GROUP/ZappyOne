import { Link } from 'react-router-dom';
import { ArrowRight, Wrench } from 'lucide-react';
import { SERVICE_ICONS, CategoryTile } from '@shared/components/home/LiveServices';
import { artFor, PITCH } from '@shared/components/home/serviceArt';

/**
 * Everything ZappyOne does, laid out as you scroll — one band per section.
 *
 * The grid above is the quick way in; this is where a first-time visitor sees
 * the whole range: each section's character and promise, then every service in
 * it with what it covers. Every service opens; whether someone can come to
 * this address is answered at the booking step.
 */
const BANDS = [
  { band: 'bg-[#EAF1FD]', chip: 'bg-[#DCE7FB] text-[#1D4ED8]' },
  { band: 'bg-[#E6F4EF]', chip: 'bg-[#D3EDE3] text-[#0F766E]' },
  { band: 'bg-[#FDF1E4]', chip: 'bg-[#FAE3C9] text-[#B45309]' },
  { band: 'bg-[#FCEBEF]', chip: 'bg-[#F8D9E0] text-[#BE123C]' },
  { band: 'bg-[#EEF0F6]', chip: 'bg-[#E1E5EE] text-[#334155]' },
];

/**
 * One service and everything inside it, as tiles: a repair's problem areas
 * (Display, Battery & Power…), a pet service's options (Bath + Dry, Haircut…),
 * a helping line's jobs (Buy for me, Pick up…). Seeing the contents is what
 * makes a service feel real; each tile opens the booking already set to it.
 */
function ServiceCard({ service, tone, onOpen }) {
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
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="flex items-center gap-3 px-3 pt-3.5 sm:px-4 sm:pt-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-navy">{service.name}</span>
          {count && <span className="block text-[12px] text-slate-500">{count}</span>}
        </span>
        <button type="button" onClick={() => onOpen(service)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-zappy-600 px-3 text-[12.5px] font-semibold text-white sm:h-9 sm:px-3.5 sm:text-[13px] transition hover:bg-zappy-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200">
          Book <ArrowRight size={14} />
        </button>
      </div>
      {tiles.length > 0 ? (
        <div className="relative">
          <div className="flex snap-x gap-2.5 overflow-x-auto scroll-px-3 px-3 pb-3.5 pt-3 no-scrollbar sm:scroll-px-4 sm:px-4 sm:pb-4 sm:pt-3.5">
            {tiles.map(({ tile, path, target }) => (
              <CategoryTile key={tile.code} category={tile} large onOpen={() => onOpen(target || service, path)} />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
        </div>
      ) : (
        <p className="px-4 pb-4 pt-2 text-[13px] leading-relaxed text-slate-500">{service.tagline || service.description}</p>
      )}
    </div>
  );
}

/** Where a section's own page is, for its single card's Book button. */
const SECTION_HOME = {
  pet_services: { name: 'Pet care', path: '/pet' },
  helping_services: { name: 'Helping services', path: '/helping' },
};

/**
 * The cards a section shows. Repairs: one card per service, its problem areas
 * as tiles. A section without headings (pet care, helping) reads the same way:
 * ONE card, its services as the tiles — or, with only a couple of services,
 * the jobs inside them (Buy for me, Pick up, Return, Exchange).
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

function Band({ domain, tone, onOpen }) {
  const art = artFor(domain.services[0]?.code, domain.code);
  const [title, line] = PITCH[domain.code] || [domain.name, domain.description];

  return (
    <section aria-labelledby={`band-${domain.code}`} className={`-mx-4 overflow-hidden sm:mx-0 sm:rounded-3xl ${tone.band}`}>
      <div className="grid gap-4 px-2 py-4 sm:gap-5 sm:p-7 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex items-center gap-4 px-2 sm:px-0">
          {art && (
            <img src={art.still} alt={art.alt} loading="lazy"
              className="h-24 w-24 shrink-0 rounded-2xl object-contain mix-blend-multiply lg:h-36 lg:w-36" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{domain.name}</p>
            <h3 id={`band-${domain.code}`} className="mt-1 text-[19px] font-bold leading-tight text-navy [text-wrap:balance] sm:text-[22px]">{title}</h3>
            {line && <p className="mt-1.5 hidden text-[14px] leading-relaxed text-slate-600 sm:block">{line}</p>}
            <p className="mt-2 text-[12px] font-medium text-slate-500">
              {domain.services.length} service{domain.services.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {cardsFor(domain).map((s) => <ServiceCard key={s.code} service={s} tone={tone} onOpen={onOpen} />)}
        </div>
      </div>
    </section>
  );
}

export default function ServiceShowcase({ domains, onOpen }) {
  if (!domains.length) return null;
  return (
    <section aria-labelledby="showcase-title" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="showcase-title" className="text-[20px] font-bold text-navy sm:text-[26px]">Everything we do in Telangana</h2>
          <p className="mt-1 text-[14px] text-slate-500">Verified pros, fixed prices before work starts, live tracking on every job.</p>
        </div>
        <Link to="/services" className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-zappy-600 hover:text-zappy-700">
          See all <ArrowRight size={15} />
        </Link>
      </div>
      {domains.map((d, i) => <Band key={d.code} domain={d} tone={BANDS[i % BANDS.length]} onOpen={onOpen} />)}
    </section>
  );
}
