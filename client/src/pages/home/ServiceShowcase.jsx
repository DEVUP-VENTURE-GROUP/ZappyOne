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
    tile: { code: o.code, name: o.name, icon: o.icon, imageUrl: o.imageUrl || '', subtitle: '' }, path: o.path,
  }));
  const tiles = repairTiles.length ? repairTiles : optionTiles;
  // Options with no picture of their own (pet care, helping) read better as
  // pills than as a row of identical icon boxes.
  const asChips = !repairTiles.length && optionTiles.every(({ tile }) => !tile.imageUrl);
  const count = repairTiles.length
    ? `${repairTiles.length} problem areas`
    : optionTiles.length ? `${optionTiles.length} options` : '';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-navy">{service.name}</span>
          {count && <span className="block text-[12px] text-slate-500">{count}</span>}
        </span>
        <button type="button" onClick={() => onOpen(service)}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-zappy-600 px-3.5 text-[13px] font-semibold text-white transition hover:bg-zappy-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-200">
          Book <ArrowRight size={14} />
        </button>
      </div>
      {tiles.length > 0 && asChips ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4 pt-3">
          {tiles.map(({ tile, path }) => (
            <button key={tile.code} type="button" onClick={() => onOpen(service, path)}
              className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-100 ${tone.chip}`}>
              {tile.name}
            </button>
          ))}
        </div>
      ) : tiles.length > 0 ? (
        <div className="relative">
          <div className="flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-4 pt-3.5 no-scrollbar">
            {tiles.map(({ tile, path }) => (
              <CategoryTile key={tile.code} category={tile} onOpen={() => onOpen(service, path)} />
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

function Band({ domain, tone, onOpen }) {
  const art = artFor(domain.services[0]?.code, domain.code);
  const [title, line] = PITCH[domain.code] || [domain.name, domain.description];

  return (
    <section aria-labelledby={`band-${domain.code}`} className={`overflow-hidden rounded-3xl ${tone.band}`}>
      <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex items-center gap-4">
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
          {domain.services.map((s) => <ServiceCard key={s.code} service={s} tone={tone} onOpen={onOpen} />)}
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
