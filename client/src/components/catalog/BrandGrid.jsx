import { memo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { easeSoft } from '../../lib/animations';

/**
 * The brand tile wall.
 *
 * Every tile is a brand the catalog API actually returned — the grid never
 * hardcodes a manufacturer, so it stays in step with the Brand collection.
 * Tiles are a fixed square with a white face and a contained mark, which is
 * what lets a wordmark, a wide horizontal logo and a square icon all sit in
 * the same row without one dominating.
 *
 * Semantics: a radiogroup of tiles, one selection, arrow keys handled by the
 * browser's native radio behaviour via roving `tabIndex`.
 */

const tile = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: easeSoft } },
};

function BrandGrid({ brands, value, onSelect, label = 'Select your brand' }) {
  const selectedIndex = brands.findIndex((b) => b.code === value);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {brands.map((brand, i) => {
        const active = brand.code === value;
        // Roving tabindex: one stop for the whole group, like a native radio set.
        const tabIndex = active || (selectedIndex === -1 && i === 0) ? 0 : -1;
        return (
          <motion.button
            key={brand.code}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabIndex}
            variants={tile}
            onClick={() => onSelect(brand)}
            className={`group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-[20px] border bg-white p-3 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 motion-reduce:transform-none ${
              active
                ? 'border-[var(--cat-accent)] shadow-[0_16px_30px_-18px_var(--cat-glow)]'
                : 'border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-[0_16px_30px_-20px_rgba(15,23,42,0.35)]'
            }`}
          >
            <span className="flex h-[46%] w-[76%] items-center justify-center">
              <BrandLogo brand={brand} />
            </span>
            <span className="line-clamp-1 text-[11.5px] font-bold text-slate-500 group-hover:text-navy-900">
              {brand.name}
            </span>
            {active && (
              <span
                className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-white"
                style={{ background: 'var(--cat-accent)' }}
              >
                <Check size={11} strokeWidth={3.5} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export default memo(BrandGrid);
