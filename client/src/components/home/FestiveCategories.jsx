import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Lightbulb, Flower2, ChefHat, Wrench } from 'lucide-react';
import { isFestiveActive } from './festive';

/**
 * Artwork.
 *
 * These tiles hotlinked five images from `images.unsplash.com`, and every one
 * of them failed to load — the festive block rendered four broken-image icons
 * as the first thing a visitor saw. There is no licensed local festive art in
 * the project, so rather than swap one external dependency for another each
 * tile now draws a tinted glyph. It is always present, costs no request, and
 * matches the catalog tile's own art-less treatment.
 */
const CATEGORY_ART = {
  'festive-cleaning': { Icon: Sparkles,  tint: 'from-rose-100 to-amber-100',   fg: 'text-rose-500'   },
  'lighting-setup':   { Icon: Lightbulb, tint: 'from-amber-100 to-yellow-100', fg: 'text-amber-600'  },
  'pandal-decor':     { Icon: Flower2,   tint: 'from-fuchsia-100 to-rose-100', fg: 'text-fuchsia-600' },
  'kitchen-assist':   { Icon: ChefHat,   tint: 'from-orange-100 to-amber-100', fg: 'text-orange-600' },
  'emergency-repairs':{ Icon: Wrench,    tint: 'from-sky-100 to-indigo-100',   fg: 'text-indigo-600' },
};

/**
 * Destinations.
 *
 * Every tile pointed at `/book/<something>` — `home-cleaning`, `electrician`,
 * `event-decor`, `family-assist`, `plumber`. None of those are values the
 * booking screen accepts: `Order.service` is a fixed enum and not one of them
 * appears in it, so each tile was a guaranteed dead end.
 *
 * Checked against the catalog rather than guessed: the cleaning, electrical,
 * plumbing and house-help service lines are all still `coming_soon`, so there
 * is no live destination to send those four to. They are now honest — labelled
 * and not clickable — rather than links into a 404. The invented "₹499, was
 * ₹999" came off with them; a price on something you cannot book is a promise
 * we would break.
 *
 * Puja & Pandal Decor is the exception: event decoration is a real, shipped
 * module, so that tile points at it.
 */
const CATEGORIES = [
  {
    id: 'festive-cleaning',
    title: 'Festive Home Cleaning',
    colSpan: 'col-span-1',
    rowSpan: 'row-span-2',
    bgColor: 'bg-white',
    comingSoon: true,
  },
  {
    id: 'lighting-setup',
    title: 'Smart Lighting Setup',
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    comingSoon: true,
  },
  {
    id: 'pandal-decor',
    title: 'Puja & Pandal Decor',
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    path: '/events',
  },
  {
    id: 'kitchen-assist',
    title: 'Hosting & Kitchen Help',
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    comingSoon: true,
  },
  {
    id: 'emergency-repairs',
    title: 'Emergency Repairs',
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    comingSoon: true,
  },
];

export default function FestiveCategories() {
  const nav = useNavigate();

  // After the hook, never before it — a conditional hook call would break the
  // rules of hooks the moment the campaign window flips.
  if (!isFestiveActive()) return null;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.9 },
    show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="w-full px-4 relative z-10 -mt-2 pb-6 bg-gradient-to-b from-[#FFE6B3] to-white">
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl mx-auto"
      >
        {CATEGORIES.map((cat, idx) => (
          <motion.div
            key={cat.id}
            variants={item}
            whileHover={cat.path ? { y: -4, scale: 1.02 } : undefined}
            whileTap={cat.path ? { scale: 0.95 } : undefined}
            onClick={() => cat.path && nav(cat.path)}
            role={cat.path ? 'button' : undefined}
            aria-disabled={cat.path ? undefined : true}
            className={`
              ${cat.bgColor} ${cat.colSpan} ${cat.rowSpan}
              rounded-2xl shadow-sm border border-orange-100 overflow-hidden
              flex flex-col relative group
              ${cat.path ? 'cursor-pointer' : 'cursor-default'}
            `}
          >
            <div className="p-3 pb-1 z-10 text-center md:text-left">
              <h3 className="font-bold text-[#4A2B29] text-xs md:text-sm leading-tight text-center">
                {cat.title}
              </h3>
              {cat.comingSoon && (
                <div className="mt-2 inline-flex items-center justify-center bg-white/80 text-[#8A5A57] ring-1 ring-orange-200 px-2 py-0.5 rounded-full text-[10px] font-bold mx-auto">
                  Coming soon
                </div>
              )}
            </div>
            <div className="flex-1 flex items-end justify-center pt-2 relative">
              {(() => {
                const art = CATEGORY_ART[cat.id] || CATEGORY_ART['emergency-repairs'];
                const { Icon, tint, fg } = art;
                return (
                  <div
                    className={`w-24 h-24 md:w-32 md:h-32 rounded-t-xl bg-gradient-to-br ${tint} flex items-center justify-center group-hover:scale-110 transition-transform duration-500 ease-out`}
                    style={{
                      maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
                      WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon size={34} strokeWidth={1.6} className={fg} />
                  </div>
                );
              })()}
            </div>
          </motion.div>
        ))}
      </motion.div>
      
      {/* Centrepiece. Was a hotlinked Unsplash photograph that did not load and
          rendered as a broken-image icon. Replaced with a purely decorative
          motif — no request, nothing to break, and no depiction of a deity
          sourced from a stock search. */}
      <div className="mt-8 relative h-32 md:h-40 flex items-center justify-center overflow-hidden">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.4 }}
          className="relative z-10 flex flex-col items-center gap-2"
        >
          <span className="text-5xl md:text-6xl leading-none" role="img" aria-label="Festive lamp">
            🪔
          </span>
          <span className="text-[#C0265F] font-bold text-sm tracking-wide">
            Ganpati Bappa Morya
          </span>
        </motion.div>
        {/* Decorative glow */}
        <div className="absolute top-1/2 -left-4 w-16 h-16 bg-pink-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50" />
        <div className="absolute top-1/2 -right-4 w-16 h-16 bg-orange-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50" />
      </div>
      
      {/* Festive Top Picks */}
      <div className="text-center mt-6 mb-4">
        <h2 className="text-[#C0265F] font-bold text-lg inline-flex items-center gap-2">
          <span className="text-sm">🌸</span> Festive Top Picks! <span className="text-sm">🌸</span>
        </h2>
      </div>
    </div>
  );
}
