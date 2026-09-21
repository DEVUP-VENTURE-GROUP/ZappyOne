import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Laptop, Cpu, Bike, Car, Truck, Home, HeartHandshake, Baby, Users,
  Zap, Droplet, Droplets, AirVent, Sparkles, Wrench, ChevronRight, ArrowRight,
  Monitor, Battery, Plug, Keyboard, Volume2, Camera, HardDrive, Gauge,
  Wifi, Thermometer, CircuitBoard, Database, ArrowUpCircle, Wand2, ShieldAlert,
  ClipboardCheck, Footprints, PackageCheck, PawPrint, Scissors, ShoppingBag, ShoppingBasket, Stethoscope,
  // Vehicle and tank headings — see CATEGORY_ICONS.
  LifeBuoy, KeyRound, Cog, BatteryCharging, Lightbulb, Disc, CircleDot, Link2,
  Waves, Fuel, Flame, Wind, Lock, Armchair, Radio, Radar, ShieldCheck,
  PackagePlus, Navigation, Search, Square,
} from 'lucide-react';
import { useLiveCatalogQuery } from '../../services/api';
import { ServiceCharacter, characterFor } from '../catalog/serviceCharacters';

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
  /* Electronics — mobile + laptop */
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

  /* Two-wheeler. The vehicle and tank headings were missing entirely, so all
     53 of them fell through to the wrench — nine identical glyphs in a row,
     which made the rail look broken rather than uniform. */
  tw_roadside: LifeBuoy,
  tw_starting: KeyRound,
  tw_engine: Cog,
  tw_battery_electrical: BatteryCharging,
  tw_lights_controls: Lightbulb,
  tw_brakes: Disc,
  tw_tyres_wheels: CircleDot,
  tw_chain_drive: Link2,
  tw_clutch_gear: Cog,
  tw_cvt: Cog,
  tw_suspension_steering: Navigation,
  tw_fuel: Fuel,
  tw_cooling: Thermometer,
  tw_body: Bike,
  tw_maintenance: Sparkles,
  tw_ev_battery: BatteryCharging,
  tw_ev_charging: Plug,
  tw_ev_motor: Zap,
  tw_ev_controller: CircuitBoard,
  tw_ev_dashboard: Gauge,

  /* Four-wheeler */
  fw_roadside: LifeBuoy,
  fw_starting: KeyRound,
  fw_engine: Cog,
  fw_battery_electrical: BatteryCharging,
  fw_fuel: Fuel,
  fw_cng: Flame,
  fw_transmission: Cog,
  fw_clutch: Cog,
  fw_brakes: Disc,
  fw_steering: Navigation,
  fw_suspension: Waves,
  fw_tyres_wheels: CircleDot,
  fw_ac: AirVent,
  fw_cooling: Thermometer,
  fw_exhaust: Wind,
  fw_lights: Lightbulb,
  fw_body: Car,
  fw_glass: Square,
  fw_doors_locks: Lock,
  fw_interior: Armchair,
  fw_infotainment: Radio,
  fw_adas: Radar,
  fw_diagnostics: Stethoscope,
  fw_safety: ShieldCheck,
  fw_maintenance: Sparkles,
  fw_ev_battery: BatteryCharging,
  fw_ev_charging: Plug,
  fw_ev_motor: Zap,

  /* Water & tank care */
  wt_cleaning: Droplets,
  wt_inspection: Search,
  wt_flushing: Waves,
  wt_repair: Wrench,
  wt_addons: PackagePlus,
};

/**
 * Per-vertical fallback, keyed by the service's `artKey`.
 *
 * An unmapped heading in a vehicle rail should still look like a vehicle
 * heading rather than a generic wrench, so the fallback narrows by vertical
 * before giving up. A genuinely unknown vertical still lands on the wrench.
 */
const VERTICAL_FALLBACK_ICON = {
  mobile: Smartphone,
  laptop: Laptop,
  two_wheeler: Bike,
  four_wheeler: Car,
  water_tank_care: Droplets,
};

/**
 * Per-domain artwork tint.
 *
 * Every tile and icon chip drew the same indigo→violet wash, so five different
 * businesses — phones, vehicles, water tanks, errands, pets — looked like one
 * undifferentiated list. Each domain now gets its own second stop while the
 * FIRST stop stays indigo, so the rails read as distinct sections of one
 * product rather than five palettes competing.
 *
 * Keyed by domain code, with a brand default for anything an operator adds
 * later — a new domain looks deliberate on day one rather than unstyled.
 */
