import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, ExternalLink } from 'lucide-react';
import { useGetAdsByPlacementQuery, useTrackAdImpressionMutation, useTrackAdClickMutation } from '@shared/services/api';

/**
 * CrossSellBanner — shows contextual sponsored add-ons.
 * Used on: booking success page, order tracking page, detail page.
 *
 * Props:
 *   placement  'booking_success' | 'order_tracking' | 'detail_cross_sell'
 *   categoryId string — context category for relevance
 *   city       string
 *   title      string — section heading
 */
export default function CrossSellBanner({ placement, categoryId, city, title = 'You might also like' }) {
  const nav = useNavigate();
  const { data } = useGetAdsByPlacementQuery({ placement, category: categoryId, city }, { skip: !placement });
  const [trackImpression] = useTrackAdImpressionMutation();
  const [trackClick]      = useTrackAdClickMutation();

  const ads = data?.ads || [];

  useEffect(() => {
    ads.forEach(ad => trackImpression({ id: String(ad._id), placement }).catch(() => {}));
  }, [ads.length]);

  if (!ads.length) return null;

  function handleClick(ad) {
    trackClick({ id: String(ad._id), placement }).catch(() => {});
    if (ad.content?.ctaLink) {
      if (ad.content.ctaLink.startsWith('http')) window.open(ad.content.ctaLink, '_blank', 'noopener');
      else nav(ad.content.ctaLink);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={13} className="text-amber-500" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {ads.map(ad => (
          <motion.button key={ad._id} whileTap={{ scale: 0.96 }} onClick={() => handleClick(ad)}
            className="shrink-0 w-44 rounded-2xl overflow-hidden text-left shadow-sm hover:shadow-md transition-shadow"
            style={{ background: ad.content?.backgroundColor || '#7c3aed' }}>
            {ad.content?.imageUrl && (
              <div className="h-24 overflow-hidden">
                <img src={ad.content.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-3">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[8px] font-bold uppercase tracking-wide opacity-60" style={{ color: ad.content?.textColor || '#fff' }}>Sponsored</span>
              </div>
              <p className="text-xs font-black leading-tight" style={{ color: ad.content?.textColor || '#fff' }}>{ad.content?.headline}</p>
              {ad.content?.body && <p className="text-[10px] mt-0.5 opacity-80 line-clamp-1" style={{ color: ad.content?.textColor || '#fff' }}>{ad.content.body}</p>}
              <div className="mt-2 flex items-center gap-1">
                <span className="text-[10px] font-bold" style={{ color: ad.content?.textColor || '#fff' }}>{ad.content?.ctaText || 'Learn More'}</span>
                <ExternalLink size={9} style={{ color: ad.content?.textColor || '#fff' }} className="opacity-70" />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
