/**
 * The home page's search bar — one of them.
 * ----------------------------------------------------------------------------
 * Home carried this twice: a `hidden md:block` copy inside the header and a
 * `md:hidden` copy below it. Two sets of markup for one control, already drifted
 * (different radii, different padding, different pill sizes), and two places to
 * change anything about search.
 *
 * It now lives below the header at every width, which is also where the
 * reference composition puts it.
 *
 * ── THE COUNT IS COUNTED ───────────────────────────────────────────────────
 * The pill read "50+ services" in both copies. It is the live catalog's real
 * total, and it is hidden entirely at zero rather than advertising a catalogue
 * we do not have.
 *
 * Search behaviour itself is untouched: the field opens Spotlight, the mic hands
 * its transcript to /services, and the lens opens the scanner. Nothing here
 * autocompletes or guesses.
 * ----------------------------------------------------------------------------
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ScanLine } from 'lucide-react';
import { useT } from '../../i18n/I18nProvider';
import { serviceNameKey } from '../../i18n/translations';
import VoiceSearchButton from '../common/VoiceSearchButton';

// Cycled through the placeholder. Localised at render via the "home.searchFor"
// template plus the svc.* name map, so the whole hint translates, not the frame.
const SEARCH_TERMS = ['Puncture Repair', 'Laptop Service', 'Electrician', 'Car Wash', 'Plumber'];

function AnimatedPlaceholder() {
  const t = useT();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SEARCH_TERMS.length), 2500);
    return () => clearInterval(id);
  }, []);
  const term = t(serviceNameKey(SEARCH_TERMS[index]), SEARCH_TERMS[index]);
  const hint = t('home.searchFor', "Search '{x}'...").replace('{x}', term);
  return (
    <span className="relative flex h-full flex-1 items-center overflow-hidden">
      <AnimatePresence>
        <motion.span
          key={index}
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 truncate text-[14px] font-medium text-slate-400 sm:text-[15px]"
        >
          {hint}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function HomeSearch({ onOpenSpotlight, onOpenLens, onVoiceResult, serviceCount = 0 }) {
  const t = useT();
  return (
    <div className="flex h-[54px] w-full items-center gap-2 rounded-[20px] border border-slate-200/90 bg-slate-50/80 pl-4 pr-2 transition-colors focus-within:border-indigo-300 hover:bg-white sm:h-[58px] sm:rounded-[22px] sm:pl-5">
      <button
        type="button"
        onClick={onOpenSpotlight}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-l-[20px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label={t('home.searchAria', 'Search for a service')}
      >
        <Search size={18} strokeWidth={2.4} className="shrink-0 text-slate-400" />
        <AnimatedPlaceholder />
      </button>

      {serviceCount > 0 && (
        <span className="hidden shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black leading-none text-indigo-600 sm:inline-block">
          {serviceCount} services
        </span>
      )}

      <VoiceSearchButton onResult={onVoiceResult} />

      <button
        type="button"
        onClick={onOpenLens}
        aria-label={t('home.lensAria', 'ZappyLens — scan to find a service')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:h-10 sm:w-10"
      >
        <ScanLine size={18} />
      </button>
    </div>
  );
}
