import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowLeft, TrendingUp, Clock, Mic, Sparkles, ChevronRight, Star, Zap } from 'lucide-react';
import {
  useLazySmartSearchQuery,
  useLazySearchSuggestQuery,
  useSearchTrendingQuery,
} from '../../services/api';
import { getRecent, addRecent, clearRecent } from '../../lib/recentSearches';

const CATEGORY_CHIPS = [
  { code: 'mobile', label: 'Mobile' }, { code: 'vehicle', label: 'Vehicle' },
  { code: 'home', label: 'Home' }, { code: 'event', label: 'Events' },
  { code: 'elder', label: 'Elder Care' }, { code: 'pet', label: 'Pets' },
];

const CATEGORY_IMAGES = {
  vehicle: 'https://images.unsplash.com/photo-1517524285303-d6fc683dddf8?w=100&h=100&fit=crop',
  home: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=100&h=100&fit=crop',
  helper: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=100&h=100&fit=crop',
  beauty: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=100&h=100&fit=crop',
  mobile: 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=100&h=100&fit=crop',
  construction: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=100&h=100&fit=crop',
  event: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=100&h=100&fit=crop',
  pet: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=100&h=100&fit=crop',
  elder: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=100&h=100&fit=crop',
  default: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?w=100&h=100&fit=crop'
};

const SERVICE_IMAGES_MAP = {
  puncture: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&h=300&q=80',
  car_wash: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&h=300&q=80',
  battery_jump_start: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=400&h=300&q=80',
  bike_service: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=400&h=300&q=80',
  car_detailing: 'https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=400&h=300&q=80',
  car_towing: 'https://images.unsplash.com/photo-1591543620767-582b2e76369e?auto=format&fit=crop&w=400&h=300&q=80',
  screen_replacement: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=400&h=300&q=80',
  battery_replacement: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=400&h=300&q=80',
  laptop_slow: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&h=300&q=80',
  charging_issue: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=400&h=300&q=80',
  data_recovery: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&h=300&q=80',
  water_tank_cleaning: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&h=300&q=80',
  overhead_tank_cleaning: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&h=300&q=80',
  underground_sump_cleaning: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&h=300&q=80',
  sintex_tank_cleaning: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&h=300&q=80',
  romantic: 'https://images.unsplash.com/photo-1494972308805-463bc619d34e?auto=format&fit=crop&w=400&h=400&q=80',
  housewarming: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&h=400&q=80',
  pet_grooming: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&h=400&q=80',
  pet_walking: 'https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?auto=format&fit=crop&w=400&h=400&q=80',
  pet_sitting: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&h=400&q=80',
  pet_vet_assist: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&h=400&q=80',
  pet_transport: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=400&h=400&q=80',
};

