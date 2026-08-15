import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Search, X } from 'lucide-react';
import PageTransition from '../components/common/PageTransition';
import BrandGrid from '../components/catalog/BrandGrid';
import BrandLogo from '../components/catalog/BrandLogo';
import { RippleLayer, useRipple } from '../components/catalog/Ripple';
import useServiceCatalog from '../hooks/useServiceCatalog';
import { useBrands, useModels } from '../hooks/useServiceBrands';
import {
  brandCategoryFor,
  brandNounFor,
  getCategoryForService,
  themeVars,
} from '../constants/catalogCategories';
import { readSelection, writeSelection, selectionToQuery } from '../lib/brandSelection';
import { easeSoft } from '../lib/animations';

/**
 * `/service/:code/brand` — the brand (and model) step.
 *
 * Sits between the service detail page and the booking flow for the verticals
 * that have a Brand catalog: phones, laptops, cars, bikes. Everything on screen
 * comes from the admin-managed Brand and DeviceModel collections, so the page
 * can never offer a manufacturer the catalog doesn't know about.
 *
 * Two steps in one page rather than two routes: picking a brand reveals its
 * models inline, which keeps the back button meaning "leave this step" instead
 * of trapping the customer in a two-deep wizard. The model step is skipped
 * entirely when the chosen brand has no models seeded.
 *
 * The step is skippable on purpose — it sharpens the booking, it isn't a gate.
 */

const STEP_LABEL = { brand: 'Step 1 of 2', model: 'Step 2 of 2' };

