import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { getCharacterByCatalogKey } from '../../constants/categoryMap';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '@shared/i18n/I18nProvider';
import { useLiveCatalogQuery } from '@shared/services/api';

/**
 * The hero service grid. Two presentations, one data source:
 *   • Desktop (md+): floating 3D characters on bare white.
 *   • Mobile (<md):  bordered cards with a tinted image area and a label strip.
 *
 * The tiles are the LIVE catalog, not a fixed list. A service appears here when
 * an operator sets it live and providers are verified for it — so the grid can
 * never advertise a category whose booking flow does not exist. Character art
 * is matched by `artKey`; a service with no artwork yet still renders, using the
 * generic tile rather than being dropped.
 */

/** A neutral look for a live service that has no character asset. */
const FALLBACK_ART = {
  img: '/images/characters/more.mp4',
  thumb: '/images/characters/thumb/more.png',
  tint: 'rgba(37, 99, 235, 0.08)',
  shadow: 'rgba(37, 99, 235, 0.18)',
};

export default function CharacterServiceGrid() {
  const nav = useNavigate();
  const t = useT();
  const isMobile = useIsMobile();
  const { data } = useLiveCatalogQuery();

  const services = (data?.domains || []).flatMap((d) => d.services);

  const SERVICES = [
    ...services.map((s) => {
      const art = getCharacterByCatalogKey(s.artKey) || FALLBACK_ART;
      return {
        id: s.code,
        label: s.name,
        caption: s.tagline || 'Book now',
        path: s.path,
        img: art.img,
        thumb: art.thumb,
        tint: art.tint,
        shadow: art.shadow,
      };
    }),
    // Kept as an honest end-cap: it says more is coming rather than opening a
    // catalog full of services nobody can book yet.
    {
      id: 'more',
      label: t('home.more', 'More soon'),
      caption: t('home.moreSoon', 'In progress'),
      path: null,
      ...FALLBACK_ART,
    },
  ];

  const handleServiceClick = (svc) => {
    if (svc.path) nav(svc.path);
  };

  return (
    <>
      {isMobile ? (
        /* ── Mobile: bordered category cards ── */
        <div className="grid grid-cols-4 gap-3 w-full">
          {SERVICES.map((svc, i) => {
            const isMore = svc.id === 'more';
            return (
              <motion.button
                key={svc.id}
                onClick={() => handleServiceClick(svc)}
                className="flex flex-col rounded-[16px] border border-slate-200 bg-white shadow-sm overflow-hidden text-left outline-none group"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <div
                  className="relative w-full aspect-square flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: isMore ? 'rgba(37, 99, 235, 0.08)' : svc.tint }}
                >
                  {isMore ? (
                    <div className="w-11 h-11 rounded-full bg-zappy-600 flex items-center justify-center shadow-md">
                      <LayoutGrid size={22} strokeWidth={2.25} className="text-white" />
                    </div>
                  ) : svc.img.includes('.mp4') ? (
                    <motion.video
                      src={svc.img}
                      poster={svc.thumb}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-contain p-1.5 z-10 transition-transform duration-300 group-hover:scale-[1.05] mix-blend-multiply"
                      style={{ filter: 'brightness(1.3) contrast(1.5)' }}
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                    />
                  ) : (
                    <motion.img
                      src={svc.img}
                      alt={svc.label}
                      className="absolute inset-0 w-full h-full object-contain p-2 z-10 transition-transform duration-300 group-hover:scale-[1.05] mix-blend-multiply"
                      loading="lazy"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                    />
                  )}
                </div>

                <div className="px-2 py-2 text-center">
                  <span className="block text-[13px] leading-[16px] font-bold text-[#14152A] truncate">
                    {svc.label}
                  </span>
                  <span className="block text-[11px] leading-[14px] font-medium text-[var(--text-mid,#4A4D68)] truncate mt-[2px]">
                    {svc.caption}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      ) : (
        /* ── Desktop: original floating characters ── */
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3 md:gap-4 w-full">
          {SERVICES.map((svc, i) => (
            <motion.button
              key={svc.id}
              onClick={() => handleServiceClick(svc)}
              className="flex flex-col items-center gap-1.5 w-full outline-none group"
              whileTap="tap"
              initial="idle"
              animate="idle"
              whileHover="hover"
            >
              <motion.div
                className="w-full aspect-square relative flex items-end justify-center pt-2 pb-3"
                variants={{
                  idle: { scale: 1 },
                  hover: { y: -6 },
                  tap: { scale: 0.92 },
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <motion.div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] w-[65%] h-[65%] rounded-full blur-[24px] opacity-40 transition-opacity duration-300 group-hover:opacity-80"
                  style={{ backgroundColor: svc.shadow }}
                />

                <div className="absolute bottom-1 w-[45%] h-[8%] bg-black/15 blur-[4px] rounded-[100%] pointer-events-none transition-transform duration-300 group-hover:scale-110 group-hover:bg-black/20" />

                {svc.img.includes('.mp4') ? (
                  <motion.video
                    src={svc.img}
                    poster={svc.thumb}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-contain z-10 transition-transform duration-300 group-hover:scale-[1.05] mix-blend-multiply"
                    style={{ filter: 'brightness(1.3) contrast(1.5)' }}
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                  />
                ) : (
                  <motion.img
                    src={svc.img}
                    alt={svc.label}
                    className="absolute inset-0 w-full h-full object-contain p-2 z-10 transition-transform duration-300 group-hover:scale-[1.05] mix-blend-multiply"
                    loading="lazy"
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                  />
                )}
              </motion.div>

              <div className="text-center w-full mt-[6px]">
                <span className="block text-[13px] leading-[18px] font-bold text-[#14152A] truncate">
                  {svc.label}
                </span>
                <span className="block text-[11px] leading-[14px] tracking-[0.04em] font-medium text-[var(--text-mid,#4A4D68)] truncate mt-[2px]">
                  {svc.caption}
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </>
  );
}
