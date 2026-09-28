import { motion } from 'framer-motion';
import { Zap, Users } from 'lucide-react';
import { useGetWarmDispatchQuery } from '@shared/services/api';

/**
 * ZeroWait L2 — Warm Dispatch signal.
 *
 * Asks the server (before payment) whether a pro has ALREADY pre-accepted this
 * kind of job nearby. If so we can honestly promise an instant match — dispatch
 * will lock them with no offer/accept round-trip the moment the order is placed.
 * No worker is notified by this check, so nothing is wasted if the user bails.
 */
export default function InstantMatchBadge({ service, lat, lng }) {
  const skip = !service || lat == null || lng == null;
  const { data } = useGetWarmDispatchQuery(
    { service, lat, lng },
    { skip, refetchOnMountOrArgChange: true, pollingInterval: 45000 },
  );

  if (skip || !data?.warm) return null;

  // Instant pro standing by — the headline promise.
  if (data.instantAvailable) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-3.5 border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center gap-3"
      >
        <motion.div
          className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0"
          animate={{ boxShadow: ['0 0 0 0 rgba(16,185,129,0.5)', '0 0 0 10px rgba(16,185,129,0)'] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <Zap size={17} className="text-white fill-white" />
        </motion.div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-black text-emerald-900">⚡ Instant match available</p>
          <p className="text-[11.5px] text-emerald-700 leading-snug">
            A pro nearby has already accepted this job type — they’ll be assigned the second you confirm.
          </p>
        </div>
      </motion.div>
    );
  }

  // No pre-accepted pro, but show honest nearby supply instead of nothing.
  if (data.nearbyCount > 0) {
    return (
      <div className="rounded-2xl p-3 border border-slate-200 bg-white flex items-center gap-2.5">
        <Users size={15} className="text-slate-400 shrink-0" />
        <p className="text-[12.5px] text-slate-600">
          <b className="text-slate-900">{data.nearbyCount} pro{data.nearbyCount !== 1 ? 's' : ''}</b> available nearby.
        </p>
      </div>
    );
  }

  return null;
}
