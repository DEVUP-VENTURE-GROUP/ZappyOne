import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
import { useGetAvailablePromosQuery, useGetEventCategoriesQuery } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';

/**
 * The quieter rows of Home. Each renders only when it has something real to
 * show; an empty row is worse than no row.
 */

export function SectionTitle({ id, title, action, onAction }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[17px] font-bold text-navy sm:text-[20px]">{title}</h2>
      {action && (
        <button type="button" onClick={onAction} className="flex shrink-0 items-center text-[13px] font-semibold text-zappy-600 hover:text-zappy-800">
          {action} <ChevronRight size={15} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

/** Scrolls sideways on a phone, lays out as a grid when there's room. */
function Row({ children, cols = 'sm:grid-cols-2 lg:grid-cols-3' }) {
  return (
    <div className={`-mx-4 mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:scroll-px-0 ${cols}`}>
      {children}
    </div>
  );
}

function offerHeadline(p) {
  if (p.type === 'percent') return `${p.discountValue}% off`;
  return `${formatPaise(p.discountValue)} off`;
}

function offerTerms(p) {
  const parts = [];
  if (p.type === 'percent' && p.maxDiscountPaise) parts.push(`up to ${formatPaise(p.maxDiscountPaise)}`);
  if (p.minOrderPaise) parts.push(`on ${formatPaise(p.minOrderPaise)}+`);
  return parts.join(', ');
}

/** Live codes this customer can still use. Tap the code to copy it. */
export function OffersRail({ isAuthed }) {
  const { data } = useGetAvailablePromosQuery(undefined, { skip: !isAuthed });
  const promos = (data?.promos || []).filter((p) => !p.alreadyUsed);
  if (!promos.length) return null;

  async function copy(code) {
    try { await navigator.clipboard.writeText(code); toast.success(`${code} copied. Apply it at checkout.`); } catch { toast(code); }
  }

  return (
    <section aria-labelledby="home-offers">
      <SectionTitle id="home-offers" title="Offers" />
      <Row>
        {promos.slice(0, 6).map((p) => (
          <button key={p.code} type="button" onClick={() => copy(p.code)}
            className="relative flex w-[270px] shrink-0 snap-start overflow-hidden rounded-xl bg-white text-left sm:w-auto"
            aria-label={`${offerHeadline(p)}, code ${p.code}. Copy code`}>
            <span className="flex w-[92px] shrink-0 flex-col justify-center bg-accent-500 px-3 py-4 text-white">
              <span className="text-[20px] font-bold leading-none">{offerHeadline(p).split(' ')[0]}</span>
              <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-90">off</span>
            </span>
            {/* perforation */}
            <span className="absolute left-[86px] top-0 h-full border-l-2 border-dotted border-white" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
              <span className="truncate text-[14px] font-semibold text-navy">{p.name}</span>
              {offerTerms(p) && <span className="text-[12px] text-slate-500">{offerTerms(p)}</span>}
              <span className="mt-1.5 text-[12px] font-bold tracking-[0.12em] text-accent-700">{p.code}</span>
            </span>
          </button>
        ))}
      </Row>
    </section>
  );
}

/** One tap back to something the customer booked before. */
/** Things they've had done before, one tap from booking again. */
export function BookAgainRail({ items, onOpen }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="home-again">
      <SectionTitle id="home-again" title="Book again" />
      <Row cols="sm:grid-cols-3">
        {items.map(({ key, title, href, date }) => (
          <button key={key} type="button" onClick={() => onOpen(href)}
            className="flex w-[200px] shrink-0 snap-start items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left sm:w-auto">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold capitalize text-navy">{title}</span>
              <span className="block text-[12px] text-slate-500">
                {date ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Before'}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold text-zappy-600">Rebook</span>
          </button>
        ))}
      </Row>
    </section>
  );
}

/** Event décor themes, as published in admin. */
export function EventsRail() {
  const nav = useNavigate();
  const { data } = useGetEventCategoriesQuery();
  const cats = data?.categories || [];
  if (!cats.length) return null;
  return (
    <section aria-labelledby="home-events">
      <SectionTitle id="home-events" title="Celebrations & décor" action="See all" onAction={() => nav('/events')} />
      <Row cols="sm:grid-cols-4 lg:grid-cols-6">
        {/* A taste on Home; "See all" has the rest. */}
        {cats.slice(0, 6).map((c) => (
          <button key={c.slug} type="button" onClick={() => nav(`/events/browse?category=${c.slug}`)}
            className="group w-[128px] shrink-0 snap-start text-left sm:w-auto">
            {c.coverImage ? (
              <>
                <span className="block aspect-[4/5] overflow-hidden rounded-xl bg-slate-200">
                  <img src={c.coverImage} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </span>
                <span className="mt-1.5 block truncate text-[13px] font-medium text-navy">{c.name}</span>
              </>
            ) : (
              // No photo uploaded yet: the name carries the tile rather than an empty box.
              <span className="flex aspect-[4/3] items-end rounded-xl bg-[#FCEFE3] p-3">
                <span className="text-[15px] font-semibold leading-tight text-[#7A3E12]">{c.name}</span>
              </span>
            )}
          </button>
        ))}
      </Row>
    </section>
  );
}

export function NearbyShopsLink() {
  const nav = useNavigate();
  return (
    <button type="button" onClick={() => nav('/nearby-shops')}
      className="flex w-full items-center justify-between gap-4 rounded-xl bg-white px-4 py-3.5 text-left">
      <span>
        <span className="block text-[15px] font-semibold text-navy">Prefer to walk in?</span>
        <span className="block text-[13px] text-slate-500">See verified repair shops near you</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-slate-400" />
    </button>
  );
}
