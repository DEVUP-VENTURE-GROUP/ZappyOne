import { motion } from 'framer-motion';
import { ArrowLeft, Zap, Share2, ShieldAlert, HeadphonesIcon, Clock } from 'lucide-react';
import { STATUS_PILL, shortId } from './_shared';

/**
 * Sticky dark navigation header, for every job kind.
 * Shows: ← back · service · reference · what it is for (device, pets, items)
 *        share · SOS · support
 *        live-status / ETA / distance pills
 *
 * `job` is the common tracked-job shape (tracking/kinds.js). Pricing lives in
 * <BookingSummary/>.
 */
export default function TrackingHeader({
  job, status, eta, distanceKm, terminal,
  onBack, onShare, onSOS, onSupport,
}) {
  const pill = STATUS_PILL[status] || STATUS_PILL.searching;

  return (
    <header className="sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(9,20,44,.99) 0%, rgba(11,24,52,.96) 100%)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        boxShadow: '0 10px 30px -18px rgba(0,0,0,.6)',
      }}>
        <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-3 pb-3">
          <div className="flex items-center gap-2.5">
            <motion.button
              onClick={onBack}
              whileTap={{ scale: 0.9 }}
              aria-label="Back"
              className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,.10)' }}
            >
              <ArrowLeft size={19} strokeWidth={2.5} className="text-white" />
            </motion.button>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/50">Live tracking</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="w-[26px] h-[26px] rounded-[9px] flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(#3B82F6, #3B82F6)', boxShadow: '0 4px 12px -2px rgba(37,99,235,.7)' }}
                >
                  <Zap size={14} className="text-white" fill="currentColor" />
                </span>
                <b className="text-[17px] font-extrabold text-white tracking-[-.02em] leading-none truncate capitalize">
                  {job.service}
                </b>
              </div>
              <p className="text-[11px] text-white/45 mt-[3px] tabular-nums truncate">
                {job.reference || `#${shortId(job.id)}`}{job.subtitle ? ` · ${job.subtitle}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!terminal && onShare && (
                <motion.button
                  onClick={onShare}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Share trip"
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,.10)' }}
                >
                  <Share2 size={16} strokeWidth={2} className="text-white/85" />
                </motion.button>
              )}
              {!terminal && job.provider && onSOS && (
                <motion.button
                  onClick={onSOS}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Emergency SOS"
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center"
                  style={{ background: 'rgba(226,59,78,.20)' }}
                >
                  <ShieldAlert size={16} strokeWidth={2.5} className="text-red-300" />
                </motion.button>
              )}
              {onSupport && (
                <motion.button
                  onClick={onSupport}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Support"
                  className="w-10 h-10 rounded-[14px] flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,.10)' }}
                >
                  <HeadphonesIcon size={16} strokeWidth={2} className="text-white/85" />
                </motion.button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 h-[29px] px-2.5 rounded-[11px] text-xs font-bold"
              style={{
                background: pill.live ? 'rgba(18,161,80,.16)' : 'rgba(255,255,255,.09)',
                color: pill.live ? '#5AE39A' : 'rgba(255,255,255,.7)',
              }}
            >
              {pill.live && (
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#34D27B', animation: 'zpt-beat 1.8s infinite' }} />
              )}
              {job.statusLabel || pill.label}
            </span>

            {!terminal && eta != null && ['assigned', 'on_the_way'].includes(status) && (
              <span
                className="inline-flex items-center gap-1.5 h-[29px] px-2.5 rounded-[11px] text-xs font-bold tabular-nums"
                style={{ background: 'rgba(37,99,235,.20)', color: '#9FC0FF' }}
              >
                <Clock size={12} strokeWidth={2.5} /> ~{eta} min
              </span>
            )}

            {['assigned', 'on_the_way'].includes(status) && distanceKm != null && (
              <span
                className="inline-flex items-center h-[29px] px-2.5 rounded-[11px] text-xs font-bold tabular-nums"
                style={{ background: 'rgba(255,255,255,.09)', color: 'rgba(255,255,255,.86)' }}
              >
                {Number(distanceKm).toFixed(1)} km away
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
