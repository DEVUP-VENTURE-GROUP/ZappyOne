import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Promo banners. Two presentations, same data + handlers:
 *   • Desktop (md+): the original full-bleed photo banners with a dark gradient.
 *   • Mobile (<md):  a light-blue rounded card — pill, title, subcopy, blue
 *                    "Book Now" button, photo bleeding to the right edge.
 */

/* Mobile light-card layout */
function PromoCard({ tag, title, subtitle, image, buttonLabel = 'Book Now', onClick, dots = null }) {
  return (
    <div
      className="relative w-full rounded-[20px] overflow-hidden cursor-pointer group bg-zappy-50 border border-zappy-100"
      onClick={onClick}
    >
      <div className="flex items-stretch min-h-[190px]">
        <div className="relative z-10 flex flex-col justify-center gap-2 p-5 w-[62%]">
          <span className="inline-block w-max px-2.5 py-1 rounded-full bg-white/80 text-zappy-700 text-[10px] font-black uppercase tracking-widest shadow-sm">
            {tag}
          </span>
          <AnimatePresence mode="wait">
            <motion.h3
              key={`t-${title}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-[19px] font-black text-slate-900 tracking-tight leading-[1.1]"
            >
              {title}
            </motion.h3>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.p
              key={`s-${subtitle}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[13px] text-slate-500 font-medium leading-snug"
            >
              {subtitle}
            </motion.p>
          </AnimatePresence>
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1.5 w-max bg-zappy-600 text-white px-4 py-2.5 rounded-full font-bold text-[13px] shadow-md group-hover:bg-zappy-700 transition-colors"
          >
            {buttonLabel} <ArrowRight size={15} strokeWidth={2.75} />
          </button>
        </div>
      </div>

      <div className="absolute right-0 top-0 bottom-0 w-[46%] pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.img
            key={image}
            src={image}
            alt={title}
            className="w-full h-full object-cover"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-zappy-50 to-transparent" />
      </div>

      {dots}
    </div>
  );
}

function DotsMobile({ items, current }) {
  return (
    <div className="absolute bottom-3 right-4 z-10 flex gap-1.5">
      {items.map((_, idx) => (
        <div
          key={idx}
          className={`h-1 rounded-full transition-all duration-300 ${idx === current ? 'w-4 bg-zappy-600' : 'w-1.5 bg-zappy-300'}`}
        />
      ))}
    </div>
  );
}

/* Desktop full-bleed layout */
function PromoFullBleed({ tag, title, subtitle, image, price, priceLabel = 'Explore', onClick, dots = null }) {
  return (
    <div
      className="relative w-full h-[360px] md:h-[420px] rounded-2xl overflow-hidden shadow-soft-lg cursor-pointer group"
      onClick={onClick}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={image}
          src={image}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute bottom-0 left-0 p-5 md:p-6 w-full">
        <div className="inline-block px-2.5 py-1 bg-white/20 backdrop-blur-md rounded border border-white/30 text-white text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2">
          {tag}
        </div>
        <AnimatePresence mode="wait">
          <motion.h3
            key={`title-${title}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-white text-2xl md:text-3xl font-black tracking-tight mb-1"
          >
            {title}
          </motion.h3>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.p
            key={`sub-${subtitle}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-white/90 text-sm md:text-base font-medium mb-4"
          >
            {subtitle}
          </motion.p>
        </AnimatePresence>
        <div className="flex items-center justify-between">
          <button className="bg-white text-slate-900 px-5 py-2.5 rounded-xl font-bold text-sm hover:scale-105 transition-transform shadow-lg">
            {priceLabel}
          </button>
          {price && <span className="text-white font-black text-lg">{price}</span>}
        </div>
      </div>

      {dots}
    </div>
  );
}

function DotsDesktop({ items, current }) {
  return (
    <div className="absolute top-4 right-4 flex gap-1.5">
      {items.map((_, idx) => (
        <div
          key={idx}
          className={`h-1 rounded-full transition-all duration-300 ${idx === current ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
        />
      ))}
    </div>
  );
}

const VEHICLE_IMAGES = [
  { id: 1, src: '/promos/promo_car_wash.png', title: 'Premium Car Wash', subtitle: 'At your doorstep, in 60 mins', price: 'From ₹349' },
  { id: 2, src: '/promos/promo_bike_wash.png', title: 'Bike Detailing', subtitle: 'Showroom shine guaranteed', price: 'From ₹199' },
  { id: 3, src: '/promos/promo_puncture.png', title: 'Emergency Puncture', subtitle: 'On-road fast assistance', price: 'From ₹99' },
];

export function PromoBannerVehicle() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const nav = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    const timer = setInterval(() => setCurrentIndex((prev) => (prev + 1) % VEHICLE_IMAGES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = VEHICLE_IMAGES[currentIndex];
  return (
    <div className="mt-8 mb-4">
      {isMobile ? (
        <PromoCard
          tag="Vehicle Care"
          title={slide.title}
          subtitle={slide.subtitle}
          image={slide.src}
          onClick={() => nav('/services')}
          dots={<DotsMobile items={VEHICLE_IMAGES} current={currentIndex} />}
        />
      ) : (
        <PromoFullBleed
          tag="Vehicle Care"
          title={slide.title}
          subtitle={slide.subtitle}
          image={slide.src}
          price={slide.price}
          onClick={() => nav('/services')}
          dots={<DotsDesktop items={VEHICLE_IMAGES} current={currentIndex} />}
        />
      )}
    </div>
  );
}

export function PromoBannerElectronics() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  return (
    <div className="mt-6 mb-8">
      {isMobile ? (
        <PromoCard
          tag="Expert Techs"
          title="Phone & Laptop Repair"
          subtitle="Certified parts, 6 months warranty."
          image="/promos/promo_electronics.png"
          onClick={() => nav('/services')}
        />
      ) : (
        <PromoFullBleed
          tag="Expert Techs"
          title="Phone & Laptop Repair"
          subtitle="Certified parts, 6 months warranty."
          image="/promos/promo_electronics.png"
          price="From ₹499"
          onClick={() => nav('/services')}
        />
      )}
    </div>
  );
}

const FAMILY_IMAGES = [
  { id: 1, src: '/promos/promo_elderly_care.png', title: 'Elderly Care', subtitle: 'Compassionate care at home', price: 'From ₹499/day' },
  { id: 2, src: '/promos/promo_babysitter.png', title: 'Expert Babysitting', subtitle: 'Safe, playful & professional', price: 'From ₹349/day' },
  { id: 3, src: '/promos/promo_physio.png', title: 'Physiotherapy', subtitle: 'Recover faster at home', price: 'From ₹699' },
];

export function PromoBannerFamily() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const nav = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    const timer = setInterval(() => setCurrentIndex((prev) => (prev + 1) % FAMILY_IMAGES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = FAMILY_IMAGES[currentIndex];
  return (
    <div className="mt-8 mb-4">
      {isMobile ? (
        <PromoCard
          tag="Family Assist"
          title={slide.title}
          subtitle={slide.subtitle}
          image={slide.src}
          onClick={() => nav('/services')}
          dots={<DotsMobile items={FAMILY_IMAGES} current={currentIndex} />}
        />
      ) : (
        <PromoFullBleed
          tag="Family Assist"
          title={slide.title}
          subtitle={slide.subtitle}
          image={slide.src}
          price={slide.price}
          onClick={() => nav('/services')}
          dots={<DotsDesktop items={FAMILY_IMAGES} current={currentIndex} />}
        />
      )}
    </div>
  );
}

export function PromoBannerEvents() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  return (
    <div className="mt-6 mb-8">
      {isMobile ? (
        <PromoCard
          tag="Event Commerce"
          title="Premium Party Decor"
          subtitle="Birthdays & Anniversaries"
          image="/promos/promo_events_decor.png"
          onClick={() => nav('/events')}
        />
      ) : (
        <PromoFullBleed
          tag="Event Commerce"
          title="Premium Party Decor"
          subtitle="Birthdays & Anniversaries"
          image="/promos/promo_events_decor.png"
          price="From ₹1499"
          onClick={() => nav('/events')}
        />
      )}
    </div>
  );
}
