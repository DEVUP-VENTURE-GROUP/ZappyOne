import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSafeBack } from '../../hooks/useBookingFlow';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Heart, Star, ArrowUpRight, PartyPopper, ArrowLeft } from 'lucide-react';
import { useGetEventCategoriesQuery, useGetEventConfigQuery, useGetEventThemesQuery, useGetServiceabilityQuery, useToggleSaveEventThemeMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

import { eventPhoto } from './eventPhotos';
import { loadGeoLocation } from '@shared/hooks/useGeolocation';
import NotInYourArea from '../catalog/serviceability/NotInYourArea';

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
          <span className="text-white/30 text-xs">|</span>
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
            Trending
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="font-black text-[15px] text-slate-900 leading-tight line-clamp-1">{theme.title}</p>
        <p className="text-xs font-semibold text-slate-400 mt-1.5 line-clamp-1">{theme.categoryId?.name}, {theme.partnerId?.businessName}</p>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <span className="text-base font-black text-ink-900">₹{Math.round((theme.startingPricePaise || 0) / 100).toLocaleString('en-IN')}</span>
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
  const goBack = useSafeBack('/');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showReels, setShowReels] = useState(false);

  // Only what an approved partner offers in this city (server events/event.service liveThemeQuery).
  const [here] = useState(() => loadGeoLocation());
  const { data: svc } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: !here });
  const city = svc?.zone?.city || undefined;
  const scope = city ? { city } : {};
  const { data: catData } = useGetEventCategoriesQuery(scope);
  const { data: config } = useGetEventConfigQuery();
  const { data: trendingData } = useGetEventThemesQuery({ ...scope, sort: 'trending', limit: 12 });
  const { data: videoData } = useGetEventThemesQuery({ ...scope, sort: 'trending', limit: 6 });
  const [toggleSave] = useToggleSaveEventThemeMutation();

  const categories = catData?.categories || [];
  const paused = config?.live === false;
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

  const withPhoto = categories.filter((c) => eventPhoto(c));
  const without = categories.filter((c) => !eventPhoto(c));
  const noneHere = svc && !svc.events;
  const openCat = (cat) => navigate(`/events/browse?category=${cat.slug}${city ? `&city=${encodeURIComponent(city)}` : ''}`);

  if (paused) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-16">
        <div className="mx-auto max-w-sm text-center">
          <PartyPopper size={40} className="mx-auto text-slate-300" />
          <h1 className="mt-4 text-xl font-bold text-ink-900">Events are not open right now</h1>
          <p className="mt-2 text-sm text-slate-500">Event décor bookings are paused for the moment. Your existing bookings carry on as planned.</p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" onClick={() => navigate('/events/bookings')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">My event bookings</button>
            <button type="button" onClick={() => navigate('/')} className="rounded-xl bg-zappy-600 px-4 py-2.5 text-sm font-bold text-white">Back to home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-20 sm:pb-8">
      {/* Header: what this is, and search. No orbs, no gradient. */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 pb-6 pt-4 sm:pb-8 sm:pt-6">
          {/* Events sit outside the tab bar, so they carry their own way back. */}
          <button type="button" onClick={goBack} aria-label="Back"
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-btn bg-sunken text-ink-700 hover:bg-line">
            <ArrowLeft size={18} />
          </button>
          <h1 className="h-display">Events and décor</h1>
          <p className="mt-1.5 text-[15px] text-ink-500">Decor and planning for birthdays, showers, anniversaries and more.</p>
          <form onSubmit={handleSearch} className="mt-5 flex max-w-2xl items-center gap-3 rounded-btn border border-line bg-sunken px-3.5 transition-colors focus-within:border-zappy-600 focus-within:bg-white">
            <Search size={18} className="shrink-0 text-ink-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Birthday, anniversary, baby shower"
              className="h-12 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400" />
          </form>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl space-y-10 px-5">
        {noneHere ? (
          <NotInYourArea soon place={svc.zone?.name || city} lat={here?.lat} lng={here?.lng} areas={svc.areas || []} onChangeLocation={() => navigate('/')} />
        ) : (
        <>
        {categories.length > 0 && (
          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="h-section">Pick the occasion</h2>
              <button type="button" onClick={() => navigate('/events/browse')} className="flex items-center gap-1 text-[14px] font-bold text-zappy-700">
                See all <ArrowUpRight size={16} />
              </button>
            </div>
            {withPhoto.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {withPhoto.map((cat) => (
                  <button key={cat._id} type="button" onClick={() => openCat(cat)} className="group text-left">
                    <span className="block aspect-[4/5] overflow-hidden rounded-card bg-sunken">
                      <img src={eventPhoto(cat)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </span>
                    <span className="mt-2 block text-[15px] font-bold text-ink-900">{cat.name}</span>
                  </button>
                ))}
              </div>
            )}
            {without.length > 0 && (
              <div className={withPhoto.length ? 'mt-5' : ''}>
                {withPhoto.length > 0 && <p className="mb-2 text-[13px] font-semibold text-ink-500">More occasions</p>}
                <div className="flex flex-wrap gap-2">
                  {without.map((cat) => (
                    <button key={cat._id} type="button" onClick={() => openCat(cat)}
                      className="rounded-full border border-line bg-white px-4 py-2 text-[14px] font-semibold text-ink-900 hover:border-zappy-600">
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Video Reels toggle */}
        {videoThemes.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-6">
              <h2 className="h-section flex items-center gap-2"><Play size={18} className="text-zappy-600" /> See it set up</h2>
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
            <h2 className="h-section">Popular packages</h2>
            <button type="button" onClick={() => navigate('/events/browse?sort=trending')} className="flex items-center gap-1 text-[14px] font-bold text-zappy-700">
              See all <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {trending.map(theme => (
              <ThemeCard key={theme._id} theme={theme} onSave={handleSave} />
            ))}
          </div>
          {!trending.length && (
            <div className="mt-4 rounded-card border border-line bg-white px-5 py-10 text-center">
              <PartyPopper size={32} className="mx-auto text-ink-300" strokeWidth={1.6} />
              <p className="mt-3 text-[15px] font-semibold text-ink-700">Packages are being added</p>
              <p className="mt-1 text-[13px] text-ink-500">Partners near you are setting up their décor packages.</p>
            </div>
          )}
        </section>
        </>
        )}
      </div>
    </div>
  );
}
