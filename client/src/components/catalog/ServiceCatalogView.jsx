import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { AlertTriangle, Heart, SearchX } from 'lucide-react';
import PageTransition from '../common/PageTransition';
import CatalogHeader from './CatalogHeader';
import FacetRail from './FacetRail';
import ServiceCard from './ServiceCard';
import ServiceTile from './ServiceTile';
import CategoryStrip from './CategoryStrip';
import { FacetRailSkeleton, ServiceGridSkeleton } from './CatalogSkeletons';
import useServiceCatalog from '../../hooks/useServiceCatalog';
import useFavorites from '../../hooks/useFavorites';
import { useGetAvailablePromosQuery } from '../../services/api';
import { selectAuth } from '../../modules/auth/authSlice';
import { getCategoryConfig, themeVars } from '../../constants/catalogCategories';
import { applyFacet, buildFacets, categoryStats, sortForDisplay } from '../../lib/serviceFacets';
import { buildPromoMap } from '../../lib/servicePromos';
import { searchServices } from '../../lib/serviceSearch';

/**
 * The Zappy Service Catalog — one component, every vertical.
 *
 * `/services` renders it with no key (all verticals); `/services/:category`
 * renders it with one. Everything that differs between Car Services, Phone
 * Repair, Plumbing and the rest lives in `constants/catalogCategories.js`, so
 * adding a vertical is a config edit, not a new page.
 *
 * Performance notes:
 *   • the catalog fetch is shared and cached across pages (useServiceCatalog)
 *   • cards are memoised and the grid renders in pages of PAGE_SIZE, extended
 *     by an IntersectionObserver — a 100-service category paints ~12 cards,
 *     not 100, without pulling in a virtualisation dependency
 *   • the entrance stagger is capped so the last card never waits on the first
 */

const PAGE_SIZE = 12;

// Mosaic rhythm: the first few services lead as double-width tiles, the rest
// fill in as quarter-width ones. Four gives two full lead rows on mobile before
// the grid breaks into the smaller tiles.
const LEAD_TILES = 4;

const gridContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

