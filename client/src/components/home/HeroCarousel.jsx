import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';

const SLIDES = [
  {
    id: 1,
    title: 'Expert Phone Repair',
    subtitle: 'Cracked screen? Battery issues? We fix it at your doorstep.',
    image: '/assets/hero_phone_repair_1780323166772.png',
    tag: 'Trending',
  },
  {
    id: 2,
    title: 'Premium Vehicle Care',
    subtitle: 'From jump starts to detailing. Your ride, our pride.',
    image: '/assets/hero_vehicle_care_1780323182530.png',
    tag: 'On-Demand',
  },
  {
    id: 3,
    title: 'Compassionate Care',
    subtitle: 'Trusted companions for your elders and family.',
    image: '/assets/hero_family_assist_1780323217410.png',
    tag: 'Highly Rated',
  },
  {
    id: 4,
    title: 'Pamper Your Pets',
    subtitle: 'Professional grooming and sitting for your furry friends.',
    image: '/assets/hero_pet_care_1780323201593.png',
    tag: 'New',
  },
];

export default function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const nav = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = SLIDES[current];

  /* ── Mobile: light rounded card (matches the promo card language) ── */
  if (isMobile) {
    return (
      <div
        className="relative w-full rounded-[20px] overflow-hidden cursor-pointer group bg-zappy-50 border border-zappy-100"
        onClick={() => nav('/services')}
      >
        <div className="flex items-stretch min-h-[200px]">
          <div className="relative z-10 flex flex-col justify-center gap-2 p-5 w-[62%]">
            <AnimatePresence mode="wait">
              <motion.span
                key={`tag-${slide.tag}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="inline-block w-max px-2.5 py-1 rounded-full bg-white/80 text-zappy-700 text-[10px] font-black uppercase tracking-widest shadow-sm"
              >
                {slide.tag}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.h3
                key={`title-${slide.title}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-[19px] font-black text-slate-900 tracking-tight leading-[1.1]"
              >
                {slide.title}
              </motion.h3>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.p
                key={`sub-${slide.subtitle}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[13px] text-slate-500 font-medium leading-snug line-clamp-2"
              >
                {slide.subtitle}
              </motion.p>
            </AnimatePresence>
            <button
              type="button"
              className="mt-1.5 inline-flex items-center gap-1.5 w-max bg-zappy-600 text-white px-4 py-2.5 rounded-full font-bold text-[13px] shadow-md group-hover:bg-zappy-700 transition-colors"
            >
              Book Now <ArrowRight size={15} strokeWidth={2.75} />
            </button>
          </div>
        </div>

        {/* Image bleeding to the right edge, fading into the blue */}
        <div className="absolute right-0 top-0 bottom-0 w-[46%] pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.img
              key={slide.image}
              src={slide.image}
              alt={slide.title}
              className="w-full h-full object-cover"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          </AnimatePresence>
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-zappy-50 to-transparent" />
        </div>

        {/* Indicators */}
        <div className="absolute bottom-3 right-4 z-10 flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 rounded-full transition-all duration-300 ${idx === current ? 'w-4 bg-zappy-600' : 'w-1.5 bg-zappy-300'}`}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ── Desktop: original full-bleed carousel ── */
  return (
    <div
      className="relative w-full h-[360px] md:h-[420px] rounded-2xl overflow-hidden shadow-soft-lg cursor-pointer group"
      onClick={() => nav('/services')}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={current}
          src={SLIDES[current].image}
          alt={SLIDES[current].title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      </AnimatePresence>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 p-5 md:p-6 w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={`tag-${current}`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="inline-block px-2.5 py-1 bg-white/20 backdrop-blur-md rounded border border-white/30 text-white text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2"
          >
            {SLIDES[current].tag}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.h3
            key={`title-${current}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-white text-2xl md:text-3xl font-black tracking-tight mb-1"
          >
            {SLIDES[current].title}
          </motion.h3>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.p
            key={`sub-${current}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-white/90 text-sm md:text-base font-medium mb-4"
          >
            {SLIDES[current].subtitle}
          </motion.p>
        </AnimatePresence>
        <div className="flex items-center justify-between">
          <button className="bg-white text-slate-900 px-5 py-2.5 rounded-xl font-bold text-sm hover:scale-105 transition-transform shadow-lg flex items-center gap-1.5">
            <Zap size={16} className="text-indigo-600 fill-indigo-600" />
            Book Now
          </button>
        </div>
      </div>

      {/* Indicators */}
      <div className="absolute top-4 right-4 flex gap-1.5 z-10">
        {SLIDES.map((_, idx) => (
          <div
            key={idx}
            className={`h-1 rounded-full transition-all duration-300 ${idx === current ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
          />
        ))}
      </div>
    </div>
  );
}
