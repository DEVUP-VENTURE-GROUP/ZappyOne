import { motion } from 'framer-motion';
import { ArrowRight, BadgePercent, Sparkles } from 'lucide-react';
import ServiceIllustration from './ServiceIllustration';
import { RippleLayer, useRipple } from './Ripple';
import { promoBadge, promoUrgency } from '../../lib/servicePromos';
import { reducedMotion, easeSoft } from '../../lib/animations';

/**
 * Category hero banner.
 *
 * Two modes, one component:
 *   • offer  — a real, currently-redeemable promo from `/promos/available`,
 *              showing its actual code, discount and expiry.
 *   • promise — the category's own value proposition when no promo applies.
 *
 * It never renders an invented discount. If the promo API is empty or the user
 * has used everything up, the banner gracefully becomes the promise variant
 * rather than inventing "20% OFF" to fill the space.
 */

export default function FeaturedBanner({ category, promo, onCta }) {
  const { ripples, spawn } = useRipple();
  const offer = promo ? promoBadge(promo) : null;
  const urgency = promo ? promoUrgency(promo) : null;
  const copy = category.banner;

  if (!offer && !copy) return null;

  const eyebrow = offer ? 'Limited-time offer' : copy.eyebrow;
  const title = offer ? `${offer} on\n${category.title.toLowerCase()}` : copy.title;
  const body = offer
    ? promo.description || `Apply code ${promo.code} at checkout. ${promo.name}.`
    : copy.body;
  const cta = offer ? 'Book and save' : copy.cta;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeSoft }}
      className="relative overflow-hidden rounded-[28px] p-5 text-white sm:p-7"
      style={{
        background:
          'linear-gradient(135deg, var(--cat-deep) 0%, var(--cat-accent) 130%)',
      }}
      aria-label={offer ? 'Current offer' : 'About this category'}
    >
      {/* Depth: two soft light pools, no images to download. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full opacity-30 blur-3xl"
        style={{ background: 'rgba(255,255,255,0.55)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ background: 'rgba(255,255,255,0.5)' }}
      />

      <div className="relative flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-sm">
            {offer ? <BadgePercent size={11} strokeWidth={3} /> : <Sparkles size={11} strokeWidth={3} />}
            {eyebrow}
          </span>

          <h2 className="mt-2.5 whitespace-pre-line text-[22px] font-black leading-[1.15] tracking-tight sm:text-[27px]">
            {title}
          </h2>

          <p className="mt-2 max-w-md text-[13px] font-medium leading-relaxed text-white/80 sm:text-sm">
            {body}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => { spawn(e); onCta?.(promo); }}
              className="group relative overflow-hidden rounded-full bg-white px-5 py-2.5 text-[13px] font-black text-[var(--cat-deep)] shadow-lg shadow-black/10 transition-transform duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transform-none"
            >
              <RippleLayer ripples={ripples} color="rgba(15,23,42,0.10)" />
              <span className="relative z-10 flex items-center gap-1.5">
                {cta}
                <ArrowRight
                  size={15}
                  strokeWidth={3}
                  className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none"
                />
              </span>
              {/* Slow sheen sweep — the one looping animation on the page. */}
              {!reducedMotion && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg] bg-white/60"
                  animate={{ left: ['-60%', '160%'] }}
                  transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
                />
              )}
            </button>

            {promo && (
              <span className="rounded-full border border-dashed border-white/45 px-3 py-2 text-[12px] font-black tracking-wider">
                {promo.code}
              </span>
            )}
            {urgency && (
              <span className="text-[11.5px] font-bold text-white/70">{urgency}</span>
            )}
          </div>
        </div>

        {/* Category illustration, re-inked white so it reads on the gradient.
            The spotlight is dropped here — it needs a light surface to work. */}
        <motion.div
          aria-hidden
          className="hidden shrink-0 sm:block"
          style={{
            '--ill-ink': 'rgba(255,255,255,0.55)',
            '--ill-body': '#FFFFFF',
            '--ill-tint': 'rgba(255,255,255,0.30)',
            '--ill-pale': 'rgba(255,255,255,0.75)',
          }}
          animate={reducedMotion ? {} : { y: [-5, 5, -5] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ServiceIllustration name={category.illustration} size={116} spotlight={false} />
        </motion.div>
      </div>
    </motion.section>
  );
}