// Zepto/Spotlight-style full-screen search. Opens over the current page.
// lat/lng optional — enables the nearby-pros group when provided.
export default function SpotlightSearch({ open, onClose, lat, lng, initialQuery = '' }) {
  const nav = useNavigate();
  const inputRef = useRef(null);
  const [q, setQ] = useState(initialQuery);
  const [recent, setRecent] = useState(getRecent());

  const [runSearch, searchState] = useLazySmartSearchQuery();
  const [runSuggest, suggestState] = useLazySearchSuggestQuery();
  const { data: trendData } = useSearchTrendingQuery(undefined, { skip: !open });

  // Focus on open; reset on close.
  useEffect(() => {
    if (open) { setRecent(getRecent()); setTimeout(() => inputRef.current?.focus(), 60); }
  }, [open]);

  // Debounced live search + suggest as the user types.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) return;
    const id = setTimeout(() => {
      runSearch({ q: term, lat, lng });
      runSuggest({ q: term });
    }, 130);
    return () => clearTimeout(id);
  }, [q, open, lat, lng, runSearch, runSuggest]);

  const go = useCallback((code, term) => {
    if (term) setRecent(addRecent(term));
    onClose?.();
    nav(`/book/${code}`);
  }, [nav, onClose]);

  const submitText = useCallback((text) => {
    const t = String(text || '').trim();
    if (!t) return;
    setQ(t);
    setRecent(addRecent(t));
    runSearch({ q: t, lat, lng });
    runSuggest({ q: t });
  }, [lat, lng, runSearch, runSuggest]);

  // Voice → fill the query (browser Web Speech).
  const startVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => submitText(e.results[0][0].transcript);
    rec.start();
  }, [submitText]);

  const data = searchState.data;
  const hasQuery = q.trim().length > 0;
  const loading = hasQuery && (searchState.isFetching || searchState.isUninitialized);
  const suggestions = suggestState.data?.suggestions || [];
  const trending = trendData?.trending || [];

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] bg-white flex flex-col"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 shrink-0">
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-2xl px-3.5 h-11">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitText(q)}
              placeholder="Search services, problems, pros…"
              className="flex-1 bg-transparent outline-none text-[15px] text-slate-900 placeholder:text-slate-400"
            />
            {q ? (
              <button onClick={() => setQ('')} className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                <X size={13} className="text-slate-500" />
              </button>
            ) : (
              <button onClick={startVoice} className="shrink-0 text-indigo-500"><Mic size={18} /></button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Live autocomplete suggestions */}
          {hasQuery && suggestions.length > 0 && (
            <div className="border-b border-slate-100">
              {suggestions.map((s) => (
                <button key={s.type + s.code} onClick={() => (s.type === 'category' ? submitText(s.title) : go(s.code, s.title))}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left">
                  <Search size={15} className="text-slate-300 shrink-0" />
                  <span className="text-[14px] text-slate-700 flex-1 truncate">{s.title}</span>
                  <ChevronRight size={15} className="text-slate-300" />
                </button>
              ))}
            </div>
          )}

          {/* Empty state: recent + trending + categories */}
          {!hasQuery && (
            <div className="p-4 space-y-6">
              {recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><Clock size={12} /> Recent</p>
                    <button onClick={() => setRecent(clearRecent())} className="text-[11px] font-bold text-slate-400 hover:text-slate-600">Clear</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((r) => (
                      <button key={r} onClick={() => submitText(r)} className="px-3 py-1.5 rounded-full bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200">{r}</button>
                    ))}
                  </div>
                </div>
              )}

              {trending.length > 0 && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5"><TrendingUp size={12} /> Trending now</p>
                  <div className="flex flex-wrap gap-2">
                    {trending.map((t) => (
                      <button key={t.code} onClick={() => (t.type === 'service' ? go(t.code, t.title) : submitText(t.title))}
                        className="px-3 py-1.5 rounded-full bg-indigo-50 text-[13px] font-semibold text-indigo-600 hover:bg-indigo-100 flex items-center gap-1.5">
                        <Zap size={12} className="fill-indigo-400 text-indigo-400" />{t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2.5">Browse</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_CHIPS.map((c) => (
                    <button key={c.code} onClick={() => submitText(c.label)} className="px-3 py-1.5 rounded-full border border-slate-200 text-[13px] font-medium text-slate-600 hover:border-slate-300">{c.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1"><div className="h-3.5 bg-slate-100 rounded w-2/5 mb-2" /><div className="h-2.5 bg-slate-50 rounded w-1/4" /></div>
                </div>
              ))}
            </div>
          )}

          {/* Resilience: if the API errors we still never dead-end — show trending. */}
          {hasQuery && !loading && !data && (
            <div className="p-4">
              <p className="text-[13px] font-semibold text-slate-500 flex items-center gap-1.5 mb-3">
                <TrendingUp size={13} className="text-indigo-500" /> Trending services
              </p>
              <div className="flex flex-wrap gap-2">
                {(trending.length ? trending : CATEGORY_CHIPS.map((c) => ({ code: c.code, title: c.label, type: 'category' }))).map((t) => (
                  <button key={t.code} onClick={() => (t.type === 'service' ? go(t.code, t.title) : submitText(t.title))}
                    className="px-3 py-1.5 rounded-full bg-indigo-50 text-[13px] font-semibold text-indigo-600 hover:bg-indigo-100">{t.title}</button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {hasQuery && !loading && data && (
            <div className="pb-8">
              {data.empty && (
                <p className="px-4 pt-3 text-[13px] font-semibold text-slate-500 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-indigo-500" /> Popular services you can book now
                </p>
              )}

              {/* Intent cards (AI Suggestions) */}
              {data.intents?.length > 0 && data.intents.map((it) => (
                <div 
                  key={it.code} 
                  onClick={() => submitText(it.title)}
                  className="mx-4 mt-3 p-3.5 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"
                >
                  <div>
                    <p className="text-[13px] font-bold text-indigo-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-500 fill-indigo-200" /> {it.title}
                    </p>
                    {it.keywords && <p className="text-[11px] text-indigo-600/80 mt-1 pl-5">AI Suggestion: {it.keywords.join(', ')}</p>}
                  </div>
                  <ChevronRight size={14} className="text-indigo-300" />
                </div>
              ))}

              {/* Services */}
              {data.services?.length > 0 && (
                <div className="px-4 py-2 mt-2">
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {data.services.map((s, idx) => {
                      // Smart image matching
                      const getServiceImage = (srv) => {
                        if (SERVICE_IMAGES_MAP[srv.code]) return SERVICE_IMAGES_MAP[srv.code];
                        if (srv.code.includes('bike') || srv.code.includes('scooter')) return 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=100&h=100&q=80';
                        if (srv.code.includes('car')) return 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=100&h=100&q=80';
                        if (srv.code.includes('phone') || srv.code.includes('mobile')) return 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?auto=format&fit=crop&w=100&h=100&q=80';
                        if (srv.code.includes('laptop') || srv.code.includes('pc')) return 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=100&h=100&q=80';
                        if (srv.icon) return srv.icon;
                        // Avoid the blue brick wall
                        return CATEGORY_IMAGES[srv.category] || CATEGORY_IMAGES.default;
                      };

                      return (
                      <div 
                        key={s.code} 
                        onClick={() => go(s.code, q)} 
                        className={`w-full flex items-center gap-3 p-3 bg-white cursor-pointer hover:bg-slate-50 transition-colors ${idx !== data.services.length - 1 ? 'border-b border-slate-100' : ''}`}
                      >
                        <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden">
                          <img 
                            src={getServiceImage(s)} 
                            alt={s.title} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <div className="flex-1 min-w-0 py-0.5">
                          <p className="text-[14px] font-bold text-[#0F172A] truncate">{s.title}</p>
                          <p className="text-[12px] text-slate-500 mt-0.5 truncate">{s.subtitle || 'Service details'}</p>
                          {s.priceMinPaise && (
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="text-[13px] font-bold text-[#0F172A]">₹{Math.round(s.priceMinPaise/100)}</span>
                              <span className="text-[11px] text-slate-400 line-through">₹{Math.round(s.priceMinPaise/100) + 100}</span>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 ml-2">
                          <button 
                            className="px-5 py-1.5 rounded-lg border border-slate-300 bg-white text-[#0F172A] text-[12px] font-bold uppercase tracking-wide hover:bg-slate-50 active:bg-slate-100"
                            onClick={(e) => { e.stopPropagation(); go(s.code, q); }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )}

              {/* Nearby pros (P2) */}
              {data.workers?.length > 0 && (
                <div className="mt-4">
                  <p className="px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Available pros near you</p>
                  <div className="flex gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                    {data.workers.map((w) => (
                      <div key={w.workerId} className="shrink-0 w-28 rounded-xl border border-slate-200 p-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold mb-1.5">{(w.name||'P')[0]}</div>
                        <p className="text-[12.5px] font-bold text-slate-900 truncate">{w.name}</p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-0.5"><Star size={10} className="fill-amber-400 text-amber-400" />{w.rating} · {w.completedJobs} jobs</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
