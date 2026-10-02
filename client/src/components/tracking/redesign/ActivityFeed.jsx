import { motion, AnimatePresence } from 'framer-motion';
import { fadeInUp } from '../../../lib/animations';
import { fmtTime } from './_shared';

/**
 * Streaming activity feed built from real statusHistory entries.
 * The most-recent event sits on top with a glowing brand dot; older
 * entries mute out. New entries slide in via layout animation.
 */
export default function ActivityFeed({ events }) {
  if (!events?.length) return null;

  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-card bg-white p-[18px]"
      style={{
        boxShadow: '0 12px 34px -12px rgba(15,23,42,.18)',
        border: '1px solid rgba(255,255,255,.9)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-extrabold tracking-[-.02em] text-[#0B1220]">Live updates</h3>
        <span className="text-[11px] font-bold text-[#94A3B8]">Auto-refresh</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {events.map((e, i) => (
            <motion.div
              key={`${e.status}-${e.at}`}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-3 py-2.5"
            >
              {/* Dot + connector */}
              <div className="flex flex-col items-center shrink-0 self-stretch">
                <span
                  className="w-[9px] h-[9px] rounded-full mt-[5px] shrink-0"
                  style={
                    i === 0
                      ? { background: '#2563FF', boxShadow: '0 0 0 3px #EAF0FF' }
                      : { background: '#CBD5E1', boxShadow: '0 0 0 3px #F1F5F9' }
                  }
                />
                {i < events.length - 1 && (
                  <span className="w-[2px] flex-1 min-h-[12px] mt-1.5 rounded-[2px]" style={{ background: '#EAEEF6' }} />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 pb-0.5">
                <p className="text-[13px] font-semibold text-[#334155] leading-snug">{e.text}</p>
                <time className="text-[11px] font-semibold text-[#94A3B8] tabular-nums">{fmtTime(e.at)}</time>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
