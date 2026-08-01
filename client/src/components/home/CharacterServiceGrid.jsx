import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { categoryMap } from '../../constants/categoryMap';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Category grid. Two presentations off the single-source `categoryMap`:
 *   • Desktop (md+): the original floating 3D characters on bare white.
 *   • Mobile (<md):  bordered white cards with a category-tinted image area and
 *                    a label strip — the redesigned mobile Home.
 * Characters, prices, tints and click behaviour are identical in both.
 */
const SERVICES = categoryMap;

export default function CharacterServiceGrid() {
  const nav = useNavigate();
  const isMobile = useIsMobile();

  const handleServiceClick = (svc) => {
    // Open the catalog pre-filtered to this category (via its catalogKey) rather
    // than text-searching the label — a label search lands on the "All" tab and
    // shows unrelated services. 'More' opens the full catalog unfiltered.
    if (svc.id === 'more' || !svc.catalogKey) nav('/services');
    else nav(`/services?category=${encodeURIComponent(svc.catalogKey)}`);
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
                    {isMore ? (
                      <span className="font-semibold text-[var(--text-hi,#14152A)]">View all</span>
                    ) : (
                      <>From <span className="font-semibold text-[var(--text-hi,#14152A)] tabular-nums">{svc.price}</span></>
                    )}
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
                  {svc.id === 'more' ? (
                    <span className="font-semibold text-[var(--text-hi,#14152A)] tabular-nums">{svc.price}</span>
                  ) : (
                    <>from <span className="font-semibold text-[var(--text-hi,#14152A)] tabular-nums">{svc.price}</span></>
                  )}
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </>
  );
}
