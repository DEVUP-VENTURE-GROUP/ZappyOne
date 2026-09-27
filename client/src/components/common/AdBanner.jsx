import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { useGetActiveAdsQuery, useTrackAdImpressionMutation, useTrackAdClickMutation } from '../../services/api';
import { selectIsAuthed } from '../../modules/auth/authSlice';

/**
 * AdBanner — horizontally scrollable ad strip for the home screen.
 * Tracks impressions on mount (once per session per ad) and clicks on tap.
 * Only renders ads of type: banner, offer_card, home_card, sponsored_service.
 */
const DISPLAY_TYPES = new Set(['banner', 'offer_card', 'home_card', 'sponsored_service']);
const impressedSet = new Set(); // session-level dedup

export default function AdBanner({ className = '' }) {
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
