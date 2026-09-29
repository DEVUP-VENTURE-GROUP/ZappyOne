import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Star, Clock, Users, CheckCircle, XCircle, Play, Calendar, Sparkles, Zap, MapPin, ChevronRight, Check } from 'lucide-react';
import { useGetEventThemeQuery, useToggleSaveEventThemeMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

export default function EventThemePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useGetEventThemeQuery(id);
  const [toggleSave] = useToggleSaveEventThemeMutation();
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(false);

  const theme = data?.theme;

  async function handleSave() {
    try {
      const res = await toggleSave(id).unwrap();
      toast.success(res.saved ? 'Saved to favorites! ✨' : 'Removed from favorites');
    } catch { toast.error('Sign in to save themes'); }
  }

  if (isLoading) return (
    <div className="min-h-screen bg-slate-50 animate-pulse flex flex-col p-4">
      <div className="h-[40vh] bg-slate-200 rounded-[2rem] mt-12" />
      <div className="space-y-4 mt-6">
        <div className="h-12 bg-slate-200 rounded-2xl w-3/4" />
        <div className="h-32 bg-slate-200 rounded-[2rem] w-full" />
      </div>
    </div>
  );

  if (!theme) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 text-center max-w-sm w-full">
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <Sparkles className="text-rose-400" size={32} />
        </div>
        <h2 className="text-2xl font-black mb-2">Theme Vanished</h2>
        <p className="text-slate-500 mb-8 text-sm">This experience is no longer available.</p>
        <button onClick={() => navigate(-1)} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold transition-colors">Return</button>
      </motion.div>
    </div>
  );

  const allMedia = [theme.coverImage, ...theme.gallery].filter(Boolean);
  const currentMedia = allMedia[galleryIdx];
  const hasMedia = allMedia.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-36 font-sans selection:bg-zappy-100 selection:text-zappy-900">
      
      {/* Top Floating Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 flex justify-between items-center pointer-events-none">
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)} 
          className="w-11 h-11 bg-white/80 backdrop-blur-md border border-slate-200 rounded-full flex items-center justify-center shadow-sm pointer-events-auto"
        >
          <ArrowLeft size={20} className="text-slate-700" />
        </motion.button>
        
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={handleSave} 
          className={`w-11 h-11 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm pointer-events-auto transition-colors border ${theme.isSaved ? 'bg-rose-50 border-rose-200' : 'bg-white/80 border-slate-200'}`}
        >
          <Heart size={20} className={theme.isSaved ? 'text-rose-500 fill-rose-500' : 'text-slate-700'} />
        </motion.button>
      </div>

      {/* Hero Image (Contained & Rounded) */}
      <div className="px-4 pt-16">
        <div className="relative w-full h-[40vh] md:h-[50vh] bg-gradient-to-br from-zappy-50 to-purple-50 rounded-[2rem] overflow-hidden shadow-sm border border-slate-200/50 flex items-center justify-center">
          
          {/* Fallback Icon behind image */}
          <Sparkles className="text-zappy-200 absolute" size={64} />
          
          {hasMedia && (
            <AnimatePresence mode="wait">
              <motion.div
                key={galleryIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0"
              >
                {showVideo && theme.videoUrl ? (
                  <video src={theme.videoUrl} autoPlay controls className="w-full h-full object-cover" />
                ) : (
                  <img 
                    src={currentMedia} 
                    alt={theme.title} 
                    className="w-full h-full object-cover relative z-10" 
                    onError={(e) => { e.target.style.display = 'none'; }} 
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Video Toggle Button */}
          {theme.videoUrl && (
             <button 
                onClick={() => setShowVideo(v => !v)}
                className="absolute bottom-4 left-4 z-20 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 text-xs font-bold text-slate-800 shadow-sm"
             >
                <Play size={14} className="text-zappy-600 fill-zappy-600" />
                {showVideo ? 'View Photos' : 'Play Video'}
             </button>
          )}
        </div>
      </div>

      {/* Thumbnail Interactive Slider */}
      {!showVideo && allMedia.length > 1 && (
        <div className="px-4 mt-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {allMedia.map((url, i) => (
              <button 
                key={i} 
                onClick={() => setGalleryIdx(i)} 
                className={`relative shrink-0 w-16 h-16 rounded-2xl overflow-hidden transition-all duration-300 ${i === galleryIdx ? 'ring-2 ring-zappy-500 ring-offset-2 scale-100' : 'opacity-50 scale-95 hover:opacity-100'}`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modern Bento Box Layout */}
      <div className="px-4 mt-6 max-w-4xl mx-auto">
        
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-3 py-1 bg-zappy-50 text-zappy-600 rounded-lg text-[10px] font-black tracking-widest uppercase border border-zappy-100">
              {theme.categoryId?.name || 'Exclusive'}
            </span>
            <span className="px-3 py-1 bg-white text-slate-600 rounded-lg text-[10px] font-black tracking-widest uppercase border border-slate-200 shadow-sm">
              <MapPin size={10} className="inline mr-1 -mt-0.5" />
              {theme.cities?.[0] || 'Global'}
            </span>
            <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black tracking-widest uppercase border border-amber-100 flex items-center gap-1 shadow-sm">
              <Star size={10} className="fill-amber-500 text-amber-500" />
              {theme.rating?.toFixed(1) || 'NEW'} ({theme.reviewCount || 0})
            </div>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.1] mb-2">
            {theme.title}
          </h1>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          
          {/* Main Price Bento */}
          <div className="col-span-2 md:col-span-4 relative overflow-hidden bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200/60">
            {/* Background decorative blob */}
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-gradient-to-br from-zappy-100 to-purple-50 rounded-full blur-3xl" />
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <p className="text-slate-400 font-bold text-[10px] mb-1 uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-500 fill-amber-500" /> Total Package
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-6xl font-black tracking-tighter text-slate-900">
                    ₹{Math.round((theme.startingPricePaise || 0) / 100).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
              <div className="flex -space-x-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-500 z-30">+3</div>
                <div className="w-10 h-10 rounded-full bg-zappy-100 border-2 border-white flex items-center justify-center text-zappy-500 z-20">👍</div>
                <div className="w-10 h-10 rounded-full bg-rose-100 border-2 border-white flex items-center justify-center text-rose-500 z-10">❤️</div>
                <div className="pl-6 text-xs font-bold text-slate-500 self-center uppercase tracking-widest">{theme.bookingCount || 'Many'} Booked</div>
              </div>
            </div>
          </div>

          {/* Setup Time Bento */}
          {theme.setupDurationMinutes && (
            <div className="col-span-1 bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200/60 flex flex-col justify-between min-h-[140px] group hover:border-zappy-200 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-zappy-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Clock className="text-zappy-600" size={20} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Setup Time</p>
                <p className="text-xl font-black text-slate-900">{theme.setupDurationMinutes} <span className="text-sm font-bold text-slate-400">mins</span></p>
              </div>
            </div>
          )}

          {/* Capacity Bento */}
          {theme.guestCapacity && (
            <div className="col-span-1 bg-white rounded-[2rem] p-5 shadow-sm border border-slate-200/60 flex flex-col justify-between min-h-[140px] group hover:border-fuchsia-200 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users className="text-fuchsia-600" size={20} />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Capacity</p>
                <p className="text-xl font-black text-slate-900">Up to {theme.guestCapacity.max}</p>
              </div>
            </div>
          )}

          {/* Description Bento */}
          {theme.description && (
            <div className="col-span-2 md:col-span-4 bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200/60 relative overflow-hidden">
              <Sparkles size={120} className="absolute -right-10 -bottom-10 text-slate-50/50" />
              <h3 className="font-black text-slate-900 mb-3 text-lg relative z-10">The Experience</h3>
              <p className="text-slate-600 text-[15px] leading-relaxed relative z-10 font-medium">
                {theme.description}
              </p>
            </div>
          )}

          {/* Included Bento */}
          {theme.includedItems?.length > 0 && (
            <div className="col-span-2 bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200/60 relative overflow-hidden group hover:border-emerald-200 transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center border border-emerald-100 group-hover:scale-110 transition-transform">
                  <Check size={24} className="text-emerald-500" strokeWidth={3} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg tracking-tight">Included</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">In this package</p>
                </div>
              </div>
              
              <ul className="space-y-4 relative z-10">
                {theme.includedItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-emerald-500" strokeWidth={3} />
                    </div>
                    <span className="text-[14px] text-slate-700 font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Excluded Bento */}
          {theme.excludedItems?.length > 0 && (
            <div className="col-span-2 bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200/60 relative overflow-hidden group hover:border-rose-200 transition-colors">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-400/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform">
                  <XCircle size={24} className="text-slate-400" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg tracking-tight">Not Included</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Add-ons needed</p>
                </div>
              </div>
              
              <ul className="space-y-4 relative z-10">
                {theme.excludedItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 opacity-70">
                    <div className="w-5 h-5 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                    <span className="text-[14px] text-slate-500 font-medium leading-relaxed line-through">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Partner Bento */}
          {theme.partnerId && (
            <div className="col-span-2 md:col-span-4 bg-slate-900 rounded-[2rem] p-6 flex flex-col sm:flex-row items-center gap-5 relative overflow-hidden mt-2">
              <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-zappy-500/20 to-fuchsia-500/20 rounded-full blur-3xl pointer-events-none" />
              
              <div className="w-20 h-20 bg-white rounded-[1.5rem] flex items-center justify-center text-slate-900 font-black text-3xl shrink-0 shadow-lg transform -rotate-3 z-10">
                {theme.partnerId.businessName?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 text-center sm:text-left z-10">
                <h4 className="font-black text-2xl text-white mb-1">{theme.partnerId.businessName}</h4>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <span className="flex items-center gap-1"><Star size={12} className="text-amber-400 fill-amber-400"/> {theme.partnerId.rating?.toFixed(1) || '4.9'}</span>
                  <span className="w-1 h-1 bg-slate-700 rounded-full" />
                  <span>{theme.partnerId.completedEvents || '10+'} Hosted</span>
                </div>
                {theme.partnerId.bio && <p className="text-sm text-slate-300 font-medium">{theme.partnerId.bio}</p>}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Floating Light CTA Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-50">
        <div className="bg-white/80 backdrop-blur-2xl border border-slate-200/60 rounded-[2rem] p-2.5 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.15)] flex gap-2">
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/events/book/${theme._id}?scheduled=true`)}
            className="flex-1 py-4 bg-slate-100 text-slate-800 rounded-[1.5rem] font-black text-[13px] uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Calendar size={16} /> Later
          </motion.button>
          
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/events/book/${theme._id}`)}
            className="flex-[1.5] py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[13px] uppercase tracking-wider flex items-center justify-center shadow-lg relative overflow-hidden group"
          >
            <span className="relative z-10 flex items-center gap-2">Book Now <ChevronRight size={16} /></span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </motion.button>
        </div>
      </div>

    </div>
  );
}
