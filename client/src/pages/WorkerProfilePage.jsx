import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ShieldCheck, Star, Briefcase, Clock, Target,
  UserCheck, Repeat2, Zap, Wrench, Droplets, Wind, Hammer,
  Users, Car, Sparkles, Paintbrush2, Smartphone, Battery,
  Layers, Home, Bike, Fuel, AlertTriangle, Bolt,
} from 'lucide-react';
import { useGetOrderQuery, useGetWorkerPublicProfileQuery } from '../services/api';

/* ─── Service icon map (mirrors WorkerDashboard) ─────────────── */
const SERVICE_ICON_MAP = {
  electrical:            { Icon: Bolt,          bg: 'bg-amber-100',   color: 'text-amber-600'   },
  plumbing:              { Icon: Droplets,       bg: 'bg-blue-100',    color: 'text-blue-600'    },
  ac_repair:             { Icon: Wind,           bg: 'bg-cyan-100',    color: 'text-cyan-600'    },
  carpenter:             { Icon: Hammer,         bg: 'bg-orange-100',  color: 'text-orange-600'  },
  helper:                { Icon: Users,          bg: 'bg-green-100',   color: 'text-green-600'   },
  puncture:              { Icon: Car,            bg: 'bg-slate-100',   color: 'text-slate-500'   },
  cleaning:              { Icon: Sparkles,       bg: 'bg-purple-100',  color: 'text-purple-600'  },
  painting:              { Icon: Paintbrush2,    bg: 'bg-pink-100',    color: 'text-pink-600'    },
  screen_replacement:    { Icon: Smartphone,     bg: 'bg-indigo-100',  color: 'text-indigo-600'  },
  battery_replacement:   { Icon: Battery,        bg: 'bg-emerald-100', color: 'text-emerald-600' },
  charging_issue:        { Icon: Bolt,           bg: 'bg-yellow-100',  color: 'text-yellow-600'  },
  speaker_mic_issue:     { Icon: Layers,         bg: 'bg-violet-100',  color: 'text-violet-600'  },
  software_issue:        { Icon: Wrench,         bg: 'bg-red-100',     color: 'text-red-600'     },
  water_damage_check:    { Icon: Droplets,       bg: 'bg-sky-100',     color: 'text-sky-600'     },
  mason:                 { Icon: Home,           bg: 'bg-stone-100',   color: 'text-stone-600'   },
  battery_jump_start:    { Icon: Zap,            bg: 'bg-yellow-100',  color: 'text-yellow-600'  },
  fuel_delivery:         { Icon: Fuel,           bg: 'bg-orange-100',  color: 'text-orange-600'  },
  bike_wash:             { Icon: Bike,           bg: 'bg-cyan-100',    color: 'text-cyan-600'    },
  car_wash:              { Icon: Car,            bg: 'bg-blue-100',    color: 'text-blue-600'    },
  minor_roadside_repair: { Icon: AlertTriangle,  bg: 'bg-red-100',     color: 'text-red-600'     },
};

const PLACEHOLDER_REVIEWS = [
  { name: 'R***a', rating: 5, comment: 'Excellent work, very professional and on time.', date: '2 days ago' },
  { name: 'S***h', rating: 5, comment: 'Fixed the issue quickly. Would recommend.', date: '5 days ago' },
  { name: 'A***y', rating: 4, comment: 'Good service, clean work.', date: '1 week ago' },
];

const STATS = [
  { label: 'Avg response time', value: '3 min', pct: 90 },
  { label: 'On-time arrival', value: '94%', pct: 94 },
  { label: 'Re-hired by customers', value: '67%', pct: 67 },
];

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
};

