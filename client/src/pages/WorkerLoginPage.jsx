import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, ArrowRight, ChevronLeft, CheckCircle2, Loader2, Shield,
  Zap, Star, Wallet, TrendingUp, Clock, BadgeCheck, Wrench, Users,
  Paintbrush, Sparkles, Smartphone, Laptop, HardHat, ChevronDown,
  MapPin, Globe, Check, Hammer, Lock, Award, HeartHandshake, Headphones
} from 'lucide-react';
import { useRequestOtpMutation, useLoginWorkerMutation } from '../services/api';
import ResendOtp from '../components/auth/ResendOtp';
import { setAuth } from '../modules/auth/authSlice';
import { ZappyLogo } from '../components/common/ZappyLogo';
import toast from 'react-hot-toast';
import SEO, { LOGIN_SCHEMA, BASE_URL } from '../components/SEO';

/* ── Skills for New User Registration ────────────────────────────────────── */
const SKILLS = [
  'puncture', 'plumbing', 'electrical', 'helper', 'carpenter', 'ac_repair',
  'screen_replacement', 'battery_replacement', 'mason', 'bike_wash', 'car_wash',
];
const SKILL_LABELS = {
  puncture: 'Puncture', plumbing: 'Plumbing', electrical: 'Electrical',
  helper: 'Helper', carpenter: 'Carpenter', ac_repair: 'AC Repair',
  screen_replacement: 'Screen Fix', battery_replacement: 'Battery',
  mason: 'Mason', bike_wash: 'Bike Wash', car_wash: 'Car Wash',
};

/* ── Services for the Left Section Curved Arc ─────────────────────────────── */
const SERVICES_ARC = [
  { id: 'plumbing', label: 'Plumbing', icon: Wrench, color: 'text-blue-600 bg-blue-50', border: 'border-blue-200/80', pos: 'top-[3%] right-[16%]' },
  { id: 'electrical', label: 'Electrical', icon: Zap, color: 'text-amber-600 bg-amber-50', border: 'border-amber-200/80', pos: 'top-[18%] right-[3%]' },
  { id: 'carpentry', label: 'Carpentry', icon: Hammer, color: 'text-indigo-600 bg-indigo-50', border: 'border-indigo-200/80', pos: 'top-[35%] right-[0%]' },
  { id: 'painting', label: 'Painting', icon: Paintbrush, color: 'text-blue-600 bg-blue-50', border: 'border-blue-200/80', pos: 'top-[53%] right-[3%]' },
  { id: 'cleaning', label: 'Cleaning', icon: Sparkles, color: 'text-teal-600 bg-teal-50', border: 'border-teal-200/80', pos: 'top-[70%] right-[12%]' },
  { id: 'phone_repair', label: 'Phone Repair', icon: Smartphone, color: 'text-violet-600 bg-violet-50', border: 'border-violet-200/80', pos: 'top-[83%] right-[26%]' },
  { id: 'laptop_repair', label: 'Laptop Repair', icon: Laptop, color: 'text-sky-600 bg-sky-50', border: 'border-sky-200/80', pos: 'top-[10%] right-[42%]' },
  { id: 'daily_workers', label: 'Daily Workers', icon: HardHat, color: 'text-orange-600 bg-orange-50', border: 'border-orange-200/80', pos: 'top-[78%] right-[52%]' },
];

/* ── Left Hero Bottom Features (4 items) ─────────────────────────────────── */
const LEFT_FEATURES = [
  { icon: '₹', title: 'Great Earnings', desc: 'Earn more with more jobs', color: 'bg-blue-50 text-blue-600', isTextIcon: true },
  { icon: Clock, title: 'Flexible Time', desc: 'Work on your own time', color: 'bg-purple-50 text-purple-600', isTextIcon: false },
  { icon: Shield, title: 'Trusted Platform', desc: '100% safe and verified', color: 'bg-emerald-50 text-emerald-600', isTextIcon: false },
  { icon: Users, title: 'Many Jobs', desc: 'Jobs available near you', color: 'bg-amber-50 text-amber-600', isTextIcon: false },
];

