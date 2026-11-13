import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * One admin-managed banner (an ad from the `home_banner` placement), drawn the
 * same way on the customer homepage and in the admin preview — so what the
 * admin approves is exactly what customers see.
 *
 *   variant  'hero' | 'campaign' | 'offer'
 *   device   'desktop' | 'mobile' forces that layout (admin preview);
 *            omitted, the banner is responsive (customer app).
 *   onOpen   called with the ad when the banner is tapped; omitted → not tappable.
 *   onImageError  called when the image fails to load — e.g. a signed link that
 *            outlived its 6-hour window — so the caller can fetch fresh links.
 *
 * The ads API stores a single image per banner, shown with `object-cover`
 * centred on every screen size, so the subject should sit in the middle third.
 */

const SIZES = {
  hero: {
    mobile: 'h-[188px] p-4',
    desktop: 'h-[340px] p-10',
    responsive: 'h-[188px] p-4 sm:h-[300px] sm:p-8 lg:h-[340px] lg:p-10',
  },
  campaign: {
    mobile: 'h-[164px] p-4',
    desktop: 'h-[220px] p-8',
    responsive: 'h-[164px] p-4 sm:h-[200px] sm:p-7 lg:h-[220px] lg:p-8',
  },
  offer: {
    mobile: 'h-[132px] p-4',
    desktop: 'h-[150px] p-5',
    responsive: 'h-[132px] p-4 sm:h-[150px] sm:p-5',
  },
};

const TITLE = {
  hero: { mobile: 'text-[20px]', desktop: 'text-[36px]', responsive: 'text-[20px] sm:text-[30px] lg:text-[36px]' },
  campaign: { mobile: 'text-[18px]', desktop: 'text-[28px]', responsive: 'text-[18px] sm:text-[24px] lg:text-[28px]' },
  offer: { mobile: 'text-[17px]', desktop: 'text-[19px]', responsive: 'text-[17px] sm:text-[19px]' },
};

const BODY = { mobile: 'line-clamp-1', desktop: 'line-clamp-2', responsive: 'line-clamp-1 sm:line-clamp-2' };

function Media({ src, variant, onError }) {
  const [broken, setBroken] = useState(false);
  const fail = () => { setBroken(true); onError?.(); };
  if (!src || broken) return null;
  if (variant === 'offer') {
    return (
      <img src={src} alt="" loading="lazy" onError={fail}
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[42%] object-cover" />
    );
  }
  return <img src={src} alt="" loading="lazy" onError={fail} className="absolute inset-0 h-full w-full object-cover" />;
}

export default function PromoBanner({ ad, variant = 'hero', device, onOpen, onImageError, active = true, className = '' }) {
  const c = ad?.content || {};
  const size = device || 'responsive';
  // Gradients append an alpha byte, so only a 6-digit hex is used as-is.
  const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback);
  const bg = hex(c.backgroundColor, '#1F4FD8');
  const fg = hex(c.textColor, '#FFFFFF');
  const hasImage = Boolean(c.imageUrl);
  const tappable = Boolean(onOpen && c.ctaLink);
  const showBody = variant !== 'offer' || size !== 'mobile';

  const inner = (
    <>
      {/* Keyed by URL: a refreshed signed link gets a fresh attempt. */}
      <Media key={c.imageUrl || 'none'} src={c.imageUrl} variant={variant} onError={onImageError} />
      {/* Scrim: keeps type legible on any photo; on a plain fill it adds depth. */}
      {variant !== 'offer' && (
        <span aria-hidden="true" className="absolute inset-0"
          style={{
            background: hasImage
              ? `linear-gradient(90deg, ${bg}F2 0%, ${bg}B3 38%, ${bg}00 72%)`
              : `linear-gradient(120deg, ${bg} 0%, ${bg}E6 55%, ${bg}B3 100%)`,
          }} />
      )}
      {variant === 'offer' && hasImage && (
        <span aria-hidden="true" className="absolute inset-y-0 right-0 w-[42%]"
          style={{ background: `linear-gradient(90deg, ${bg} 0%, ${bg}00 45%)` }} />
      )}
      <span className={`relative flex h-full flex-col justify-center ${variant === 'offer' ? 'max-w-[62%]' : 'max-w-[68%] sm:max-w-[58%]'}`}
        style={{ color: fg }}>
        {c.badgeText && (
          <span className="mb-2 inline-flex self-start rounded-chip px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]"
            style={{ background: `${fg}26`, color: fg }}>
            {c.badgeText}
          </span>
        )}
        <span className={`font-extrabold leading-[1.12] tracking-[-0.02em] [text-wrap:balance] ${TITLE[variant][size]}`}>
          {c.headline}
        </span>
        {showBody && c.body && (
          // One line on a phone (badge + two-line headline + button already fill it), two from tablet up.
          <span className={`mt-1.5 leading-snug opacity-90 ${BODY[size]} ${variant === 'hero' && size !== 'mobile' ? 'text-[13px] sm:text-[16px]' : 'text-[13px]'}`}>
            {c.body}
          </span>
        )}
        {c.ctaText && c.ctaLink && variant !== 'offer' && (
          <span className={`mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-white font-semibold text-ink-900 ${
            size === 'mobile' ? 'h-9 px-3.5 text-[13px]' : 'h-10 px-4 text-[14px] sm:h-11 sm:px-5'}`}>
            {c.ctaText} <ArrowRight size={15} />
          </span>
        )}
        {c.ctaText && c.ctaLink && variant === 'offer' && (
          <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold underline-offset-2">
            {c.ctaText} <ArrowRight size={13} />
          </span>
        )}
      </span>
    </>
  );

  const base = `relative block w-full overflow-hidden text-left ${variant === 'offer' ? 'rounded-card' : 'rounded-[20px]'} ${SIZES[variant][size]} ${className}`;

  if (!tappable) {
    return <div className={base} style={{ background: bg }} aria-hidden={!active || undefined}>{inner}</div>;
  }
  return (
    <button type="button" onClick={() => onOpen(ad)} tabIndex={active ? 0 : -1} aria-hidden={!active || undefined}
      aria-label={[c.headline, c.ctaText].filter(Boolean).join('. ')}
      className={`${base} transition-transform duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-600/25`}
      style={{ background: bg }}>
      {inner}
    </button>
  );
}
