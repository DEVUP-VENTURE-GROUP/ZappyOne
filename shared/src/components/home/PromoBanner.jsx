import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

// One admin-managed home_banner ad, drawn the same on the customer home and in the admin preview; device forces a layout, omitted it is responsive.

const SIZES = {
  hero: { mobile: 'h-[188px] p-4', desktop: 'h-[340px] p-10', responsive: 'h-[188px] p-4 sm:h-[300px] sm:p-8 lg:h-[340px] lg:p-10' },
  campaign: { mobile: 'h-[164px] p-4', desktop: 'h-[220px] p-8', responsive: 'h-[164px] p-4 sm:h-[200px] sm:p-7 lg:h-[220px] lg:p-8' },
  offer: { mobile: 'h-[132px] p-4', desktop: 'h-[150px] p-5', responsive: 'h-[132px] p-4 sm:h-[150px] sm:p-5' },
};
const TITLE = {
  hero: { mobile: 'text-[20px]', desktop: 'text-[36px]', responsive: 'text-[20px] sm:text-[30px] lg:text-[36px]' },
  campaign: { mobile: 'text-[18px]', desktop: 'text-[28px]', responsive: 'text-[18px] sm:text-[24px] lg:text-[28px]' },
  offer: { mobile: 'text-[17px]', desktop: 'text-[19px]', responsive: 'text-[17px] sm:text-[19px]' },
};
const BODY = { mobile: 'line-clamp-1', desktop: 'line-clamp-2', responsive: 'line-clamp-1 sm:line-clamp-2' };
const IMAGE_WIDTH = { hero: 'w-[46%]', campaign: 'w-[44%]', offer: 'w-[40%]' };
const TEXT_WIDTH = { hero: 'max-w-[54%]', campaign: 'max-w-[56%]', offer: 'max-w-[60%]' };
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback);

function Media({ src, variant, onError }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  const fail = () => { setBroken(true); onError?.(); };
  return <img src={src} alt="" loading="lazy" onError={fail} className={`pointer-events-none absolute inset-y-0 right-0 h-full object-cover ${IMAGE_WIDTH[variant]}`} />;
}

function Badge({ text, fg }) {
  if (!text) return null;
  return (
    <span className="mb-2 inline-flex self-start rounded-chip px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ background: `${fg}26`, color: fg }}>
      {text}
    </span>
  );
}

function Body({ text, variant, size }) {
  if (!text || (variant === 'offer' && size === 'mobile')) return null;
  const big = variant === 'hero' && size !== 'mobile';
  return <span className={`mt-1.5 leading-snug opacity-90 ${BODY[size]} ${big ? 'text-[13px] sm:text-[16px]' : 'text-[13px]'}`}>{text}</span>;
}

function Cta({ c, variant, size }) {
  if (!c.ctaText || !c.ctaLink) return null;
  if (variant === 'offer') {
    return <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold">{c.ctaText} <ArrowRight size={13} /></span>;
  }
  const dims = size === 'mobile' ? 'h-9 px-3.5 text-[13px]' : 'h-10 px-4 text-[14px] sm:h-11 sm:px-5';
  return <span className={`mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-white font-semibold text-ink-900 ${dims}`}>{c.ctaText} <ArrowRight size={15} /></span>;
}

function Content({ c, variant, size, fg }) {
  const width = c.imageUrl ? TEXT_WIDTH[variant] : 'max-w-[80%]';
  return (
    <span className={`relative flex h-full flex-col justify-center ${width}`} style={{ color: fg }}>
      <Badge text={c.badgeText} fg={fg} />
      <span className={`font-extrabold leading-[1.12] tracking-[-0.02em] [text-wrap:balance] ${TITLE[variant][size]}`}>{c.headline}</span>
      <Body text={c.body} variant={variant} size={size} />
      <Cta c={c} variant={variant} size={size} />
    </span>
  );
}

export default function PromoBanner({ ad, variant = 'hero', device, onOpen, onImageError, active = true, className = '' }) {
  const c = ad?.content || {};
  const size = device || 'responsive';
  const bg = hex(c.backgroundColor, '#1F4FD8');
  const fg = hex(c.textColor, '#FFFFFF');
  const radius = variant === 'offer' ? 'rounded-card' : 'rounded-[20px]';
  const base = `relative block w-full overflow-hidden text-left ${radius} ${SIZES[variant][size]} ${className}`;
  // Finished artwork (the bundled banners) carries its own words: the image fills the banner.
  const inner = ad?.fullImage ? <img src={c.imageUrl} alt={c.headline || ''} loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : (
    <>
      {/* Keyed by URL: a refreshed signed link gets a fresh attempt. */}
      <Media key={c.imageUrl || 'none'} src={c.imageUrl} variant={variant} onError={onImageError} />
      <Content c={c} variant={variant} size={size} fg={fg} />
    </>
  );
  if (!onOpen || !c.ctaLink) {
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
