import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import { distinctArt } from '@shared/components/home/serviceArt';
import { problemPhoto } from '@shared/components/home/problemArt';

/**
 * The services, as one even grid on a single neutral surface.
 *
 * Order carries the priority, not colour: what someone verified can do at this
 * address comes first, then the rest in catalog order. Every tile looks the
 * same so nothing competes by tint; the picture and the name do the work.
 */
/**
 * Soft tints, one per service area, so the grid reads in groups at a glance.
 * Light surfaces only — the icon or character carries the colour.
 */
export const DOMAIN_TINT = {
  electronics: { bg: 'bg-violet-50', fg: 'text-violet-600' },
  vehicles: { bg: 'bg-sky-50', fg: 'text-sky-600' },
  home_services: { bg: 'bg-cyan-50', fg: 'text-cyan-600' },
  pet_services: { bg: 'bg-orange-50', fg: 'text-orange-500' },
  helping_services: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  family_assist: { bg: 'bg-rose-50', fg: 'text-rose-500' },
  events: { bg: 'bg-pink-50', fg: 'text-pink-500' },
};
const DEFAULT_TINT = { bg: 'bg-zappy-50', fg: 'text-zappy-600' };
export const tintFor = (domainCode) => DOMAIN_TINT[domainCode] || DEFAULT_TINT;

function Tile({ service, character, onOpen }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  const tint = tintFor(service.domainCode);
  // An admin-set picture wins; then the service's ZappyOne character; then its icon.
  const art = service.imageUrl || character?.still;
  return (
    <button type="button" onClick={onOpen}
      className="group flex flex-col items-center gap-2 text-center focus-visible:outline-none">
      <span className={`flex aspect-square w-full max-w-[88px] items-center justify-center overflow-hidden rounded-[18px] ${tint.bg} ring-1 ring-inset ring-black/[0.03] transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95 group-focus-visible:ring-4 group-focus-visible:ring-zappy-600/25`}>
        {art
          ? <img src={art} alt="" loading="lazy" className={`h-full w-full ${service.imageUrl ? 'object-cover' : 'object-contain p-1.5 mix-blend-multiply'}`} />
          : <Icon strokeWidth={1.8} className={`h-[42%] w-[42%] ${tint.fg}`} />}
      </span>
      <span className="line-clamp-2 text-[12px] font-semibold leading-[1.25] text-ink-900 sm:text-[13px]">{service.name}</span>
    </button>
  );
}

export function ServiceGrid({ domains, onOpen, onViewAll }) {
  const all = domains.flatMap((d) => d.services);
  if (!all.length) return null;
  // Bookable here first; the sort is stable, so catalog order holds within each group.
  const tiles = [...all].sort((a, b) => Number(a.available === false) - Number(b.available === false));
  const characters = new Map(domains.flatMap((d) => [...distinctArt(d.services, d.code)]));

  // Phones: four columns. Wider: one fixed tile size, as many per row as fit.
  return (
    <section aria-labelledby="home-services">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-services" className="h-section">Explore services</h2>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="flex shrink-0 items-center text-[13px] font-semibold text-zappy-600 hover:text-zappy-800">
            View all <ChevronRight size={15} strokeWidth={2.4} />
          </button>
        )}
      </div>
      {/* auto-fit: a short catalogue spreads across the row instead of huddling left. */}
      <div className="mt-4 grid grid-cols-4 justify-items-center gap-x-2 gap-y-5 sm:grid-cols-[repeat(auto-fit,minmax(104px,1fr))] sm:gap-x-4">
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
 *
 * The row drifts on its own so every problem gets seen; it stops while a
 * finger or pointer is on it, the arrows step through it, and anyone who asks
 * for reduced motion gets a still row they scroll themselves.
 */
const DRIFT_PX_PER_S = 28;

export function ProblemChips({ services }) {
  const nav = useNavigate();
  const row = useRef(null);
  const hold = useRef(false);
  const resumeAt = useRef(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const chips = [];
  const seen = new Set();
  for (const s of services) {
    for (const h of s.highlights || []) {
      if (seen.has(h.name) || chips.length >= 10) continue;
      seen.add(h.name);
      chips.push({ ...h, service: s });
    }
  }
  const loops = !reduce && chips.length > 3;

  useEffect(() => {
    const el = row.current;
    if (!el || !loops) return undefined;
    let raf; let last = performance.now(); let carry = 0;
    const tick = (now) => {
      const dt = Math.min(64, now - last); last = now;
      if (!hold.current && now >= resumeAt.current && !document.hidden) {
        carry += (DRIFT_PX_PER_S * dt) / 1000;
        const step = Math.floor(carry);
        if (step) { el.scrollLeft += step; carry -= step; }
        // The list is drawn twice; past the first copy, jump back by one copy.
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) el.scrollLeft -= half;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loops]);

  const pause = (ms = 0) => { resumeAt.current = performance.now() + ms; };
  function stepBy(dir) {
    const el = row.current;
    if (!el) return;
    pause(4000);
    if (loops && dir < 0 && el.scrollLeft < 240) el.scrollLeft += el.scrollWidth / 2;
    el.scrollBy({ left: dir * 240, behavior: reduce ? 'auto' : 'smooth' });
  }

  if (!chips.length) return null;
  const list = loops ? [...chips, ...chips] : chips;

  return (
    <section aria-labelledby="home-problems">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-problems" className="text-[13px] font-semibold text-ink-500">Common problems</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => stepBy(-1)} aria-label="Previous problems"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-700 hover:border-line-strong">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => stepBy(1)} aria-label="More problems"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink-700 hover:border-line-strong">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="relative -mx-4 mt-2 sm:mx-0">
        <div
          ref={row}
          className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:px-0"
          onMouseEnter={() => { hold.current = true; }}
          onMouseLeave={() => { hold.current = false; }}
          onTouchStart={() => { hold.current = true; }}
          onTouchEnd={() => { hold.current = false; pause(3000); }}
          onFocus={() => { hold.current = true; }}
          onBlur={() => { hold.current = false; }}
        >
          {list.map((c, i) => {
            const Icon = SERVICE_ICONS[c.service.icon] || Wrench;
            const photo = problemPhoto(c.service.artKey || c.service.code, c);
            const copy = i >= chips.length;
            return (
              <button
                key={`${c.service.code}:${c.code}:${copy ? 1 : 0}`}
                type="button"
                onClick={() => nav(c.service.path)}
                tabIndex={copy ? -1 : 0}
                aria-hidden={copy || undefined}
                className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-line bg-white pl-1.5 pr-3.5 text-[13px] font-medium text-ink-900 transition-colors duration-150 hover:border-line-strong active:bg-canvas"
              >
                {photo
                  ? <img src={photo} alt="" loading="lazy" decoding="async" className="h-7 w-7 rounded-full object-cover" />
                  : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zappy-50 text-zappy-600">
                      <Icon size={14} strokeWidth={2} />
                    </span>
                  )}
                {c.name}
              </button>
            );
          })}
        </div>
        {/* Soft edges say "there is more this way". */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-canvas to-transparent sm:w-10" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-canvas to-transparent sm:w-10" />
      </div>
    </section>
  );
}
