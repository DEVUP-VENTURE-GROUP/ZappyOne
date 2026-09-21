import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { useGetActiveAdsQuery, useTrackAdImpressionMutation, useTrackAdClickMutation } from '../../services/api';
import { selectIsAuthed } from '../../modules/auth/authSlice';

/**
 * AdBanner — real promotional content from `GET /ads/active`, or nothing.
 *
 * Tracks impressions on mount (once per session per ad) and clicks on tap.
 * Only renders ads of type: banner, offer_card, home_card, sponsored_service.
 *
 * Two presentations over one data source:
 *
 *   variant="strip"    — the original horizontally scrollable row of small ads.
 *   variant="featured" — the home page's single wide promotion card. It shows
 *                        the FIRST eligible ad only; the reference composition
 *                        has one promotional slot, and a row of three competing
 *                        offers is what the old home page did.
 *
 * Both share the impression/click tracking and the empty behaviour, because
 * "no active ad" must render nothing rather than fall back to invented copy.
 * There is no placeholder promotion anywhere in this file.
 */
const DISPLAY_TYPES = new Set(['banner', 'offer_card', 'home_card', 'sponsored_service']);
const impressedSet = new Set(); // session-level dedup

export default function AdBanner({ className = '', variant = 'strip' }) {
  const nav = useNavigate();
  const isAuthed = useSelector(selectIsAuthed);
  const { data } = useGetActiveAdsQuery(undefined, { skip: !isAuthed });
  const [trackImpression] = useTrackAdImpressionMutation();
  const [trackClick] = useTrackAdClickMutation();
  const trackedRef = useRef(new Set());

  const ads = (data?.ads || []).filter((a) => DISPLAY_TYPES.has(a.type));

  // Fire impression once per session per ad
  useEffect(() => {
    if (!ads.length) return;
    ads.forEach((ad) => {
      const key = String(ad._id);
      if (!impressedSet.has(key)) {
        impressedSet.add(key);
        trackImpression(key);
      }
    });
  }, [ads.length]); // eslint-disable-line

  if (!ads.length) return null;

  function handleClick(ad) {
    trackClick(String(ad._id));
    if (ad.content?.ctaLink) {
      if (ad.content.ctaLink.startsWith('http')) {
        window.open(ad.content.ctaLink, '_blank', 'noopener');
      } else {
        nav(ad.content.ctaLink);
      }
    }
  }

  /* ── Featured: one wide card ─────────────────────────────────────────── */
  if (variant === 'featured') {
    const ad = ads[0];
    const c = ad.content || {};
    const fg = c.textColor || '#FFFFFF';
    return (
      <motion.button
        onClick={() => handleClick(ad)}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.99 }}
        className={`group relative block w-full overflow-hidden rounded-[22px] text-left shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`}
        style={{ background: c.backgroundColor || '#4F46E5' }}
      >
        {c.imageUrl && (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-45 transition-transform duration-500 group-hover:scale-[1.03]"
            style={{ backgroundImage: `url(${c.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}
        {/* Keeps the copy legible over whatever photograph an operator uploads. */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />

        <div className="relative z-10 flex min-h-[150px] flex-col justify-center gap-1.5 p-5 sm:min-h-[180px] sm:p-7 lg:min-h-[200px] lg:p-9">
          {c.badgeText && (
            <span
              className="w-max rounded-full px-2.5 py-1 text-[9.5px] font-black uppercase tracking-[0.14em]"
              style={{ background: 'rgba(255,255,255,0.22)', color: fg }}
            >
              {c.badgeText}
            </span>
          )}
          {c.headline && (
            <p
              className="max-w-[22ch] text-[22px] font-black leading-[1.08] tracking-[-0.03em] sm:text-[28px] lg:text-[34px]"
              style={{ color: fg }}
            >
              {c.headline}
            </p>
          )}
          {c.body && (
            <p className="max-w-[40ch] text-[12px] font-medium opacity-85 sm:text-[14px]" style={{ color: fg }}>
              {c.body}
            </p>
          )}
          {c.ctaText && (
            <span
              className="mt-2 inline-flex w-max items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12.5px] font-black text-slate-900 shadow-sm sm:text-[13.5px]"
            >
              {c.ctaText}
              <ArrowRight size={14} strokeWidth={2.8} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>

        <span
          className="absolute right-3 top-3 z-10 text-[8.5px] font-bold uppercase tracking-[0.18em] opacity-60"
          style={{ color: fg }}
        >
          Ad
        </span>
      </motion.button>
    );
  }

  /* ── Strip: the original scrollable row ──────────────────────────────── */
  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
        {ads.map((ad) => (
          <motion.button
            key={ad._id}
            onClick={() => handleClick(ad)}
            className="shrink-0 rounded-2xl overflow-hidden relative w-64 h-28 text-left"
            style={{ background: ad.content?.backgroundColor || '#2563EB' }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Background image */}
            {ad.content?.imageUrl && (
              <div
                className="absolute inset-0 opacity-20"
                style={{ backgroundImage: `url(${ad.content.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}

            <div className="relative z-10 p-4 flex flex-col h-full justify-between">
              <div>
                {ad.content?.badgeText && (
                  <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-1.5"
                    style={{ background: 'rgba(255,255,255,0.25)', color: ad.content.textColor || '#fff' }}>
                    {ad.content.badgeText}
                  </span>
                )}
                <p className="text-sm font-bold leading-tight" style={{ color: ad.content?.textColor || '#fff' }}>
                  {ad.content?.headline}
                </p>
                {ad.content?.body && (
                  <p className="text-[10px] mt-0.5 opacity-75 line-clamp-1" style={{ color: ad.content?.textColor || '#fff' }}>
                    {ad.content.body}
                  </p>
                )}
              </div>
              {ad.content?.ctaText && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[10px] font-bold" style={{ color: ad.content?.textColor || '#fff' }}>
                    {ad.content.ctaText}
                  </span>
                  <ExternalLink size={9} style={{ color: ad.content?.textColor || '#fff' }} />
                </div>
              )}
            </div>

            {/* Sponsored label */}
            <div className="absolute top-2 right-2 text-[8px] font-bold uppercase tracking-widest opacity-50" style={{ color: ad.content?.textColor || '#fff' }}>
              AD
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
