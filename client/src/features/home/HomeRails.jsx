import toast from 'react-hot-toast';
import {
  ArrowRight, CheckCircle2, ChevronRight, Clock, MapPin, RotateCcw, ShieldCheck, Star, Store, Wrench, XCircle,
} from 'lucide-react';
import { useGetAvailablePromosQuery, useNearbyShopsQuery } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { offerEnds } from '@shared/customer/season';
import { ZappyWordmark } from '@shared/components/common/ZappyLogo';
import PromoBanner from '@shared/components/home/PromoBanner';
import { artFor, servicePhoto } from '@shared/components/home/serviceArt';
import { tintFor } from './ServiceGrid';
import { AREA_PHOTO } from '@shared/config/homepageContent';
import { icon3dFor } from '@shared/config/icons3d';

// The sections of Home below the hero.

export function SectionTitle({ id, title, action, onAction, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="h-section flex flex-wrap items-baseline gap-x-2">{title}{children}</h2>
      {action && (
        <button type="button" onClick={onAction} className="flex shrink-0 items-center text-[13px] font-semibold text-zappy-600 hover:text-zappy-800">
          {action} <ChevronRight size={15} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

/** Scrolls sideways on a phone, lays out as a grid when there's room. */
function Rail({ children, cols = 'sm:grid-cols-2 lg:grid-cols-4', className = '' }) {
  return (
    <div className={`-mx-4 mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:scroll-px-0 ${cols} ${className}`}>
      {children}
    </div>
  );
}

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/* Book a service / Local stores */

export function ModeSwitch({ onStores }) {
  return (
    <nav aria-label="What would you like to do" className="grid grid-cols-2 gap-1 rounded-[16px] bg-zappy-50 p-1 ring-1 ring-inset ring-zappy-100">
      <span aria-current="page"
        className="relative flex h-12 items-center justify-center gap-2 rounded-[12px] bg-zappy-600 text-[14px] font-bold text-white shadow-soft-lg sm:text-[15px]">
        <Wrench size={17} strokeWidth={2.2} /> Book a service
      </span>
      <button type="button" onClick={onStores}
        className="flex h-12 items-center justify-center gap-2 rounded-[12px] text-[14px] font-bold text-zappy-700 transition-colors hover:bg-white sm:text-[15px]">
        <Store size={17} strokeWidth={2.2} /> Shop from Stores
        <span className="rounded-full bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">New</span>
      </button>
    </nav>
  );
}

/* ZappyOne promotion */

/** A simple drawn storefront — illustration only; the brand mark is the real logo component. */
function StorefrontArt({ className = '' }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true">
      <ellipse cx="80" cy="112" rx="70" ry="6" fill="#DCE6FB" />
      <circle cx="22" cy="88" r="16" fill="#86EFAC" /><rect x="20" y="92" width="4" height="18" rx="2" fill="#65A30D" />
      <circle cx="140" cy="86" r="14" fill="#86EFAC" /><rect x="138" y="90" width="4" height="20" rx="2" fill="#65A30D" />
      <rect x="32" y="40" width="96" height="70" rx="6" fill="#FFFFFF" stroke="#B9CCF7" strokeWidth="2" />
      <rect x="40" y="18" width="80" height="16" rx="5" fill="#1F4FD8" />
      <rect x="54" y="23" width="52" height="6" rx="3" fill="#FFFFFF" opacity="0.9" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M${30 + i * 16.7} 34 h16.7 v10 a8.35 8.35 0 0 1 -16.7 0z`} fill={i % 2 ? '#FFFFFF' : '#1F4FD8'} stroke="#1F4FD8" strokeWidth="1.2" />
      ))}
      <rect x="44" y="60" width="34" height="26" rx="3" fill="#EEF3FD" stroke="#B9CCF7" />
      <rect x="49" y="70" width="10" height="12" rx="2" fill="#F59E0B" opacity="0.8" />
      <rect x="62" y="66" width="11" height="16" rx="2" fill="#8EAAF0" />
      <rect x="88" y="60" width="28" height="50" rx="3" fill="#1A41B4" />
      <circle cx="110" cy="86" r="2" fill="#F59E0B" />
    </svg>
  );
}

export function ZappyOnePromo({ onExplore }) {
  return (
    <section aria-labelledby="home-zappyone"
      className="relative overflow-hidden rounded-[20px] bg-zappy-50 ring-1 ring-inset ring-zappy-100">
      <div className="flex items-center gap-3 p-4 sm:gap-6 sm:p-6 lg:px-8">
        <StorefrontArt className="h-[84px] w-[104px] shrink-0 sm:h-[120px] sm:w-[150px]" />
        <div className="min-w-0 flex-1">
          <h2 id="home-zappyone" className="text-[17px] font-extrabold leading-tight tracking-[-0.01em] text-ink-900 sm:text-[22px]">
            Discover local stores on <ZappyWordmark size={22} className="ml-0.5 translate-y-[3px] align-baseline sm:hidden" /><ZappyWordmark size={28} className="ml-1 hidden translate-y-[5px] align-baseline sm:inline-flex" />
          </h2>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-500 sm:text-[15px]">
            Verified neighbourhood shops near you. Walk in, or book their service directly.
          </p>
          <button type="button" onClick={onExplore}
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-zappy-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-zappy-700 sm:hidden">
            Explore stores <ArrowRight size={15} />
          </button>
        </div>
        <button type="button" onClick={onExplore}
          className="hidden h-12 shrink-0 items-center gap-2 rounded-full bg-zappy-600 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-zappy-700 sm:inline-flex">
          Explore stores <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}

/* Popular services near you */

function photoFor(s) {
  return servicePhoto(s) || AREA_PHOTO[s.code] || AREA_PHOTO[s.domainCode] || artFor(s.code, s.domainCode)?.still || null;
}

export function PopularServices({ services, onOpen, onViewAll }) {
  if (!services.length) return null;
  return (
    <section aria-labelledby="home-popular">
      <SectionTitle id="home-popular" title="Popular services near you" action="View all" onAction={onViewAll} />
      <Rail>
        {services.map((s) => {
          const photo = photoFor(s);
          const tint = tintFor(s.domainCode);
          const covers = s.coverage?.reduce((n, g) => n + (g.problems?.length || 0), 0) || 0;
          return (
            <button key={s.code} type="button" onClick={() => onOpen(s)}
              className="group flex w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-white text-left transition-colors hover:border-line-strong sm:w-auto">
              <span className={`relative block aspect-[16/10] w-full overflow-hidden ${tint.bg}`}>
                {photo
                  ? <img src={photo} alt="" loading="lazy" className={`h-full w-full transition-transform duration-300 group-hover:scale-[1.03] ${photo.startsWith('/characters/') ? 'object-contain p-3 mix-blend-multiply' : 'object-cover'}`} />
                  : <span className="flex h-full items-center justify-center"><img src={icon3dFor(s)} alt="" loading="lazy" className="h-[64%] w-auto object-contain" /></span>}
                {s.isPopular && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-accent-700 shadow-soft">Popular</span>
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3">
                <span className="line-clamp-1 text-[15px] font-bold text-ink-900">{s.name}</span>
                {(s.tagline || s.description) && <span className="line-clamp-2 text-[12px] leading-snug text-ink-500">{s.tagline || s.description}</span>}
                <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 text-[12px] font-semibold">
                  {s.available === true && <span className="flex items-center gap-1 text-success-700"><CheckCircle2 size={13} /> Available here</span>}
                  {s.available === false && <span className="text-ink-400">Coming to your area</span>}
                  {covers > 0 && <span className="text-ink-500">{covers} problems covered</span>}
                </span>
              </span>
            </button>
          );
        })}
      </Rail>
    </section>
  );
}

/* Service promos (the team's web design): two cards under Explore Services */

// Each card opens a live service here; a card whose services are not live at this address does not show.
const SERVICE_PROMOS = [
  {
    key: 'cleaning', codes: ['daily_cleaning', 'bathroom_balcony', 'sofa_mattress'], area: 'home_daily_help', photo: '/services/daily_cleaning.jpg',
    title: 'Home', accent: 'Deep Cleaning', line: 'Professional cleaning for a healthier, happier home.',
    card: 'bg-[#4B2A9B]', fade: 'from-[#4B2A9B]', titleTone: 'text-white', lineTone: 'text-white/90', accentTone: 'text-orange-400',
  },
  {
    key: 'ac', codes: ['appliance_repair'], photo: '/services/appliance_repair.jpg',
    title: 'AC Service', accent: '& Repair', line: 'Keep your home cool and comfortable.',
    card: 'bg-[#E8EFFC]', fade: 'from-[#E8EFFC]', titleTone: 'text-zappy-700', lineTone: 'text-ink-700', accentTone: 'text-orange-500',
  },
];

export function ServicePromos({ services, onOpen, onOpenArea }) {
  const byCode = new Map(services.map((s) => [s.code, s]));
  const cards = SERVICE_PROMOS
    .map((p) => ({ ...p, target: p.codes.map((c) => byCode.get(c)).find(Boolean) }))
    .filter((p) => p.target);
  if (!cards.length) return null;
  return (
    <section aria-label="Featured services" className={`grid gap-4 ${cards.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {cards.map((p) => (
        <button key={p.key} type="button" onClick={() => (p.area ? onOpenArea(p.area) : onOpen(p.target))}
          aria-label={`${p.title} ${p.accent}. ${p.line} Book now`}
          className={`group relative flex h-[190px] overflow-hidden rounded-[20px] text-left shadow-[0_2px_12px_-3px_rgba(16,24,40,0.12)] sm:h-[250px] lg:h-[280px] ${p.card}`}>
          <img src={p.photo} alt="" loading="lazy" decoding="async"
            className="absolute inset-y-0 right-0 h-full w-[52%] object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          {/* Solid up to where the photo starts (48%), so no edge shows; then it fades into the photo. */}
          <span aria-hidden="true" className={`absolute inset-0 bg-gradient-to-r ${p.fade} from-[48%] to-transparent to-[76%]`} />
          <span className="relative flex max-w-[62%] flex-col justify-center gap-2 p-5 sm:gap-3 sm:p-8">
            <span className={`text-[24px] font-extrabold italic leading-[1.05] tracking-[-0.02em] sm:text-[34px] lg:text-[40px] ${p.titleTone}`}>
              {p.title}<br /><span className={p.accentTone}>{p.accent}</span>
            </span>
            <span className={`text-[13px] leading-snug sm:text-[17px] ${p.lineTone}`}>{p.line}</span>
            <span className="mt-1 inline-flex h-10 items-center gap-2 self-start rounded-full bg-white px-5 text-[14px] font-bold text-ink-900 shadow-[0_6px_16px_-6px_rgba(16,24,40,0.35)] transition-colors group-hover:bg-zappy-50 sm:mt-2 sm:h-12 sm:px-7 sm:text-[17px]">
              Book Now <ArrowRight size={18} strokeWidth={2.4} />
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}

/* Campaign banners (admin) */

export function CampaignBanners({ ads, onOpen, onImageError }) {
  if (!ads.length) return null;
  return (
    <section aria-label="Campaigns">
      {ads.length === 1
        ? <PromoBanner ad={ads[0]} variant="campaign" onOpen={onOpen} onImageError={onImageError} />
        : (
          <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
            {ads.map((ad) => (
              <div key={ad._id} className="w-[88%] shrink-0 snap-start sm:w-auto">
                <PromoBanner ad={ad} variant="campaign" onOpen={onOpen} onImageError={onImageError} />
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

/* Explore local stores */

function StoreCard({ shop, onOpen }) {
  const services = (shop.services || []).map((x) => x.name).join(' · ') || shop.category;
  return (
    <button type="button" onClick={onOpen}
      className="group flex w-[230px] shrink-0 snap-start flex-col overflow-hidden rounded-card border border-line bg-white text-left transition-colors hover:border-line-strong sm:w-auto">
      <span className="relative block aspect-[16/10] w-full overflow-hidden bg-sunken">
        {shop.coverImageUrl
          ? <img src={shop.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          : <span className="flex h-full items-center justify-center"><Store size={30} strokeWidth={1.5} className="text-ink-300" /></span>}
        {/* Only verified shops are returned by /shops/nearby, so the badge is a fact. */}
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-success-700 shadow-soft">
          <ShieldCheck size={12} /> Verified
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-1 text-[15px] font-bold text-ink-900">{shop.businessName}</span>
        {/* A new shop's rating is the schema default, not a review: shown only once someone has reviewed it. */}
        {shop.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-700">
            <Star size={13} className="fill-amber-400 text-amber-400" /> {Number(shop.rating).toFixed(1)}
            <span className="font-normal text-ink-400">({shop.reviewCount})</span>
          </span>
        )}
        {services && <span className="line-clamp-2 text-[12px] leading-snug text-ink-500">{services}</span>}
        <span className="mt-auto pt-1 text-[12px] font-semibold">
          {shop.openNow === true && <span className="text-success-700">Open now{shop.todayHours?.closesAt ? ` · till ${shop.todayHours.closesAt}` : ''}</span>}
          {shop.openNow === false && <span className="text-ink-400">Closed now</span>}
          {shop.openNow == null && shop.completedJobs > 0 && <span className="text-ink-500">{shop.completedJobs} jobs done</span>}
        </span>
      </span>
    </button>
  );
}

export function LocalStores({ lat, lng, enabled, onOpenShop, onViewAll }) {
  const skip = !enabled || lat == null || lng == null;
  const { data, isLoading, isError } = useNearbyShopsQuery({ lat, lng, radiusKm: 10 }, { skip });
  if (skip || isError) return null;
  const shops = (data?.shops || []).slice(0, 8);

  return (
    <section aria-labelledby="home-stores">
      <SectionTitle id="home-stores" title="Explore local stores on" action={shops.length ? 'View all' : null} onAction={onViewAll}>
        <ZappyWordmark size={22} className="translate-y-[3px]" />
      </SectionTitle>
      {isLoading ? (
        <Rail>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-[230px] shrink-0 overflow-hidden rounded-card border border-line bg-white sm:w-auto" aria-hidden="true">
              <span className="block aspect-[16/10] animate-pulse bg-sunken" />
              <span className="block space-y-2 p-3"><span className="block h-3.5 w-3/4 animate-pulse rounded bg-sunken" /><span className="block h-3 w-1/2 animate-pulse rounded bg-sunken" /></span>
            </span>
          ))}
        </Rail>
      ) : shops.length ? (
        <Rail>{shops.map((s) => <StoreCard key={s._id} shop={s} onOpen={() => onOpenShop(s._id)} />)}</Rail>
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-card border border-dashed border-line-strong bg-white px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zappy-50 text-zappy-600"><MapPin size={18} /></span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ink-900">No verified stores within 10 km yet</span>
            <span className="block text-[13px] text-ink-500">New shops join every week. You can still book any service above.</span>
          </span>
        </div>
      )}
    </section>
  );
}

/* Offers & deals */

function couponHeadline(p) {
  return p.type === 'percent' ? `${p.discountValue}% OFF` : `${formatPaise(p.discountValue)} OFF`;
}

function couponTerms(p) {
  const parts = [];
  if (p.type === 'percent' && p.maxDiscountPaise) parts.push(`up to ${formatPaise(p.maxDiscountPaise)}`);
  if (p.minOrderPaise) parts.push(`on ${formatPaise(p.minOrderPaise)}+`);
  if (offerEnds(p)) parts.push(offerEnds(p));
  return parts.join(' · ');
}

const COUPON_FILLS = ['bg-zappy-600', 'bg-accent-600', 'bg-ink-900'];

export function OffersDeals({ ads, isAuthed, onOpenAd, onViewAll, onImageError }) {
  const { data } = useGetAvailablePromosQuery(undefined, { skip: !isAuthed });
  const promos = (data?.promos || []).filter((p) => !p.alreadyUsed).slice(0, 6);
  if (!ads.length && !promos.length) return null;

  async function copy(code) {
    try { await navigator.clipboard.writeText(code); toast.success(`${code} copied. Apply it at checkout.`); } catch { toast(code); }
  }

  return (
    <section aria-labelledby="home-offers">
      <SectionTitle id="home-offers" title="Offers & deals for you" action={isAuthed ? 'View all' : null} onAction={onViewAll} />
      <Rail cols="sm:grid-cols-2 lg:grid-cols-3">
        {ads.map((ad) => (
          <div key={ad._id} className="w-[270px] shrink-0 snap-start sm:w-auto">
            <PromoBanner ad={ad} variant="offer" onOpen={onOpenAd} onImageError={onImageError} />
          </div>
        ))}
        {promos.map((p, i) => (
          <button key={p.code} type="button" onClick={() => copy(p.code)}
            aria-label={`${couponHeadline(p)}, ${p.name}. Code ${p.code}. Copy code`}
            className={`relative flex h-[132px] w-[270px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-card p-4 text-left text-white sm:h-[150px] sm:w-auto sm:p-5 ${COUPON_FILLS[i % COUPON_FILLS.length]}`}>
            <span aria-hidden="true" className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold opacity-90">{p.name}</span>
              <span className="mt-0.5 block text-[24px] font-extrabold leading-none tracking-[-0.02em]">{couponHeadline(p)}</span>
              {couponTerms(p) && <span className="mt-1 block truncate text-[12px] opacity-85">{couponTerms(p)}</span>}
            </span>
            <span className="inline-flex self-start rounded-chip border border-dashed border-white/70 px-2 py-0.5 text-[12px] font-bold tracking-[0.12em]">{p.code}</span>
          </button>
        ))}
      </Rail>
    </section>
  );
}

/* Book again */

export function BookAgain({ items, onOpen, onViewAll }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="home-again">
      <SectionTitle id="home-again" title="Book again" action="View all" onAction={onViewAll} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ key, title, href, date, art }) => (
          <div key={key} className="flex items-center gap-3 rounded-card border border-line bg-white p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-zappy-50">
              {art ? <img src={art} alt="" loading="lazy" className="h-full w-full object-contain p-1 mix-blend-multiply" /> : <RotateCcw size={18} className="text-zappy-600" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold capitalize text-ink-900">{title}</span>
              <span className="block text-[12px] text-ink-500">{date ? `Last booked · ${fmtDay(date)}` : 'Booked before'}</span>
            </span>
            <button type="button" onClick={() => onOpen(href)}
              className="h-9 shrink-0 rounded-full border border-zappy-200 px-3.5 text-[13px] font-semibold text-zappy-700 transition-colors hover:bg-zappy-50">
              Book again
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* Recent activity */

const KIND_LABEL = { order: 'Service booking', repair: 'Repair', pet: 'Pet care', helping: 'Helping task' };

function ActivityIcon({ job }) {
  if (job.active) return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zappy-50 text-zappy-600"><Clock size={18} /></span>;
  if (job.outcome === 'completed') return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600"><CheckCircle2 size={18} /></span>;
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-400"><XCircle size={18} /></span>;
}

export function RecentActivity({ jobs, onOpen, onViewAll }) {
  if (!jobs.length) return null;
  return (
    <section aria-labelledby="home-activity">
      <SectionTitle id="home-activity" title="Your recent activity" action="All bookings" onAction={onViewAll} />
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
        {jobs.map((j) => (
          <li key={`${j.kind}:${j.id}`}>
            <button type="button" onClick={() => onOpen(j.href)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas">
              <ActivityIcon job={j} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold capitalize text-ink-900">{j.title}</span>
                  <span className="shrink-0 rounded-chip bg-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{KIND_LABEL[j.kind] || 'Booking'}</span>
                </span>
                <span className="block truncate text-[12px] text-ink-500">
                  {j.needsYou ? 'Needs your approval' : j.stage}{j.createdAt ? ` · ${fmtDay(j.createdAt)}` : ''}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-300" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
