import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, TrendingUp, Play, Heart, Star, ChevronRight, ArrowUpRight, PartyPopper } from 'lucide-react';
import { useGetEventCategoriesQuery, useGetEventThemesQuery, useToggleSaveEventThemeMutation } from '@shared/services/api';
import CrossSellBanner from '../../components/ads/CrossSellBanner';
import toast from 'react-hot-toast';
import birthdayPhoto from '@assets/images/events/event_birthday.webp';
import babyShowerPhoto from '@assets/images/events/event_baby.webp';
import anniversaryPhoto from '@assets/images/events/event_anniversary.webp';
import housewarmingPhoto from '@assets/images/events/event_housewarming.webp';
import romanticPhoto from '@assets/images/events/event_romantic.webp';

/* Category Images Map */
const CATEGORY_MAP = {
  'birthday': { img: birthdayPhoto, color: 'from-pink-500/80 to-transparent' },
  'baby-shower': { img: babyShowerPhoto, color: 'from-blue-500/80 to-transparent' },
  'anniversary': { img: anniversaryPhoto, color: 'from-purple-500/80 to-transparent' },
  'housewarming': { img: housewarmingPhoto, color: 'from-amber-500/80 to-transparent' },
  'romantic': { img: romanticPhoto, color: 'from-rose-500/80 to-transparent' },
  'default': { img: birthdayPhoto, color: 'from-zappy-500/80 to-transparent' }
};

function getCatStyles(name) {
  if (!name) return CATEGORY_MAP['default'];
  const key = name.toLowerCase();
  if (key.includes('birth')) return CATEGORY_MAP['birthday'];
  if (key.includes('baby')) return CATEGORY_MAP['baby-shower'];
  if (key.includes('anniversary')) return CATEGORY_MAP['anniversary'];
  if (key.includes('house')) return CATEGORY_MAP['housewarming'];
  if (key.includes('romantic')) return CATEGORY_MAP['romantic'];
  return CATEGORY_MAP['default'];
}

/* Bento Grid Classes based on index */
function getBentoClass(idx) {
  if (idx === 0) return "col-span-2 row-span-2 min-h-[240px] sm:min-h-[280px]";
  return "col-span-1 row-span-1 min-h-[140px]";
}

/* Video reel card with auto-play on intersection */
function VideoReelCard({ theme, onSave }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !theme.videoUrl) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) videoRef.current?.play().catch(() => {});
      else videoRef.current?.pause();
    }, { threshold: 0.6 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [theme.videoUrl]);

  const navigate = useNavigate();
  return (
    <div ref={containerRef} className="relative rounded-card overflow-hidden bg-black aspect-[9/16] cursor-pointer group shadow-lg" onClick={() => navigate(`/events/themes/${theme._id}`)}>
      {theme.videoUrl ? (
        <video ref={videoRef} src={theme.videoUrl} loop muted playsInline className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      ) : (
        <img src={theme.coverImage} alt={theme.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="text-white font-black text-[15px] leading-tight">{theme.title}</p>
        <p className="text-white/80 font-medium text-xs mt-1">₹{Math.round((theme.startingPricePaise || 0) / 100).toLocaleString('en-IN')} starting</p>
        <div className="flex items-center gap-2 mt-2.5">
          <Star size={12} className="text-yellow-400 fill-yellow-400" />
          <span className="text-white/90 text-xs font-bold">{theme.rating?.toFixed(1) || '–'}</span>
          <span className="text-white/30 text-xs">·</span>
          <span className="text-white/70 text-xs">{theme.bookingCount} booked</span>
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onSave(theme._id); }}
        className={`absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-all ${theme.isSaved ? 'bg-rose-500 scale-110' : 'bg-black/30 backdrop-blur-md border border-white/20 hover:bg-black/50'}`}>
        <Heart size={16} className={theme.isSaved ? 'text-white fill-white' : 'text-white'} />
      </button>
      {theme.status === 'featured' && (
        <div className="absolute top-4 left-4 px-3 py-1 bg-fuchsia-500 rounded-full text-white text-[10px] font-black tracking-widest flex items-center gap-1.5 shadow-lg border border-white/20">
          <Star size={12} />FEATURED
        </div>
      )}
    </div>
  );
}

