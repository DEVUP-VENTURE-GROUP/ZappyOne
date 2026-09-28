import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench, ChevronRight, ArrowRight,
  Monitor, Battery, Plug, Keyboard, Volume2, Camera, HardDrive, Gauge,
  Wifi, Thermometer, CircuitBoard, Database, ArrowUpCircle, Wand2, ShieldAlert,
  ClipboardCheck, Footprints, PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope,
} from 'lucide-react';
import { useLiveCatalogQuery } from '../../services/api';

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
const ICONS = {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench,
  ClipboardCheck, Footprints, PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope,
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
  maintenance: Sparkles,
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
  const Icon = CATEGORY_ICONS[category.code] || Wrench;
  const count = category.problems.length;

  return (
    <button
      onClick={onOpen}
      className="group flex w-[116px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white text-left ring-1 ring-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:ring-indigo-300 hover:shadow-[0_18px_34px_-22px_rgba(79,70,229,0.55)] sm:w-[132px]"
    >
      <span className="relative flex aspect-[5/4] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 to-violet-50">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
          />
        ) : (
          <Icon size={24} className="text-indigo-500 transition-transform duration-200 group-hover:scale-110" strokeWidth={1.6} />
        )}
      </span>

      {/* Fixed height keeps one-line and two-line names on the same baseline. */}
      <span className="flex h-[52px] flex-col justify-start px-2.5 pt-2">
        <span className="line-clamp-2 text-[12px] font-bold leading-[1.25] tracking-[-0.01em] text-[#0F172A]">
          {category.name}
        </span>
        <span className="mt-auto pb-2 text-[10.5px] font-medium text-slate-400">
          {count} {count === 1 ? 'issue' : 'issues'}
        </span>
      </span>
    </button>
  );
}

function ServiceCard({ service, onOpenService, onOpenCategory }) {
  const Icon = ICONS[service.icon] || Wrench;
  const coverage = service.coverage || [];

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200/70">
      <button onClick={onOpenService} className="group flex w-full items-center gap-4 p-4 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-indigo-50">
          {service.imageUrl
            ? <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
            : <Icon size={22} className="text-indigo-600" strokeWidth={1.75} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-sm font-black text-[#0F172A]">{service.name}</span>
            {service.isPopular && (
              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-600">
                Popular
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
            {service.description || service.tagline}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
      </button>

      {/* Horizontal scrollable carousel — Swiggy/Zomato style */}
      {coverage.length > 0 && (
        <div className="relative border-t border-slate-100">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 py-3.5 snap-x scroll-smooth">
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

/** availableCodes: when given, only services covered at the customer's location are shown. */
export default function LiveServices({ availableCodes = null }) {
  const nav = useNavigate();
  const { data, isLoading } = useLiveCatalogQuery();

  if (isLoading) {
    return (
      <div className="mt-7 space-y-3">
        {[0, 1].map((i) => <div key={i} className="h-52 animate-pulse rounded-3xl bg-slate-100" />)}
      </div>
    );
  }

  const allowed = availableCodes && new Set(availableCodes);
  const domains = (data?.domains || [])
    .map((d) => (allowed ? { ...d, services: d.services.filter((s) => allowed.has(s.code)) } : d))
    .filter((d) => d.services.length);
  if (!domains.length) return null;

  return (
    <div className="mt-7 space-y-7">
      {domains.map((d) => {
        const Icon = ICONS[d.icon] || Wrench;
        return (
          <section key={d.code}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-indigo-50">
                {d.imageUrl
                  ? <img src={d.imageUrl} alt="" className="h-full w-full object-cover" />
                  : <Icon size={17} className="text-indigo-500" strokeWidth={2} />}
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-black tracking-tight text-[#0F172A]">{d.name}</h2>
                {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {d.services.map((s) => (
                <ServiceCard
                  key={s.code}
                  service={s}
                  onOpenService={() => nav(s.path)}
                  onOpenCategory={(group) => nav(`/repair/category/${s.artKey || s.code}/${group.code}`)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/*
        Said plainly rather than by listing services that cannot be booked.
        A greyed-out tile invites a tap that goes nowhere; a sentence does not.
      */}
      <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center">
        <p className="text-sm font-bold text-slate-700">More services are on the way</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Vehicles, home services and family assist open as soon as we have verified providers for them.
        </p>
        <button
          onClick={() => nav('/nearby-shops')}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600"
        >
          Browse nearby shops meanwhile <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
