import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Heart, Search, Share2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import VoiceSearchButton from '../common/VoiceSearchButton';
import ServiceIllustration from './ServiceIllustration';
import { easeSoft, reducedMotion } from '../../lib/animations';

/**
 * Catalog header: the oversized title block, then a sticky search + filter bar.
 *
 * The title collapses into the sticky bar once it scrolls past — driven by an
 * IntersectionObserver on a 1px sentinel rather than a scroll listener, which
 * keeps it off the main thread and correct regardless of which element is
 * actually scrolling (the app shell scrolls the body on mobile and an inner
 * container on desktop).
 */

export default function CatalogHeader({
  category,
  query,
  onQueryChange,
  stats = [],
  savedCount = 0,
  savedActive = false,
  onToggleSaved,
  children, // the facet rail — pinned together with the search bar
}) {
  const nav = useNavigate();
  const sentinelRef = useRef(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const share = async () => {
    const payload = {
      title: `${category.title} · Zappy`,
      text: category.subtitle,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(payload.url);
      toast.success('Link copied');
    } catch (err) {
      // A user dismissing the share sheet is not an error worth surfacing.
      if (err?.name !== 'AbortError') toast.error('Could not share this page');
    }
  };

  return (
    <>
      <div className="relative overflow-hidden">
        {/* Ambient category wash behind the title block. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-64"
          style={{
            background:
              'radial-gradient(60% 70% at 15% 0%, var(--cat-tint) 0%, rgba(255,255,255,0) 70%)',
          }}
        />

        <div
          className="page-container relative"
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleSaved}
                aria-pressed={savedActive}
                aria-label={
                  savedActive
                    ? 'Show all services'
                    : `Show saved services${savedCount ? ` (${savedCount})` : ''}`
                }
                className={`relative flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold shadow-sm transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)] ${
                  savedActive
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-slate-200/70 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Heart
                  size={16}
                  strokeWidth={2.4}
                  className={savedActive ? 'fill-rose-500 text-rose-500' : ''}
                />
                {savedCount > 0 && <span className="tabular-nums">{savedCount}</span>}
              </button>

              <button
                type="button"
                onClick={share}
                aria-label="Share this page"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cat-accent)]"
              >
                <Share2 size={17} strokeWidth={2.3} />
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--cat-accent)]">
                {category.eyebrow}
              </span>
              <h1 className="mt-1 text-[30px] font-black leading-[1.08] tracking-tight text-navy-900 sm:text-[38px]">
                {category.title}
              </h1>
              <p className="mt-1.5 text-[14px] font-medium text-slate-500 sm:text-[15px]">
                {category.subtitle}
              </p>
            </div>

            <motion.div
              aria-hidden
              className="hidden shrink-0 sm:block"
              animate={reducedMotion ? {} : { y: [-4, 4, -4] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ServiceIllustration name={category.illustration} size={88} />
            </motion.div>
          </div>

          {/* Measured from the services actually in this category — no claims. */}
          {stats.length > 0 && (
            <ul className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
              {stats.map((stat) => (
                <li
                  key={stat.key}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1.5 text-[11.5px] font-bold text-slate-600 backdrop-blur-sm"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--cat-accent)' }}
                  />
                  {stat.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {/* Sticky: search + filters travel with the user through a long grid. */}
      <div
        className={`sticky top-0 z-30 border-b bg-white/85 backdrop-blur-xl transition-shadow duration-300 ${
          pinned ? 'border-slate-200/70 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.5)]' : 'border-transparent'
        }`}
      >
        <div className="page-container py-3">
          <div className="flex items-center gap-3">
            <AnimatePresence initial={false}>
              {pinned && (
                <motion.span
                  key="pinned-title"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.22, ease: easeSoft }}
                  className="hidden shrink-0 overflow-hidden whitespace-nowrap text-[15px] font-black text-navy-900 lg:block"
                >
                  {category.title}
                </motion.span>
              )}
            </AnimatePresence>

            <div className="relative flex flex-1 items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm transition-all focus-within:border-[var(--cat-accent)] focus-within:shadow-[0_0_0_4px_var(--cat-glow)]">
              <Search size={17} strokeWidth={2.4} className="shrink-0 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={category.searchPlaceholder}
                aria-label={`Search ${category.title}`}
                className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-navy-900 outline-none placeholder:font-medium placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
              />
              <AnimatePresence>
                {query && (
                  <motion.button
                    type="button"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    onClick={() => onQueryChange('')}
                    aria-label="Clear search"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    <X size={12} strokeWidth={3} />
                  </motion.button>
                )}
              </AnimatePresence>
              <VoiceSearchButton onResult={onQueryChange} />
            </div>
          </div>

          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </>
  );
}
