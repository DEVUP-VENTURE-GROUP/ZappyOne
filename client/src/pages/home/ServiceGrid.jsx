import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { distinctArt } from '@shared/components/home/serviceArt';

/**
 * The services, as one even grid on a single neutral surface.
 *
 * Order carries the priority, not colour: what someone verified can do at this
 * address comes first, then the rest in catalog order. Every tile looks the
 * same so nothing competes by tint; the picture and the name do the work.
 */
function Tile({ service, character, onOpen }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  // An admin-set picture wins; then the service's ZappyOne character; then its icon.
  const art = service.imageUrl || character?.still;
  return (
    <button type="button" onClick={onOpen}
      className="group flex flex-col items-center gap-1.5 rounded-card text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-600/20">
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-card bg-sunken transition-colors duration-150 group-active:bg-line">
        {art
          ? <img src={art} alt="" loading="lazy" className={`h-full w-full ${service.imageUrl ? 'object-cover' : 'object-contain mix-blend-multiply pt-1.5'}`} />
          : <Icon strokeWidth={1.6} className="h-[36%] w-[36%] text-ink-700" />}
      </span>
      <span className="line-clamp-2 text-[13px] font-medium leading-[1.25] text-ink-900">{service.name}</span>
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

export function ServiceGrid({ domains, onOpen }) {
  const base = useColumns();
  const all = domains.flatMap((d) => d.services);
  if (!all.length) return null;
  // Bookable here first; the sort is stable, so catalog order holds within each group.
  const tiles = [...all].sort((a, b) => Number(a.available === false) - Number(b.available === false));
  // One column fewer or more if that leaves no tile alone on the last row.
  const orphans = (c) => (c - (tiles.length % c)) % c;
  const cols = [base, base - 1, base + 1].filter((c) => c >= 3)
    .sort((a, b) => orphans(a) - orphans(b) || Math.abs(a - base) - Math.abs(b - base))[0];
  const characters = new Map(domains.flatMap((d) => [...distinctArt(d.services, d.code)]));

  return (
    <section aria-labelledby="home-services">
      <h2 id="home-services" className="h-section">Services</h2>
      <div className="mt-3 grid gap-x-3 gap-y-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles.map((s) => (
          <Tile key={s.code} service={s} character={characters.get(s.code)} onOpen={() => onOpen(s)} />
        ))}
      </div>
    </section>
  );
}

/**
 * The fastest way in: a problem in the customer's own words, straight into the
 * service that fixes it. Drawn from the catalog's popular problems, so an
 * operator changes this list, not a developer.
 */
export function ProblemChips({ services }) {
  const nav = useNavigate();
  const chips = [];
  const seen = new Set();
  for (const s of services) {
    for (const h of s.highlights || []) {
      if (seen.has(h.name) || chips.length >= 10) continue;
      seen.add(h.name);
      chips.push({ ...h, service: s });
    }
  }
  if (!chips.length) return null;
  return (
    <section aria-labelledby="home-problems">
      <h2 id="home-problems" className="text-[13px] font-semibold text-ink-500">Common problems</h2>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => (
          <button
            key={`${c.service.code}:${c.code}`}
            type="button"
            onClick={() => nav(c.service.path)}
            className="min-h-[36px] shrink-0 rounded-btn border border-line bg-white px-3 text-[13px] font-medium text-ink-700 transition-colors duration-150 hover:border-line-strong active:bg-canvas"
          >
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}
