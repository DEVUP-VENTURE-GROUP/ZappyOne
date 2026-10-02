import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench, ChevronRight,
  Monitor, Battery, Plug, Keyboard, Volume2, Camera, HardDrive, Gauge,
  Wifi, Thermometer, CircuitBoard, Database, ArrowUpCircle, Wand2, ShieldAlert,
  ClipboardCheck, ShieldCheck, Footprints, PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope, PartyPopper,
} from 'lucide-react';
import { useLiveCatalogQuery } from '../../services/api';
import { distinctArt } from './serviceArt';

/**
 * What a customer can book today, and what each service covers.
 *
 * Read from the same rows providers sign up against, so the two sides cannot
 * disagree: a service reaches this list only when it is live, which is also the
 * only state a provider can be verified in. Listing something nobody is
 * verified to do is how a marketplace takes a booking it cannot fulfil.
 *
 * Under each service are its HEADINGS — Display, Battery & Power, Storage,
 * Connectivity — and nothing else. Opening a heading is a page of its own,
 * because the full symptom list runs to a hundred-odd entries per service and
 * flattening that onto the home page would bury the choice that actually
 * matters first: which kind of problem you have.
 *
 * Headings, their pictures and their contents are all admin-managed data.
 */

/** Icon names are stored as data; this maps them, with a sane fallback. */
export const SERVICE_ICONS = {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench,
  ClipboardCheck, Footprints, PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope, PartyPopper,
};

/**
 * Fallback artwork for a heading with no picture set yet.
 *
 * Keyed by the catalog's own category codes, so a heading looks deliberate on
 * day one and an operator can replace it with a photo whenever they like.
 */
export const CATEGORY_ICONS = {
  display: Monitor,
  battery_power: Battery,
  charging: Plug,
  keyboard_touchpad: Keyboard,
  body_hinge: Wrench,
  audio: Volume2,
  camera: Camera,
  storage: HardDrive,
  performance: Gauge,
  software: Wand2,
  connectivity: Wifi,
  overheating: Thermometer,
  advanced_hardware: CircuitBoard,
  liquid_damage: Droplet,
  liquid_advanced: Droplet,
  physical: ShieldAlert,
  data_recovery: Database,
  upgrade: ArrowUpCircle,
  maintenance: Wrench,
};

/**
 * One heading tile in the scrolling strip.
 *
 * The width is FIXED, in pixels. It used to be
 * `calc((100% - 5 * 0.75rem) / 6)`, which looks like "six across" but is not:
 * inside an `overflow-x-auto` flex row, a percentage resolves against the
 * visible width, so every tile became a sixth of the phone screen — about 55px.
 * "Battery & Power" then rendered as "BAT & POW" over two clipped lines, which
 * is exactly how the strip looked on a real device.
 *
 * The label is sentence case for the same reason. Uppercase with letter-spacing
 * is roughly 30% wider, and these names come from the database — "Liquid &
 * Advanced" has to fit whatever we choose, so the layout is built around the
 * longest real name rather than the shortest.
 */
