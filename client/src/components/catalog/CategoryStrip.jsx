import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import ServiceIllustration from './ServiceIllustration';
import { buildCatalogCategories, themeVars } from '../../constants/catalogCategories';
import { useCategoryGroups } from '../../lib/serviceCatalogGroups';
import { easeSoft } from '../../lib/animations';

/**
 * Horizontal rail of verticals — the doorway into each category catalog.
 *
 * Counts are computed against the live catalog, and a vertical with nothing in
 * it is dropped, so this rail can never lead to an empty page. Each tile keeps
 * its own accent by scoping `themeVars()` to the card, which is why the rail
 * reads as one system while still being colour-coded per vertical.
 */
export default function CategoryStrip({ services = [], activeKey, title = 'Browse by category' }) {
  useCategoryGroups(); // re-render when the admin category taxonomy loads/changes
  const tiles = buildCatalogCategories().filter((c) => c.showInCustomer !== false).map((category) => ({
    category,
    count: services.reduce((n, s) => n + (category.match(s) ? 1 : 0), 0),
  })).filter((t) => t.count > 0 && t.category.key !== activeKey);

  if (!tiles.length) return null;

  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
        {title}
      </h2>
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {tiles.map(({ category, count }, i) => (
          <motion.div
            key={category.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: Math.min(i * 0.03, 0.24), ease: easeSoft }}
            style={themeVars(category.theme)}
            className="shrink-0 snap-start"
          >
            <Link
              to={`/services/${category.key}`}
              className="group flex h-full w-[148px] flex-col rounded-[20px] border border-slate-200/70 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[var(--cat-border)] hover:shadow-[0_18px_34px_-20px_var(--cat-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 motion-reduce:transform-none"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-[14px] transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
                style={{ background: 'var(--cat-tint)' }}
              >
                <ServiceIllustration name={category.illustration} size={32} />
              </div>
              <span className="mt-3 text-[13.5px] font-bold leading-tight text-navy-900">
                {category.title}
              </span>
              <span className="mt-auto flex items-center gap-0.5 pt-2 text-[11.5px] font-semibold text-slate-400">
                {count} {count === 1 ? 'service' : 'services'}
                <ChevronRight
                  size={13}
                  strokeWidth={3}
                  className="text-[var(--cat-accent)] transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