export default function ServiceCatalogView({ categoryKey = null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessToken } = useSelector(selectAuth);
  const { services, loading, error, refetch } = useServiceCatalog();
  const { favorites, count: savedCount } = useFavorites();

  const category = useMemo(() => getCategoryConfig(categoryKey), [categoryKey]);
  const mosaic = category.cardStyle === 'mosaic';

  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [facetKey, setFacetKey] = useState(() => searchParams.get('f') || 'all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Real offers only — the endpoint is user-scoped, so it's skipped for guests
  // and the banner falls back to the category's own value proposition.
  const { data: promoData } = useGetAvailablePromosQuery(undefined, { skip: !accessToken });

  /* ── Derive the list ───────────────────────────────────────────────────── */

  const pool = useMemo(
    () => sortForDisplay(services.filter(category.match)),
    [services, category],
  );

  const facets = useMemo(() => buildFacets(category.facets, pool), [category, pool]);
  const stats = useMemo(() => categoryStats(pool), [pool]);

  // A facet from the URL (or a previous category) may not exist here.
  const activeFacet = facets.some((f) => f.key === facetKey) ? facetKey : 'all';

  // The endpoint returns `{ promos: [...] }`; tolerate a bare array too.
  const promos = useMemo(() => {
    if (Array.isArray(promoData)) return promoData;
    return Array.isArray(promoData?.promos) ? promoData.promos : [];
  }, [promoData]);

  const promoMap = useMemo(() => buildPromoMap(promos, pool), [promos, pool]);

  const { list, noExactMatch } = useMemo(() => {
    let next = applyFacet(pool, facets, activeFacet);
    if (savedOnly) next = next.filter((s) => favorites.includes(s.code));

    const q = query.trim();
    if (!q) return { list: next, noExactMatch: false };

    const hits = searchServices(next, q);
    // Never dead-end on a typo: fall back to the unsearched list with a note.
    if (hits.length) return { list: hits, noExactMatch: false };
    return { list: next, noExactMatch: true };
  }, [pool, facets, activeFacet, savedOnly, favorites, query]);


  /* ── URL sync ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    query ? next.set('q', query) : next.delete('q');
    activeFacet !== 'all' ? next.set('f', activeFacet) : next.delete('f');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // `searchParams` is intentionally omitted: including it re-runs this on our
    // own write and fights the router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeFacet, setSearchParams]);

  /* ── Progressive rendering ─────────────────────────────────────────────── */

  useEffect(() => { setVisible(PAGE_SIZE); }, [activeFacet, query, savedOnly, categoryKey]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= list.length) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible((v) => Math.min(v + PAGE_SIZE, list.length));
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, list.length]);

  const shown = useMemo(() => list.slice(0, visible), [list, visible]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setFacetKey('all');
    setSavedOnly(false);
  }, []);


  /* ── Render ────────────────────────────────────────────────────────────── */

  const isEmpty = !loading && !error && list.length === 0;

  return (
    <PageTransition>
      <div
        className="min-h-screen bg-[#F8FAFC] pb-24 font-sans"
        style={themeVars(category.theme)}
      >
        <CatalogHeader
          category={category}
          query={query}
          onQueryChange={setQuery}
          stats={stats}
          savedCount={savedCount}
          savedActive={savedOnly}
          onToggleSaved={() => setSavedOnly((v) => !v)}
        >
          {loading ? (
            <FacetRailSkeleton />
          ) : (
            <FacetRail
              facets={facets}
              active={activeFacet}
              onSelect={setFacetKey}
              label={`Filter ${category.title}`}
            />
          )}
        </CatalogHeader>

        <div className="page-container mt-5 space-y-6">
          {/* All-services view: the verticals are the primary navigation. */}
          {!categoryKey && !loading && !error && (
            <CategoryStrip services={services} title="Browse by category" />
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 rounded-[24px] border border-slate-200/70 bg-white px-6 py-14 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-red-50">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <p className="text-lg font-black text-navy-900">Couldn’t load services</p>
                <p className="mt-1 text-sm text-slate-500">
                  Check your connection and try again.
                </p>
              </div>
              <button
                type="button"
                onClick={refetch}
                className="rounded-xl bg-[var(--cat-accent)] px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
              >
                Retry
              </button>
            </motion.div>
          )}

          {noExactMatch && !isEmpty && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[13px] font-semibold"
              style={{
                background: 'var(--cat-tint)',
                borderColor: 'var(--cat-border)',
                color: 'var(--cat-deep)',
              }}
            >
              <SearchX size={17} className="mt-px shrink-0" />
              No exact match for “{query}” — here’s everything else in {category.title}.
            </motion.p>
          )}

          <section id="catalog-grid" className="scroll-mt-32">
            {!error && !loading && list.length > 0 && (
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {list.length} {list.length === 1 ? 'service' : 'services'}
                  {savedOnly ? ' saved' : ' available'}
                </h2>
                {(query || activeFacet !== 'all' || savedOnly) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-[12px] font-bold text-[var(--cat-accent)] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {loading && <ServiceGridSkeleton count={6} mosaic={mosaic} />}

            {isEmpty && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4 rounded-[24px] border border-slate-200/70 bg-white px-6 py-14 text-center"
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-[22px]"
                  style={{ background: 'var(--cat-tint)' }}
                >
                  {savedOnly ? (
                    <Heart size={26} className="text-rose-400" />
                  ) : (
                    <SearchX size={26} style={{ color: 'var(--cat-accent)' }} />
                  )}
                </div>
                <div>
                  <p className="text-lg font-black text-navy-900">
                    {savedOnly ? 'Nothing saved yet' : 'No services match that'}
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    {savedOnly
                      ? 'Tap the heart on any service to keep it here for later.'
                      : 'Try a different filter, or clear everything to see the full list.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
                >
                  Show all services
                </button>
              </motion.div>
            )}

            {shown.length > 0 && (
              <motion.div
                key={`${categoryKey || 'all'}-${activeFacet}`}
                variants={gridContainer}
                initial="initial"
                animate="animate"
                aria-live="polite"
                className={
                  mosaic
                    ? 'grid grid-cols-4 gap-2.5 sm:gap-3 lg:grid-cols-6'
                    : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
                }
              >
                {shown.map((service, i) =>
                  mosaic ? (
                    <ServiceTile
                      key={service.code}
                      service={service}
                      category={category}
                      promo={promoMap[service.code]}
                      size={i < LEAD_TILES ? 'large' : 'small'}
                    />
                  ) : (
                    <ServiceCard
                      key={service.code}
                      service={service}
                      category={category}
                      promo={promoMap[service.code]}
                    />
                  ),
                )}
              </motion.div>
            )}

            {/* Reveals the next page as it approaches the viewport. */}
            {visible < list.length && (
              <div ref={sentinelRef} className="mt-4">
                <ServiceGridSkeleton count={mosaic ? 4 : 2} mosaic={mosaic} />
              </div>
            )}
          </section>

          {/* Cross-sell out of a category page. */}
          {categoryKey && !loading && !error && (
            <CategoryStrip
              services={services}
              activeKey={category.key}
              title="Other Zappy services"
            />
          )}
        </div>
      </div>
    </PageTransition>
  );
}
