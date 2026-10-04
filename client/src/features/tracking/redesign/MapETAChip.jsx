import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

/**
 * Floating glass chip overlaid on the top-left of the map,
 * showing the live ETA + remaining distance.
 * Renders only when there's a meaningful ETA to show.
 */
export default function MapETAChip({ eta, distanceKm, status }) {
  const show = eta != null && ['assigned', 'on_the_way'].includes(status);
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="absolute left-3 top-3 z-20 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl pointer-events-none"
      style={{
        background: 'rgba(255,255,255,.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,.7)',
        boxShadow: '0 18px 50px -18px rgba(15,23,42,.4)',
      }}
    >
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: '#EAF0FF', color: '#2563FF' }}
      >
        <Clock size={18} strokeWidth={2.2} />
      </span>
      <div>
        <p className="text-[17px] font-extrabold leading-none tracking-[-.02em] tabular-nums" style={{ color: '#0B1220' }}>
          {eta} min away
        </p>
        <p className="text-[10.5px] font-semibold mt-0.5" style={{ color: '#647084' }}>
          Estimated arrival{distanceKm != null ? ` · ${Number(distanceKm).toFixed(1)} km` : ''}
        </p>
      </div>
    </motion.div>
  );
}
