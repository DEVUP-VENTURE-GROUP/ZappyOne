import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, SlidersHorizontal, Star, Heart, TrendingUp, X, Play, SearchX, PartyPopper } from 'lucide-react';
import { useGetEventThemesQuery, useGetEventCategoriesQuery, useToggleSaveEventThemeMutation } from '@shared/services/api';
import toast from 'react-hot-toast';
import { eventPhoto } from '../../lib/eventPhotos';

/* Category Styles Map */
const GRADIENTS = [
  [/birth|kid|party|graduat/, 'from-pink-600/90 via-pink-500/50 to-transparent'],
  [/baby|gender|shower/, 'from-blue-600/90 via-blue-500/50 to-transparent'],
  [/anniversar|engage/, 'from-purple-600/90 via-purple-500/50 to-transparent'],
  [/house|corporate|farewell/, 'from-amber-600/90 via-amber-500/50 to-transparent'],
  [/romant/, 'from-rose-600/90 via-rose-500/50 to-transparent'],
];

function getCatStyles(name) {
  const key = String(name || '').toLowerCase();
  const gradient = (GRADIENTS.find(([re]) => re.test(key)) || [null, 'from-zappy-600/90 via-zappy-500/50 to-transparent'])[1];
  return { img: eventPhoto(key), gradient };
}

const SORT_OPTIONS = [
  { value: 'trending',   label: 'Trending',  icon: TrendingUp },
  { value: 'rating',     label: 'Top Rated', icon: Star },
  { value: 'price_asc',  label: '₹ Low to High', icon: null },
  { value: 'price_desc', label: '₹ High to Low', icon: null },
  { value: 'newest',     label: 'Newest', icon: null },
];

/* Theme Card (Reused from HomePage for consistency) */
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
            FEATURED
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

export default function EventCategoryPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const category = params.get('category') || '';
  const searchQ  = params.get('search') || '';

  const [sort,       setSort]       = useState('trending');
  const [budgetMax,  setBudgetMax]  = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [city,       setCity]       = useState('');
  const [page,       setPage]       = useState(1);
  const [showFilter, setShowFilter] = useState(false);

  const { data, isLoading } = useGetEventThemesQuery({
    category: category || undefined, sort, page, search: searchQ || undefined,
    budgetMax: budgetMax ? Number(budgetMax) * 100 : undefined,
    guestCount: guestCount ? Number(guestCount) : undefined,
    city: city || undefined,
  });

  const { data: catData } = useGetEventCategoriesQuery();
  const [toggleSave] = useToggleSaveEventThemeMutation();

  const themes = data?.themes || [];
  const cat = catData?.categories?.find(c => c.slug === category);
  
  const heroStyle = getCatStyles(cat?.name);
  const titleText = cat ? cat.name : searchQ ? `"${searchQ}"` : 'Explore Events';

  async function handleSave(id) {
    try { await toggleSave(id).unwrap(); }
    catch { toast.error('Sign in to save'); }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 font-sans">
      
      {/* Premium Hero Section */}
      <div className="relative overflow-hidden sm:rounded-b-[3rem] shadow-xl pb-10 pt-safe">
        {/* Background Image & Gradients */}
        <div className="absolute inset-0 bg-slate-900">
          {category || searchQ ? (
            <img src={heroStyle.img} alt="Hero" className="w-full h-full object-cover opacity-60 mix-blend-overlay" />
          ) : null}
          <div className={`absolute inset-0 bg-gradient-to-t ${heroStyle.gradient} opacity-90`} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent opacity-70" />
        </div>

        {/* Top Nav */}
        <div className="relative z-10 px-5 pt-6 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-10 h-10 bg-white/20 flex items-center justify-center rounded-full text-white hover:bg-white/30 transition-colors border border-white/20 shadow-lg">
            <ArrowLeft size={20} />
          </button>
          <button onClick={() => setShowFilter(v => !v)} className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold border transition-all shadow-lg ${showFilter ? 'bg-white text-slate-900 border-white' : 'bg-white/20 text-white border-white/20 hover:bg-white/30'}`}>
            <SlidersHorizontal size={16} /> Filters
          </button>
        </div>

        {/* Title Content */}
        <div className="relative z-10 px-6 pt-12 pb-6 max-w-5xl mx-auto">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
            <p className="text-white/80 font-black tracking-[0.2em] uppercase text-xs mb-3 drop-shadow-md">
              {searchQ ? 'Search Results' : 'Category'}
            </p>
            <h1 className="text-4xl sm:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-xl">
              {titleText}
            </h1>
            <p className="text-white/90 text-sm sm:text-base font-semibold mt-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              {data?.total || 0} stunning themes available
            </p>
          </motion.div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto px-5 -mt-6 relative z-20">
        
        {/* Sort & Filter Bar */}
        <div className="bg-white rounded-[2rem] p-2 shadow-lg border border-slate-100 flex flex-col gap-2">
          
          {/* Filters Drawer */}
          <AnimatePresence>
            {showFilter && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100">
                  <div>
                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-2">Max Budget (₹)</label>
                    <input type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="e.g. 5000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-2">Guests</label>
                    <input type="number" value={guestCount} onChange={e => setGuestCount(e.target.value)} placeholder="e.g. 50"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-2">City</label>
                    <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Bangalore"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all" />
                  </div>
                  {(budgetMax || guestCount || city) && (
                    <div className="sm:col-span-3 flex justify-end">
                      <button onClick={() => { setBudgetMax(''); setGuestCount(''); setCity(''); }} className="text-xs font-bold text-red-500 bg-red-50 px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-red-100 transition-colors">
                        <X size={14} /> Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sort Pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none px-2 py-1">
            {SORT_OPTIONS.map(o => {
              const Icon = o.icon;
              return (
                <button key={o.value} onClick={() => setSort(o.value)}
                  className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 ${sort === o.value ? 'bg-slate-900 text-white shadow-md' : 'bg-transparent text-slate-500 hover:bg-slate-100'}`}>
                  {Icon && <Icon size={14} className={sort === o.value ? 'text-rose-400' : 'text-slate-400'} />}
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-8">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-[1.5rem] overflow-hidden animate-pulse border border-slate-100">
                  <div className="h-[200px] bg-slate-200" />
                  <div className="p-5 space-y-3"><div className="h-4 bg-slate-200 rounded w-3/4" /><div className="h-3 bg-slate-200 rounded w-1/2" /></div>
                </div>
              ))}
            </div>
          ) : themes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
              {themes.map(theme => (
                <ThemeCard key={theme._id} theme={theme} onSave={handleSave} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm mt-4">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <SearchX size={32} className="text-slate-300" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">No themes found</h3>
              <p className="text-slate-500 font-medium">Try adjusting your filters or searching for something else.</p>
              <button onClick={() => { setBudgetMax(''); setGuestCount(''); setCity(''); }} className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-slate-800 transition-colors">
                Clear all filters
              </button>
            </div>
          )}

          {/* Pagination */}
          {data?.pages > 1 && (
            <div className="flex gap-2 justify-center mt-12 mb-8">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-xl text-sm font-black transition-all ${p === page ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