export default function WorkerProfilePage() {
  const { workerId } = useParams();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const nav = useNavigate();

  /* Try dedicated public profile endpoint first */
  const { data: profileData, isError: profileError } = useGetWorkerPublicProfileQuery(workerId, {
    skip: !workerId,
  });

  /* Fallback: get worker data from order */
  const { data: orderData } = useGetOrderQuery(orderId, {
    skip: !orderId || !!profileData,
  });

  /* Resolve worker info from whichever source worked */
  const worker = profileData?.worker ?? null;
  const order  = orderData?.order ?? null;

  const name         = worker?.name         ?? order?.workerName   ?? 'Worker';
  const rating       = worker?.rating       ?? order?.workerRating ?? 4.8;
  const completedJobs = worker?.completedJobs ?? order?.workerJobs  ?? 0;
  const skills       = worker?.skills       ?? (order?.service ? [order.service] : []);
  const isKyc        = worker?.kyc?.status === 'approved' || order?.workerId != null;

  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const primarySkill = skills[0] ?? 'electrical';

  function handleRebook() {
    nav(`/book/${primarySkill}?preferredWorker=${workerId}`);
  }

  return (
    <div className="min-h-screen pb-40" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #f8fafc 180px)' }}>

      {/* ── Back button ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-2 flex items-center" style={{ background: 'transparent' }}>
        <motion.button
          onClick={() => nav(-1)}
          whileTap={{ scale: 0.9 }}
          className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center"
        >
          <ArrowLeft size={18} strokeWidth={2.5} className="text-white" />
        </motion.button>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center pt-4 pb-8 px-4">
        {/* Animated orb */}
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.35), transparent)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 6, repeat: Infinity }}
        />

        {/* Avatar */}
        <motion.div
          className="relative z-10 w-24 h-24 rounded-full flex items-center justify-center text-white font-black text-3xl ring-4 ring-white/20 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
        >
          {initials}
          {/* Verified tick overlay */}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-white">
            <ShieldCheck size={14} strokeWidth={2.5} className="text-white" />
          </div>
        </motion.div>

        {/* Name + badge */}
        <motion.h1
          className="mt-4 text-2xl font-black text-white z-10 text-center"
          {...fadeInUp}
          transition={{ delay: 0.15 }}
        >
          {name}
        </motion.h1>

        <motion.div
          className="flex items-center gap-1.5 mt-1.5 z-10"
          {...fadeInUp}
          transition={{ delay: 0.2 }}
        >
          <ShieldCheck size={14} strokeWidth={2.5} className="text-green-400" />
          <span className="text-green-400 text-xs font-bold">KYC Verified</span>
          <span className="text-white/20 mx-1">·</span>
          <Star size={13} strokeWidth={2} className="text-amber-400 fill-amber-400" />
          <span className="text-white text-sm font-bold">{typeof rating === 'number' ? rating.toFixed(1) : '4.8'}</span>
          <span className="text-white/20 mx-1">·</span>
          <Briefcase size={13} strokeWidth={2} className="text-white/60" />
          <span className="text-white/60 text-xs font-medium">{completedJobs} jobs</span>
        </motion.div>
      </div>

      {/* ── Content cards ────────────────────────────────────────── */}
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 space-y-3">

        {/* Trust badges row */}
        <motion.div
          className="flex gap-2 flex-wrap"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
        >
          {[
            { label: 'KYC Verified',          bg: 'bg-green-100',  text: 'text-green-700',  Icon: ShieldCheck },
            { label: `${completedJobs} Jobs`,  bg: 'bg-indigo-100', text: 'text-indigo-700', Icon: Briefcase   },
            { label: `${typeof rating === 'number' ? rating.toFixed(1) : '4.8'} Rating`, bg: 'bg-amber-100', text: 'text-amber-700', Icon: Star },
          ].map(({ label, bg, text, Icon }) => (
            <span
              key={label}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold ${bg} ${text}`}
            >
              <Icon size={12} strokeWidth={2.5} />
              {label}
            </span>
          ))}
        </motion.div>

        {/* Specialisations */}
        {skills.length > 0 && (
          <motion.div
            className="bg-white rounded-2xl p-4 shadow-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.27 }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Specialisations</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => {
                const svc = SERVICE_ICON_MAP[skill] ?? { Icon: Wrench, bg: 'bg-slate-100', color: 'text-slate-500' };
                const { Icon } = svc;
                return (
                  <span
                    key={skill}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${svc.bg} ${svc.color}`}
                  >
                    <Icon size={12} strokeWidth={2} />
                    {skill.replace(/_/g, ' ')}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Why choose me — aspirational stats */}
        <motion.div
          className="bg-white rounded-2xl p-4 shadow-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.31 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Target size={13} strokeWidth={2.5} className="text-indigo-600" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Why Choose Me</p>
          </div>
          <div className="space-y-3">
            {STATS.map(({ label, value, pct }, i) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-600">{label}</p>
                  <p className="text-xs font-extrabold text-indigo-600">{value}</p>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.35 + i * 0.1 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent reviews */}
        <motion.div
          className="bg-white rounded-2xl p-4 shadow-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <Star size={13} strokeWidth={2.5} className="text-amber-500" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Reviews</p>
          </div>

          <div className="space-y-3">
            {PLACEHOLDER_REVIEWS.map((review, i) => (
              <motion.div
                key={i}
                className="p-3 bg-slate-50 rounded-xl"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.07 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center">
                      <UserCheck size={12} strokeWidth={2} className="text-white" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">{review.name}</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star
                        key={j}
                        size={10}
                        strokeWidth={j < review.rating ? 0 : 1.5}
                        className={j < review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{review.comment}</p>
                <p className="text-[10px] text-slate-300 mt-1 font-medium">{review.date}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Rebook CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <motion.button
            onClick={handleRebook}
            whileTap={{ scale: 0.97 }}
            className="w-full h-14 rounded-2xl text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }}
          >
            <Repeat2 size={20} strokeWidth={2.5} />
            Book {name.split(' ')[0]} Again
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
