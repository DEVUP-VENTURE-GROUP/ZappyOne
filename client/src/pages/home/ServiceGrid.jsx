import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';

/**
 * Everything bookable here, as one grid — the Blinkit "shop by category" move.
 * A tile exists only for a live service a verified provider covers at this
 * location, so every tap leads somewhere that can actually be booked.
 *
 * Columns follow the width: 4 on a phone, up to 8 on a desktop.
 */
function Tile({ service, onOpen }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col items-center gap-2 text-center focus-visible:outline-none">
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-[#E9F0FB] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-zappy-500">
        {service.imageUrl
          ? <img src={service.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <Icon size={30} strokeWidth={1.5} className="text-zappy-700" />}
      </span>
      <span className="line-clamp-2 text-[12px] font-medium leading-[1.3] text-navy sm:text-[13px]">{service.name}</span>
    </button>
  );
}

export function ServiceGrid({ services, onOpen }) {
  if (!services.length) return null;
  return (
    <section aria-labelledby="home-services">
      <h2 id="home-services" className="text-[17px] font-bold text-navy sm:text-[20px]">What do you need help with?</h2>
      <div className="mt-3 grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {services.map((s) => <Tile key={s.code} service={s} onOpen={() => onOpen(s)} />)}
      </div>
    </section>
  );
}

/**
 * The problems people actually book for, straight into the right service —
 * Zomato's quick filters, applied to "what's wrong". Drawn from the catalog's
 * popular problems, so an operator changes this list, not a developer.
 */
export function ProblemChips({ services }) {
  const nav = useNavigate();
  const chips = [];
  const seen = new Set();
  for (const s of services) {
    for (const h of s.highlights || []) {
      if (seen.has(h.name) || chips.length >= 12) continue;
      seen.add(h.name);
      chips.push({ ...h, service: s });
    }
  }
  if (!chips.length) return null;
  return (
    <section aria-labelledby="home-problems">
      <h2 id="home-problems" className="text-[17px] font-bold text-navy sm:text-[20px]">Common problems we fix</h2>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => (
          <button
            key={`${c.service.code}:${c.code}`}
            type="button"
            onClick={() => nav(c.service.path)}
            className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 ring-1 ring-slate-200 transition hover:text-zappy-700 hover:ring-zappy-300 active:scale-[0.97]"
          >
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}
