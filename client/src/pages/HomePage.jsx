import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
  Bell, Search, ChevronRight, ChevronDown, Zap, Star, Wrench,
  Droplets, Bolt, Hammer, Users, Car, Sparkles,
  Flame, Trophy, Smartphone, Battery, Layers,
  Bike, Fuel, AlertTriangle, ArrowUpRight,
  Clock, Wallet, User, ShieldCheck,
  CheckCircle, Lock, TrendingUp, MapPin, Loader2,
  Laptop, Tv, Wifi, Camera, Heart, PartyPopper, Dog,
  ShieldAlert, Cpu, MonitorSmartphone, Repeat2,
  Tag, Headphones, ArrowRight, ThumbsUp,
} from 'lucide-react';
import { selectAuth, selectIsAuthed } from '../modules/auth/authSlice';
import toast from 'react-hot-toast';
import { useT } from '../i18n/I18nProvider';
import { useListOrdersQuery, useGetGamificationQuery, useGetRecommendationsQuery, useListServicesQuery, useRebookOrderMutation, useListNotificationsQuery } from '../services/api';
import { useGeolocation, loadGeoLocation } from '../hooks/useGeolocation';
import { reverseGeocode } from '../utils/reverseGeocode';
import { serviceLabel } from '../constants/services';
import { ZappyLogo } from '../components/common/ZappyLogo';
import Footer from '../components/layout/Footer';
import VoiceSearchButton from '../components/common/VoiceSearchButton';
import SpotlightSearch from '../components/search/SpotlightSearch';
import LensModal from '../components/lens/LensModal';
import { ScanLine } from 'lucide-react';

function LensButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="ZappyLens — scan to find a service"
      className="relative shrink-0 w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition">
      <ScanLine size={18} />
    </button>
  );
}
import AdBanner from '../components/common/AdBanner';
import { springSnap, fadeInUp, staggerContainer } from '../lib/animations';
import IntroSplash from '../components/common/IntroSplash';
import HeroCarousel from '../components/home/HeroCarousel';
import CharacterServiceGrid from '../components/home/CharacterServiceGrid';
import { SERVICE_PRICE_FALLBACK } from '../constants/servicePriceFallback';
import OffersSection from '../components/home/OffersSection';
import { 
  PromoBannerVehicle, 
  PromoBannerElectronics,
  PromoBannerFamily,
  PromoBannerEvents
} from '../components/home/PromoBanners';
import SEO, { HOME_SCHEMA, BASE_URL } from '../components/SEO';
import { useIsMobile } from '../hooks/useIsMobile';

const SEARCH_PLACEHOLDERS = [
  "Search 'Puncture Repair'...",
  "Search 'Laptop Service'...",
  "Search 'Electrician'...",
  "Search 'Car Wash'...",
  "Search 'Plumber'..."
];

