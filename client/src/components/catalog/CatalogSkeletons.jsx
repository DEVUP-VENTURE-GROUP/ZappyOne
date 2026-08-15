/**
 * Loading placeholders for the catalog.
 *
 * These mirror the real card's box model exactly (same padding, same 62px
 * illustration tile, same footer height) so the grid doesn't reflow when data
 * lands. Shimmer comes from the global `.skeleton` class, which already drops
 * to a flat fill under prefers-reduced-motion.
 */

function Bar({ className = '' }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

export function ServiceCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-[24px] border border-slate-200/70 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <div className="skeleton h-[62px] w-[62px] shrink-0 rounded-[18px]" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <Bar className="h-4 w-4/5" />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-3/5" />
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Bar className="h-3 w-16" />
        <Bar className="h-3 w-24" />
      </div>
      <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-4">
        <div className="space-y-2">
          <Bar className="h-2.5 w-16" />
          <Bar className="h-5 w-20" />
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-9 w-24 rounded-full" />
          <Bar className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ServiceGridSkeleton({ count = 6, mosaic = false }) {
  // Mosaic placeholders mirror the tile rhythm — two double-width leads, then
  // quarter-width tiles — so the grid doesn't reshuffle when data lands.
  if (mosaic) {
    return (
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3 lg:grid-cols-6" aria-hidden>
        {Array.from({ length: Math.max(count, 8) }).map((_, i) => (
          <div
            key={i}
            className={
              i < 4
                ? 'skeleton col-span-2 h-[188px] rounded-[20px] sm:h-[212px]'
                : 'skeleton col-span-1 h-[136px] rounded-[20px] sm:h-[152px]'
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <ServiceCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function FacetRailSkeleton() {
  return (
    <div className="flex gap-2 overflow-hidden" aria-hidden>
      {[64, 88, 112, 96, 76].map((w, i) => (
        <div key={i} className="skeleton h-9 shrink-0 rounded-full" style={{ width: w }} />
      ))}
    </div>
  );
}

export function BannerSkeleton() {
  return <div className="skeleton h-[168px] w-full rounded-[28px] sm:h-[188px]" aria-hidden />;
}
