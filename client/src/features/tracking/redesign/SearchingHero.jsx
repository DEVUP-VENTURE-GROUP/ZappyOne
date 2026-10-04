import { motion } from 'framer-motion';
import { Zap, MapPin, ShieldCheck } from 'lucide-react';
import { fadeInUp } from '../../../lib/animations';

/**
 * Visual filler for the "searching" phase, when there's no worker to
 * populate the WorkerRichCard yet. Sets expectations, shows we're actively
 * looking, and communicates the trust story so the pane never feels empty.
 */
export default function SearchingHero({ etaMinutes }) {
  return (
    <motion.div
      variants={fadeInUp}
      className="relative overflow-hidden rounded-card p-[18px]"
      style={{
        background: 'linear-gradient(#0A1830, #0A1830)',
        boxShadow: '0 12px 34px -12px rgba(15,23,42,.28)',
      }}
    >
      {/* animated aura */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle,rgba(37,99,235,.45),transparent 70%)', animation: 'zpt-aura 4s ease-in-out infinite' }} />

      <div className="flex items-center gap-3 relative">
        <div className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: 'rgba(37,99,235,.22)', border: '1px solid rgba(159,192,255,.25)' }}>
          <Zap size={20} className="text-[#9FC0FF]" fill="currentColor" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-extrabold tracking-[-.02em] text-[16px]">Finding the best pro nearby</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-[3px] rounded-lg"
              style={{ color: '#5AE39A', background: 'rgba(18,161,80,.16)' }}>
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#34D27B', animation: 'zpt-beat 1.6s infinite' }} />
              Live
            </span>
          </div>
          <p className="text-[12.5px] text-white/60 mt-0.5">
            Broadcasting your request to top-rated professionals in your area
          </p>
        </div>
      </div>

      {/* scanning bar */}
      <div className="relative mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
        <span className="absolute top-0 bottom-0 w-1/3 rounded-full"
          style={{ background: 'linear-gradient(90deg,transparent,#2563FF,transparent)', animation: 'zpt-scan 1.8s linear infinite' }} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 relative">
        <MiniStat icon={<MapPin size={14} />} n={etaMinutes ? `~${etaMinutes} min` : 'Nearby'} l="Estimated match" />
        <MiniStat icon={<ShieldCheck size={14} />} n="Verified" l="ID + background" />
        <MiniStat icon={<Zap size={14} />} n="Instant" l="Sub-second match" />
      </div>
    </motion.div>
  );
}

function MiniStat({ icon, n, l }) {
  return (
    <div className="rounded-2xl py-2.5 px-2 text-center"
      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="flex items-center justify-center gap-1 text-[13px] font-extrabold text-white tabular-nums">
        <span className="text-[#9FC0FF]">{icon}</span>{n}
      </div>
      <div className="text-[10px] font-semibold text-white/50 mt-1">{l}</div>
    </div>
  );
}
