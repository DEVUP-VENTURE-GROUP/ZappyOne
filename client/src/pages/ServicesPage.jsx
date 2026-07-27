import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Search, Clock, ChevronRight, X,
  Wrench, Droplets, Bolt, Hammer, Users, Car, Sparkles,
  Tv, Wifi, Smartphone, Battery, Layers, Bike, Fuel, AlertTriangle, Zap,
  Camera, Heart, Dog, Star, ShieldCheck, ShieldAlert, Cpu,
  MonitorSmartphone, Laptop, Lock, ArrowUpRight
} from 'lucide-react';
import PageTransition from '../components/common/PageTransition';
import VoiceSearchButton from '../components/common/VoiceSearchButton';
import SpotlightSearch from '../components/search/SpotlightSearch';
import { searchServices } from '../lib/serviceSearch';
import { getCharacterByCatalogKey } from '../constants/categoryMap';
import { SkeletonServiceCard } from '../components/common/Skeleton';
import { easeSoft } from '../lib/animations';
import toast from 'react-hot-toast';

// Lightweight grid entrance — a tiny, capped stagger so 80+ cards paint in ~1s
// instead of trickling in over 5s. No per-card `layout` (that thrashes on filter).
const gridContainer = { initial: {}, animate: { transition: { staggerChildren: 0.012 } } };
const gridItem = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: easeSoft } } };