/* ── Right Card Bottom Informational Features (Replacing Social Logins) ──── */
const RIGHT_FEATURES = [
  { icon: Wallet, title: 'Instant Payouts', desc: 'Get paid instantly in your wallet', color: 'bg-blue-50 text-blue-600' },
  { icon: MapPin, title: 'Nearby Jobs', desc: 'Get jobs near your area', color: 'bg-emerald-50 text-emerald-600' },
  { icon: BadgeCheck, title: 'Verified Platform', desc: '100% safe and verified', color: 'bg-purple-50 text-purple-600' },
  { icon: Clock, title: 'Flexible Hours', desc: 'Work on your own schedule', color: 'bg-amber-50 text-amber-600' },
];

export default function WorkerLoginPage() {
  const [phone, setPhone] = useState('');
  const OTP_LEN = 6;
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(''));
  const [name, setName] = useState('');
  const [skills, setSkills] = useState([]);
  const [step, setStep] = useState('phone');
  const [otpMeta, setOtpMeta] = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [isNewUser, setIsNewUser] = useState(true);
  const pendingOtp = useRef(null);
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [loginWorker, { isLoading: loggingIn }] = useLoginWorkerMutation();
  const nav = useNavigate();
  const loc = useLocation();
  const dispatch = useDispatch();
  const otpRefs = useRef([]);

  const otp = otpDigits.join('');

  // Auto-fill OTP from API (dev mode)
  useEffect(() => {
    if (step !== 'otp' || !pendingOtp.current) return;
    const code = String(pendingOtp.current);
    pendingOtp.current = null;
    const digits = code.slice(0, OTP_LEN).split('').concat(Array(Math.max(0, OTP_LEN - code.length)).fill(''));
    setOtpDigits(digits);
    setTimeout(() => otpRefs.current[OTP_LEN - 1]?.focus(), 80);
  }, [step]);

  // Auto-submit for returning users
  useEffect(() => {
    if (step === 'otp' && otp.length === OTP_LEN && !isNewUser) verify();
  }, [otp]);

  function handleOtpChange(i, char) {
    const d = char.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[i] = d;
    setOtpDigits(next);
    if (d && i < OTP_LEN - 1) otpRefs.current[i + 1]?.focus();
  }

  function handleOtpKey(i, e) {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      const next = [...otpDigits];
      next[i - 1] = '';
      setOtpDigits(next);
      otpRefs.current[i - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN);
    if (text.length >= 4) {
      setOtpDigits(text.split('').concat(Array(Math.max(0, OTP_LEN - text.length)).fill('')));
      otpRefs.current[Math.min(text.length, OTP_LEN - 1)]?.focus();
    }
  }

  async function send() {
    if (!/^[0-9]{10,15}$/.test(phone)) { toast.error('Enter a valid phone number'); return; }
    try {
      const r = await requestOtp({ phone, role: 'worker' }).unwrap();
      pendingOtp.current = r.otp || null;
      setIsNewUser(r.isNewUser ?? true);
      setOtpMeta({ cooldownSec: r.cooldownSec ?? 30, resendsLeft: r.resendsLeft ?? 3 });
      setStep('otp');
    } catch (err) {
      toast.error(err.data?.error || 'Failed to send OTP');
    }
  }

  function handleResent(data) {
    setOtpDigits(Array(OTP_LEN).fill(''));
    if (data?.otp) {
      const code = String(data.otp).slice(0, OTP_LEN);
      setOtpDigits(code.split('').concat(Array(Math.max(0, OTP_LEN - code.length)).fill('')));
      setTimeout(() => otpRefs.current[OTP_LEN - 1]?.focus(), 80);
    } else {
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    }
  }

  function startOver() {
    setOtpDigits(Array(OTP_LEN).fill(''));
    pendingOtp.current = null;
    setStep('phone');
  }

  async function verify() {
    try {
      const r = await loginWorker({
        phone,
        otp,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(skills.length ? { skills } : {}),
      }).unwrap();
      const profile = r.worker;
      dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, profile, role: 'worker' }));
      nav(loc.state?.from || '/worker', { replace: true });
    } catch (err) {
      const detail = typeof err.data?.details?.[0] === 'string' ? err.data.details[0] : err.data?.error || 'Verification failed';
      toast.error(detail);
    }
  }

  return (
    <>
      <SEO
        title="Worker Login — Join Zappy & Earn Daily | Zappy India"
        description="Join Zappy as a service professional. Earn ₹500–₹2000/day. Verified workers get instant job notifications and daily payments."
        canonical={`${BASE_URL}/worker/login`}
        keywords="join Zappy as worker, earn money home services, service professional jobs India"
        jsonLd={LOGIN_SCHEMA}
      />

      {/* ─── MAIN WRAPPER (Light background matching reference spec) ─── */}
      <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col lg:flex-row items-center justify-between p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 font-sans overflow-x-hidden relative">

        {/* ─── LEFT HERO SECTION ─── */}
        <div className="w-full lg:w-[50%] xl:w-[54%] flex flex-col justify-between min-h-[580px] lg:min-h-[720px] px-2 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 relative z-10">

          {/* Top Header: Logo & Branding */}
          <div className="flex items-center gap-3">
            <ZappyLogo size={46} />
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-none">
                ZAPPY
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-blue-600 mt-0.5 tracking-wide">
                On-Demand. On-Time.
              </span>
            </div>
          </div>

          {/* Hero Heading & Subtitle */}
          <div className="mt-6 sm:mt-8 lg:mt-10">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl sm:text-5xl xl:text-[56px] font-black text-slate-900 leading-[1.08] tracking-tight">
                Real People.<br />
                Real Skills.<br />
                Real <span className="text-blue-600">Zappy.</span>
              </h1>
              <p className="mt-4 sm:mt-5 text-slate-600 text-base xl:text-lg font-medium leading-relaxed max-w-md">
                Join Zappy and start earning by helping customers with services they can count on.
              </p>
            </motion.div>
          </div>

          {/* ── Center Visual Area (Phone Mockup + Zappy Scooter + Dashed Service Arc) ── */}
          <div className="relative w-full min-h-[340px] sm:min-h-[380px] xl:min-h-[420px] my-6 flex items-center justify-start overflow-visible">

            {/* Subtle City Skyline Silhouette Background */}
            <div className="absolute inset-x-0 bottom-0 h-36 opacity-20 pointer-events-none select-none overflow-hidden">
              <svg viewBox="0 0 1200 240" fill="none" className="w-full h-full object-cover">
                <path d="M0 240V140H40V100H80V140H120V60H180V140H220V90H280V140H340V30H420V140H480V70H540V140H600V50H680V140H740V90H800V140H860V40H940V140H1000V80H1060V140H1120V110H1200V240H0Z" fill="#3B82F6" />
              </svg>
            </div>

            {/* SVG Dashed Arc Path connecting Services (Desktop) */}
            <svg className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 600 420" fill="none">
              <path
                d="M 500,20 C 580,100 580,320 500,380 C 440,420 380,380 340,320"
                stroke="#60A5FA"
                strokeWidth="2.5"
                strokeDasharray="7 7"
                fill="none"
              />
              <circle cx="500" cy="20" r="4" fill="#3B82F6" />
              <circle cx="560" cy="90" r="4" fill="#3B82F6" />
              <circle cx="580" cy="190" r="4" fill="#3B82F6" />
              <circle cx="560" cy="290" r="4" fill="#3B82F6" />
              <circle cx="480" cy="370" r="4" fill="#3B82F6" />
            </svg>

            <div className="flex items-center gap-4 sm:gap-6 relative z-10 w-full">

              {/* 1) CSS Phone Mockup showing "Book trusted services in a few taps" */}
              <motion.div
                className="w-44 sm:w-52 md:w-56 rounded-[2.2rem] sm:rounded-[2.5rem] border-[5px] sm:border-[6px] border-slate-900 bg-white shadow-2xl p-2 sm:p-2.5 relative shrink-0 -rotate-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                {/* Phone Speaker Notch */}
                <div className="w-12 sm:w-14 h-3 sm:h-3.5 bg-slate-900 mx-auto rounded-full mb-2" />

                {/* App Screen Content */}
                <div className="px-1 py-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                      <ZappyLogo size={14} />
                      <span className="text-[9px] font-black text-slate-800">ZAPPY</span>
                    </div>
                    <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">PRO</span>
                  </div>

                  <p className="text-[10px] sm:text-[11px] font-black text-slate-900 text-center leading-tight my-2">
                    Book trusted services<br />in a few taps
                  </p>

                  {/* Mini Services Grid inside Phone Screen */}
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 my-2 sm:my-3">
                    {[
                      { icon: Wrench, label: 'Plumbing', bg: 'bg-blue-50 text-blue-600' },
                      { icon: Zap, label: 'Electrical', bg: 'bg-amber-50 text-amber-600' },
                      { icon: Hammer, label: 'Carpentry', bg: 'bg-indigo-50 text-indigo-600' },
                      { icon: Paintbrush, label: 'Painting', bg: 'bg-blue-50 text-blue-600' },
                      { icon: Sparkles, label: 'Cleaning', bg: 'bg-teal-50 text-teal-600' },
                      { icon: Smartphone, label: 'Repair', bg: 'bg-violet-50 text-violet-600' },
                    ].map((m, idx) => (
                      <div key={idx} className="flex flex-col items-center p-1 sm:p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                        <div className={`w-5 sm:w-6 h-5 sm:h-6 rounded-full flex items-center justify-center ${m.bg}`}>
                          <m.icon size={11} />
                        </div>
                        <span className="text-[7px] sm:text-[8px] font-bold text-slate-700 mt-1 truncate max-w-full">{m.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Phone Screen Bottom Banner */}
                  <div className="mt-2 p-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-center">
                    <p className="text-[8px] font-bold">100% Verified Partners</p>
                    <p className="text-[7px] opacity-80">Instant booking & live tracking</p>
                  </div>
                </div>
              </motion.div>

              {/* 2) Blue Zappy Partner Scooter / Delivery Bike Graphic */}
              <motion.div
                className="relative shrink-0 flex items-center justify-center -ml-4 sm:-ml-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {/* Glowing light behind scooter */}
                <div className="absolute w-40 sm:w-56 h-40 sm:h-56 rounded-full bg-blue-500/15 blur-2xl -z-10" />

                {/* Scooter illustration with ZAPPY PARTNER delivery box */}
                <div className="relative flex items-center justify-center">
                  <img
                    src="/assets/hero_vehicle_care_1780323182530.png"
                    alt="Zappy Partner Scooter"
                    className="w-52 sm:w-64 md:w-72 lg:w-80 object-contain drop-shadow-2xl"
                    onError={(e) => {
                      // Crisp SVG fallback if image is unavailable
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling.style.display = 'flex';
                    }}
                  />
                  {/* High Quality Vector Scooter Fallback */}
                  <div className="hidden flex-col items-center justify-center p-4 bg-white/80 backdrop-blur-md rounded-3xl border border-blue-100 shadow-xl">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-black text-xs">
                      <ZappyLogo size={18} />
                      <span>ZAPPY PARTNER</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 mt-2">Instant Service Delivery</p>
                  </div>
                </div>
              </motion.div>

            </div>

            {/* 3) Services Arc Bubbles (Desktop layout positioned along curve) */}
            <div className="hidden lg:block absolute inset-0 pointer-events-none overflow-visible">
              {SERVICES_ARC.map((s, idx) => (
                <motion.div
                  key={s.id}
                  className={`absolute ${s.pos} pointer-events-auto`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.15 + idx * 0.05 }}
                >
                  <div className={`flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-full shadow-lg shadow-blue-500/10 border ${s.border} hover:scale-105 hover:border-blue-300 transition-all cursor-default select-none group`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.color} group-hover:bg-blue-600 group-hover:text-white transition-colors`}>
                      <s.icon size={14} />
                    </div>
                    <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{s.label}</span>
                  </div>
                </motion.div>
              ))}
            </div>

          </div>

          {/* Responsive Services Row for Mobile (< lg screens) */}
          <div className="lg:hidden w-full my-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Zappy Services</p>
            <div className="flex flex-wrap gap-2">
              {SERVICES_ARC.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${s.color}`}>
                    <s.icon size={11} />
                  </div>
                  <span className="text-xs font-bold text-slate-700">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Left Hero Bottom Features (4 Horizontal Cards) ── */}
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 bg-white/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm mt-6 sm:mt-8"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {LEFT_FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${f.color} flex items-center justify-center shrink-0 shadow-sm`}>
                  {f.isTextIcon ? (
                    <span className="text-lg font-black">{f.icon}</span>
                  ) : (
                    <f.icon size={18} />
                  )}
                </div>
                <div>
                  <p className="text-xs sm:text-[13px] font-bold text-slate-900 leading-tight">{f.title}</p>
                  <p className="text-[11px] font-medium text-slate-500 leading-snug mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

        </div>

        {/* ─── RIGHT PANEL — WHITE LOGIN CARD & OTP FLOW ─── */}
        <div className="w-full lg:w-[460px] xl:w-[500px] shrink-0 mt-8 lg:mt-0 relative z-10 flex flex-col justify-center">

          <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl shadow-slate-300/60 border border-slate-100 p-6 sm:p-8 lg:p-10 xl:p-11 flex flex-col justify-between">

            {/* Top Right: Language Selector Button */}
            <div className="flex justify-end mb-4 sm:mb-6">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs sm:text-sm font-semibold transition-colors"
              >
                <Globe size={14} className="text-slate-500" />
                <span>English</span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
            </div>

            {/* Welcome Emblem / Avatar Illustration */}
            <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-full bg-blue-50 border-4 border-blue-100/70 mx-auto mb-5 sm:mb-6 flex items-center justify-center relative overflow-hidden shadow-inner">
              <div className="flex flex-col items-center justify-center text-blue-600">
                <div className="w-9 h-14 rounded-xl border-2 border-blue-600 bg-white flex flex-col items-center justify-between p-1 shadow-sm">
                  <div className="w-4 h-1 bg-blue-600 rounded-full" />
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users size={12} className="text-blue-600" />
                  </div>
                  <div className="w-3 h-0.5 bg-blue-400 rounded-full" />
                </div>
              </div>
              {/* Decorative side accents */}
              <div className="absolute left-2 bottom-4 w-2 h-5 bg-blue-200/80 rounded-full rotate-12" />
              <div className="absolute right-2 bottom-4 w-2 h-5 bg-blue-200/80 rounded-full -rotate-12" />
            </div>

            {/* Title & Subtitle */}
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {step === 'phone' ? 'Welcome Back!' : step === 'otp' ? 'Verify OTP' : 'Welcome Partner!'}
              </h2>
              <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm font-medium text-slate-500">
                {step === 'phone'
                  ? 'Login to continue to your Zappy partner account'
                  : step === 'otp'
                    ? `We sent a 6-digit verification code to +91 ${phone}`
                    : 'Set up your profile to start earning'}
              </p>
            </div>

            <AnimatePresence mode="wait">
              {/* ── PHONE NUMBER STEP ── */}
              {step === 'phone' ? (
                <motion.div
                  key="phone"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.25 }}
                  className="w-full"
                >
                  <div className="mb-6">
                    <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                      Mobile Number
                    </label>
                    <div className="flex items-center rounded-xl border-2 border-slate-200 bg-white overflow-hidden transition-all focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10 hover:border-slate-300">
                      {/* Country Code Flag Selector Box */}
                      <div className="flex items-center gap-1.5 px-3.5 sm:px-4 py-3.5 sm:py-4 border-r border-slate-200 bg-slate-50 text-slate-800 font-bold text-sm sm:text-base select-none shrink-0">
                        <span className="text-base sm:text-lg">🇮🇳</span>
                        <span>+91</span>
                        <ChevronDown size={14} className="text-slate-400 ml-0.5" />
                      </div>

                      {/* Phone Input Field */}
                      <input
                        type="tel"
                        inputMode="numeric"
                        className="w-full px-3.5 sm:px-4 py-3.5 sm:py-4 text-slate-900 font-semibold text-sm sm:text-base outline-none bg-transparent placeholder:text-slate-400 placeholder:font-normal"
                        placeholder="Enter mobile number"
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                        onKeyDown={e => e.key === 'Enter' && send()}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Continue Button (Blue Gradient with Arrow) */}
                  <button
                    type="button"
                    onClick={send}
                    disabled={sending || phone.length < 10}
                    className="w-full py-4 rounded-xl font-bold text-base text-white transition-all duration-200 flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : null}
                    <span>Continue</span>
                    {!sending && <ArrowRight size={18} className="stroke-[2.5]" />}
                  </button>
                </motion.div>

              ) : step === 'otp' ? (
                /* ── OTP VERIFICATION STEP ── */
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.25 }}
                  className="w-full"
                >
                  {/* OTP 6-Digit Boxes */}
                  <div className="flex justify-between gap-1.5 sm:gap-2 mb-6" onPaste={handleOtpPaste}>
                    {otpDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={el => (otpRefs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKey(i, e)}
                        className={`w-11 sm:w-13 h-12 sm:h-14 text-center text-xl sm:text-2xl font-black rounded-xl border-2 outline-none transition-all ${
                          d
                            ? 'border-blue-600 bg-blue-50/40 text-slate-900 shadow-sm'
                            : 'border-slate-200 bg-slate-50/50 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Resend OTP + Change Number Link */}
                  <div className="flex items-center justify-between mb-6">
                    <ResendOtp
                      phone={phone}
                      cooldownSec={otpMeta.cooldownSec}
                      resendsLeft={otpMeta.resendsLeft}
                      onResent={handleResent}
                      onStartOver={startOver}
                      tone="light"
                    />
                    <button
                      type="button"
                      onClick={startOver}
                      className="text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft size={15} />
                      <span>Change number</span>
                    </button>
                  </div>

                  {/* New User Profile Fields */}
                  {isNewUser && (
                    <div className="space-y-5 mb-6 text-left">
                      <div>
                        <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                          Your Name
                        </label>
                        <input
                          type="text"
                          className="w-full py-3.5 px-4 rounded-xl border-2 border-slate-200 outline-none font-medium transition-all text-slate-900 placeholder-slate-400 bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                          placeholder="e.g. Rajesh Kumar"
                          value={name}
                          onChange={e => setName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2.5">
                          Select Your Skills
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {SKILLS.map(s => {
                            const on = skills.includes(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSkills(p => (on ? p.filter(x => x !== s) : [...p, s]))}
                                className={`px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-semibold transition-all border ${
                                  on
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {on && <CheckCircle2 size={13} className="inline-block mr-1 -mt-0.5" />}
                                {SKILL_LABELS[s]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Verify Button (Blue Gradient with Arrow) */}
                  <button
                    type="button"
                    onClick={verify}
                    disabled={loggingIn || otp.length < 4}
                    className="w-full py-4 rounded-xl font-bold text-base text-white transition-all duration-200 flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loggingIn ? <Loader2 size={18} className="animate-spin" /> : null}
                    <span>Verify & Start Earning</span>
                    {!loggingIn && <ArrowRight size={18} className="stroke-[2.5]" />}
                  </button>
                </motion.div>

              ) : null}
            </AnimatePresence>

            {/* ── BOTTOM INFORMATIONAL FEATURES ──
                 (Replacing Google / Facebook / Apple social logins completely) */}
            <div className="mt-8 pt-6 sm:mt-10 sm:pt-8 border-t border-slate-100">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {RIGHT_FEATURES.map((feat, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center text-center p-3 sm:p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-all"
                  >
                    <div className={`w-10 h-10 rounded-xl ${feat.color} flex items-center justify-center mb-2 shadow-sm`}>
                      <feat.icon size={18} />
                    </div>
                    <p className="font-bold text-xs sm:text-[13px] text-slate-800 leading-tight mb-0.5">
                      {feat.title}
                    </p>
                    <p className="font-medium text-[11px] text-slate-500 leading-snug">
                      {feat.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Security Note at Bottom */}
            <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 text-xs font-medium">
              <Lock size={13} className="text-slate-400" />
              <span>Your data is 256-bit SSL encrypted & secure</span>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}

