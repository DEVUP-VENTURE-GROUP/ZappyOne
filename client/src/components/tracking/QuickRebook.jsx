import { motion } from 'framer-motion';
import { RotateCcw, ChevronRight, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SERVICE_LABELS = {
  puncture: 'Puncture Repair', plumbing: 'Plumbing', electrical: 'Electrical',
  ac_repair: 'AC Repair', carpenter: 'Carpenter', helper: 'Helper',
};

export default function QuickRebook({ service, workerName, workerRating, lastTotal }) {
  const nav = useNavigate();
  const label = SERVICE_LABELS[service] || service?.replace(/_/g, ' ') || 'Service';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0   }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 28 }}
      className="card bg-slate-900 overflow-hidden"
    >
      {/* subtle glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
        Book Again
      </p>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <RotateCcw size={16} className="text-white/80" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white capitalize text-sm">{label}</p>
          {workerName && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-white/50">with {workerName}</span>
              {workerRating && (
                <>
                  <Star size={9} className="text-amber-400 fill-amber-400" />
                  <span className="text-[11px] text-amber-300">{workerRating.toFixed?.(1)}</span>
                </>
              )}
            </div>
          )}
        </div>
        {lastTotal && (
          <span className="text-sm font-extrabold text-white shrink-0">₹{lastTotal}</span>
        )}
      </div>

      <button
        onClick={() => nav(`/book/${service}`)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-[#0F172A] text-sm font-bold hover:bg-slate-100 active:scale-[0.98] transition"
      >
        Book Again
        <ChevronRight size={14} />
      </button>
    </motion.div>
  );
}
