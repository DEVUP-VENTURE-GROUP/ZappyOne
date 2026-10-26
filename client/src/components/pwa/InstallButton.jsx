import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2 } from 'lucide-react';

/**
 * The single primary CTA for the install prompt.
 *
 * Full-width, 52px, blue→navy gradient with hover, press, ripple and loading
 * states. Purely presentational — the parent owns the install logic and passes
 * `loading` + `onClick`.
 */
export default function InstallButton({ onClick, loading = false, label = 'Install ZappyOne' }) {
  const [ripples, setRipples] = useState([]);

  const spawnRipple = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const id = Date.now();
    setRipples((r) => [
      ...r,
      { id, size, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2 },
    ]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 600);
  };

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        if (loading) return;
        spawnRipple(e);
        onClick?.(e);
      }}
      disabled={loading}
      aria-busy={loading}
      aria-label={label}
      whileHover={{ scale: loading ? 1 : 1.02 }}
      whileTap={{ scale: loading ? 1 : 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className="relative w-full h-[52px] rounded-2xl overflow-hidden bg-zappy-gradient text-white font-semibold text-[15px]
                 shadow-glow-blue outline-none focus-visible:ring-2 focus-visible:ring-zappy-400 focus-visible:ring-offset-2
                 disabled:cursor-not-allowed disabled:opacity-90"
    >
      {/* Sheen that sweeps across on hover for a premium feel */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)' }}
      />

      {/* Ripples */}
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden
          initial={{ opacity: 0.5, scale: 0 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="pointer-events-none absolute rounded-full bg-white/40"
          style={{ width: r.size, height: r.size, left: r.x, top: r.y }}
        />
      ))}

      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Installing…
          </>
        ) : (
          <>
            <Download size={18} strokeWidth={2.5} />
            {label}
          </>
        )}
      </span>
    </motion.button>
  );
}