const DOMAIN_ART = {
  electronics:      { art: 'from-indigo-50 to-violet-100',  chip: 'bg-indigo-50',  fg: 'text-indigo-600',  glyph: 'text-indigo-500'  },
  vehicles:         { art: 'from-indigo-50 to-sky-100',     chip: 'bg-sky-50',     fg: 'text-sky-700',     glyph: 'text-sky-600'     },
  home_services:    { art: 'from-indigo-50 to-cyan-100',    chip: 'bg-cyan-50',    fg: 'text-cyan-700',    glyph: 'text-cyan-600'    },
  helping_services: { art: 'from-indigo-50 to-amber-100',   chip: 'bg-amber-50',   fg: 'text-amber-700',   glyph: 'text-amber-600'   },
  pet_services:     { art: 'from-indigo-50 to-fuchsia-100', chip: 'bg-fuchsia-50', fg: 'text-fuchsia-700', glyph: 'text-fuchsia-600' },
};

const DEFAULT_ART = DOMAIN_ART.electronics;
/** Exported so Home's rails tint from the same table rather than a copy. */
export const artFor = (domainCode) => DOMAIN_ART[domainCode] || DEFAULT_ART;
/** Domain/service icon names are catalog data; resolved here, shared with Home. */
export const iconFor = (name) => ICONS[name] || Wrench;

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
export function CategoryTile({ category, onOpen, fallbackIcon, art = DEFAULT_ART }) {
  const Icon = CATEGORY_ICONS[category.code] || fallbackIcon || Wrench;
  const count = category.problems.length;

  return (
    <button onClick={onOpen} className="tile group">
      <span className={`tile-art bg-gradient-to-br ${art.art}`}>
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
          />
        ) : (
          <>
            {/* A soft wash behind the glyph so an art-less tile reads as a
                designed surface rather than an empty box. */}
            <span className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rounded-full bg-white/50 blur-xl" />
            <Icon
              size={26}
              strokeWidth={1.6}
              className={`relative ${art.glyph} transition-transform duration-200 group-hover:scale-110`}
            />
          </>
        )}
      </span>

      {/* Grows with the name; the rail equalises heights so a two-line label
          can never collide with the count beneath it. */}
      <span className="tile-body">
        <span className="line-clamp-2 text-[12px] font-bold leading-[1.3] tracking-[-0.01em] text-[#0F172A]">
          {category.name}
        </span>
        <span className="mt-auto pt-1 text-[10.5px] font-medium text-slate-400">
          {count} {count === 1 ? 'issue' : 'issues'}
        </span>
      </span>
    </button>
  );
}

function ServiceCard({ service, onOpenService, onOpenCategory, art = DEFAULT_ART }) {
  const Icon = ICONS[service.icon] || Wrench;
  const coverage = service.coverage || [];
  // Resolution order: artwork the CATALOG supplies wins, because an operator
  // uploading a picture is a deliberate act; then this service's character;
  // then the domain-tinted icon. Every step degrades, none can render torn.
  const character = service.imageUrl ? null : characterFor(service.code);

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200/70 transition duration-200 hover:ring-slate-300 hover:shadow-[0_18px_34px_-24px_rgba(15,23,42,0.35)]">
      <button onClick={onOpenService} className="group flex w-full items-center gap-4 p-4 text-left">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${art.chip}`}>
          {service.imageUrl ? (
            <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : character ? (
            <ServiceCharacter
              code={service.code}
              size={52}
              className="transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <Icon size={22} className={art.fg} strokeWidth={1.75} />
          )}
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
          <div className="rail px-4 py-3.5">
            {coverage.map((group) => (
              <CategoryTile
                key={group.code}
                category={group}
                art={art}
                fallbackIcon={VERTICAL_FALLBACK_ICON[service.artKey]}
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

export default function LiveServices() {
  const nav = useNavigate();
  const { data, isLoading } = useLiveCatalogQuery();

  if (isLoading) {
    return (
      <div className="mt-7 space-y-3">
        {[0, 1].map((i) => <div key={i} className="h-52 animate-pulse rounded-3xl bg-slate-100" />)}
      </div>
    );
  }

  const domains = data?.domains || [];
  if (!domains.length) return null;

  return (
    <div className="mt-7 space-y-7">
      {domains.map((d) => {
        const Icon = ICONS[d.icon] || Wrench;
        const art = artFor(d.code);
        const serviceCount = d.services.length;
        return (
          <section key={d.code}>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl ${art.chip}`}>
                {d.imageUrl
                  ? <img src={d.imageUrl} alt="" className="h-full w-full object-cover" />
                  : <Icon size={18} className={art.fg} strokeWidth={2} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[18px] font-black tracking-tight text-[#0F172A]">{d.name}</h2>
                  {/* The real number of live services in this domain — counted
                      from the response, never a hardcoded figure. */}
                  <span className="shrink-0 text-[11px] font-bold text-slate-400">
                    {serviceCount} {serviceCount === 1 ? 'service' : 'services'}
                  </span>
                </div>
                {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {d.services.map((s) => (
                <ServiceCard
                  key={s.code}
                  service={s}
                  art={art}
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
