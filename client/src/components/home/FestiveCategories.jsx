import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = [
  {
    id: 'festive-cleaning',
    title: 'Festive Home Cleaning',
    price: '₹499',
    originalPrice: '₹999',
    img: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=400&auto=format&fit=crop', // cleaning
    colSpan: 'col-span-1',
    rowSpan: 'row-span-2',
    bgColor: 'bg-white',
    path: '/book/home-cleaning'
  },
  {
    id: 'lighting-setup',
    title: 'Smart Lighting Setup',
    img: 'https://images.unsplash.com/photo-1563454790312-32b0a48b59d9?q=80&w=200&auto=format&fit=crop', // lights
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    path: '/book/electrician'
  },
  {
    id: 'pandal-decor',
    title: 'Puja & Pandal Decor',
    img: 'https://images.unsplash.com/photo-1631558223947-bb71891d4d35?q=80&w=200&auto=format&fit=crop', // decor
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    path: '/book/event-decor'
  },
  {
    id: 'kitchen-assist',
    title: 'Hosting & Kitchen Help',
    img: 'https://images.unsplash.com/photo-1556910103-1c02745a872f?q=80&w=200&auto=format&fit=crop', // cooking/assist
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    path: '/book/family-assist'
  },
  {
    id: 'emergency-repairs',
    title: 'Emergency Repairs',
    img: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=200&auto=format&fit=crop', // tools
    colSpan: 'col-span-1',
    rowSpan: 'row-span-1',
    bgColor: 'bg-white',
    path: '/book/plumber'
  },
];

export default function FestiveCategories() {
  const nav = useNavigate();

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.9 },
    show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="w-full px-4 relative z-10 -mt-2 pb-6 bg-gradient-to-b from-[#FFE6B3] to-white">
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl mx-auto"
      >
        {CATEGORIES.map((cat, idx) => (
          <motion.div
            key={cat.id}
            variants={item}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => cat.path && nav(cat.path)}
            className={`
              ${cat.bgColor} ${cat.colSpan} ${cat.rowSpan}
              rounded-2xl shadow-sm border border-orange-100 overflow-hidden
              flex flex-col relative cursor-pointer group
            `}
          >
            <div className="p-3 pb-1 z-10 text-center md:text-left">
              <h3 className="font-bold text-[#4A2B29] text-xs md:text-sm leading-tight text-center">
                {cat.title}
              </h3>
              {cat.price && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-[#C0265F] text-white px-2 py-0.5 rounded-full text-xs font-black shadow-sm mx-auto">
                  <span className="line-through text-white/70 text-[10px] font-medium">{cat.originalPrice}</span>
                  <span>{cat.price}</span>
                </div>
              )}
            </div>
            <div className="flex-1 flex items-end justify-center pt-2 relative">
              <img 
                src={cat.img} 
                alt={cat.title}
                className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-t-xl group-hover:scale-110 transition-transform duration-500 ease-out"
                style={{
                   maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)',
                   WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)'
                }}
              />
            </div>
          </motion.div>
        ))}
      </motion.div>
      
      {/* Ganesha Centerpiece (Using a vibrant abstract placeholder to match vibe) */}
      <div className="mt-8 relative h-48 md:h-64 flex justify-center overflow-hidden">
         <motion.img
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.4 }}
            src="https://images.unsplash.com/photo-1572943187122-83b63d76e73c?q=80&w=400&auto=format&fit=crop"
            alt="Lord Ganesha"
            className="h-full object-contain drop-shadow-2xl z-10"
            style={{ mixBlendMode: 'multiply' }}
         />
         {/* Decorative leaves */}
         <div className="absolute top-1/2 -left-4 w-16 h-16 bg-pink-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50" />
         <div className="absolute top-1/2 -right-4 w-16 h-16 bg-orange-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50" />
      </div>
      
      {/* Festive Top Picks */}
      <div className="text-center mt-6 mb-4">
        <h2 className="text-[#C0265F] font-bold text-lg inline-flex items-center gap-2">
          <span className="text-sm">🌸</span> Festive Top Picks! <span className="text-sm">🌸</span>
        </h2>
      </div>
    </div>
  );
}