export function CategoryTile({ category, onOpen }) {
  const Icon = CATEGORY_ICONS[category.code] || SERVICE_ICONS[category.icon] || Wrench;
  const problems = category.problems || [];
  const count = problems.length;
  // A repair heading previews what it covers, from the catalog's own names.
  const preview = count
    ? `${problems.slice(0, 2).map((p) => p.name).join(', ')}${count > 2 ? ' & more' : ''}`
    : '';

  return (
    <button
      onClick={onOpen}
      className="group flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-white text-left transition-colors duration-150 hover:border-line-strong active:bg-canvas sm:w-[200px]"
    >
      <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-sunken">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            // A ZappyOne character is drawn on white: fit it and let the tint show through.
            className={`h-full w-full transition-transform duration-300 group-hover:scale-105 ${
              category.imageUrl.startsWith('/characters/') ? 'object-contain mix-blend-multiply pt-1' : 'object-cover'}`}
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white text-zappy-600">
            <Icon size={24} strokeWidth={1.8} />
          </span>
        )}
        {count > 0 && (
          <span className="chip absolute bottom-2 left-2 bg-white/95 font-semibold tabular-nums text-ink-900">
            {count} {count === 1 ? 'problem' : 'problems'}
          </span>
        )}
      </span>

      {/* Fixed height keeps every tile in a row the same, whatever the name. */}
      <span className={`flex flex-col gap-1 p-3 ${count ? 'h-[118px]' : 'h-[96px]'}`}>
        <span className={`${count ? 'line-clamp-1' : 'line-clamp-2'} text-[15px] font-bold leading-snug text-ink-900`}>{category.name}</span>
        {count > 0 ? (
          <>
            <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-500">{preview}</span>
            <span className="mt-auto flex items-center justify-between gap-2">
              {/* True for every repair: the quote comes first, nothing starts until it is approved. */}
              <span className="flex items-center gap-1 text-[12px] font-semibold text-green-700">
                <ShieldCheck size={13} /> Quote first
              </span>
              <span className="flex items-center text-[12px] font-semibold text-zappy-600">
                View <ChevronRight size={14} />
              </span>
            </span>
          </>
        ) : (
          <>
            {category.subtitle ? <span className="line-clamp-1 text-[12px] text-ink-500">{category.subtitle}</span> : null}
            <span className="mt-auto flex items-center justify-end text-[12px] font-semibold text-zappy-600">
              Book <ChevronRight size={14} />
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/**
 * A section whose services have no headings of their own (pet care, helping):
 * one card, one row — a box per service. Listing each as a full card made the
 * section as long as the repairs above it for a handful of simple services.
 */
function ServiceRow({ services, onOpen }) {
  const characters = distinctArt(services);
  return (
    <div className="relative overflow-hidden rounded-xl bg-white">
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 py-3.5 snap-x scroll-px-4 scroll-smooth">
        {services.map((s) => (
          <CategoryTile
            key={s.code}
            category={{ code: s.code, name: s.name, icon: s.icon, imageUrl: s.imageUrl || characters.get(s.code)?.still, subtitle: '' }}
            onOpen={() => onOpen(s)}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}

function ServiceCard({ service, character, onOpenService, onOpenCategory }) {
  const Icon = SERVICE_ICONS[service.icon] || Wrench;
  const coverage = service.coverage || [];

  return (
    <div className="overflow-hidden rounded-xl bg-white">
      <button onClick={onOpenService} className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
        {service.imageUrl
          ? <img src={service.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
          : character
            ? <img src={character.still} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-[#EEF3FB] object-contain mix-blend-multiply" />
            : <Icon size={24} className="shrink-0 text-zappy-700" strokeWidth={1.6} />}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-navy">{service.name}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
            {service.description || service.tagline}
          </span>
        </span>
        <span className="flex shrink-0 items-center text-[13px] font-semibold text-zappy-600">
          Book <ChevronRight size={16} className="transition group-hover:translate-x-0.5" />
        </span>
      </button>

      {/* Horizontal scrollable carousel — Swiggy/Zomato style */}
      {coverage.length > 0 && (
        <div className="relative border-t border-slate-100">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 py-3.5 snap-x scroll-px-4 scroll-smooth">
            {coverage.map((group) => (
              <CategoryTile
                key={group.code}
                category={group}
                onOpen={() => onOpenCategory(group)}
              />
            ))}
          </div>
          {/* Edge fades: a hint that the row continues, not a hard cut. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
        </div>
      )}
    </div>
  );
}

/**
 * availableCodes: when given, which services someone covers at the customer's
 *   location — reported to onOpenService(code, served) for demand analytics.
 *   Every service opens; the booking step says if nobody can come yet.
 */
export default function LiveServices({ availableCodes = null, onOpenService = null }) {
  const nav = useNavigate();
  const { data, isLoading } = useLiveCatalogQuery();

  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-200/60" />)}
      </div>
    );
  }

  const allowed = availableCodes && new Set(availableCodes);
  const domains = (data?.domains || [])
    .map((d) => ({
      ...d,
      services: d.services.map((s) => ({ ...s, domainCode: d.code, available: allowed ? allowed.has(s.code) : undefined })),
    }))
    .filter((d) => d.services.length);
  const open = (s, path) => {
    onOpenService?.(s.code, s.available !== false);
    nav(path || s.path);
  };
  if (!domains.length) return null;

  return (
    <div className="space-y-8">
      {domains.map((d) => (
        <section key={d.code} aria-labelledby={`domain-${d.code}`}>
          <h2 id={`domain-${d.code}`} className="text-[17px] font-bold text-navy sm:text-[20px]">{d.name}</h2>
          {d.description && <p className="mt-0.5 text-[13px] text-slate-500">{d.description}</p>}
          {d.services.some((s) => s.coverage?.length) ? (
            <div className="mt-3 space-y-3">
              {d.services.map((s) => (
                <ServiceCard
                  key={s.code}
                  service={s}
                  character={distinctArt(d.services, d.code).get(s.code)}
                  onOpenService={() => open(s)}
                  onOpenCategory={(group) => open(s, `/repair/category/${s.artKey || s.code}/${group.code}`)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <ServiceRow services={d.services} onOpen={(s) => open(s)} />
            </div>
          )}
        </section>
      ))}

      <p className="text-[13px] text-slate-500">
        New areas open every week as we verify providers across Telangana.
      </p>
    </div>
  );
}
