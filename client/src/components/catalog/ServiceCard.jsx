import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Clock, Heart, ListChecks, Star, Zap } from 'lucide-react';
import ServiceIllustration, { illustrationFor } from './ServiceIllustration';
import { RippleLayer, useRipple } from './Ripple';
import useFavorites from '../../hooks/useFavorites';
import { promoBadge } from '../../lib/servicePromos';
import { formatDuration, serviceBlurb, startingPrice } from '../../lib/serviceFacets';
import { easeSoft } from '../../lib/animations';

/**
 * The catalog's detail-rich card: illustration tile beside the copy, with
 * signals, price and a Book Now. Dense enough for verticals with many similar
 * services (phones, laptops, home trades).
 *
 * Verticals whose `cardStyle` is 'mosaic' render `ServiceTile` instead — a
 * minimal bento tile. `ServiceCatalogView` picks between them.
 *
 * Interaction model: the card body is a stretched link to the detail page,
 * with the favourite toggle and Book Now raised above it — no nested buttons
 * (invalid HTML, breaks keyboard traversal), so screen readers get exactly
 * three targets per card.
 *
 * Every number shown is real: price and duration from the catalog row, the
 * checklist count from its admin-defined checklist, the discount badge only
 * from a live promo the user can redeem. Rating and bookings render only when
 * the API supplies them.
 */

export const cardVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: easeSoft } },
};

/** Discount pill — same mark in both layouts, positioned by the caller. */
function DiscountBadge({ label, className = '' }) {
  if (!label) return null;
  return (
    <span
      className={`rounded-full bg-[var(--cat-accent)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm ${className}`}
    >
      {label}
    </span>
  );
}

function FavoriteButton({ saved, name, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className={`z-20 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-400 backdrop-blur-sm transition-colors hover:border-rose-200 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] ${className}`}
    >
      <Heart size={15} strokeWidth={2.4} className={saved ? 'fill-rose-500 text-rose-500' : ''} />
    </button>
  );
}

function Signals({ rating, bookings, duration, checks }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] font-semibold text-slate-500">
      {rating && (
        <span className="flex items-center gap-1 text-navy-900">
          <Star size={12} strokeWidth={3} className="fill-accent-500 text-accent-500" />
          {rating.toFixed(1)}
          {bookings ? (
            <span className="font-medium text-slate-400">({bookings.toLocaleString('en-IN')})</span>
          ) : null}
        </span>
      )}
      {duration && (
        <span className="flex items-center gap-1">
          <Clock size={12} strokeWidth={2.6} className="text-slate-400" />
          {duration}
        </span>
      )}
      {checks > 0 && (
        <span className="flex items-center gap-1">
          <ListChecks size={12} strokeWidth={2.6} className="text-slate-400" />
          {checks}-point checklist
        </span>
      )}
    </div>
  );
}

function PriceFooter({ price, ripples, onBook }) {
  return (
    <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-100 pt-3.5 sm:pt-4">
      <div className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          {price ? 'Starting at' : 'Pricing'}
        </span>
        <span className="block text-[19px] font-black leading-tight text-navy-900">
          {price || 'On inspection'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onBook}
          className="relative z-20 overflow-hidden rounded-full bg-[var(--cat-accent)] px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_6px_16px_-6px_var(--cat-glow)] transition-transform duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 motion-reduce:transform-none"
        >
          <RippleLayer ripples={ripples} />
          Book now
        </button>
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all duration-300 group-hover:border-[var(--cat-accent)] group-hover:bg-[var(--cat-tint)] group-hover:text-[var(--cat-accent)]"
        >
          <ArrowUpRight size={16} strokeWidth={2.6} />
        </span>
      </div>
    </div>
  );
}

function ServiceCard({ service, category, promo, onBook }) {
  const nav = useNavigate();
  const { isFavorite, toggle } = useFavorites();
  const { ripples, spawn } = useRipple();

  const illustration = illustrationFor(service, category);
  const price = startingPrice(service);
  const duration = formatDuration(service.estimatedDurationMinutes);
  const checks = Array.isArray(service.checklist) ? service.checklist.length : 0;
  const discount = promoBadge(promo);
  const saved = isFavorite(service.code);
  const rating = Number(service.rating) || null;
  const bookings = Number(service.bookingsCount ?? service.completedCount) || null;

  const handleBook = (event) => {
    event.preventDefault();
    event.stopPropagation();
    spawn(event);
    // Straight into the existing booking flow — routing/business logic untouched.
    window.setTimeout(() => (onBook ? onBook(service) : nav(`/book/${service.code}`)), 90);
  };

  const handleFavorite = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(service.code);
  };

  const stretchedLink = (
    <Link
      to={`/service/${service.code}`}
      className="absolute inset-0 z-10 rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2"
      aria-label={`${service.name} — view details`}
    />
  );

  const featuredPill = service.isFeatured && (
    <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-accent-700">
      <Zap size={10} strokeWidth={3} /> Popular
    </span>
  );

  /* ── Compact: icon beside copy (default) ───────────────────────────────── */
  return (
    <motion.article
      variants={cardVariants}
      className="group relative flex h-full flex-col rounded-[24px] border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[var(--cat-border)] hover:shadow-[0_22px_44px_-18px_var(--cat-glow)] focus-within:-translate-y-1 focus-within:shadow-[0_22px_44px_-18px_var(--cat-glow)] motion-reduce:transform-none sm:p-5"
    >
      {stretchedLink}

      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <div
            className="flex h-[62px] w-[62px] items-center justify-center rounded-[18px] transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transform-none"
            style={{ background: 'var(--cat-tint)' }}
          >
            <ServiceIllustration name={illustration} size={42} />
          </div>
          <DiscountBadge label={discount} className="absolute -left-1.5 -top-2" />
        </div>

        <div className="min-w-0 flex-1 pr-8">
          {featuredPill}
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-navy-900 transition-colors group-hover:text-[var(--cat-accent)] sm:text-base">
            {service.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-relaxed text-slate-500">
            {serviceBlurb(service)}
          </p>
        </div>
      </div>

      <FavoriteButton
        saved={saved}
        name={service.name}
        onToggle={handleFavorite}
        className="absolute right-3 top-3 sm:right-4 sm:top-4"
      />

      <div className="mt-3.5">
        <Signals rating={rating} bookings={bookings} duration={duration} checks={checks} />
      </div>

      <PriceFooter price={price} ripples={ripples} onBook={handleBook} />
    </motion.article>
  );
}

export default memo(ServiceCard);
