import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import ServiceIllustration, { illustrationFor } from './ServiceIllustration';
import { promoBadge } from '../../lib/servicePromos';
import { startingPrice } from '../../lib/serviceFacets';
import { easeSoft } from '../../lib/animations';

/**
 * Mosaic tile — the bento presentation.
 *
 * Deliberately minimal: a spotlit illustration and the service name, nothing
 * else. No price row, no duration, no Book Now. The tile's whole job is to be
 * recognised at a glance and tapped; the detail page carries the commercial
 * detail and the booking CTA. That's also the flow this catalog was specced
 * around — browse → tap a service → details → Book Now.
 *
 * Two sizes drive the mosaic rhythm. `large` spans two grid columns and leads
 * the page; `small` is a quarter-width tile. `ServiceCatalogView` decides which
 * is which, so this component stays a pure presentation unit.
 *
 * The downlight cone is CSS rather than the illustration's own built-in
 * spotlight (turned off below), because at tile scale the in-SVG cone is too
 * tight to read — this one spills past the artwork the way the reference does.
 */

const tileVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.26, ease: easeSoft } },
};

const SPOTLIGHT =
  'radial-gradient(72% 58% at 50% -4%, rgba(245,158,11,0.20) 0%, rgba(245,158,11,0.07) 42%, rgba(245,158,11,0) 72%)';

function ServiceTile({ service, category, promo, size = 'small' }) {
  const large = size === 'large';
  const illustration = illustrationFor(service, category);
  const discount = promoBadge(promo);
  const price = large ? startingPrice(service) : null;

  return (
    <motion.div
      variants={tileVariants}
      className={large ? 'col-span-2' : 'col-span-1'}
    >
      <Link
        to={`/service/${service.code}`}
        className={`group relative flex h-full w-full flex-col items-center overflow-hidden rounded-[20px] border border-slate-200/70 bg-white text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[var(--cat-border)] hover:shadow-[0_20px_38px_-20px_var(--cat-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 motion-reduce:transform-none ${
          large ? 'h-[188px] p-3 sm:h-[212px] sm:p-4' : 'h-[136px] p-2 sm:h-[152px] sm:p-2.5'
        }`}
      >
        {/* Warm downlight, exactly as wide as the tile. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2/3" style={{ background: SPOTLIGHT }} />

        {(discount || service.isFeatured) && (
          <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
            style={
              discount
                ? { background: 'var(--cat-accent)', color: '#fff' }
                : { background: '#FEF3C7', color: '#B45309' }
            }
          >
            {!discount && <Zap size={8} strokeWidth={3.5} />}
            {discount || 'Popular'}
          </span>
        )}

        <span className="relative flex flex-1 items-center justify-center">
          <motion.span
            className="block drop-shadow-[0_8px_12px_rgba(15,23,42,0.10)]"
            whileHover={{ scale: 1.07, y: -2 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <ServiceIllustration
              name={illustration}
              size={large ? 84 : 50}
              spotlight={false}
            />
          </motion.span>
        </span>

        <span className="relative w-full">
          <span
            className={`block font-bold leading-tight text-navy-900 transition-colors group-hover:text-[var(--cat-accent)] ${
              large ? 'line-clamp-3 text-[13.5px] sm:text-[14.5px]' : 'line-clamp-3 text-[10.5px] sm:text-[11.5px]'
            }`}
          >
            {service.name}
          </span>
          {price && (
            <span className="mt-1 block text-[11px] font-semibold text-slate-400">
              from {price}
            </span>
          )}
        </span>
      </Link>
    </motion.div>
  );
}

export default memo(ServiceTile);
