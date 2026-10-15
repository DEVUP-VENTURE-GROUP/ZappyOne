import { useMemo } from 'react';
import { confettiPieces, offerHeadline, offerTerms } from '../../../customer/season';

/**
 * Spotlight scene: the season's offer, big, with a confetti burst. Only while
 * its promo code is live; it says exactly what the code gives.
 */
export default function SpotlightOffer({ offer, theme }) {
  const confetti = useMemo(() => confettiPieces([theme.accent, '#FFFFFF', theme.curtain, '#FBBF24']), [theme]);
  const terms = offerTerms(offer);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {confetti.map((c, i) => (
        <span key={i} aria-hidden="true" className="fz-confetti absolute top-0 rounded-[2px]"
          style={{ left: `${c.x}%`, width: c.w, height: c.h, background: c.color, transform: `rotate(${c.rot}deg)`, animationDelay: `${c.delay}ms`, animationDuration: `${c.dur}ms` }} />
      ))}
      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="fz-rise text-[11.5px] font-extrabold uppercase tracking-[0.22em]" style={{ color: theme.accent }}>{offer.name}</p>
        <p className="fz-pop text-[44px] font-black leading-none tracking-[-0.04em] sm:text-[56px]" style={{ color: theme.ink, animationDelay: '.15s' }}>{offerHeadline(offer)}</p>
        {terms && <p className="fz-rise mt-1 text-[13px]" style={{ color: theme.sub, animationDelay: '.35s' }}>{terms}</p>}
        <span className="fz-pop mt-2.5 rounded-xl border-2 border-dashed bg-white/80 px-3.5 py-1.5 text-[14px] font-extrabold tracking-[0.12em]"
          style={{ borderColor: theme.accent, color: theme.accent, animationDelay: '.5s' }}>
          {offer.code}
        </span>
      </div>
    </div>
  );
}
