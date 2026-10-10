import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { fadeInUp } from '../../../lib/animations';
import { fmtTime } from '@shared/customer/trackingSteps';

/**
 * What has happened on the job, newest first, from the real status history.
 *
 * The current step is a blue dot with a soft pulse; every step before it is a
 * filled check, and the line joining them is drawn in brand blue, flowing down
 * from the latest step, so progress reads at a glance. New steps slide in on
 * top. Motion is skipped for anyone who asks for less of it.
 */
export default function ActivityFeed({ events, live = true }) {
  const reduce = useReducedMotion();
  if (!events?.length) return null;

  return (
    <motion.div variants={fadeInUp} className="rounded-card border border-line bg-white p-[18px]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[16px] font-bold text-ink-900">Live updates</h3>
        {live && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" /> Live
          </span>
        )}
      </div>

      <ol className="flex flex-col">
        <AnimatePresence initial={false}>
          {events.map((e, i) => {
            // A finished job has no step in progress: every step is a check.
            const current = i === 0 && live;
            const last = i === events.length - 1;
            return (
              <motion.li
                key={`${e.status}-${e.at}`}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex gap-3"
              >
                {/* Marker and the line down to the previous step */}
                <div className="flex w-5 shrink-0 flex-col items-center self-stretch">
                  {current ? (
                    <span className="relative mt-1 flex h-5 w-5 items-center justify-center">
                      {!reduce && <span className="absolute inset-0 animate-ping rounded-full bg-zappy-600/30" aria-hidden="true" />}
                      <span className="relative h-3 w-3 rounded-full bg-zappy-600 ring-4 ring-zappy-50" />
                    </span>
                  ) : (
                    <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-zappy-600 text-white">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                  {!last && (
                    <span className="relative my-1 w-[2px] flex-1 overflow-hidden rounded-full bg-zappy-100">
                      <motion.span
                        className="absolute inset-x-0 top-0 rounded-full bg-zappy-600"
                        initial={reduce ? { height: '100%' } : { height: '0%' }}
                        animate={{ height: '100%' }}
                        transition={{ duration: 0.5, delay: reduce ? 0 : 0.15 + i * 0.12, ease: 'easeOut' }}
                      />
                    </span>
                  )}
                </div>

                <div className={`min-w-0 flex-1 ${last ? 'pb-0' : 'pb-4'}`}>
                  <p className={`text-[14px] leading-snug ${current ? 'font-bold text-ink-900' : 'font-medium text-ink-700'}`}>{e.text}</p>
                  <time className="text-[12px] tabular-nums text-ink-400">{fmtTime(e.at)}</time>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </motion.div>
  );
}
