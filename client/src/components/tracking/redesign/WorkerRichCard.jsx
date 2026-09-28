import { motion } from 'framer-motion';
import { Phone, MessageCircle, Star, ShieldCheck, Navigation, UserCheck } from 'lucide-react';
import { fadeInUp } from '../../../lib/animations';
import AnimatedETA from '../AnimatedETA';
import Avatar from './Avatar';

/**
 * The rich worker card shown once a technician is assigned.
 *  ┌ ┐
 *  │  [AV]  Name Verified Pro           │
 *  │        Certified Zappy professional    │
 *  │  ┌ ┬ ┬ ┐                │
 *  │  │ 4.9  │ 1240 │  ID  │  stats         │
 *  │  └ ┴ ┴ ┘                │
 *  │  ┌ ┬ ┬ ┬ ┐                 │
 *  │  │Call│Chat│Live│Prof│  actions        │
 *  │  └ ┴ ┴ ┴ ┘                 │
 *  │  → Estimated arrival        13 mins    │
 *  └ ┘
 */
export default function WorkerRichCard({ order, eta, status, onCall, onChat, onLive, onProfile }) {
  const rating = order.workerRating?.toFixed?.(1) || '—';
  const jobs   = order.workerJobs != null ? String(order.workerJobs) : '—';

  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-[24px] bg-white p-[18px]"
      style={{
        boxShadow: '0 12px 34px -12px rgba(15,23,42,.18)',
        border: '1px solid rgba(255,255,255,.9)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3.5">
        <button onClick={onProfile} className="shrink-0" aria-label="View profile">
          <Avatar name={order.workerName} size={62} radius={19} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onProfile}
              className="text-[18px] font-extrabold tracking-[-.02em] text-[#0B1220] truncate text-left"
            >
              {order.workerName || 'Your technician'}
            </button>
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-[3px] rounded-lg"
              style={{ color: '#0B7A3B', background: '#E7F6EE' }}
            >
              <ShieldCheck size={11} strokeWidth={2.5} /> Verified Pro
            </span>
          </div>
          <p className="text-[12.5px] text-[#647084] mt-1">Certified Zappy professional</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <Stat n={
          <span className="flex items-center justify-center gap-1">
            <Star size={14} className="text-[#F5A524]" fill="currentColor" />{rating}
          </span>
        } l="Rating" />
        <Stat n={jobs} l="Jobs done" />
        <Stat n={
          <span className="flex items-center justify-center gap-1">
            <ShieldCheck size={14} className="text-[#12A150]" /> ID
          </span>
        } l="Verified" />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        <ActionTile onClick={onCall}    label="Call"    tone="g"><Phone size={18} strokeWidth={2} /></ActionTile>
        <ActionTile onClick={onChat}    label="Chat"    tone="b"><MessageCircle size={18} strokeWidth={2} /></ActionTile>
        <ActionTile onClick={onLive}    label="Live"    tone="v"><Navigation size={18} strokeWidth={2} /></ActionTile>
        <ActionTile onClick={onProfile} label="Profile" tone="s"><UserCheck size={18} strokeWidth={2} /></ActionTile>
      </div>

      {/* Inline live ETA row — reuses the existing AnimatedETA */}
      {['assigned', 'on_the_way', 'arrived'].includes(status) && (
        <div className="mt-3.5">
          <AnimatedETA etaMinutes={eta} status={status} />
        </div>
      )}
    </motion.div>
  );
}

function Stat({ n, l }) {
  return (
    <div className="rounded-2xl py-3 px-2.5 text-center" style={{ background: '#F6F8FC' }}>
      <div className="text-[17px] font-extrabold text-[#0B1220] tabular-nums leading-none">{n}</div>
      <div className="text-[10.5px] font-semibold text-[#647084] mt-1.5">{l}</div>
    </div>
  );
}

function ActionTile({ children, label, tone, onClick }) {
  const tones = {
    g: { background: '#E7F6EE', color: '#12A150' },
    b: { background: '#EAF0FF', color: '#1D4ED8' },
    v: { background: '#EFEAFE', color: '#7C3AED' },
    s: { background: '#EEF2F9', color: '#475569' },
  };
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className="rounded-2xl pt-3 pb-2.5 px-1 flex flex-col items-center gap-1.5"
      style={{ background: '#F6F8FC' }}
    >
      <span
        className="w-[38px] h-[38px] rounded-[13px] flex items-center justify-center"
        style={tones[tone]}
      >
        {children}
      </span>
      <span className="text-[11px] font-bold text-[#334155]">{label}</span>
    </motion.button>
  );
}