function AnimatedSearchPlaceholder() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % SEARCH_PLACEHOLDERS.length), 2500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex-1 h-full relative overflow-hidden flex items-center">
      <AnimatePresence>
        <motion.span
          key={index}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-0 right-0 truncate text-slate-400 font-medium text-[14px] sm:text-[15px]"
        >
          {SEARCH_PLACEHOLDERS[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ─── Book Again helpers ───────────────────────────────────────────────── */
// Emoji for the rebook card's icon tile, chosen from the service code keyword.
function serviceEmoji(code = '') {
  const c = code.toLowerCase();
  if (c.includes('puncture') || c.includes('tyre')) return '🛞';
  if (c.includes('bike')) return '🏍️';
  if (c.includes('car') || c.includes('fuel') || c.includes('breakdown') || c.includes('jump')) return '🚗';
  if (c.includes('laptop')) return '💻';
  if (c.includes('screen') || c.includes('battery') || c.includes('charging') || c.includes('phone') || c.includes('camera') || c.includes('software') || c.includes('water') || c.includes('data')) return '📱';
  if (c.includes('tv')) return '📺';
  if (c.includes('cctv')) return '📷';
  if (c.includes('router') || c.includes('wifi')) return '📶';
  if (c.includes('lock') || c.includes('automation')) return '🔐';
  if (c.includes('electric') || c.includes('fan') || c.includes('light') || c.includes('switch')) return '💡';
  if (c.includes('plumb') || c.includes('pipe') || c.includes('tap')) return '🚿';
  if (c.includes('pet') || c.includes('dog') || c.includes('groom')) return '🐾';
  if (c.includes('event') || c.includes('birthday') || c.includes('decor')) return '🎉';
  if (c.includes('elder') || c.includes('medicine') || c.includes('hospital') || c.includes('grocery')) return '🧓';
  return '🔧';
}

// Short "time ago" label for the rebook card.
function timeAgo(date) {
  if (!date) return 'Booked before';
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

/* ─── Most booked — Electronics Rescue ────────────────────────────────── */
const MOST_BOOKED = [
  { key: 'screen_replacement',  name: 'Screen Replacement', img: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'battery_replacement', name: 'Battery Replacement',img: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'laptop_slow',         name: 'Laptop Speed Fix',   img: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'charging_issue',      name: 'Charging Port Fix',  img: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'data_recovery',       name: 'Data Recovery',      img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
];

/* ─── Vehicle care highlights ──────────────────────────────────────────── */
const VEHICLE_HIGHLIGHTS = [
  { key: 'puncture',         name: 'Puncture Repair',  img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'car_wash',         name: 'Car Wash',         img: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'battery_jump_start',name: 'Jump Start',      img: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'bike_service',     name: 'Bike Full Service',img: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'car_detailing',    name: 'Car Detailing',    img: 'https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&w=400&h=300&q=80', badge: 'Popular' },
  { key: 'car_towing',       name: 'Vehicle Towing',   img: 'https://images.unsplash.com/photo-1591543620767-582b2e76369e?auto=format&fit=crop&w=400&h=300&q=80', badge: 'New' },
];

/* ─── Service tile data ────────────────────────────────────────────────── */
// Electronics Rescue — Mobile
const PHONE_TILES = [
  { key: 'screen_replacement',  name: 'Screen Fix',    img: '/images/services/phone_screen.webp',  eta: '25 mins' },
  { key: 'battery_replacement', name: 'Battery',       img: '/images/services/phone_battery.webp', eta: '30 mins' },
  { key: 'charging_issue',      name: 'Charging',      img: '/images/services/phone_charging.webp',eta: '20 mins' },
  { key: 'camera_issue',        name: 'Camera',        img: '/images/services/phone_camera.webp',  eta: null      },
  { key: 'software_issue',      name: 'Software',      img: '/images/services/phone_software.webp',eta: null      },
  { key: 'water_damage',        name: 'Water Damage',  img: '/images/services/phone_water.webp',   eta: null      },
  { key: 'data_recovery',       name: 'Data Recovery', img: '/images/services/phone_data.webp',    eta: null      },
];

// Electronics Rescue — Laptop
const LAPTOP_TILES = [
  { key: 'laptop_slow',             name: 'Slow Laptop',    img: '/images/services/laptop_slow.webp',     eta: '45 mins' },
  { key: 'laptop_ssd_upgrade',      name: 'SSD Upgrade',    img: '/images/services/laptop_ssd.webp',      eta: null      },
  { key: 'laptop_screen_issue',     name: 'Screen Repair',  img: '/images/services/laptop_screen.webp',   eta: null      },
  { key: 'laptop_virus_removal',    name: 'Virus Removal',  img: '/images/services/laptop_virus.webp',    eta: null      },
  { key: 'laptop_data_recovery',    name: 'Data Recovery',  img: '/images/services/laptop_data.webp',     eta: null      },
  { key: 'laptop_charging_issue',   name: 'Charging Fix',   img: '/images/services/laptop_charging.webp', eta: '40 mins' },
];

// Smart Devices
const SMART_TILES = [
  { key: 'smart_tv_install',    name: 'Smart TV',         img: '/images/smart_tv.webp',       eta: '60 mins' },
  { key: 'router_setup',        name: 'WiFi Setup',       img: '/images/wifi_setup.webp',     eta: '30 mins' },
  { key: 'cctv_install',        name: 'CCTV Install',     img: '/images/cctv_install.webp',   eta: null      },
  { key: 'smart_lock_install',  name: 'Smart Lock',       img: '/images/smart_lock.webp',       eta: null      },
  { key: 'home_automation_setup',name: 'Home Auto',       img: '/images/home_auto.webp',      eta: null      },
];

// Vehicle Care
const VEHICLE_TILES = [
  { key: 'puncture',           name: 'Puncture',      Icon: AlertTriangle, grad: 'from-slate-600 to-slate-800',  shadow: 'rgba(100,116,139,0.4)', eta: '18 mins' },
  { key: 'battery_jump_start', name: 'Jump Start',    Icon: Zap,           grad: 'from-yellow-500 to-amber-600', shadow: 'rgba(245,158,11,0.4)',  eta: '15 mins' },
  { key: 'bike_wash',          name: 'Bike Wash',     Icon: Bike,          grad: 'from-cyan-500 to-blue-600',    shadow: 'rgba(6,182,212,0.35)', eta: '30 mins' },
  { key: 'car_wash',           name: 'Car Wash',      Icon: Car,           grad: 'from-sky-500 to-blue-700',     shadow: 'rgba(14,165,233,0.35)',eta: '35 mins' },
  { key: 'car_breakdown',      name: 'Breakdown',     Icon: Hammer,        grad: 'from-red-500 to-rose-700',     shadow: 'rgba(239,68,68,0.35)', eta: '20 mins' },
  { key: 'fuel_delivery',      name: 'Fuel Delivery', Icon: Fuel,          grad: 'from-orange-500 to-red-500',   shadow: 'rgba(249,115,22,0.4)', eta: '25 mins' },
];

// Family & Elder Assist
const FAMILY_TILES = [
  { key: 'medicine_pickup',    name: 'Medicine',      img: '/images/medicine_delivery.webp', eta: '40 mins' },
  { key: 'hospital_companion', name: 'Hospital Help', img: '/images/hospital_companion.webp', eta: null      },
  { key: 'grocery_assistance', name: 'Grocery',       img: '/images/grocery_delivery.webp',   eta: '45 mins' },
  { key: 'elder_companion',    name: 'Elder Care',    img: '/images/elder_care.webp',         eta: null      },
  { key: 'home_visit_check',   name: 'Home Visit',    img: '/images/home_visit.webp',         eta: null      },
];

// Tank & Water Cleaning
const TANK_TILES = [
  { key: 'water_tank_cleaning',      name: 'Water Tank',      img: '/images/water_tank_cleaning.webp', badge: 'New' },
  { key: 'overhead_tank_cleaning',   name: 'Overhead Tank',   img: '/images/overhead_tank_cleaning.webp', badge: 'New' },
  { key: 'underground_sump_cleaning',name: 'Underground Sump',img: '/images/underground_sump_cleaning.webp', badge: 'New' },
  { key: 'sintex_tank_cleaning',     name: 'Sintex Tank',     img: '/images/sintex_tank_cleaning.webp', badge: 'New' },
];

// Event Commerce tiles — navigate to event commerce module
const EVENT_TILES = [
  { key: 'birthday',      name: 'Birthday',    img: '/images/event_birthday.webp',  category: 'birthday'      },
  { key: 'anniversary',   name: 'Anniversary', img: '/images/event_anniversary.webp', category: 'anniversary'   },
  { key: 'baby-shower',   name: 'Baby Shower', img: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=400&h=400&q=80',   category: 'baby-shower'   },
  { key: 'romantic',      name: 'Romantic',    img: 'https://images.unsplash.com/photo-1494972308805-463bc619d34e?auto=format&fit=crop&w=400&h=400&q=80',      category: 'romantic'      },
  { key: 'housewarming',  name: 'Housewarming',img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&h=400&q=80',  category: 'housewarming'  },
];

// Pet Assistance
const PET_TILES = [
  { key: 'pet_grooming',       name: 'Grooming',    img: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&h=400&q=80',  eta: '60 mins' },
  { key: 'pet_walking',        name: 'Walking',     img: 'https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?auto=format&fit=crop&w=400&h=400&q=80', eta: '20 mins' },
  { key: 'pet_sitting',        name: 'Pet Sitting', img: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&h=400&q=80',     eta: null      },
  { key: 'pet_vet_assist',     name: 'Vet Help',    img: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&h=400&q=80',   eta: null      },
  { key: 'pet_transport',      name: 'Transport',   img: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=400&h=400&q=80', eta: null      },
];

const HERO_POSTERS = [
  { Icon: Smartphone, label: 'Phone Repair',  grad: 'from-indigo-500 via-violet-600 to-purple-700' },
  { Icon: Car,        label: 'Vehicle Care',  grad: 'from-slate-600 via-slate-700 to-slate-900'    },
  { Icon: Heart,      label: 'Family Assist', grad: 'from-rose-500 via-pink-500 to-fuchsia-600'    },
  { Icon: Dog,        label: 'Pet Care',      grad: 'from-amber-400 via-orange-500 to-red-500'     },
];

const ACTIVE_STATUSES = ['created','searching','assigned','on_the_way','arrived','in_progress'];
const STATUS_LABELS = {
  searching: 'Finding a worker', assigned: 'Worker assigned', on_the_way: 'On the way',
  arrived: 'Arrived', in_progress: 'In progress', created: 'Order placed',
};
const LEVEL_COLORS = {
  Rookie: 'from-slate-400 to-slate-500',    Explorer: 'from-green-400 to-emerald-500',
  Regular: 'from-blue-400 to-blue-600',     Pro: 'from-violet-400 to-purple-600',
  Expert: 'from-amber-400 to-orange-500',   Elite: 'from-rose-400 to-red-500',
  Champion: 'from-pink-400 to-fuchsia-600', Legend: 'from-yellow-300 to-amber-500',
};

/* ─── Live worker badge ────────────────────────────────────────────────── */
function LiveBadge() {
  const [n, setN] = useState(47);
  useEffect(() => {
    const id = setInterval(() => setN(x => x + (Math.random() > 0.5 ? 1 : -1)), 6000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 ring-1 ring-green-200 whitespace-nowrap shrink-0">
      <motion.span className="w-1.5 h-1.5 rounded-full bg-green-500"
        animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }} />
      <span className="text-[11px] font-bold text-green-700 whitespace-nowrap">{n} workers live</span>
    </div>
  );
}

/* ─── Notification bell with live unread count ─────────────────────────── */
// Reuses the same real notifications source the BottomNav/WorkerDashboard use.
// No hardcoded count — the badge reflects genuine unread notifications.
function NotifBell({ nav, isAuthed }) {
  const { data } = useListNotificationsQuery(
    { page: 1, unreadOnly: true },
    { skip: !isAuthed, pollingInterval: 60000 },
  );
  const count = data?.unread ?? data?.notifications?.length ?? 0;
  return (
    <motion.button
      onClick={() => nav('/notifications')}
      className="relative w-11 h-11 md:w-[52px] md:h-[52px] rounded-full bg-white border border-slate-900/5 shadow-soft flex items-center justify-center shrink-0 hover:shadow-soft-lg hover:-translate-y-0.5 transition-all"
      whileTap={{ scale: 0.88 }}
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
    >
      <Bell size={18} strokeWidth={1.75} className="text-slate-600" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none ring-2 ring-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </motion.button>
  );
}

/* ─── Hero trust bar (live, overlapping the banner's bottom edge) ──────── */
// Static brand promises (copy, not data). Rebuilt as a crisp live card so it
// no longer relies on the screenshot's baked-in white box.
const TRUST_BADGES = [
  { Icon: ShieldCheck, l1: 'Verified',     l2: 'Professionals' },
  { Icon: Tag,         l1: 'Upfront',      l2: 'Pricing' },
  { Icon: Clock,       l1: 'On-time',      l2: 'Service' },
  { Icon: ThumbsUp,    l1: 'Satisfaction', l2: 'Guaranteed' },
];

function HeroTrustBar() {
  return (
    <div className="relative z-10 -mt-2.5 md:-mt-6 mx-2.5 md:mx-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_14px_36px_-14px_rgba(15,23,42,0.24)] px-1.5 py-3 md:px-4 md:py-3.5">
        <div className="grid grid-cols-4 divide-x divide-slate-200/60">
          {TRUST_BADGES.map(({ Icon, l1, l2 }) => (
            <div
              key={l1}
              className="flex items-center justify-center gap-1.5 md:gap-2.5 px-1 md:px-2"
            >
              <Icon size={16} strokeWidth={2} className="text-zappy-600 shrink-0" />
              <span className="text-[10px] md:text-[12.5px] font-semibold text-slate-700 leading-[1.18]">
                {l1}<br />{l2}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Offer / trust cards (section 7) ──────────────────────────────────── */
// Static brand copy — Zappy has no offers API, so these are local constants
// (the ZAPPY20 code matches the one already surfaced in OffersSection).
const TRUST_OFFERS = [
  { Icon: Tag,        title: 'FLAT 20% OFF', line1: 'On first service', line2: 'Use: ZAPPY20' },
  { Icon: Wallet,     title: 'SAFE & SECURE', line1: '100% secure', line2: 'payments' },
  { Icon: Headphones, title: '24/7 SUPPORT',  line1: 'We are always', line2: 'here to help' },
];

function TrustOfferCards() {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 md:gap-3">
      {TRUST_OFFERS.map(({ Icon, title, line1, line2 }) => (
        <div
          key={title}
          className="flex items-center gap-2 md:gap-2.5 rounded-[12px] bg-slate-50 border border-slate-200/70 px-2 py-2 md:px-3 md:py-2.5"
        >
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-zappy-50 flex items-center justify-center shrink-0">
            <Icon size={14} strokeWidth={2} className="text-zappy-600" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[9px] md:text-[11px] font-bold text-zappy-600 uppercase tracking-wide leading-[1.15]">{title}</p>
            <p className="text-[8.5px] md:text-[10px] text-slate-500 font-medium leading-[1.2]">{line1} {line2}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── UC-style image service card ──────────────────────────────────────── */
function ServiceImageCard({ item, nav }) {
  // Live price from the admin Service Catalog — single source of truth. When the
  // catalog hasn't loaded yet (or a request failed), fall back to a snapshot of
  // catalog minimums so the card shows a real "From ₹X" instead of "Get Quote".
  const { data: catalog } = useListServicesQuery();
  const svc   = catalog?.byCode?.[item.key];
  const livePrice = svc?.priceRangeMinPaise != null ? Math.round(svc.priceRangeMinPaise / 100) : null;
  const price = livePrice ?? SERVICE_PRICE_FALLBACK[item.key] ?? null;
  const isServiceCode = /^[a-z][a-z0-9_]+$/.test(item.key || '');
  const badge = item.badge || 'Popular';

  return (
    <div
      onClick={() => nav(`/book/${item.key}`)}
      className="shrink-0 w-36 sm:w-44 md:w-[200px] lg:w-[240px] flex flex-col text-left cursor-pointer group"
    >
      <div className="w-full aspect-[4/3] sm:aspect-square rounded-[12px] md:rounded-[16px] overflow-hidden bg-slate-100 mb-2.5 relative">
        <img
          src={item.img}
          alt={item.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur-sm">
          {badge}
        </span>
      </div>
      <p className="text-[13px] md:text-[15px] font-bold text-[#0f172a] leading-snug mb-0.5 truncate">{item.name}</p>
      <div className="flex items-center gap-1.5">
        {price != null ? (
          <>
            <span className="text-[11px] md:text-[12px] text-slate-400 font-medium">From</span>
            <span className="text-[13px] md:text-[15px] font-bold text-[#0f172a]">₹{price}</span>
          </>
        ) : isServiceCode ? (
          <span className="text-[12px] md:text-[13px] font-semibold text-indigo-600">Get Quote</span>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Gradient poster tile ─────────────────────────────────────────────── */
function PosterTile({ svc, nav }) {
  const { key, name, Icon, grad, shadow, eta } = svc;
  return (
    <motion.button onClick={() => nav(`/book/${key}`)} className="w-[104px] sm:w-[124px] md:w-[140px] lg:w-[156px] flex flex-col items-center gap-2.5 group shrink-0"
      whileHover={{ y: -4 }} whileTap={{ scale: 0.92 }} transition={springSnap}>
      <div className={`w-full aspect-square rounded-[28px] bg-gradient-to-br ${grad} relative overflow-hidden highlight-edge`}
        style={{ boxShadow: shadow ? `0 12px 32px -4px ${shadow}` : '0 12px 32px -4px rgba(15,23,42,0.15)' }}>
        <div className="absolute -right-3 -top-3 w-20 h-20 rounded-full bg-white/20 blur-xl" />
        <div className="absolute -left-2 -bottom-3 w-16 h-16 rounded-full bg-black/10 blur-xl" />
        <div className="absolute inset-0 bg-noise mix-blend-overlay opacity-50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={36} strokeWidth={1.5} className="text-white drop-shadow-lg relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1" />
        </div>
        {eta && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-black/20 backdrop-blur-md rounded-full px-2.5 py-1 flex items-center gap-1.5 border border-white/20 highlight-edge">
              <Clock size={10} className="text-white" />
              <span className="text-[9px] font-black text-white uppercase tracking-widest">{eta}</span>
            </div>
          </div>
        )}
        <motion.div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      <span className="text-xs sm:text-[13px] font-bold text-slate-700 text-center leading-tight">{name}</span>
    </motion.button>
  );
}

/* ─── Compact poster tile ──────────────────────────────────────────────── */
function CompactTile({ svc, nav }) {
  const { key, name, Icon, grad, eta } = svc;
  // nav can be a function (event tiles) or a useNavigate instance (service tiles)
  const handleClick = typeof nav === 'function' && nav.length === 0 ? nav : () => nav(`/book/${key}`);
  return (
    <motion.button onClick={handleClick} className="w-[88px] sm:w-[104px] md:w-[120px] lg:w-[136px] flex flex-col items-center gap-2 group shrink-0"
      whileHover={{ y: -3 }} whileTap={{ scale: 0.93 }}>
      <div className={`w-full aspect-square rounded-[24px] bg-gradient-to-br ${grad} relative overflow-hidden shadow-soft highlight-edge group-hover:shadow-soft-lg transition-shadow`}>
        <div className="absolute -right-2 -top-2 w-16 h-16 rounded-full bg-white/10 blur-md" />
        <div className="absolute inset-0 bg-noise mix-blend-overlay opacity-30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={28} strokeWidth={1.5} className="text-white relative z-10 transition-transform duration-500 group-hover:scale-110 drop-shadow-md" />
        </div>
        {eta && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-black/20 backdrop-blur-md rounded-full px-2 py-0.5 flex items-center gap-1 border border-white/20 highlight-edge">
              <Clock size={8} className="text-white" />
              <span className="text-[8px] font-black text-white uppercase tracking-widest">{eta}</span>
            </div>
          </div>
        )}
      </div>
      <span className="text-[11px] sm:text-xs font-semibold text-slate-700 text-center leading-tight">{name}</span>
    </motion.button>
  );
}

/* ─── Compact image tile ───────────────────────────────────────────────── */
function CompactImageTile({ svc, nav }) {
  const { key, name, img, eta } = svc;
  return (
    <motion.button onClick={() => nav(`/book/${key}`)} className="w-[108px] sm:w-[124px] md:w-[140px] lg:w-[156px] flex flex-col items-center gap-2 group shrink-0"
      whileHover={{ y: -4 }} whileTap={{ scale: 0.94 }}>
      <div className="w-full aspect-square rounded-2xl md:rounded-[1.25rem] bg-slate-100 relative overflow-hidden shadow-sm border border-slate-100 group-hover:shadow-lg transition-shadow">
        <img src={img} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
        {eta && (
          <div className="absolute top-2 right-2 z-10">
            <div className="bg-black/40 backdrop-blur-md rounded-full px-1.5 py-1 flex items-center gap-1 border border-white/10 shadow-sm">
              <Clock size={8} className="text-white" />
              <span className="text-[9px] font-black text-white">{eta}</span>
            </div>
          </div>
        )}
        <div className="absolute bottom-2.5 left-2 right-2 z-10 text-center">
           <span className="text-[11px] sm:text-sm font-bold text-white leading-tight drop-shadow-md">{name}</span>
        </div>
      </div>
    </motion.button>
  );
}

/* ─── Section header ───────────────────────────────────────────────────── */
function SectionHeader({ title, badge, badgeColor = 'bg-slate-100 text-slate-800', onSeeAll }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-4 md:mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] md:text-[28px] font-bold text-slate-900 tracking-tight">{title}</h2>
        {badge && <span className={`text-[10px] md:text-xs font-medium px-2 py-0.5 rounded-md ${badgeColor}`}>{badge}</span>}
      </div>
      {onSeeAll && (
        <button onClick={onSeeAll} className="group flex items-center gap-1 text-[14px] md:text-[15px] font-semibold text-zappy-600 hover:text-zappy-700 transition-colors">
          See all <ArrowRight size={15} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────────────────── */
export default function HomePage() {
  const nav = useNavigate();
  const [spotOpen, setSpotOpen] = useState(false);
  const { profile } = useSelector(selectAuth);
  const isAuthed     = useSelector(selectIsAuthed);
  const [lensOpen, setLensOpen] = useState(false);
  // Redesigned Home renders on mobile only; desktop keeps the original layout.
  const isMobile = useIsMobile();

  const { data }          = useListOrdersQuery(1, { skip: !isAuthed });
  const { data: gamData } = useGetGamificationQuery(undefined, { skip: !isAuthed });
  const { data: recData } = useGetRecommendationsQuery(undefined, { skip: !isAuthed });

  const tHome = useT();
  const [rebook, { isLoading: rebooking }] = useRebookOrderMutation();
  // One-click rebook: re-place a past order with fresh pricing/dispatch, then jump
  // to tracking. Falls back to the normal booking flow on any issue.
  const handleRebook = async (id, service) => {
    if (rebooking) return;
    try {
      const res = await rebook(id).unwrap();
      toast.success('Rebooked — finding you a pro');
      nav(`/orders/${res.order._id}`);
    } catch (err) {
      const msg = err?.data?.error;
      if (err?.data?.activeOrderId) { toast.error(msg || 'You already have an active order'); nav(`/orders/${err.data.activeOrderId}`); }
      else { if (msg) toast.error(msg); nav(`/book/${service}`); }
    }
  };

  const activeOrder    = data?.orders?.find(o => ACTIVE_STATUSES.includes(o.status));
  const firstName      = profile?.name?.split(' ')[0] || 'there';
  const gam            = gamData?.gamification;
  const recommendations = recData?.recommendations || [];

  // Quick rebook: last 3 distinct services from completed orders (with the date)
  const quickRebooks = (() => {
    const seen = new Set();
    const result = [];
    for (const o of (data?.orders ?? [])) {
      if (o.status === 'completed' && !seen.has(o.service)) {
        seen.add(o.service);
        result.push({ id: o._id, service: o.service, date: o.completedAt || o.createdAt });
        if (result.length === 3) break;
      }
    }
    return result;
  })();

  // Re-engagement banner (#99): show "book again" nudge if last completed order was >7 days ago
  const lastCompleted = data?.orders?.find(o => o.status === 'completed');
  const daysSinceLastOrder = lastCompleted
    ? Math.floor((Date.now() - new Date(lastCompleted.completedAt || lastCompleted.createdAt).getTime()) / 86_400_000)
    : null;
  const showReengagement = daysSinceLastOrder !== null && daysSinceLastOrder >= 7 && !activeOrder;

  /* ── GPS location detection — high-accuracy multi-sample + smart reverse geocode ── */
  const { getCurrent } = useGeolocation();
  const [loc, setLoc] = useState(() => {
    const cached = loadGeoLocation();
    return cached
      ? { primary: 'Detecting location…', secondary: null, loading: true, lat: cached.lat, lng: cached.lng }
      : { primary: 'Detecting location…', secondary: null, loading: true };
  });

  const [locSheet, setLocSheet] = useState(false);
  const [locSearch, setLocSearch] = useState('');
  const [locResults, setLocResults] = useState([]);
  const [locSearching, setLocSearching] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);

  useEffect(() => {
    getCurrent()
      .then(async ({ lat, lng, accuracy }) => {
        // If accuracy is worse than 500m (IP-based location on laptops/desktops),
        // don't trust the auto-detected name — open the sheet so user can pin exactly.
        if (accuracy && accuracy > 500) {
          setLoc({ primary: 'Set your location', secondary: 'Tap to choose', loading: false });
          setLocSheet(true);
          return;
        }
        const { primary, secondary } = await reverseGeocode(lat, lng);
        setLoc({ primary, secondary, loading: false, lat, lng });
      })
      .catch(() => {
        // Try cached coords for reverse geocode on GPS denial
        const cached = loadGeoLocation();
        if (cached) {
          reverseGeocode(cached.lat, cached.lng)
            .then(({ primary, secondary }) => setLoc({ primary, secondary, loading: false }));
        } else {
          setLoc({ primary: 'Set your location', secondary: 'Tap to choose', loading: false });
          setLocSheet(true);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapbox address search for location sheet
  useEffect(() => {
    if (!locSearch.trim() || locSearch.length < 3) { setLocResults([]); return; }
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return;
    const ctrl = new AbortController();
    setLocSearching(true);
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locSearch)}.json` +
      `?access_token=${token}&language=en&country=IN&types=address,neighborhood,locality,place&limit=5`,
      { signal: ctrl.signal },
    )
      .then(r => r.json())
      .then(d => {
        setLocResults(d.features || []);
        setLocSearching(false);
      })
      .catch(() => setLocSearching(false));
    return () => ctrl.abort();
  }, [locSearch]);

  async function detectCurrentLocation() {
    setLocDetecting(true);
    try {
      const { lat, lng } = await getCurrent();
      const { primary, secondary } = await reverseGeocode(lat, lng);
      setLoc({ primary, secondary, loading: false, lat, lng });
      setLocSheet(false);
    } catch {
      // ignore
    } finally {
      setLocDetecting(false);
    }
  }

  function pickLocResult(feat) {
    const [lng, lat] = feat.center;
    const ctx = feat.context || [];
    const get = (prefix) => ctx.find(c => c.id?.startsWith(prefix))?.text ?? null;
    const neighborhood = get('neighborhood');
    const locality = get('locality');
    const place = get('place');
    const region = get('region');
    const primary = neighborhood || locality || feat.text;
    const secondary = [place || locality, region].filter(Boolean).join(', ') || null;
    setLoc({ primary, secondary, loading: false, lat, lng });
    setLocSheet(false);
    setLocSearch('');
    setLocResults([]);
  }

  return (
    <>
      <SpotlightSearch open={spotOpen} onClose={() => setSpotOpen(false)} />
      <SEO
        title="Zappy — Book Verified Professionals Instantly | Home Services India"
        description="India's fastest on-demand home services app. Puncture repair, phone repair, laptop repair, electrician, plumber, bike mechanic, car wash, pet grooming — verified pros arrive in 30 minutes. Book in 60 seconds."
        canonical={BASE_URL}
        keywords="home services near me, on-demand services India, puncture repair, phone repair near me, laptop repair at home, electrician near me, plumber near me, bike mechanic near me, car wash at home, Zappy, instant services"
        jsonLd={HOME_SCHEMA}
      />
      <IntroSplash />
      <div className="min-h-screen bg-white bg-noise overflow-x-hidden w-full">

        {/* ─── Premium Navbar ───────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-900/5" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>


          <div className="max-w-7xl w-full mx-auto px-4 md:px-6 h-[60px] md:h-[84px] flex items-center gap-3 md:gap-8">
            {/* Logo */}
            <div className="flex items-center shrink-0 cursor-pointer" onClick={() => nav('/')}>
              <img
                src="/branding/zappylogo.png"
                alt="Zappy"
                className="h-[46px] md:h-[60px] object-contain drop-shadow-sm"
              />
            </div>

            {/* Location widget ─ world-class GPS chip */}
            <motion.button
              onClick={() => setLocSheet(true)}
              className="flex-1 md:flex-none md:w-[280px] min-w-0 flex items-center gap-2 md:gap-3 px-3 md:px-4 h-11 md:h-14 rounded-[20px] relative overflow-hidden text-left bg-slate-50/50 hover:bg-indigo-50/50 border border-slate-200/50 hover:border-indigo-200/80 transition-colors"
              whileTap={{ scale: 0.98 }}
            >
              {/* Animated GPS pin */}
              <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
                <MapPin size={16} strokeWidth={2.5} className="text-indigo-600 relative z-10" />
                {loc.loading && (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-full border border-indigo-400"
                      animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border border-indigo-400"
                      animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.55 }}
                    />
                  </>
                )}
                {!loc.loading && (
                  <motion.div
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  />
                )}
              </div>

              {/* Location text */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-[2px]">
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-none whitespace-nowrap truncate block">
                  Delivering to
                </span>
                <AnimatePresence mode="wait">
                  {loc.loading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5">
                      <Loader2 size={12} className="text-indigo-400 animate-spin" />
                      <span className="text-[13px] font-semibold text-slate-400">Detecting…</span>
                    </motion.div>
                  ) : (
                    <motion.div key="found" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className="flex flex-col min-w-0">
                      <span className="text-sm font-black text-slate-900 leading-tight truncate">{loc.primary}</span>
                      <span className="text-[10px] text-slate-400 font-medium leading-tight truncate">
                        {loc.secondary || 'Tap to set exact location'}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <ChevronDown size={14} className="text-indigo-400 shrink-0" />
            </motion.button>

            {/* ─── Desktop Search bar ───────────────────────────────────────────── */}
            <div className="hidden md:block flex-1 max-w-2xl mx-auto">
              <div className="w-full flex items-center gap-3 rounded-[24px] pl-6 pr-3 h-14 bg-slate-50 border border-slate-200/80 shadow-inner hover:bg-white hover:border-indigo-300/60 transition-colors">
                <button onClick={() => setSpotOpen(true)} className="flex items-center gap-3 flex-1 text-left h-full min-w-0">
                  <Search size={18} strokeWidth={2} className="text-slate-400 shrink-0" />
                  <AnimatedSearchPlaceholder />
                </button>
                <motion.span
                  className="text-xs font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full shrink-0"
                  animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2.5, repeat: Infinity }}
                >
                  50+ services
                </motion.span>
                <VoiceSearchButton onResult={(text) => nav(`/services?q=${encodeURIComponent(text)}`)} />
                <LensButton onClick={() => setLensOpen(true)} />
              </div>
            </div>

            {/* Action Icons */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Bell — real unread count */}
              <NotifBell nav={nav} isAuthed={isAuthed} />

              {/* Avatar */}
              <motion.button
                onClick={() => nav('/profile')}
                className="hidden md:flex w-11 h-11 md:w-[52px] md:h-[52px] rounded-full items-center justify-center shrink-0 hover:scale-105 transition-transform overflow-hidden bg-slate-100 ring-2 ring-indigo-500/20 shadow-md"
                whileTap={{ scale: 0.88 }}
              >
                <img 
                  src={profile?.avatar || '/images/zappy_tower_avatar.webp'} 
                  alt={firstName || 'User'} 
                  className="w-full h-full object-cover"
                />
              </motion.button>
            </div>
          </div>
        </header>

        {/* ─── Mobile Search bar ───────────────────────────────────────────── */}
        <div className="md:hidden bg-white/80 backdrop-blur-md px-4 pt-3 pb-5 border-b border-slate-900/5">
          <div className="w-full flex items-center gap-2 rounded-[20px] pl-4 pr-2 h-14 bg-slate-50 border border-slate-200/80 shadow-inner">
            <button onClick={() => setSpotOpen(true)} className="flex items-center gap-3 flex-1 text-left h-full min-w-0">
              <Search size={18} strokeWidth={2.5} className="text-slate-400 shrink-0" />
              <AnimatedSearchPlaceholder />
            </button>
            <motion.span
              className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full shrink-0 leading-none"
              animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2.5, repeat: Infinity }}
            >
              50+
            </motion.span>
            <VoiceSearchButton onResult={(text) => nav(`/services?q=${encodeURIComponent(text)}`)} />
            <LensButton onClick={() => setLensOpen(true)} />
          </div>
        </div>

        {isMobile ? (
          /* ═══ Mobile hero — banner + live trust bar + card grid + promo + offers ═══ */
          <div className="max-w-7xl w-full mx-auto px-4 pt-3 pb-2">
            {/* Hero banner — cropped to the dark artwork only (headline, avatars,
                "48+ Happy Customers" are baked into the PNG). The trust bar below
                is a live HTML card that overlaps the banner's bottom edge. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="rounded-[20px] overflow-hidden shadow-soft">
                <img
                  src="/banner1_hero.webp"
                  alt="Zappy — Your needs. Our experts. On demand. Trusted professionals at your doorstep in minutes."
                  className="w-full h-auto block"
                  loading="eager"
                />
              </div>
              <HeroTrustBar />
            </motion.div>

            {/* Popular Services */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[20px] font-bold text-slate-900 tracking-tight">Popular Services</h2>
                <button
                  onClick={() => nav('/services')}
                  className="group flex items-center gap-1 text-[14px] font-semibold text-zappy-600 hover:text-zappy-700 transition-colors"
                >
                  See all <ArrowRight size={15} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
              <CharacterServiceGrid />
            </motion.div>

            {/* Premium Vehicle Care promo */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <PromoBannerVehicle />
            </motion.div>

            {/* Offer / trust cards */}
            <TrustOfferCards />
          </div>
        ) : (
          /* ═══ Desktop hero — original greeting + floating grid + carousel ═══ */
          <div className="max-w-7xl w-full mx-auto px-4 md:px-6 pt-2 md:pt-5 pb-5">
            <div className="mb-4 md:mb-5 flex items-end justify-between gap-3">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <h1 className="text-[26px] md:text-[34px] font-extrabold text-slate-900 leading-[1.08] tracking-[-0.025em]">
                  {tHome('home.greeting', 'What can we fix')}{firstName !== 'there' ? <>, <span className="text-indigo-600">{firstName}</span></> : ''}?
                </h1>
                <p className="mt-1 text-[14px] md:text-[15px] text-slate-500 font-medium">
                  {tHome('home.tagline', 'Trusted pros, at your door in minutes.')}
                </p>
              </motion.div>
              <div className="shrink-0 pb-1">
                <LiveBadge />
              </div>
            </div>

            <motion.div className="mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <CharacterServiceGrid />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <HeroCarousel />
            </motion.div>
          </div>
        )}

        {/* ─── Book Again (card style) ──────────────────────────────── */}
        {quickRebooks.length > 0 && (
          <div className="max-w-7xl w-full mx-auto px-4 md:px-6 mt-6">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Repeat2 size={16} className="text-indigo-500" />
              <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Book Again</span>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {quickRebooks.map(({ id, service, date }) => (
                <motion.button
                  key={id || service}
                  onClick={() => handleRebook(id, service)}
                  disabled={rebooking}
                  className="shrink-0 w-44 md:w-56 p-3 rounded-[22px] bg-white border border-slate-200 shadow-sm flex items-center justify-between group disabled:opacity-60"
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ y: -2, boxShadow: '0 12px 24px -8px rgba(99,102,241,0.25)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg shadow-inner shrink-0">
                      {serviceEmoji(service)}
                    </div>
                    <div className="text-left min-w-0">
                      <span className="block text-sm font-bold text-slate-900 leading-tight mb-0.5 truncate">{serviceLabel(service)}</span>
                      <span className="block text-[10px] font-medium text-indigo-500">Tap to book again · {timeAgo(date)}</span>
                    </div>
                  </div>
                  {rebooking
                    ? <Loader2 size={14} className="text-indigo-500 animate-spin shrink-0" />
                    : <Repeat2 size={14} className="text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0" />}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Premium Dashboard Widgets Removed ─── */}



        <div className="max-w-7xl w-full mx-auto px-4 md:px-6">

          {/* ─── Featured carousel (mobile only — desktop shows it in the hero) ─ */}
          {isMobile && (
            <div className="mt-7">
              <HeroCarousel />
            </div>
          )}

          {/* ─── Offers ──────────────────────────────────────────────── */}
          <OffersSection />

          {/* Ad Banners */}
          <AdBanner className="mt-4" />

          {/* ─── Electronics Rescue — Most Booked ────────────────────── */}
          <div className="mt-7">
            <SectionHeader title="Electronics Rescue" badge="Most Booked" badgeColor="bg-indigo-50 text-indigo-600 ring-indigo-100" onSeeAll={() => nav('/services')} />
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {MOST_BOOKED.map((item, i) => (
                <ServiceImageCard key={i} item={item} nav={nav} />
              ))}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <motion.button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></motion.button>
              </div>
            </div>
          </div>

          <PromoBannerElectronics />

          {/* ─── Phone Repair ────────────────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Phone Repair" badge="Android & iPhone" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/services')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {PHONE_TILES.map((item, i) => <ServiceImageCard key={i} item={item} nav={nav} />)}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          {/* ─── Laptop Services ──────────────────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Laptop Services" badge="All Brands" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/services')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {LAPTOP_TILES.map((item, i) => <ServiceImageCard key={i} item={item} nav={nav} />)}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          {/* ─── Smart Devices ────────────────────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Smart Devices" badge="Install & Fix" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/services')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {SMART_TILES.map((item, i) => <ServiceImageCard key={i} item={item} nav={nav} />)}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          {/* Vehicle promo (desktop only — mobile shows it in the hero) */}
          {!isMobile && <PromoBannerVehicle />}

          {/* ─── Vehicle Care ───────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Vehicle Care" badge="On-Road Help" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/services')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {VEHICLE_HIGHLIGHTS.map((item, i) => <ServiceImageCard key={i} item={item} nav={nav} />)}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          <PromoBannerFamily />

          {/* ─── Family & Elder Assist ────────────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Family Assist" badge="Trusted Help" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/services')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {FAMILY_TILES.map((item, i) => <ServiceImageCard key={i} item={item} nav={nav} />)}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          {/* ─── Tank & Water Cleaning ─────────────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Tank & Water Cleaning" badge="Home Care" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/services')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {TANK_TILES.map((item, i) => <ServiceImageCard key={i} item={item} nav={nav} />)}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/services')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          <PromoBannerEvents />

          {/* ─── Event Decorations ─────────────────────────────────── */}
          <div className="mt-7">
            <div>
              <SectionHeader title="Event Decorations" badge="🎉 Book a Theme" badgeColor="bg-slate-100 text-slate-800" onSeeAll={() => nav('/events')} />
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 md:-mx-6 snap-x snap-mandatory">
              <div className="shrink-0 w-1 md:w-2" />
              {EVENT_TILES.map((item, i) => (
                <ServiceImageCard key={i} item={{...item, key: `../events/browse?category=${item.category}`}} nav={nav} />
              ))}
              <div className="shrink-0 w-12 flex items-center justify-center">
                <button onClick={() => nav('/events')} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm hover:scale-105"><ChevronRight size={18} strokeWidth={2.5} className="text-slate-600" /></button>
              </div>
            </div>
          </div>

          {/* ─── Pet Assistance ── hidden until feature launch ────────── */}

          {/* ─── Trust strip ──────────────────────────────────────────── */}
          <div className="px-4 mt-7 mb-4">
            <div className="rounded-2xl p-4 ring-1 ring-slate-200/60" style={{ background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)' }}>
              <div className="flex items-center justify-around">
                {[
                  { Icon: ShieldCheck, label: 'Insured Work',  color: 'text-indigo-500', bg: 'bg-indigo-50' },
                  { Icon: CheckCircle, label: 'Verified Pros', color: 'text-green-600',  bg: 'bg-green-50'  },
                  { Icon: Lock,        label: 'Secure Pay',    color: 'text-blue-600',   bg: 'bg-blue-50'   },
                  { Icon: TrendingUp,  label: '4.8 Rated',     color: 'text-amber-600',  bg: 'bg-amber-50'  },
                ].map(({ Icon, label, color, bg }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5">
                    <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                      <Icon size={16} strokeWidth={1.75} className={color} />
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 text-center uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
        <Footer />
        <LensModal open={lensOpen} onClose={() => setLensOpen(false)} />
      </div>

      {/* ── Location Search Sheet ── */}
      <AnimatePresence>
        {locSheet && (
          <>
            {/* backdrop */}
            <motion.div
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setLocSheet(false); setLocSearch(''); setLocResults([]); }}
            />
            {/* bottom sheet */}
            <motion.div
              className="fixed bottom-0 inset-x-0 z-[110] bg-white rounded-t-3xl shadow-2xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              {/* drag pill */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>

              <div className="px-5 pt-2 pb-10">
                <h2 className="text-lg font-black text-slate-900 mb-4">Set your location</h2>

                {/* Search input */}
                <div className="relative mb-4">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search area, street, landmark…"
                    value={locSearch}
                    onChange={e => setLocSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  {locSearching && (
                    <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
                  )}
                </div>

                {/* Use current location */}
                <button
                  onClick={detectCurrentLocation}
                  disabled={locDetecting}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-3 text-left transition-colors"
                  style={{ background: '#f0f4ff', border: '1px solid rgba(99,102,241,0.2)' }}
                >
                  {locDetecting
                    ? <Loader2 size={18} className="text-indigo-500 animate-spin shrink-0" />
                    : <MapPin size={18} className="text-indigo-500 shrink-0" />
                  }
                  <div>
                    <p className="text-sm font-bold text-indigo-700">Use current location</p>
                    <p className="text-[11px] text-indigo-400">Detect via GPS</p>
                  </div>
                </button>

                {/* Search results */}
                {locResults.length > 0 && (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
                    {locResults.map((feat) => (
                      <button
                        key={feat.id}
                        onClick={() => pickLocResult(feat)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <MapPin size={15} className="text-slate-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{feat.text}</p>
                          <p className="text-[11px] text-slate-400 truncate">{feat.place_name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
