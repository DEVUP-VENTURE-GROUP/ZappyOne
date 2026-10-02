import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { distinctArt } from '@shared/components/home/serviceArt';

/**
 * Everything we do in Telangana, as one grid — the Blinkit "shop by category"
 * move. Every tap is recorded (served or wanted) by the page.
 *
 * Columns follow the width: 4 on a phone, up to 8 on a desktop.
 */
/**
 * Muted tints so each group reads as its own shelf. Picked by the domain's
 * position in the admin-ordered catalog, so a new domain needs no code.
 */
const SHELVES = [
  { bg: 'bg-[#E8F0FC]', fg: 'text-[#1D4ED8]' }, // blue
  { bg: 'bg-[#E4F3EE]', fg: 'text-[#0F766E]' }, // teal
  { bg: 'bg-[#FBEEE0]', fg: 'text-[#B45309]' }, // amber
  { bg: 'bg-[#FBE8EC]', fg: 'text-[#BE123C]' }, // rose
  { bg: 'bg-[#ECEEF2]', fg: 'text-[#334155]' }, // slate
];

function Tile({ service, character, shelf, onOpen }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  // An admin-set picture wins; then the service's ZappyOne character; then its icon.
  const art = service.imageUrl || character?.still;
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col items-center gap-2 text-center focus-visible:outline-none">
      <span className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl ${shelf.bg} group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-zappy-500`}>
        {art
          ? <img src={art} alt="" loading="lazy" className={`h-full w-full transition-transform duration-300 group-hover:scale-105 ${service.imageUrl ? 'object-cover' : 'object-contain mix-blend-multiply pt-1.5'}`} />
          : <Icon strokeWidth={1.5} className={`h-[38%] w-[38%] ${shelf.fg} transition-transform duration-200 group-hover:scale-105`} />}
      </span>
      <span className="line-clamp-2 text-[12px] font-medium leading-[1.3] text-navy sm:text-[13px]">{service.name}</span>
    </button>
  );
}

/** Columns in the tile grid at the current width: 4 phone → 5 → 6 → 8 desktop. */
const BREAKPOINTS = [['(min-width: 1024px)', 8], ['(min-width: 768px)', 6], ['(min-width: 640px)', 5]];
function useColumns() {
  const read = () => (typeof window === 'undefined' ? 4
    : (BREAKPOINTS.find(([q]) => window.matchMedia(q).matches)?.[1] ?? 4));
  const [cols, setCols] = useState(read);
  useEffect(() => {
    const lists = BREAKPOINTS.map(([q]) => window.matchMedia(q));
    const onChange = () => setCols(read());
    lists.forEach((m) => m.addEventListener('change', onChange));
    return () => lists.forEach((m) => m.removeEventListener('change', onChange));
  }, []);
  return cols;
}

/**
 * One even grid of every service — no section headings, so tiles line up in
 * clean rows at every width. Each tile keeps its section's tint, which is all
 * the grouping a glance needs. Nothing is marked "soon": a customer opens any
 * service, and whether someone can come is answered at the booking step.
 */
export function ServiceGrid({ domains, onOpen }) {
  const cols = useColumns();
  const tiles = domains.flatMap((d, i) => d.services.map((s) => ({ s, d, shelf: SHELVES[i % SHELVES.length] })));
  if (!tiles.length) return null;
  const characters = new Map(domains.flatMap((d) => [...distinctArt(d.services, d.code)]));
  return (
    <section aria-labelledby="home-services">
      <h2 id="home-services" className="text-[17px] font-bold text-navy sm:text-[20px]">What do you need help with?</h2>
      <div className="mt-3 grid gap-x-3 gap-y-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map(({ s, shelf }) => (
          <Tile key={s.code} service={s} character={characters.get(s.code)} shelf={shelf} onOpen={() => onOpen(s)} />
        ))}
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
