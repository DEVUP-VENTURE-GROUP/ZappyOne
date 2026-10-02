import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

/**
 * "How was your experience?" panel shown in the action bar
 * immediately after completion, before the user has rated.
 */
export default function RatingPanel({ onRate }) {
  const [value, setValue] = useState(0);
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(#0F172A, #0F172A)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.2)',
      }}
    >
      <div className="p-4 space-y-3">
        <p className="text-sm font-bold text-white text-center">How was your experience?</p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <motion.button
              key={n}
              onClick={() => setValue(n)}
              whileTap={{ scale: 0.85 }}
              className="p-1"
            >
              <Star
                size={32}
                strokeWidth={1.5}
                className={n <= value ? 'text-amber-400 fill-amber-400' : 'text-white/20'}
              />
            </motion.button>
          ))}
        </div>
        <motion.button
          onClick={() => onRate(value)}
          disabled={!value}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40 disabled:pointer-events-none"
          style={{ background: 'linear-gradient(#22c55e, #22c55e)' }}
        >
          Submit Rating
        </motion.button>
      </div>
    </div>
  );
}
