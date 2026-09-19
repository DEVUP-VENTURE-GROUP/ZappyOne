import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { isFestiveActive } from './festive';

export default function GaneshFestiveHeader() {
  // Outside the campaign window Home renders its normal hero. See ./festive.js.
  if (!isFestiveActive()) return null;

  // Simple floating animation for petals/leaves in the background
  const floatingVariants = {
    animate: {
      y: [0, -15, 0],
      rotate: [0, 10, -10, 0],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  return (
    <div className="relative w-full overflow-hidden bg-gradient-to-b from-[#FFF2D7] to-[#FFE6B3] pt-6 pb-2">
      {/* Background decorations */}
      <motion.div 
        className="absolute top-4 left-4 text-orange-400 opacity-60"
        variants={floatingVariants}
        animate="animate"
      >
        <Sparkles size={24} />
      </motion.div>
      <motion.div 
        className="absolute top-8 right-6 text-pink-400 opacity-60"
        variants={floatingVariants}
        animate="animate"
        style={{ animationDelay: '1s' }}
      >
        <Sparkles size={20} />
      </motion.div>

      {/* Header Text */}
      <div className="text-center relative z-10 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-center gap-2 mb-1"
        >
          <span className="text-rose-500 text-sm">🌸</span>
          <span className="text-rose-600 font-bold text-sm tracking-wide uppercase">Celebrate</span>
          <span className="text-rose-500 text-sm">🌸</span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-4xl font-black text-rose-600 tracking-tight"
          style={{ fontFamily: "'Outfit', 'Inter', sans-serif" }}
        >
          Ganesh Chaturthi
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-orange-600/80 font-semibold text-xs mt-1"
        >
          14th September
        </motion.p>
      </div>

      {/* Bottom festive edge decoration (SVG wave or similar could go here) */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent opacity-80 z-0" />
    </div>
  );
}
