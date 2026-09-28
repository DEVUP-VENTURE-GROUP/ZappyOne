/**
 * AnimatedETA — The "something is coming fast" ETA display.
 *
 * States:
 *  • Calculating — animated spinning dots + wave text
 *  • ETA arrives — number flips in from above with speed lines
 *  • ETA counting — live countdown with urgency pulse when < 3 min
 *  • Arrived     — celebration burst
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Navigation } from 'lucide-react';

/* CSS injected once */
function ensureStyles() {
  if (document.getElementById('aeta-css')) return;
  const s = document.createElement('style');
  s.id = 'aeta-css';
  s.textContent = `
    @keyframes aeta-speed-line {
      0%   { transform: translateX(-120%) scaleX(0.3); opacity: 0;   }
      40%  { opacity: 1; }
      100% { transform: translateX(120%)  scaleX(1.0); opacity: 0;   }
    }
    @keyframes aeta-digit-in {
      from { transform: translateY(-24px); opacity: 0; }
      to   { transform: translateY(0px);   opacity: 1; }
    }
    @keyframes aeta-pulse-ring {
      0%   { transform: scale(1);   opacity: .7; }
      100% { transform: scale(2.4); opacity: 0;  }
    }
    @keyframes aeta-dot-wave {
      0%,60%,100% { transform: translateY(0);   }
      30%         { transform: translateY(-5px); }
    }
    .aeta-speed-line {
      position: absolute; height: 1.5px; width: 40px; border-radius: 99px;
      background: linear-gradient(90deg, transparent, currentColor, transparent);
      animation: aeta-speed-line 0.9s ease-in-out infinite;
    }
    .aeta-digit { animation: aeta-digit-in 0.35s cubic-bezier(.22,1,.36,1) both; }
    .aeta-dot { animation: aeta-dot-wave 1.2s ease-in-out infinite; }
    .aeta-dot:nth-child(2) { animation-delay: 0.15s; }
    .aeta-dot:nth-child(3) { animation-delay: 0.30s; }
  `;
  document.head.appendChild(s);
}

function SpeedLines({ color = '#2563eb', count = 4 }) {
  const lines = Array.from({ length: count }, (_, i) => ({
    top: `${18 + i * 16}%`,
    width: `${28 + i * 12}px`,
    delay: `${i * 0.22}s`,
    opacity: 0.4 - i * 0.07,
  }));
  return (
    <div className="absolute inset-y-0 left-0 w-full overflow-hidden pointer-events-none">
      {lines.map((l, i) => (
        <span
          key={i}
          className="aeta-speed-line"
          style={{ top: l.top, width: l.width, animationDelay: l.delay, color, opacity: l.opacity }}
        />
      ))}
    </div>
  );
}

function DigitFlip({ value }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        className="aeta-digit inline-block tabular-nums"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        exit={{    y:  16, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

export default function AnimatedETA({ etaMinutes, status }) {
  ensureStyles();

  const prevEta     = useRef(etaMinutes);
  const [showLines, setShowLines] = useState(false);
  const lineTimer   = useRef(null);

  const isArrived    = status === 'arrived';
  const isCalculating = etaMinutes == null && !isArrived;
  const isUrgent     = !isArrived && etaMinutes != null && etaMinutes <= 2;

  // Flash speed lines whenever ETA changes
  useEffect(() => {
    if (etaMinutes != null && etaMinutes !== prevEta.current) {
      prevEta.current = etaMinutes;
      setShowLines(true);
      clearTimeout(lineTimer.current);
      lineTimer.current = setTimeout(() => setShowLines(false), 1200);
    }
  }, [etaMinutes]);

  if (isArrived) {
    return (
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(90deg,#f0fdf4,#dcfce7)' }}>
        <div className="flex items-center gap-2">
          <motion.span
            className="text-xl"
            animate={{ rotate: [0, -10, 10, -5, 0], scale: [1, 1.2, 1] }}
            transition={{ duration: 0.6 }}
          >
            📍
          </motion.span>
          <span className="text-sm font-bold text-green-800">Worker has arrived</span>
        </div>
        <motion.span
          className="text-sm font-black text-green-700"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          At your location
        </motion.span>
      </div>
    );
  }

  return (
    <div
      className="px-4 py-3 relative overflow-hidden flex items-center justify-between"
      style={{
        background: isUrgent
          ? 'linear-gradient(90deg,#fff7ed,#ffedd5)'
          : 'linear-gradient(90deg,#eff6ff,#dbeafe)',
      }}
    >
      {/* Speed lines flash on ETA update */}
      {showLines && <SpeedLines color={isUrgent ? '#ea580c' : '#2563eb'} count={4} />}

      {/* Left: label */}
      <div className="flex items-center gap-2 z-10">
        {isUrgent ? (
          <motion.div
            animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.8 }}
          >
            <Zap size={14} strokeWidth={2.5} className="text-orange-500" />
          </motion.div>
        ) : (
          <motion.div
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Navigation size={13} strokeWidth={2} className="text-blue-500" />
          </motion.div>
        )}
        <span className={`text-xs font-semibold ${isUrgent ? 'text-orange-700' : 'text-blue-700'}`}>
          Estimated arrival
        </span>
      </div>

      {/* Right: ETA value */}
      <div className="z-10 flex items-baseline gap-1">
        {isCalculating ? (
          /* Animated dots while calculating */
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-blue-400">Calculating</span>
            <span className="flex gap-0.5 items-end mb-0.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="aeta-dot w-1 h-1 rounded-full bg-blue-400 inline-block"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        ) : (
          <>
            {/* Pulsing ring when very close */}
            {isUrgent && (
              <span className="relative flex items-center justify-center w-5 h-5 mr-1">
                <span
                  className="absolute rounded-full w-full h-full"
                  style={{
                    background: '#ea580c',
                    animation: 'aeta-pulse-ring 1s ease-out infinite',
                    opacity: 0.35,
                  }}
                />
                <span className="w-2 h-2 rounded-full bg-orange-500 relative z-10" />
              </span>
            )}

            {/* Digit flip animation */}
            <span
              className="font-black text-xl tabular-nums leading-none"
              style={{ color: isUrgent ? '#c2410c' : '#1d4ed8' }}
            >
              <DigitFlip value={etaMinutes} />
            </span>

            <span className={`text-[11px] font-bold ${isUrgent ? 'text-orange-600' : 'text-blue-500'}`}>
              min{etaMinutes === 1 ? '' : 's'}
            </span>

            {isUrgent && (
              <motion.span
                className="ml-1 text-[10px] font-black text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 0.7, repeat: Infinity }}
              >
                Almost here!
              </motion.span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
