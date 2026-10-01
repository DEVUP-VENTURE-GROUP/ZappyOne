import { motion } from 'framer-motion';
import { CheckCircle, Clock, Zap } from 'lucide-react';
import { fadeInUp } from '../../../lib/animations';
import { STEPS, fmtTime } from './_shared';

/**
 * Vertical progress timeline showing all lifecycle stages.
 * `activeStepIdx` marks the current step (glowing ring).
 * `timesByStatus` is a { [status]: iso-date } map from real statusHistory
 * — passed times render on their step; the current step shows "Now".
 */
export default function PremiumTimeline({ steps = STEPS, activeStepIdx, timesByStatus = {} }) {
  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-[24px] bg-white p-[18px]"
      style={{
        boxShadow: '0 12px 34px -12px rgba(15,23,42,.18)',
        border: '1px solid rgba(255,255,255,.9)',
      }}
    >
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[16px] font-extrabold tracking-[-.02em] text-[#0B1220]">Live status</h3>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
          style={{ color: '#1D4ED8', background: '#EAF0FF' }}
        >
          <Zap size={12} strokeWidth={2.5} fill="currentColor" /> Real-time
        </span>
      </div>

      <div className="flex flex-col">
        {steps.map((s, i) => {
          const done    = activeStepIdx > i;
          const current = activeStepIdx === i;
          // "searching" and "created" statuses map to the first step
          const at = timesByStatus[s.key];

          return (
            <div key={s.key} className="flex gap-3.5">
              {/* Rail — node + connector */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center relative z-[2] transition"
                  style={
                    done
                      ? { background: 'linear-gradient(135deg,#2E86FF,#2563FF)', color: '#fff', boxShadow: '0 6px 14px -4px rgba(37,99,235,.55)' }
                      : current
                      ? { background: 'linear-gradient(135deg,#3B82F6,#2563FF)', color: '#fff', boxShadow: '0 0 0 5px rgba(37,99,235,.15),0 8px 18px -4px rgba(37,99,235,.6)' }
                      : { background: '#EEF2F9', color: '#B4C0D4', border: '1.5px solid #E3E9F3' }
                  }
                >
                  {current && (
                    <span
                      className="absolute rounded-full"
                      style={{ inset: -5, border: '2px solid rgba(37,99,235,.5)', animation: 'zpt-ring 1.8s ease-out infinite' }}
                    />
                  )}
                  {done ? (
                    <CheckCircle size={16} strokeWidth={2.6} />
                  ) : current ? (
                    <span className="w-[9px] h-[9px] rounded-full bg-white" style={{ animation: 'zpt-beat 1.5s infinite' }} />
                  ) : (
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#CBD5E1' }} />
                  )}
                </div>

                {i < steps.length - 1 && (
                  <div
                    className="w-[2.5px] flex-1 min-h-[22px] my-[3px] rounded-[2px] relative overflow-hidden"
                    style={{ background: done ? 'linear-gradient(#2563FF,#4C86FF)' : '#EAEEF6' }}
                  >
                    {current && (
                      <span
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(180deg,transparent,#2563FF)', animation: 'zpt-flow 1.6s linear infinite' }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className={`flex-1 min-w-0 ${i < steps.length - 1 ? 'pb-5' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[14.5px] leading-tight tracking-[-.015em]"
                    style={{
                      fontWeight: current ? 800 : 700,
                      color: current ? '#1D4ED8' : done ? '#0B1220' : '#94A3B8',
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    className="text-[11px] font-semibold tabular-nums shrink-0"
                    style={{ color: current ? '#2563FF' : '#94A3B8' }}
                  >
                    {current ? 'Now' : at ? fmtTime(at) : ''}
                  </span>
                </div>

                {(current || done) && (
                  <p className="text-[12.5px] text-[#647084] mt-[3px] leading-snug">{s.desc}</p>
                )}

                {done && (
                  <span
                    className="inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-[3px] rounded-lg mt-1.5"
                    style={{ background: '#E7F6EE', color: '#0B7A3B' }}
                  >
                    <CheckCircle size={11} strokeWidth={3} /> Completed
                  </span>
                )}
                {current && (
                  <span
                    className="inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-[3px] rounded-lg mt-1.5"
                    style={{ background: '#EAF0FF', color: '#1D4ED8' }}
                  >
                    <Clock size={11} strokeWidth={2.5} /> In progress
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
