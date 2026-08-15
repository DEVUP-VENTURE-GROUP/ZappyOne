import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { RippleLayer, useRipple } from './Ripple';

/**
 * Horizontal filter rail.
 *
 * The selected state is a single shared `layoutId` pill, so switching filters
 * slides the highlight between chips instead of cross-fading two backgrounds —
 * the detail that makes the rail feel native rather than web. Framer Motion
 * drops layout animation automatically under prefers-reduced-motion.
 *
 * Semantics: these are toggle filters over one list, not tabs over separate
 * panels, so each chip is a `button` with `aria-pressed` inside a labelled
 * group. The grid it controls is `aria-live="polite"` in the parent view.
 */

function Chip({ facet, active, onSelect }) {
  const { ripples, spawn } = useRipple();

  return (
    <button
      type="button"
      id={`facet-${facet.key}`}
      onClick={(e) => { spawn(e); onSelect(facet.key); }}
      aria-pressed={active}
      className={`relative shrink-0 snap-start overflow-hidden rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 ${
        active
          ? 'border-transparent text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {active && (
        <motion.span
          layoutId="facet-pill"
          className="absolute inset-0 rounded-full bg-[var(--cat-accent)]"
          transition={{ type: 'spring', stiffness: 480, damping: 38 }}
        />
      )}
      <RippleLayer ripples={ripples} color="rgba(15,23,42,0.10)" />
      <span className="relative z-10 flex items-center gap-1.5">
        {facet.label}
        <span
          className={`tabular-nums text-[11px] font-bold ${
            active ? 'text-white/70' : 'text-slate-400'
          }`}
        >
          {facet.count}
        </span>
      </span>
    </button>
  );
}

export default function FacetRail({ facets, active, onSelect, label = 'Filter services' }) {
  const railRef = useRef(null);

  // Keep the active chip in view when it changes from outside the rail
  // (deep link, "clear filters", a facet disappearing after a search).
  useEffect(() => {
    const el = railRef.current?.querySelector(`#facet-${CSS.escape(active)}`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  if (!facets?.length) return null;

  return (
    <div
      ref={railRef}
      role="group"
      aria-label={label}
      className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {facets.map((facet) => (
        <Chip
          key={facet.key}
          facet={facet}
          active={active === facet.key}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