const SERVICE_ICONS = {
  // ── Mobile ────────────────────────────────────────────────────────────────
  screen_replacement:    { Icon: Smartphone,    gradient: 'from-indigo-500 to-violet-600',  bg: 'bg-indigo-50',  text: 'text-indigo-600', img: '/images/services/phone_screen.webp' },
  battery_replacement:   { Icon: Battery,       gradient: 'from-emerald-500 to-green-600',  bg: 'bg-emerald-50', text: 'text-emerald-600', img: '/images/services/phone_battery.webp' },
  charging_issue:        { Icon: Bolt,          gradient: 'from-yellow-400 to-orange-500',  bg: 'bg-yellow-50',  text: 'text-yellow-600', img: '/images/services/phone_charging.webp' },
  speaker_mic_issue:     { Icon: Layers,        gradient: 'from-purple-500 to-violet-600',  bg: 'bg-violet-50',  text: 'text-violet-600' },
  microphone_issue:      { Icon: Layers,        gradient: 'from-violet-500 to-purple-600',  bg: 'bg-purple-50',  text: 'text-purple-600' },
  software_issue:        { Icon: Wrench,        gradient: 'from-rose-400 to-red-500',       bg: 'bg-red-50',     text: 'text-red-600', img: '/images/services/phone_software.webp' },
  water_damage:          { Icon: Droplets,      gradient: 'from-blue-400 to-cyan-500',      bg: 'bg-sky-50',     text: 'text-sky-600', img: '/images/services/phone_water.webp' },
  camera_issue:          { Icon: Camera,        gradient: 'from-pink-500 to-rose-600',      bg: 'bg-pink-50',    text: 'text-pink-600', img: '/images/services/phone_camera.webp' },
  data_recovery:         { Icon: Layers,        gradient: 'from-teal-500 to-emerald-600',   bg: 'bg-teal-50',    text: 'text-teal-600', img: '/images/services/phone_data.webp' },
  device_not_turning_on: { Icon: Smartphone,    gradient: 'from-slate-600 to-slate-800',    bg: 'bg-slate-50',   text: 'text-slate-600' },
  // ── Laptop ────────────────────────────────────────────────────────────────
  laptop_slow:             { Icon: Laptop,      gradient: 'from-slate-600 to-slate-800',    bg: 'bg-slate-50',   text: 'text-slate-600', img: '/images/services/laptop_slow.webp' },
  laptop_ssd_upgrade:      { Icon: Cpu,         gradient: 'from-blue-600 to-indigo-700',    bg: 'bg-blue-50',    text: 'text-blue-600', img: '/images/services/laptop_ssd.webp' },
  laptop_ram_upgrade:      { Icon: Cpu,         gradient: 'from-indigo-500 to-blue-600',    bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  laptop_keyboard_issue:   { Icon: Laptop,      gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600' },
  laptop_motherboard_issue:{ Icon: Cpu,         gradient: 'from-red-600 to-rose-700',       bg: 'bg-red-50',     text: 'text-red-600' },
  laptop_charging_issue:   { Icon: Bolt,        gradient: 'from-amber-400 to-orange-500',   bg: 'bg-orange-50',  text: 'text-orange-600', img: '/images/services/laptop_charging.webp' },
  laptop_screen_issue:     { Icon: MonitorSmartphone, gradient: 'from-violet-500 to-purple-700', bg: 'bg-violet-50', text: 'text-violet-600', img: '/images/services/laptop_screen.webp' },
  laptop_virus_removal:    { Icon: ShieldAlert, gradient: 'from-red-500 to-rose-700',       bg: 'bg-red-50',     text: 'text-red-600', img: '/images/services/laptop_virus.webp' },
  laptop_data_recovery:    { Icon: Layers,      gradient: 'from-emerald-500 to-teal-700',   bg: 'bg-emerald-50', text: 'text-emerald-600', img: '/images/services/laptop_data.webp' },
  // ── Smart Devices ─────────────────────────────────────────────────────────
  smart_tv_install:      { Icon: Tv,            gradient: 'from-slate-700 to-slate-900',    bg: 'bg-slate-50',   text: 'text-slate-600', img: '/images/smart_tv.webp' },
  smart_tv_repair:       { Icon: Tv,            gradient: 'from-red-600 to-rose-700',       bg: 'bg-red-50',     text: 'text-red-600', img: '/images/smart_tv.webp' },
  router_setup:          { Icon: Wifi,          gradient: 'from-blue-500 to-cyan-600',      bg: 'bg-cyan-50',    text: 'text-cyan-600', img: '/images/wifi_setup.webp' },
  router_troubleshoot:   { Icon: Wifi,          gradient: 'from-sky-500 to-blue-600',       bg: 'bg-sky-50',     text: 'text-sky-600', img: '/images/wifi_setup.webp' },
  cctv_install:          { Icon: Camera,        gradient: 'from-stone-600 to-stone-800',    bg: 'bg-stone-50',   text: 'text-stone-600', img: '/images/cctv_install.webp' },
  cctv_repair:           { Icon: Camera,        gradient: 'from-amber-600 to-orange-700',   bg: 'bg-amber-50',   text: 'text-amber-600', img: '/images/cctv_install.webp' },
  smart_lock_install:    { Icon: Lock,          gradient: 'from-indigo-600 to-violet-700',  bg: 'bg-indigo-50',  text: 'text-indigo-600', img: '/images/smart_lock.webp' },
  home_automation_setup: { Icon: Zap,           gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600', img: '/images/home_auto.webp' },
  // ── Vehicle ───────────────────────────────────────────────────────────────
  puncture:              { Icon: Car,           gradient: 'from-slate-500 to-slate-700',    bg: 'bg-slate-50',   text: 'text-slate-600' },
  bike_chain_issue:      { Icon: Bike,          gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600' },
  bike_brake_issue:      { Icon: Bike,          gradient: 'from-red-500 to-rose-600',       bg: 'bg-red-50',     text: 'text-red-600' },
  bike_battery_issue:    { Icon: Battery,       gradient: 'from-emerald-500 to-green-600',  bg: 'bg-emerald-50', text: 'text-emerald-600' },
  bike_wash:             { Icon: Bike,          gradient: 'from-cyan-400 to-blue-500',      bg: 'bg-cyan-50',    text: 'text-cyan-600' },
  bike_breakdown:        { Icon: AlertTriangle, gradient: 'from-orange-500 to-red-500',     bg: 'bg-orange-50',  text: 'text-orange-600' },
  bike_service:          { Icon: Wrench,        gradient: 'from-violet-500 to-purple-600',  bg: 'bg-violet-50',  text: 'text-violet-600' },
  car_wash:              { Icon: Car,           gradient: 'from-sky-500 to-blue-600',       bg: 'bg-sky-50',     text: 'text-sky-600' },
  car_detailing:         { Icon: Sparkles,      gradient: 'from-indigo-500 to-violet-600',  bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  battery_jump_start:    { Icon: Zap,           gradient: 'from-yellow-500 to-amber-600',   bg: 'bg-yellow-50',  text: 'text-yellow-600' },
  car_puncture:          { Icon: Car,           gradient: 'from-slate-600 to-slate-800',    bg: 'bg-slate-50',   text: 'text-slate-600' },
  car_breakdown:         { Icon: AlertTriangle, gradient: 'from-red-500 to-rose-600',       bg: 'bg-red-50',     text: 'text-red-600' },
  fuel_delivery:         { Icon: Fuel,          gradient: 'from-orange-500 to-red-500',     bg: 'bg-orange-50',  text: 'text-orange-600' },
  car_service:           { Icon: Wrench,        gradient: 'from-blue-600 to-indigo-700',    bg: 'bg-blue-50',    text: 'text-blue-600' },
  commercial_emergency:  { Icon: AlertTriangle, gradient: 'from-red-600 to-rose-700',       bg: 'bg-red-50',     text: 'text-red-600' },
  commercial_scheduled_maintenance: { Icon: Wrench, gradient: 'from-slate-600 to-slate-800', bg: 'bg-slate-50', text: 'text-slate-600' },
  fleet_support:         { Icon: Car,           gradient: 'from-indigo-600 to-blue-700',    bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  auto_repair:           { Icon: Wrench,        gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600' },
  van_repair:            { Icon: Car,           gradient: 'from-stone-600 to-stone-800',    bg: 'bg-stone-50',   text: 'text-stone-600' },
  // ── Family & Elder ────────────────────────────────────────────────────────
  medicine_pickup:       { Icon: Heart,         gradient: 'from-rose-500 to-pink-600',      bg: 'bg-rose-50',    text: 'text-rose-600', img: '/images/medicine_delivery.webp' },
  hospital_companion:    { Icon: ShieldCheck,   gradient: 'from-blue-500 to-indigo-600',    bg: 'bg-blue-50',    text: 'text-blue-600', img: '/images/hospital_companion.webp' },
  grocery_assistance:    { Icon: Users,         gradient: 'from-green-500 to-emerald-600',  bg: 'bg-green-50',   text: 'text-green-600', img: '/images/grocery_delivery.webp' },
  bill_payment_assist:   { Icon: ShieldCheck,   gradient: 'from-teal-500 to-cyan-600',      bg: 'bg-teal-50',    text: 'text-teal-600' },
  document_submission:   { Icon: ShieldCheck,   gradient: 'from-violet-500 to-purple-600',  bg: 'bg-violet-50',  text: 'text-violet-600' },
  home_visit_check:      { Icon: ShieldCheck,   gradient: 'from-indigo-500 to-blue-600',    bg: 'bg-indigo-50',  text: 'text-indigo-600', img: '/images/home_visit.webp' },
  elder_doctor_visit:    { Icon: Heart,         gradient: 'from-red-500 to-rose-600',       bg: 'bg-red-50',     text: 'text-red-600', img: '/images/elder_care.webp' },
  elder_companion:       { Icon: Users,         gradient: 'from-purple-500 to-violet-600',  bg: 'bg-purple-50',  text: 'text-purple-600', img: '/images/elder_care.webp' },
  elder_home_visit:      { Icon: ShieldCheck,   gradient: 'from-teal-500 to-emerald-600',   bg: 'bg-teal-50',    text: 'text-teal-600', img: '/images/home_visit.webp' },
  elder_transport:       { Icon: Car,           gradient: 'from-blue-500 to-indigo-600',    bg: 'bg-blue-50',    text: 'text-blue-600', img: '/images/hospital_companion.webp' },
  // ── Event Crew ────────────────────────────────────────────────────────────
  event_decorator:           { Icon: Sparkles,  gradient: 'from-violet-500 to-purple-600',  bg: 'bg-violet-50',  text: 'text-violet-600', img: '/images/events/event_romantic.webp' },
  event_setup_crew:          { Icon: Users,     gradient: 'from-blue-500 to-indigo-600',    bg: 'bg-blue-50',    text: 'text-blue-600', img: '/images/events/event_housewarming.webp' },
  event_cleaning_crew:       { Icon: Sparkles,  gradient: 'from-teal-500 to-cyan-600',      bg: 'bg-teal-50',    text: 'text-teal-600' },
  event_helper:              { Icon: Users,     gradient: 'from-green-500 to-emerald-600',  bg: 'bg-green-50',   text: 'text-green-600' },
  event_sound_crew:          { Icon: Layers,    gradient: 'from-slate-700 to-slate-900',    bg: 'bg-slate-50',   text: 'text-slate-600' },
  event_lighting_crew:       { Icon: Zap,      gradient: 'from-amber-400 to-orange-500',   bg: 'bg-amber-50',   text: 'text-amber-600' },
  event_security_crew:       { Icon: ShieldCheck, gradient: 'from-red-500 to-rose-600',    bg: 'bg-red-50',     text: 'text-red-600' },
  event_birthday_setup:      { Icon: Star,     gradient: 'from-pink-500 to-fuchsia-600',   bg: 'bg-pink-50',    text: 'text-pink-600', img: '/images/events/event_birthday.webp' },
  event_wedding_setup:       { Icon: Star,     gradient: 'from-amber-400 to-orange-500',   bg: 'bg-amber-50',   text: 'text-amber-600', img: '/images/events/event_anniversary.webp' },
  event_photography_assist:  { Icon: Camera,   gradient: 'from-indigo-500 to-violet-600',  bg: 'bg-indigo-50',  text: 'text-indigo-600' },
  event_catering_assist:     { Icon: Users,    gradient: 'from-orange-400 to-red-500',     bg: 'bg-orange-50',  text: 'text-orange-600' },
  // ── Pet ───────────────────────────────────────────────────────────────────
  pet_grooming:          { Icon: Dog,           gradient: 'from-amber-400 to-orange-500',   bg: 'bg-amber-50',   text: 'text-amber-600' },
  pet_walking:           { Icon: Bike,          gradient: 'from-green-500 to-emerald-600',  bg: 'bg-green-50',   text: 'text-green-600' },
  pet_transport:         { Icon: Car,           gradient: 'from-violet-500 to-purple-600',  bg: 'bg-violet-50',  text: 'text-violet-600' },
  pet_sitting:           { Icon: Heart,         gradient: 'from-rose-500 to-pink-600',      bg: 'bg-rose-50',    text: 'text-rose-600' },
  pet_vet_assist:        { Icon: ShieldCheck,   gradient: 'from-blue-500 to-indigo-600',    bg: 'bg-blue-50',    text: 'text-blue-600' },
  pet_training_assist:   { Icon: Star,          gradient: 'from-amber-500 to-orange-600',   bg: 'bg-amber-50',   text: 'text-amber-600' },
};

// 'All' stays a meta icon (not a service category), so it keeps a line icon.
// Every other chip's icon comes from categoryMap — the single character source
// of truth shared with the Home grid and sticky rail.
const CATEGORIES = [
  { key: 'all',          label: 'All'           },
  { key: 'mobile',       label: 'Phone'         },
  { key: 'laptop',       label: 'Laptop'        },
  { key: 'car',          label: 'Car Service'   },
  { key: 'bike',         label: 'Bike Repair'   },
  { key: 'smart_device', label: 'Smart Devices' },
  { key: 'helper',       label: 'Family'        },
  { key: 'event',        label: 'Events'        },
  { key: 'pet',          label: 'Pets'          },
];

// Smart Devices, Events, and Pets all share category='other' in the DB schema.
// Use code-prefix matching to distinguish them on the frontend.
const CATEGORY_MATCHERS = {
  mobile:       (s) => s.category === 'mobile',
  laptop:       (s) => s.category === 'laptop' || s.code?.startsWith('laptop_'),
  car:          (s) => s.category === 'car' || s.code?.startsWith('car_') || s.code === 'periodic_car_service',
  bike:         (s) => s.category === 'bike' || s.code?.startsWith('bike_'),
  vehicle:      (s) => s.category === 'car' || s.category === 'bike' || s.category === 'vehicle',
  helper:       (s) => s.category === 'helper',
  smart_device: (s) => s.category === 'other' && !s.code?.startsWith('event_') && !s.code?.startsWith('pet_'),
  event:        (s) => s.code?.startsWith('event_'),
  pet:          (s) => s.code?.startsWith('pet_'),
};

export default function ServicesPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [services, setServices] = useState([]);
  // Seed the query from ?q= so voice search from the Home page lands here.
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [category, setCategory] = useState('all');
  const [spotOpen, setSpotOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchServices = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${baseUrl}/api/catalog/services`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setServices(data.services || []);
    } catch {
      setLoadError(true);
      toast.error('Could not load services. Tap retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  const { filtered, noExactMatch } = useMemo(() => {
    // 1. Narrow by the selected category first.
    let list = services;
    if (category !== 'all') {
      const matcher = CATEGORY_MATCHERS[category];
      list = list.filter((s) => (matcher ? matcher(s) : s.category === category));
    }
    // 2. No search text → show the (category) list as-is.
    const q = query.trim();
    if (!q) return { filtered: list, noExactMatch: false };
    // 3. Smart intent search ("book puncture", "phone screen broken", …).
    const results = searchServices(list, q);
    if (results.length) return { filtered: results, noExactMatch: false };
    // 4. Never dead-end: show everything in the category instead of "No services".
    return { filtered: list, noExactMatch: true };
  }, [services, query, category]);

  return (
    <PageTransition>
      <SpotlightSearch open={spotOpen} onClose={() => setSpotOpen(false)} initialQuery={query} />
      <div className="min-h-screen bg-[#F8FAFC] pb-40 font-sans selection:bg-indigo-500/30">

        {/* Immersive Header */}
        <header className="sticky top-0 z-30 pb-2 bg-white/70 backdrop-blur-2xl border-b border-slate-200/50" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
          <div className="page-container">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-6">
              <motion.button
                onClick={() => nav(-1)}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/60 hover:bg-slate-200 transition-colors"
                whileTap={{ scale: 0.9 }}
              >
                <ArrowLeft size={18} className="text-slate-700" />
              </motion.button>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Zappy Catalog</span>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">All Services</h1>
              </div>
              <div className="w-10 h-10" /> {/* Balancer */}
            </div>

            {/* Premium Search */}
            <div className="relative group mb-5">
              <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-xl group-focus-within:bg-indigo-500/10 transition-colors pointer-events-none" />
              <div className="relative flex items-center gap-3 bg-white border border-slate-200/80 rounded-2xl px-4 py-3.5 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                <Search size={18} className="text-slate-400 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSpotOpen(true)}
                  placeholder="What do you need help with?"
                  className="flex-1 bg-transparent outline-none text-sm sm:text-base font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-medium"
                />
                <AnimatePresence>
                  {query && (
                    <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => setQuery('')} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                      <X size={12} className="text-slate-500" />
                    </motion.button>
                  )}
                </AnimatePresence>
                <VoiceSearchButton
                  onResult={(text) => {
                    setQuery(text);
                    setSearchParams(text ? { q: text } : {}, { replace: true });
                  }}
                />
              </div>
            </div>

            {/* Category Pills (Bento Style) */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
              {CATEGORIES.map((c) => {
                const isActive = category === c.key;
                const character = c.key === 'all' ? null : getCharacterByCatalogKey(c.key);
                return (
                  <motion.button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-[1rem] text-sm font-bold transition-all border ${
                      isActive
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                        : 'bg-white text-slate-600 border-slate-200/80 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    {character ? (
                      <span
                        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center p-1 overflow-hidden"
                        style={{ backgroundColor: isActive ? '#FFFFFF' : character.tint }}
                      >
                        <img
                          src={character.thumb}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          className="w-full h-full object-contain"
                        />
                      </span>
                    ) : (
                      <Sparkles size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                    )}
                    {c.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </header>

        <div className="page-container mt-6">
          {/* Error state */}
          {!loading && loadError && (
            <motion.div className="flex flex-col items-center justify-center h-[40vh] gap-4 text-center"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="w-20 h-20 rounded-[2rem] bg-red-50 flex items-center justify-center shadow-inner">
                <AlertTriangle size={32} className="text-red-400" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-lg">Couldn't load services</p>
                <p className="text-slate-500 text-sm mt-1">Check your connection and try again.</p>
              </div>
              <button onClick={fetchServices}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 active:scale-95 transition-all shadow-sm">
                Retry
              </button>
            </motion.div>
          )}

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-[24px] p-5 border border-slate-200/60 shadow-sm animate-pulse">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl mb-4" />
                  <div className="h-5 bg-slate-100 rounded mb-2 w-3/4" />
                  <div className="h-4 bg-slate-100 rounded mb-6 w-full" />
                  <div className="flex justify-between mt-4 pt-4 border-t border-slate-100">
                    <div className="w-16 h-4 bg-slate-100 rounded" />
                    <div className="w-12 h-6 bg-slate-100 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <motion.div
              className="flex flex-col items-center justify-center h-[40vh] gap-4 text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-20 h-20 rounded-[2rem] bg-slate-100 flex items-center justify-center shadow-inner">
                <Wrench size={32} className="text-slate-400" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-xl">No services found</p>
                <p className="text-sm text-slate-500 mt-2">Try a different search or category.</p>
              </div>
              {(query || category !== 'all') && (
                <motion.button
                  onClick={() => { setQuery(''); setCategory('all'); }}
                  className="mt-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 px-6 py-3 rounded-xl transition-colors shadow-lg shadow-slate-900/20"
                  whileTap={{ scale: 0.95 }}
                >
                  Clear all filters
                </motion.button>
              )}
            </motion.div>
          )}

          {/* Soft "no exact match" banner — we still show services, never a dead-end */}
          {!loading && noExactMatch && (
            <motion.div
              className="mb-5 flex items-start gap-3 rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            >
              <Search size={18} className="text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-indigo-900">
                No exact match for “{query}” — here’s everything we offer. Tap any service to book.
              </p>
            </motion.div>
          )}

          {/* Results Header */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                {noExactMatch ? `${filtered.length} Services` : `${filtered.length} Services Available`}
              </p>
            </div>
          )}

          {/* Grid */}
          {!loading && filtered.length > 0 && (
            <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" variants={gridContainer} initial="initial" animate="animate">
              {filtered.map((s) => {
                  const svc = SERVICE_ICONS[s.code] || SERVICE_ICONS[s.category] || {
                    Icon: Wrench, gradient: 'from-slate-500 to-slate-600', bg: 'bg-slate-100', text: 'text-slate-700',
                  };
                  const { Icon } = svc;
                  const price = Math.round((s.priceRangeMinPaise || 0) / 100);

                  return (
                    <motion.button
                      key={s.code}
                      onClick={() => nav(`/book/${s.code}`)}
                      className="group relative bg-white rounded-[24px] text-left border border-slate-200/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:border-slate-300/80 overflow-hidden flex flex-col h-full"
                      variants={gridItem}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Image Thumbnail */}
                      <div className="relative w-full h-36 bg-slate-100 overflow-hidden shrink-0">
                        {svc.img ? (
                          <img src={svc.img} alt={s.name} loading="lazy" decoding="async" width="400" height="144" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className={`w-full h-full bg-gradient-to-br ${svc.gradient} opacity-20`} />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
                        
                        {/* Glassmorphic Icon layered over image */}
                        <div className="absolute bottom-3 left-4 w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-lg">
                          <Icon size={22} strokeWidth={2.5} className="text-white" />
                        </div>

                        {/* Arrow indicator top right */}
                        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all group-hover:bg-white/20">
                          <ArrowUpRight size={16} className="text-white" />
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="font-black text-slate-900 text-[17px] leading-tight mb-2 line-clamp-1 group-hover:text-indigo-600 transition-colors">{s.name}</h3>
                        <p className="text-[13px] text-slate-500 font-medium line-clamp-2 leading-relaxed mb-4 min-h-[40px] flex-1">
                          {s.description || 'Professional service at your doorstep'}
                        </p>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Starting at</span>
                            <span className="text-base font-black text-slate-900">
                              {price > 0 ? `₹${price}` : 'Get Quote'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-500">
                            <Clock size={12} className="text-slate-400" />
                            <span className="text-[11px] font-bold">~{s.estimatedDurationMinutes}m</span>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
            </motion.div>
          )}
        </div>

      </div>
    </PageTransition>
  );
}
