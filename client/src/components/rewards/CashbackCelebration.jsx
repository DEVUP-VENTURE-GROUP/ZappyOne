import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Wallet, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* Confetti particle (pure CSS animation, no lib) */
const CONFETTI_COLORS = [
  '#3B82F6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#f97316', '#14b8a6', '#a855f7', '#eab308',
];

const CONFETTI_COUNT = 60;

function Confetti() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => {
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const left = `${(i * 1.7) % 100}%`;
        const delay = `${(i * 0.04) % 1.5}s`;
        const size = 6 + (i % 6);
        const duration = `${1.8 + (i % 10) * 0.15}s`;
        const rotate = (i % 4) * 90;
        const isSquare = i % 3 !== 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left,
              top: '-10px',
              width: size,
              height: isSquare ? size : size * 0.4,
              background: color,
              borderRadius: isSquare ? '2px' : '50%',
              animation: `confetti-fall ${duration} ${delay} ease-in forwards`,
              transform: `rotate(${rotate}deg)`,
              opacity: 0.9,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0)    rotate(0deg)   scaleX(1); opacity: 1; }
          50%  { transform: translateY(40vh) rotate(180deg) scaleX(0.7); opacity: 1; }
          100% { transform: translateY(110vh) rotate(360deg) scaleX(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* Orbiting sparkle ring */
function SparkleRing({ amount }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings */}
      <motion.div
        className="absolute rounded-full border-2 border-violet-300/40"
        style={{ width: 160, height: 160 }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.1, 0.4] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full border-2 border-zappy-300/30"
        style={{ width: 200, height: 200 }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.08, 0.3] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
      />

      {/* Center coin */}
      <motion.div
        className="relative w-28 h-28 rounded-full flex items-center justify-center shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #3B82F6 0%, #8b5cf6 50%, #a855f7 100%)',
          boxShadow: '0 0 0 8px rgba(59,130,246,0.15), 0 24px 60px rgba(59,130,246,0.45)',
        }}
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.1 }}
      >
        <span className="text-5xl select-none">💰</span>
        {/* Shimmer sweep */}
        <motion.div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)' }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2 }}
        />
      </motion.div>

      {/* Orbiting sparkles */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <motion.div
          key={deg}
          className="absolute"
          style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
          animate={{
            rotate: [deg, deg + 360],
            x: Math.cos((deg * Math.PI) / 180) * 72,
            y: Math.sin((deg * Math.PI) / 180) * 72,
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

/* Main export */
export default function CashbackCelebration({ amountPaise, totalEarnedPaise, onClose }) {
  const nav = useNavigate();
  const timerRef = useRef(null);

  const amount = Math.round((amountPaise || 0) / 100);
  const totalEarned = Math.round((totalEarnedPaise || 0) / 100);

  // Auto-dismiss after 6s
  useEffect(() => {
    timerRef.current = setTimeout(onClose, 6000);
    return () => clearTimeout(timerRef.current);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }} />

        {/* Confetti */}
        <Confetti />

        {/* Card */}
        <motion.div
          className="relative z-10 mx-4 rounded-3xl overflow-hidden text-center"
          style={{
            background: 'linear-gradient(165deg, #1e1b4b 0%, #2e1065 40%, #1e1b4b 100%)',
            border: '1px solid rgba(139,92,246,0.35)',
            boxShadow: '0 40px 100px rgba(59,130,246,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
            maxWidth: 360,
            width: '100%',
          }}
          initial={{ scale: 0.6, y: 40, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>

          {/* Top gradient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-30"
            style={{ background: 'radial-gradient(ellipse, #8b5cf6, transparent)', filter: 'blur(20px)' }} />

          <div className="relative px-6 pt-8 pb-6 space-y-5">
            {/* Sparkle ring */}
            <SparkleRing amount={amount} />

            {/* Copy */}
            <div className="space-y-2">
              <motion.p
                className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-400"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Cashback Credited
              </motion.p>
              <motion.p
                className="text-5xl font-black text-white"
                style={{ textShadow: '0 0 30px rgba(139,92,246,0.8)' }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
              >
                ₹{amount}
              </motion.p>
              <motion.p
                className="text-sm font-semibold text-white/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                is back in your wallet — just for using Zappy!
              </motion.p>
            </div>

            {/* Stats strip */}
            {totalEarned > 0 && (
              <motion.div
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Sparkles size={13} className="text-amber-400" />
                <p className="text-xs font-bold text-white/60">
                  Total cashback earned:
                  <span className="text-amber-400 ml-1.5">₹{totalEarned}</span>
                </p>
              </motion.div>
            )}

            {/* Marketing line */}
            <motion.p
              className="text-xs text-white/40 font-medium leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              Every order earns you real money back.<br />
              The more you book, the more you save.
            </motion.p>

            {/* CTA */}
            <motion.div
              className="flex gap-2.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <button
                onClick={() => { onClose(); nav('/wallet'); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-extrabold text-white"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6, #8b5cf6)',
                  boxShadow: '0 8px 24px rgba(59,130,246,0.4)',
                }}
              >
                <Wallet size={15} />
                View Wallet
              </button>
              <button
                onClick={onClose}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white/70 bg-white/08"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                Continue
                <ArrowRight size={14} />
              </button>
            </motion.div>
          </div>

          {/* Bottom auto-dismiss bar */}
          <motion.div
            className="h-1 rounded-b-3xl"
            style={{ background: 'linear-gradient(90deg, #3B82F6, #8b5cf6, #ec4899)' }}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 6, ease: 'linear' }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
