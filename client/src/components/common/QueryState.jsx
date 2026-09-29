import { motion } from 'framer-motion';
import { RefreshCw, Inbox, WifiOff } from 'lucide-react';

/**
 * Shared loading / empty / error primitives so every list & detail screen has the
 * same Uber/Zepto-grade states — never a dead spinner, never a blank area, always
 * a way to recover.
 *
 * Usage:
 *   <QueryState
 *     isLoading={isLoading} isError={isError} onRetry={refetch}
 *     isEmpty={items.length === 0}
 *     skeleton={<SkeletonList rows={5} />}
 *     empty={<EmptyState icon={Inbox} title="No bookings yet" .../>}
 *   >
 *     {items.map(...)}
 *   </QueryState>
 */

/* Skeletons */
export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton rounded-md ${className}`} style={{ minHeight: 12 }} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-4">
      <div className="flex items-center gap-3">
        <div className="skeleton w-11 h-11 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="h-3.5 w-2/3" />
          <SkeletonLine className="h-3 w-1/3" />
        </div>
        <div className="skeleton w-14 h-6 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 4, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

/* Empty state */
export function EmptyState({ icon: Icon = Inbox, title, subtitle, action, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center px-6 py-16 ${className}`}
    >
      <motion.div
        initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zappy-50 to-violet-50 flex items-center justify-center mb-4"
      >
        <Icon size={28} className="text-zappy-500" strokeWidth={1.75} />
      </motion.div>
      <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-[15rem]">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/* Error state (with retry) */
export function ErrorState({ onRetry, message, className = '' }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-16 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
        {offline ? <WifiOff size={26} className="text-rose-500" /> : <RefreshCw size={24} className="text-rose-500" />}
      </div>
      <h3 className="text-base font-extrabold text-slate-900">{offline ? "You're offline" : "Couldn't load this"}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-[16rem]">
        {message || (offline ? 'Check your connection and try again.' : 'Something went wrong on our end.')}
      </p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold active:scale-95 transition-transform">
          <RefreshCw size={15} /> Try again
        </button>
      )}
    </div>
  );
}

/* The wrapper */
export default function QueryState({
  isLoading, isError, isEmpty, error, onRetry,
  skeleton, empty, children,
}) {
  if (isLoading) return skeleton || <SkeletonList />;
  if (isError) return <ErrorState onRetry={onRetry} message={error?.data?.error} />;
  if (isEmpty) return empty || <EmptyState title="Nothing here yet" />;
  return children;
}