/* Theme grid card */
function ThemeCard({ theme, onSave }) {
  const navigate = useNavigate();
  return (
    <motion.div whileHover={{ y: -6 }} onClick={() => navigate(`/events/themes/${theme._id}`)}
      className="bg-white rounded-[1.5rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100/80 cursor-pointer group transition-all duration-300">
      <div className="relative">
        <img src={theme.coverImage} alt={theme.title} className="w-full h-[200px] object-cover group-hover:scale-105 transition-transform duration-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {theme.videoUrl && (
          <div className="absolute bottom-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center border border-white/40 shadow-lg group-hover:bg-rose-500 group-hover:border-rose-400 transition-colors">
            <Play size={14} className="text-white ml-1" />
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onSave(theme._id); }}
          className={`absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-all ${theme.isSaved ? 'bg-rose-500 scale-110' : 'bg-black/20 backdrop-blur-md border border-white/20 hover:bg-black/40'}`}>
          <Heart size={16} className={theme.isSaved ? 'text-white fill-white' : 'text-white'} />
        </button>
        {theme.isTrending && (
          <div className="absolute top-4 left-4 px-3 py-1 bg-orange-500 rounded-full text-white text-[10px] font-black tracking-widest shadow-lg border border-white/20">
            🔥 TRENDING
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="font-black text-[15px] text-slate-900 leading-tight line-clamp-1">{theme.title}</p>
        <p className="text-xs font-semibold text-slate-400 mt-1.5 line-clamp-1">{theme.categoryId?.name} · {theme.partnerId?.businessName}</p>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <span className="text-base font-black text-rose-600">₹{Math.round((theme.startingPricePaise || 0) / 100).toLocaleString('en-IN')}</span>
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
            <Star size={12} className="text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-bold text-slate-700">{theme.rating?.toFixed(1) || '–'}</span>
            <span className="text-[10px] font-semibold text-slate-400">({theme.reviewCount})</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function EventsHomePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showReels, setShowReels] = useState(false);

  const { data: catData } = useGetEventCategoriesQuery();
  const { data: trendingData } = useGetEventThemesQuery({ sort: 'trending', limit: 12 });
  const { data: videoData } = useGetEventThemesQuery({ sort: 'trending', limit: 6 });
  const [toggleSave] = useToggleSaveEventThemeMutation();

  const categories = catData?.categories || [];
  const trending   = trendingData?.themes || [];
  const videoThemes = (videoData?.themes || []).filter(t => t.videoUrl);

  async function handleSave(id) {
    try { await toggleSave(id).unwrap(); }
    catch { toast.error('Sign in to save themes'); }
  }

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) navigate(`/events/browse?search=${encodeURIComponent(search.trim())}`);
  }

  const fallbackCategories = [
    { name: 'Birthday' }, { name: 'Baby Shower' }, { name: 'Anniversary' }, { name: 'Housewarming' }, { name: 'Romantic' }
  ];

  const renderCategories = categories.length ? categories : fallbackCategories;

  return (
    <div className="min-h-screen bg-canvas pb-20 sm:pb-8">
      {/* Header: what this is, and search. No orbs, no gradient. */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 pb-6 pt-8 sm:pb-8 sm:pt-12">
          <h1 className="h-display">Events and décor</h1>
          <p className="mt-1.5 text-[15px] text-ink-500">Decor and planning for birthdays, showers, anniversaries and more.</p>
          <form onSubmit={handleSearch} className="mt-5 flex max-w-2xl items-center gap-3 rounded-btn border border-line bg-sunken px-3.5 transition-colors focus-within:border-zappy-600 focus-within:bg-white">
            <Search size={18} className="shrink-0 text-ink-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Birthday, anniversary, baby shower"
              className="h-12 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400" />
          </form>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto px-5 mt-10 space-y-12">
        
        {/* CRAZY UNIQUE BENTO GRID CATEGORIES */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Browse by Occasion</h2>
            <button onClick={() => navigate('/events/browse')} className="text-sm font-bold text-rose-600 flex items-center gap-1 hover:text-rose-700 transition-colors">
              Explore All <ArrowUpRight size={18} strokeWidth={3} />
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {renderCategories.slice(0, 5).map((cat, idx) => {
              const style = getCatStyles(cat.name);
              return (
                <button key={cat._id || idx} onClick={() => navigate(`/events/browse?category=${cat.slug || cat.name?.toLowerCase()}`)}
                  className={`relative rounded-card overflow-hidden group cursor-pointer shadow-sm hover:shadow-xl transition-all duration-500 ${getBentoClass(idx)}`}>
                  
                  {/* Background Image */}
                  <img src={style.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 group-hover:rotate-1 transition-all duration-700" />
                  
                  {/* Gradient Overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-t ${style.color} mix-blend-multiply opacity-60 group-hover:opacity-80 transition-opacity duration-500`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
                  
                  {/* Content */}
                  <div className="absolute inset-0 p-5 flex flex-col justify-end">
                    <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                      <h3 className="text-white font-black text-lg sm:text-xl drop-shadow-md text-left">{cat.name}</h3>
                      <div className="h-0 opacity-0 group-hover:h-auto group-hover:opacity-100 group-hover:mt-2 transition-all duration-500 overflow-hidden flex items-center gap-1 text-white/90 text-xs font-bold uppercase tracking-wider">
                        Explore <ArrowUpRight size={14} strokeWidth={3} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Sponsored cross-sell banner */}
        <CrossSellBanner placement="category_listing" title="Sponsored Partners" />

        {/* Video Reels toggle */}
        {videoThemes.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <span className="w-8 h-8 bg-zappy-500 rounded-xl flex items-center justify-center shadow-lg shadow-zappy-500/30">
                  <Play size={14} className="text-white ml-0.5" />
                </span>
                See it Live
              </h2>
              <button onClick={() => setShowReels(v => !v)} className="text-sm font-bold text-zappy-600 hover:text-zappy-700 transition-colors">
                {showReels ? 'Hide reels' : 'Play reels'}
              </button>
            </div>
            <AnimatePresence>
              {showReels && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {videoThemes.slice(0, 4).map(theme => (
                    <VideoReelCard key={theme._id} theme={theme} onSave={handleSave} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* Trending */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="w-8 h-8 bg-orange-400 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                <TrendingUp size={16} className="text-white" strokeWidth={2.5} />
              </span>
              Trending Now
            </h2>
            <button onClick={() => navigate('/events/browse?sort=trending')} className="text-sm font-bold text-rose-600 flex items-center gap-1 hover:text-rose-700 transition-colors">
              See all <ArrowUpRight size={18} strokeWidth={3} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {trending.map(theme => (
              <ThemeCard key={theme._id} theme={theme} onSave={handleSave} />
            ))}
          </div>
          {!trending.length && (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm mt-4">
              <PartyPopper size={56} className="mx-auto text-zappy-200 mb-5" strokeWidth={1.5} />
              <p className="text-slate-500 font-bold text-lg">No themes yet — check back soon!</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

