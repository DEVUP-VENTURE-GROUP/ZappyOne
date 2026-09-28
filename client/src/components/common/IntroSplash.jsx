import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZappyLogo } from '@shared/components/common/ZappyLogo';

const IMAGES = [
  'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=400&h=300&q=80', // Phone screen
  'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=400&h=300&q=80', // Phone battery
  'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&h=300&q=80', // Laptop slow
  'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=400&h=300&q=80', // Laptop charge
  'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&h=300&q=80', // Data rec
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&h=300&q=80', // Puncture
  'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&h=300&q=80', // Car Wash
  'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=400&h=300&q=80', // Jump start
  'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=400&h=300&q=80', // Bike Service
  'https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=400&h=300&q=80', // Car Detail
  'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=400&h=400&q=80', // Baby shower
  'https://images.unsplash.com/photo-1494972308805-463bc619d34e?auto=format&fit=crop&w=400&h=400&q=80', // Romantic
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&h=400&q=80', // Housewarm
  'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&h=400&q=80', // Pet Groom
  'https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?auto=format&fit=crop&w=400&h=400&q=80', // Pet Walk
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&h=400&q=80', // Pet Sit
  'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&h=400&q=80', // Vet help
  'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=400&h=400&q=80', // Pet Transport
  'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=400&auto=format&fit=crop',     // Cleaning
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop',     // Beauty
  'https://images.unsplash.com/photo-1607472586893-edb57cbca132?q=80&w=400&auto=format&fit=crop',     // Plumbing
  'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=400&auto=format&fit=crop'      // Painting
];

export default function IntroSplash({ onComplete }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenIntro');
    
    if (!hasSeen) {
      setIsVisible(true);
      // Play for exactly 5.5 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Safari private mode / quota errors would otherwise throw inside the
        // setTimeout, skipping onComplete and stalling parents that depend on it.
        try { localStorage.setItem('hasSeenIntro', 'true'); } catch { /* ignore */ }
        if (onComplete) onComplete();
      }, 5500);
      return () => clearTimeout(timer);
    } else {
      if (onComplete) onComplete();
    }
  }, [onComplete]);

  // Layout positions for the 22 images to form a realistic scattered/masonry collage
  // Values are percentages for highly responsive scaling
  const positions = [
    { top: '-10%', left: '-10%', width: '35%', height: '30%' },
    { top: '-15%', left: '30%', width: '30%', height: '35%' },
    { top: '-5%', left: '65%', width: '45%', height: '30%' },
    { top: '25%', left: '-20%', width: '40%', height: '35%' },
    { top: '20%', left: '25%', width: '50%', height: '40%' }, // Center large piece
    { top: '30%', left: '80%', width: '35%', height: '35%' },
    { top: '65%', left: '-15%', width: '35%', height: '35%' },
    { top: '65%', left: '25%', width: '25%', height: '35%' },
    { top: '75%', left: '55%', width: '40%', height: '30%' },
    { top: '70%', left: '90%', width: '25%', height: '40%' },
    { top: '5%', left: '15%', width: '20%', height: '25%' },
    { top: '15%', left: '75%', width: '25%', height: '25%' },
    { top: '45%', left: '10%', width: '25%', height: '20%' },
    { top: '50%', left: '60%', width: '25%', height: '25%' },
    { top: '85%', left: '15%', width: '30%', height: '25%' },
    { top: '35%', left: '-5%', width: '20%', height: '25%' },
    { top: '10%', left: '-5%', width: '25%', height: '20%' },
    { top: '55%', left: '85%', width: '20%', height: '20%' },
    { top: '85%', left: '-5%', width: '20%', height: '20%' },
    { top: '-5%', left: '90%', width: '20%', height: '25%' },
    { top: '90%', left: '40%', width: '25%', height: '20%' },
    { top: '40%', left: '45%', width: '20%', height: '20%' },
  ];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="intro-splash"
          className="fixed inset-0 z-[100] bg-slate-950 overflow-hidden flex items-center justify-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Collage Layer */}
          <motion.div 
            className="absolute inset-0 w-full h-full"
            initial={{ scale: 1.5, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 5, ease: 'easeOut' }}
          >
            {IMAGES.map((src, i) => (
              <motion.div
                key={i}
                className="absolute overflow-hidden rounded-2xl shadow-2xl"
                style={{
                  ...positions[i],
                  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                }}
                initial={{ opacity: 0, scale: 0.8, y: 50 }}
                animate={{ opacity: 0.6, scale: 1, y: 0 }}
                transition={{
                  delay: i * 0.1, // Stagger effect
                  duration: 0.8,
                  ease: [0.22, 1, 0.36, 1]
                }}
              >
                <img 
                  src={src} 
                  alt="" 
                  className="w-full h-full object-cover" 
                  style={{ filter: 'grayscale(20%) contrast(110%)' }}
                />
                <div className="absolute inset-0 bg-indigo-900/20 mix-blend-multiply" />
              </motion.div>
            ))}
          </motion.div>

          {/* Vignette Overlay to darken edges so center pops */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.9)_100%)]" />

          {/* Dynamic Flash / Reveal sequence overlay */}
          <motion.div 
            className="absolute inset-0 bg-slate-950"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0.95] }}
            transition={{ delay: 2.8, duration: 1.5, ease: 'easeInOut' }}
          />

          {/* Main Logo & Text Reveal */}
          <motion.div
            className="relative z-10 flex flex-col items-center"
            initial={{ scale: 0.9, opacity: 0, filter: 'blur(10px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            transition={{ delay: 3.2, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div 
              className="w-28 h-28 bg-white/10 backdrop-blur-xl rounded-[2rem] flex items-center justify-center mb-6 shadow-[0_0_80px_rgba(99,102,241,0.6)] border border-white/20"
              animate={{ 
                boxShadow: ['0 0 40px rgba(99,102,241,0)', '0 0 80px rgba(99,102,241,0.8)', '0 0 60px rgba(99,102,241,0.4)'] 
              }}
              transition={{ delay: 3.5, duration: 2 }}
            >
              <ZappyLogo size={56} className="text-white drop-shadow-md" />
            </motion.div>
            
            <motion.div className="flex overflow-hidden">
              <motion.h1 
                className="text-5xl font-black tracking-tighter text-white"
                initial={{ y: 50 }}
                animate={{ y: 0 }}
                transition={{ delay: 3.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                Zappy
              </motion.h1>
            </motion.div>
            
            <motion.p
              className="bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent font-black text-sm mt-3 tracking-[0.3em] uppercase"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 3.8, duration: 0.8 }}
            >
              Services Redefined
            </motion.p>
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
