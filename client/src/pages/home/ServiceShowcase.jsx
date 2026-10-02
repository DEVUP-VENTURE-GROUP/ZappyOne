import { Link } from 'react-router-dom';
import { ArrowRight, Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { artFor, PITCH } from '@shared/components/home/serviceArt';

/**
 * Everything ZappyOne does, laid out as you scroll — one band per section.
 *
 * The grid above is the quick way in; this is where a first-time visitor sees
 * the whole range: each section's character and promise, then every service in
 * it with what it covers and whether it can be booked here today. Services
 * nobody near them is verified for yet read "Coming soon" and a tap is demand.
 */
const BANDS = [
  { band: 'bg-[#EAF1FD]', chip: 'bg-[#DCE7FB] text-[#1D4ED8]' },
  { band: 'bg-[#E6F4EF]', chip: 'bg-[#D3EDE3] text-[#0F766E]' },
  { band: 'bg-[#FDF1E4]', chip: 'bg-[#FAE3C9] text-[#B45309]' },
  { band: 'bg-[#FCEBEF]', chip: 'bg-[#F8D9E0] text-[#BE123C]' },
  { band: 'bg-[#EEF0F6]', chip: 'bg-[#E1E5EE] text-[#334155]' },
];

/** What a service covers, in a few words: its headings for a repair, else its line. */
function coversLine(s) {
  const heads = (s.coverage || []).map((c) => c.name);
  if (heads.length) return heads.slice(0, 3).join(' · ') + (heads.length > 3 ? ` +${heads.length - 3} more` : '');
  return s.tagline || s.description || '';
}

function ServiceCard({ service, tone, onOpen }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  const soon = service.available === false;
  return (
    <button
      type="button"
      onClick={() => onOpen(service)}
      className="group flex w-[240px] shrink-0 snap-start flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-zappy-200 hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-100 sm:w-auto"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone.chip}`}>
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="mt-3 text-[15px] font-semibold leading-snug text-navy">{service.name}</span>
      <span className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500">{coversLine(service)}</span>
      <span className="mt-auto pt-3">
        {soon ? (
          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700">Coming soon</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-zappy-600">
            Book <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
          </span>
        )}
      </span>
    </button>
  );
}

function Band({ domain, tone, onOpen }) {
  const art = artFor(domain.services[0]?.code, domain.code);
  const [title, line] = PITCH[domain.code] || [domain.name, domain.description];
  const live = domain.services.filter((s) => s.available !== false).length;

  return (
    <section aria-labelledby={`band-${domain.code}`} className={`overflow-hidden rounded-3xl ${tone.band}`}>
      <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[400px_1fr] lg:items-center lg:gap-8">
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
              {live < domain.services.length && ` · ${live ? `${live} bookable here` : 'coming soon here'}`}
            </p>
          </div>
        </div>
        <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:content-start sm:items-start sm:overflow-visible sm:px-0 xl:grid-cols-3">
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