export default function BrandSelectPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const { services, loading } = useServiceCatalog();
  const { ripples, spawn } = useRipple();

  const service = useMemo(() => services.find((s) => s.code === code), [services, code]);
  const category = useMemo(() => getCategoryForService(service), [service]);
  const brandCategory = service ? brandCategoryFor(category.key) : null;
  const noun = brandNounFor(category.key);

  const { brands, loading: brandsLoading } = useBrands(brandCategory);
  const [selection, setSelection] = useState(null);
  const { models, loading: modelsLoading } = useModels(selection?.brand || null);
  const [query, setQuery] = useState('');

  // Restore the remembered choice once we know which brands still exist.
  useEffect(() => {
    if (!brandCategory || !brands.length || selection) return;
    const stored = readSelection(brandCategory);
    if (stored && brands.some((b) => b.code === stored.brand)) setSelection(stored);
  }, [brandCategory, brands, selection]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q) || b.code.includes(q));
  }, [brands, query]);

  const selectedBrand = useMemo(
    () => brands.find((b) => b.code === selection?.brand) || null,
    [brands, selection],
  );

  const chooseBrand = (brand) => {
    const next = { brand: brand.code, brandName: brand.name, model: '', modelName: '' };
    setSelection(next);
    writeSelection(brandCategory, next);
  };

  const chooseModel = (model) => {
    const next = {
      ...selection,
      model: model?.code || '',
      modelName: model?.name || '',
    };
    setSelection(next);
    writeSelection(brandCategory, next);
  };

  const goToBooking = (withSelection) => {
    nav(`/book/${code}${withSelection ? selectionToQuery(selection) : ''}`);
  };

  /* ── Guards ────────────────────────────────────────────────────────── */

  if (loading && !service) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-4">
        <div className="page-container space-y-4 pt-8">
          <div className="skeleton h-8 w-2/3 rounded-md" />
          <div className="skeleton h-4 w-1/2 rounded-md" />
          <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-[20px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Nothing to choose from → don't strand the customer on an empty step.
  if (!loading && (!service || !brandCategory)) {
    return <Navigate to={`/book/${code}`} replace />;
  }
  if (!brandsLoading && brands.length === 0) {
    return <Navigate to={`/book/${code}`} replace />;
  }

  const step = selectedBrand ? 'model' : 'brand';
  const hasModelStep = selectedBrand && (modelsLoading || models.length > 0);

  return (
    <PageTransition>
      <div
        className="min-h-screen bg-[#F8FAFC] font-sans"
        style={themeVars(category.theme)}
      >
        <div
          className="page-container"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => nav(-1)}
              aria-label="Go back"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)]"
            >
              <ArrowLeft size={18} strokeWidth={2.4} />
            </button>
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              {hasModelStep ? STEP_LABEL[step] : 'Select your brand'}
            </span>
            <button
              type="button"
              onClick={() => goToBooking(false)}
              className="rounded-full px-3 py-2 text-[13px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)]"
            >
              Skip
            </button>
          </div>

          <div className="mt-5">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--cat-accent)]">
              {service.name}
            </span>
            <h1 className="mt-1 text-[27px] font-black leading-[1.1] tracking-tight text-navy-900 sm:text-[34px]">
              Which brand is your {noun}?
            </h1>
            <p className="mt-1.5 text-[14px] font-medium text-slate-500">
              It goes to the professional with your booking, so they know what they’re
              working on before they arrive.
            </p>
          </div>

          {/* Search — the phone list is long enough to warrant it. */}
          {brands.length > 8 && (
            <div className="relative mt-5 flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm transition-all focus-within:border-[var(--cat-accent)] focus-within:shadow-[0_0_0_4px_var(--cat-glow)]">
              <Search size={17} strokeWidth={2.4} className="shrink-0 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${brands.length} brands`}
                aria-label="Search brands"
                className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-navy-900 outline-none placeholder:font-medium placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="page-container mt-5 pb-8">
          {brandsLoading ? (
            <div
              className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              aria-hidden
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton aspect-square rounded-[20px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[24px] border border-slate-200/70 bg-white px-6 py-12 text-center">
              <p className="text-[15px] font-black text-navy-900">No brand matches “{query}”</p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-slate-500">
                You can skip this step — the professional will confirm the details with you.
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-4 rounded-xl bg-navy-900 px-5 py-2.5 text-[13px] font-bold text-white transition-transform active:scale-95"
              >
                Show all brands
              </button>
            </div>
          ) : (
            <motion.div initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.02 } } }}>
              <BrandGrid
                brands={filtered}
                value={selection?.brand}
                onSelect={chooseBrand}
                label={`Select your ${noun} brand`}
              />
            </motion.div>
          )}

          {/* Model step — appears in place once a brand with models is chosen. */}
          <AnimatePresence initial={false}>
            {hasModelStep && (
              <motion.section
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: easeSoft }}
                className="overflow-hidden"
                aria-label="Select your model"
              >
                <div className="pt-8">
                  <h2 className="text-[17px] font-black tracking-tight text-navy-900">
                    Which {selectedBrand.name} model?
                  </h2>
                  <p className="mt-1 text-[13px] font-medium text-slate-500">
                    Optional — pick it if you know it.
                  </p>

                  {modelsLoading ? (
                    <div className="mt-3 flex gap-2" aria-hidden>
                      {[120, 150, 130].map((w, i) => (
                        <div key={i} className="skeleton h-11 rounded-2xl" style={{ width: w }} />
                      ))}
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label={`${selectedBrand.name} models`}
                      className="mt-3 flex flex-wrap gap-2"
                    >
                      {models.map((model) => {
                        const active = selection?.model === model.code;
                        return (
                          <button
                            key={model.code}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => chooseModel(active ? null : model)}
                            className={`flex items-center gap-1.5 rounded-2xl border px-3.5 py-2.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 ${
                              active
                                ? 'border-[var(--cat-accent)] bg-[var(--cat-tint)] text-[var(--cat-deep)]'
                                : 'border-slate-200/70 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {active && <Check size={13} strokeWidth={3.5} />}
                            {model.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-[12.5px] font-medium text-slate-400">
            Brand not listed?{' '}
            <Link to={`/book/${code}`} className="font-bold text-[var(--cat-accent)] hover:underline">
              Continue without it
            </Link>
          </p>
        </div>

        {/* ── Sticky continue bar ──────────────────────────────────────── */}
        <div
          className="sticky bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="page-container flex items-center gap-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {selectedBrand ? (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-slate-200/70 bg-white p-1.5">
                    <BrandLogo brand={selectedBrand} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-black text-navy-900">
                      {selectedBrand.name}
                    </span>
                    <span className="block truncate text-[12px] font-semibold text-slate-500">
                      {selection?.modelName || 'Model not set'}
                    </span>
                  </span>
                </>
              ) : (
                <span className="text-[13px] font-semibold text-slate-500">
                  Pick a brand, or skip this step
                </span>
              )}
            </div>

            <motion.button
              type="button"
              onClick={(e) => { spawn(e); goToBooking(true); }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: easeSoft }}
              className={`relative shrink-0 overflow-hidden rounded-2xl px-6 py-3.5 text-[15px] font-black text-white shadow-[0_10px_24px_-10px_var(--cat-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] focus-visible:ring-offset-2 ${
                selectedBrand ? '' : 'opacity-60'
              }`}
              style={{ background: 'var(--cat-accent)' }}
            >
              <RippleLayer ripples={ripples} />
              <span className="relative z-10 flex items-center gap-1.5">
                Continue
                <ArrowRight size={16} strokeWidth={3} />
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
