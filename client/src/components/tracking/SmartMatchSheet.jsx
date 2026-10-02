import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, MapPin, Award, X, CheckCircle } from 'lucide-react';

const REASONS = [
  { icon: MapPin,    text: 'Closest available worker to your location' },
  { icon: Star,      text: 'Top-rated with consistent 4.8+ reviews'    },
  { icon: Award,     text: 'Specialised in this service category'       },
];

export default function SmartMatchSheet({ worker, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* dim overlay */}
      <motion.div
        className="absolute inset-0 bg-black/30"
        onClick={onDismiss}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* sheet */}
      <motion.div
        className="relative w-full max-w-lg bg-white rounded-t-sheet overflow-hidden shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        {/* progress bar auto-dismiss */}
        <motion.div
          className="h-0.5 bg-blue-600 absolute top-0 left-0"
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: 6, ease: 'linear' }}
        />

        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-slate-200" />
        </div>

        <div className="px-5 pb-7 pt-2">
          {/* dismiss */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-1">
                Best match found
              </p>
              <h2 className="text-xl font-extrabold text-[#0F172A]">
                {worker?.name || 'Your Worker'}
              </h2>
            </div>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400"
            >
              <X size={16} />
            </button>
          </div>

          {/* worker summary */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
            <div className="w-12 h-12 rounded-2xl bg-zappy-gradient flex items-center justify-center text-white font-bold text-base shrink-0">
              {(worker?.name || 'W').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-[#0F172A] text-sm">{worker?.name || 'Worker'}</p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Star size={11} className="text-amber-400 fill-amber-400" />
                <span className="text-xs font-semibold text-slate-700">
                  {worker?.rating?.toFixed?.(1) || '4.8'}
                </span>
                <span className="text-slate-300 text-xs">·</span>
                <span className="text-xs text-slate-500">{worker?.completedJobs || 0}+ jobs</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400">ETA</p>
              <p className="font-extrabold text-[#0F172A] text-sm">
                {worker?.etaMinutes != null ? `${worker.etaMinutes} min` : '—'}
              </p>
            </div>
          </div>

          {/* match reasons */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Why this match
          </p>
          <div className="space-y-2.5">
            {REASONS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-blue-600" />
                </div>
                <p className="text-xs font-medium text-slate-700 leading-snug">{text}</p>
                <CheckCircle size={12} className="text-green-500 shrink-0 ml-auto" />
              </div>
            ))}
          </div>

          <button
            onClick={onDismiss}
            className="w-full mt-5 py-3 rounded-xl bg-[#0F172A] text-white text-sm font-bold hover:bg-slate-800 active:scale-[0.98] transition"
          >
            Track Worker
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
