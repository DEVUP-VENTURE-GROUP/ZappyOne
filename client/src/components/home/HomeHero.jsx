/**
 * The homepage hero.
 * ----------------------------------------------------------------------------
 * Home had no hero. It opened on a text headline and went straight into
 * discovery, so the first screen never said what Zappy is — a visitor had to
 * infer the product from a row of service cards. This is the card that answers
 * "what is this" before it answers "what can I book".
 *
 * ── ONE COMPOSITION ────────────────────────────────────────────────────────
 * Not `isMobile ? … : …`. The same markup stacks on a phone and splits into two
 * columns at `lg`, because two layouts meant two places to fix anything and two
 * chances for them to disagree — which is exactly how Home ended up with a
 * greeting on one branch and a fabricated "48 workers live" badge on the other.
 *
 * ── THE TRUST STRIP IS INSIDE THE HERO ─────────────────────────────────────
 * It used to sit at the very bottom of the page, roughly two thousand pixels
 * below the fold, which is the one place a trust signal cannot do its job.
 *
 * ── NOTHING HERE IS A MEASUREMENT ──────────────────────────────────────────
 * The four strip items are capability statements: things the product does,
 * which are true without an API behind them. No count, rating, response time or
 * satisfaction percentage appears here, because we have no source for any of
 * them and an invented trust signal is worse than none.
 * ----------------------------------------------------------------------------
 */

import { motion } from 'framer-motion';
import { ShieldCheck, Tag, Clock, CreditCard } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import ZappyPro from './ZappyPro';

const TRUST = [
  { Icon: ShieldCheck, k: 'home.trust.verified', fallback: 'Verified\nProfessionals' },
  { Icon: Tag,         k: 'home.trust.pricing',  fallback: 'Upfront\nPricing' },
  { Icon: Clock,       k: 'home.trust.ontime',   fallback: 'On-time\nService' },
  { Icon: CreditCard,  k: 'home.trust.payments', fallback: 'Secure\nPayments' },
];

function TrustStrip() {
  const t = useT();
  return (
    <div className="relative rounded-[20px] bg-white/95 px-1.5 py-2.5 shadow-[0_10px_30px_-12px_rgba(30,41,59,0.28)] ring-1 ring-white/70 backdrop-blur-sm sm:px-2">
      {/* 2×2 on a phone, 4-up from `sm`. The divider only appears once the row
          is a single line — between rows of a 2×2 grid it reads as a mistake. */}
      <ul className="grid grid-cols-2 sm:grid-cols-4">
        {TRUST.map(({ Icon, k, fallback }, i) => {
          const label = t(k, fallback);
          const [first, ...rest] = label.split('\n');
          return (
            <li
              key={k}
              className={`flex items-center gap-2 px-2 py-1.5 sm:px-2.5 ${
                i > 0 ? 'sm:border-l sm:border-slate-200/80' : ''
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-indigo-50 sm:h-8 sm:w-8">
                <Icon size={15} strokeWidth={2.2} className="text-indigo-600" />
              </span>
              <span className="min-w-0 text-[10.5px] font-bold leading-[1.25] tracking-[-0.01em] text-[#0F172A] sm:text-[11.5px]">
                {first}
                {rest.length ? (
                  <>
                    <br />
                    {rest.join(' ')}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function HomeHero() {
  const t = useT();

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[26px] ring-1 ring-indigo-100/80 sm:rounded-[28px]"
      style={{ background: 'linear-gradient(135deg,#EEF1FE 0%,#E7EAFD 45%,#EDE9FE 100%)' }}
    >
      {/* Soft lighting. Purely decorative, and kept behind everything so no
          blur lands on top of text. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-indigo-300/25 blur-3xl" />
      </div>

      <div className="relative px-4 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pt-10">
        <div className="flex items-end gap-1 sm:gap-2 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-6">
          {/* ── Copy ───────────────────────────────────────────────────────
              `shrink-0` below `lg`: the headline does not wrap, so this column
              takes exactly the width its longest line needs and the figure
              takes whatever is left. That way the figure grows with the screen
              — it was pinned at 118px, which looked right at 390 and undersized
              at 430 — without ever squeezing the headline. */}
          <div className="min-w-0 shrink-0 pb-2 lg:shrink lg:pb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.13em] text-indigo-500 sm:text-[11px]">
              {t('home.hero.eyebrow', 'Home services, made simple')}
            </p>

            {/* Three lines, deliberately. The reference's headline is a
                staircase; a single reflowing sentence loses that rhythm, and
                the middle line is the one that carries the colour.
                `whitespace-nowrap` holds the staircase together: at 390px the
                copy column is about 190px and "On demand." at this weight is
                close enough to that to wrap, which turned three lines into
                six and buried the figure. */}
            <h1 className="mt-2 whitespace-nowrap text-[27px] font-black leading-[1.08] tracking-[-0.038em] text-[#0F172A] sm:text-[33px] lg:text-[44px] xl:text-[52px]">
              <span className="block">{t('home.hero.line1', 'Your needs.')}</span>
              <span className="block text-indigo-600">{t('home.hero.line2', 'Our experts.')}</span>
              <span className="block">{t('home.hero.line3', 'On demand.')}</span>
            </h1>

            {/* The cap matters because the column is `shrink-0`: without it the
                column takes this sentence's full max-content width — about
                300px — and the figure is squeezed to a sliver. Capped, the
                column is governed by the headline instead and the subtitle
                wraps under it. */}
            <p className="mt-2.5 max-w-[20ch] text-[12.5px] font-medium leading-[1.4] text-slate-600 sm:max-w-[26ch] sm:text-[14px] lg:max-w-[34ch] lg:text-[16px]">
              {t('home.hero.sub', 'Trusted professionals at your doorstep in minutes.')}
            </p>
          </div>

          {/* ── Figure ───────────────────────────────────────────────────────
              Bottom-aligned and clipped by the card, so the feet meet the
              hero's lower edge the way they do in the reference rather than
              floating in the middle of the panel. `w-[45%]` keeps the split
              the brief asks for without ever crowding the headline, and the
              whole box is one element so a raster render drops straight in. */}
          <div className="relative -mb-px flex min-w-0 flex-1 items-end justify-center self-end lg:w-full">
            <ZappyPro className="h-[162px] w-full sm:h-[210px] lg:h-[340px] xl:h-[390px]" />
          </div>
        </div>
      </div>

      {/* The strip overlaps the hero's bottom edge, which is what makes it read
          as part of the card rather than as the next section. */}
      <div className="relative px-3 pb-3 sm:px-4 sm:pb-4 lg:px-10 lg:pb-8">
        <TrustStrip />
      </div>
    </motion.section>
  );
}
