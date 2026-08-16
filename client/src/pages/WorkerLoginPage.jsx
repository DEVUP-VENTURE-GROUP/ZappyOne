import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, ArrowRight, ChevronLeft, CheckCircle2, Loader2, ShieldCheck,
  Wallet, Lock, User, Check, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import {
  useRequestOtpMutation, useLoginWorkerMutation,
  useLoginWorkerPasswordMutation, useForgotWorkerPasswordMutation,
} from '../services/api';
import ResendOtp from '../components/auth/ResendOtp';
import { setAuth } from '../modules/auth/authSlice';
import { ZappyLogo } from '../components/common/ZappyLogo';
import toast from 'react-hot-toast';
import SEO, { LOGIN_SCHEMA, BASE_URL } from '../components/SEO';

/* Skills shown to first-time workers during registration. */
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

const PHONE_KEY = 'zappy:workerPhone';

/* ── Hero illustration — city skyline, courier on a scooter, floating stat
   card. Pure inline SVG + one HTML card so it stays crisp and needs no asset. */
function HeroScene() {
  return (
    <div className="relative w-full max-w-[460px] mx-auto lg:mx-0 aspect-[5/4] select-none pointer-events-none">
      <svg viewBox="0 0 500 400" className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <linearGradient id="wlp-wave" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="wlp-scoot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2E6BFF" />
            <stop offset="1" stopColor="#1E40AF" />
          </linearGradient>
          <linearGradient id="wlp-jacket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#2450C8" />
          </linearGradient>
        </defs>

        {/* Skyline silhouette */}
        <g fill="#DCE7FB">
          <rect x="250" y="150" width="34" height="150" rx="3" />
          <rect x="288" y="120" width="30" height="180" rx="3" />
          <rect x="322" y="170" width="26" height="130" rx="3" />
          <rect x="352" y="100" width="34" height="200" rx="3" />
          <rect x="390" y="160" width="28" height="140" rx="3" />
          <rect x="422" y="135" width="32" height="165" rx="3" />
          <rect x="458" y="185" width="26" height="115" rx="3" />
        </g>
        <g fill="#EAF1FE">
          <rect x="300" y="150" width="6" height="10" /><rect x="300" y="172" width="6" height="10" />
          <rect x="362" y="130" width="6" height="10" /><rect x="362" y="152" width="6" height="10" />
          <rect x="432" y="160" width="6" height="10" /><rect x="432" y="182" width="6" height="10" />
        </g>

        {/* Dashed courier route + destination pin */}
        <path d="M470 70 C470 150 300 150 250 250" fill="none" stroke="#B7CBF5"
          strokeWidth="2.5" strokeDasharray="4 7" strokeLinecap="round" />
        <circle cx="250" cy="250" r="5" fill="#F59E0B" />
        <g transform="translate(452,44)">
          <path d="M18 0C8 0 0 8 0 18c0 12 18 30 18 30s18-18 18-30C36 8 28 0 18 0z" fill="#2563EB" />
          <circle cx="18" cy="17" r="7" fill="#fff" />
        </g>

        {/* Bottom brand wave */}
        <path d="M250 400 C250 320 330 300 400 300 C470 300 500 340 500 400 Z" fill="url(#wlp-wave)" opacity="0.9" />
        <path d="M300 400 C300 356 360 344 410 348 C470 352 500 372 500 400 Z" fill="#1E3A8A" opacity="0.25" />

        {/* ═══ Courier on a scooter (facing right) ═══ */}
        <g transform="translate(70,150)">
          {/* ground shadow */}
          <ellipse cx="150" cy="196" rx="150" ry="15" fill="#1E3A8A" opacity="0.10" />

          {/* delivery box behind the rider */}
          <rect x="10" y="70" width="62" height="62" rx="13" fill="url(#wlp-scoot)" />
          <text x="41" y="114" fontSize="36" fontWeight="900" fill="#fff" textAnchor="middle"
            style={{ fontFamily: 'Inter, sans-serif' }}>Z</text>

          {/* ── scooter body ── */}
          {/* rear mudguard hump + seat post */}
          <path d="M42 168 q0 -40 44 -42 l36 -1 4 40 -60 20z" fill="#1E40AF" />
          {/* seat */}
          <rect x="86" y="120" width="70" height="16" rx="8" fill="#1E293B" />
          {/* floor deck */}
          <path d="M120 158 l104 0 q10 0 10 8 l-2 8 -118 0z" fill="url(#wlp-scoot)" />
          {/* front leg-shield sweeping up to the handlebar */}
          <path d="M214 168 q34 -2 40 -44 l6 -46 q1 -12 -12 -12 q-12 0 -13 12 l-6 40 q-4 30 -30 40z" fill="url(#wlp-scoot)" />
          {/* handlebar */}
          <path d="M236 40 l30 -12 q7 -3 9 4 q2 6 -5 9 l-28 11z" fill="#1E293B" />
          <circle cx="248" cy="34" r="8" fill="#1E293B" />

          {/* ── rider ── */}
          {/* thigh (on seat) + shin down to deck */}
          <path d="M120 108 q30 -6 44 8 l6 30 q2 12 -12 12 q-12 0 -14 -10z" fill="url(#wlp-jacket)" />
          <path d="M150 128 q16 8 18 30 l-2 18 q-1 10 -12 9 q-10 -1 -10 -12 l-2 -30z" fill="#1E3A8A" />
          {/* boot on deck */}
          <path d="M138 172 l26 0 q8 0 8 8 l0 4 -40 0 q-4 -10 6 -12z" fill="#0F172A" />
          {/* torso — leaning forward toward the bars */}
          <path d="M108 66 q10 -30 40 -28 q26 2 34 24 q6 16 -4 30 l-40 24 q-24 12 -36 -8 q-8 -14 6 -38z" fill="url(#wlp-jacket)" />
          {/* zip highlight */}
          <path d="M132 44 l14 44" fill="none" stroke="#DCEBFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
          {/* forward arm to the handlebar */}
          <path d="M160 66 q40 -10 78 -24" fill="none" stroke="url(#wlp-jacket)" strokeWidth="17" strokeLinecap="round" />
          <circle cx="240" cy="40" r="9" fill="#F3C6A0" />
          {/* head + helmet */}
          <circle cx="132" cy="10" r="22" fill="#F3C6A0" />
          <path d="M110 8 a22 22 0 0 1 44 0 q-2 -6 -8 -8 l-30 0 q-4 3 -6 8z" fill="#1E3A8A" />
          <path d="M108 8 a24 24 0 0 1 48 0 l-8 0 a16 16 0 0 0 -32 0z" fill="#2E6BFF" />
          {/* helmet visor */}
          <path d="M150 8 q10 2 9 12 l-14 2 q-3 -10 5 -14z" fill="#1E293B" opacity="0.8" />

          {/* wheels (drawn last, on top) */}
          <g>
            <circle cx="66" cy="170" r="32" fill="#1E293B" />
            <circle cx="66" cy="170" r="13" fill="#CBD5E1" />
            <circle cx="66" cy="170" r="5" fill="#64748B" />
            <circle cx="228" cy="170" r="32" fill="#1E293B" />
            <circle cx="228" cy="170" r="13" fill="#CBD5E1" />
            <circle cx="228" cy="170" r="5" fill="#64748B" />
          </g>
        </g>
      </svg>

      {/* Floating stats card — sits top-right, clear of the rider */}
      <div className="absolute top-[8%] right-[0%] w-[52%] max-w-[212px] bg-white rounded-2xl shadow-[0_16px_40px_-12px_rgba(30,64,175,0.35)] ring-1 ring-blue-100/60 p-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Wallet size={17} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none">Earnings</p>
            <p className="text-[17px] font-black text-slate-900 leading-tight">₹1,750</p>
          </div>
        </div>
        <div className="h-px bg-slate-100" />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-950 flex items-center justify-center shrink-0">
            <CheckCircle2 size={17} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none">Jobs Completed</p>
            <p className="text-[17px] font-black text-slate-900 leading-tight">12</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkerLoginPage() {
  const OTP_LEN = 6;
  const [phone, setPhone] = useState(() => {
    try { return localStorage.getItem(PHONE_KEY) || ''; } catch { return ''; }
  });
  const [remember, setRemember] = useState(() => {
    try { return !!localStorage.getItem(PHONE_KEY); } catch { return true; }
  });
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(''));
  const [name, setName] = useState('');
  const [skills, setSkills] = useState([]);
  const [step, setStep] = useState('phone');
  const [otpMeta, setOtpMeta] = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [isNewUser, setIsNewUser] = useState(true);
  const pendingOtp = useRef(null);
  // Login method: OTP (default) or password (Worker ID / email / phone + password).
  const [mode, setMode] = useState('otp');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [loginWorker, { isLoading: loggingIn }] = useLoginWorkerMutation();
  const [loginWorkerPassword, { isLoading: pwLoggingIn }] = useLoginWorkerPasswordMutation();
  const [forgotWorkerPassword, { isLoading: sendingReset }] = useForgotWorkerPasswordMutation();
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
  }, [otp]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Remember (or forget) the phone number for next time.
      try {
        if (remember) localStorage.setItem(PHONE_KEY, phone);
        else localStorage.removeItem(PHONE_KEY);
      } catch { /* private mode */ }
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

  // ── Password sign-in (Worker ID / email / phone + password) ──────────────
  async function passwordLogin() {
    if (!identifier.trim() || !password) { toast.error('Enter your Worker ID / email / phone and password'); return; }
    try {
      const r = await loginWorkerPassword({ identifier: identifier.trim(), password }).unwrap();
      const profile = r.worker;
      dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, profile, role: 'worker' }));
      nav(loc.state?.from || '/worker', { replace: true });
    } catch (err) {
      toast.error(err.data?.error || 'Invalid credentials');
    }
  }

  // Forgot password → server sends a reset OTP to the account's phone.
  async function forgotPassword() {
    if (!identifier.trim()) { toast.error('Enter your Worker ID / email / phone first'); return; }
    try {
      await forgotWorkerPassword({ identifier: identifier.trim() }).unwrap();
      toast.success('If the account exists, a reset code has been sent to its phone.');
    } catch (err) {
      toast.error(err.data?.error || 'Could not start password reset');
    }
  }

  return (
    <>
      <SEO
        title="Worker Login — Zappy Partner Portal"
        description="Sign in to your Zappy worker dashboard. Accept nearby jobs, track earnings and get paid instantly."
        canonical={`${BASE_URL}/worker/login`}
        jsonLd={LOGIN_SCHEMA}
      />

      <div className="h-[100dvh] w-full overflow-hidden bg-gradient-to-b from-[#EAF1FF] via-[#EEF3FF] to-[#F4F7FF] flex flex-col lg:h-auto lg:min-h-[100dvh] lg:overflow-visible lg:flex-row">

        {/* ═══════════ HERO (mobile: top · desktop: left) ═══════════ */}
        <section className="relative flex-1 min-h-0 lg:flex-none lg:w-[54%] lg:min-h-[100dvh] flex flex-col justify-between lg:justify-center px-6 pt-7 pb-0 lg:px-16 lg:py-14 overflow-hidden">
          {/* soft ambient blobs */}
          <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 right-0 w-72 h-72 rounded-full bg-indigo-200/30 blur-3xl" />

          <div>
            {/* Brand */}
            <div className="relative z-10 flex items-center gap-2.5 mb-4 lg:mb-10">
              <ZappyLogo size={40} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg lg:text-xl font-black text-slate-900 leading-none">Zappy</span>
                  <span className="text-[10px] font-black text-white bg-blue-600 px-2 py-[3px] rounded-md tracking-wide leading-none">WORKER</span>
                </div>
                <p className="text-[10px] lg:text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.18em] mt-1">Worker Portal</p>
              </div>
            </div>

            {/* Headline */}
            <div className="relative z-10 max-w-md">
              <h1 className="text-[30px] sm:text-[42px] lg:text-[52px] font-black leading-[1.05] tracking-tight text-slate-900">
                Work on<br />your time.<br />
                <span className="text-blue-600">Earn on<br />every job.</span>
              </h1>
              <div className="w-12 lg:w-14 h-[5px] lg:h-[6px] rounded-full bg-amber-400 mt-3.5 mb-3 lg:mt-5 lg:mb-4" />
              <p className="text-[13px] lg:text-base font-medium text-slate-500 leading-relaxed max-w-xs">
                Join thousands of professionals earning{' '}
                <span className="font-bold text-slate-700">₹500 – ₹2,000</span> daily with Zappy.
              </p>
            </div>
          </div>

          {/* Illustration */}
          <div className="relative z-10 w-full max-w-[270px] sm:max-w-[360px] lg:max-w-[460px] mx-auto lg:mx-0 lg:mt-8">
            <HeroScene />
          </div>
        </section>

        {/* ═══════════ LOGIN CARD (mobile: bottom · desktop: right) ═══════════ */}
        <section className="relative z-20 shrink-0 lg:flex-1 lg:w-[46%] flex items-stretch lg:items-center justify-center lg:px-10">
          <div className="w-full lg:max-w-md bg-white rounded-t-[34px] lg:rounded-[28px] shadow-[0_-10px_44px_rgba(15,23,42,0.10)] lg:shadow-[0_24px_70px_-24px_rgba(30,64,175,0.30)] lg:ring-1 lg:ring-slate-100 px-6 pt-6 pb-7 lg:p-9 -mt-8 lg:mt-0 max-h-[60vh] lg:max-h-none overflow-y-auto lg:overflow-visible">

            <h2 className="text-[24px] lg:text-[26px] font-black tracking-tight text-slate-900">Worker Login</h2>
            <p className="text-[13.5px] lg:text-[14px] font-medium text-slate-400 mt-1 mb-4 lg:mb-5">Sign in to your worker dashboard</p>

            {/* OTP / Password method toggle — only on the entry step */}
            {step === 'phone' && (
              <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-100 mb-5" role="tablist">
                {[['otp', 'OTP'], ['password', 'Password']].map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`flex-1 h-10 rounded-xl text-[13.5px] font-bold transition-all ${
                      mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence>
              {step === 'phone' && mode === 'otp' ? (
                /* ── OTP: phone entry ── */
                <motion.div key="phone" initial={false} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }} className="w-full">

                  <label className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 mb-2">
                    Phone Number
                  </label>
                  <div className="relative mb-5">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-slate-400">
                      <Phone size={18} strokeWidth={2.2} className="text-blue-500" />
                      <span className="text-[14px] font-semibold text-slate-500">+91</span>
                      <span className="w-px h-5 bg-slate-200" />
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoFocus
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      onKeyDown={(e) => e.key === 'Enter' && send()}
                      placeholder="Enter your registered phone"
                      className="w-full h-[54px] pl-[104px] pr-4 rounded-2xl border-2 border-slate-200 bg-slate-50/60 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                  </div>

                  <label className="flex items-center gap-2.5 mb-6 cursor-pointer w-fit select-none">
                    <span
                      onClick={() => setRemember((v) => !v)}
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${remember ? 'bg-blue-600' : 'bg-white border-2 border-slate-300'}`}
                    >
                      {remember && <Check size={13} strokeWidth={3.5} className="text-white" />}
                    </span>
                    <span className="text-[13.5px] font-semibold text-slate-600">Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={send}
                    disabled={sending}
                    className="w-full h-[54px] rounded-2xl font-bold text-[15.5px] text-white flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    {sending ? <Loader2 size={19} className="animate-spin" /> : <>Sign in <ArrowRight size={19} strokeWidth={2.6} /></>}
                  </button>

                  <div className="flex items-center gap-3 my-6">
                    <span className="flex-1 h-px bg-slate-100" />
                    <span className="text-[12px] font-semibold text-slate-300">or</span>
                    <span className="flex-1 h-px bg-slate-100" />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <ShieldCheck size={19} className="text-blue-600" strokeWidth={2.2} />
                    </div>
                    <div>
                      <p className="text-[13.5px] font-bold text-slate-800 leading-tight">Secure login for your account</p>
                      <p className="text-[12px] font-medium text-slate-400 leading-tight mt-0.5">Your data is always protected</p>
                    </div>
                  </div>
                </motion.div>

              ) : step === 'phone' && mode === 'password' ? (
                /* ── PASSWORD SIGN-IN ── */
                <motion.div key="password" initial={false} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }} className="w-full">

                  <label className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 mb-2">
                    Worker ID / Email / Phone
                  </label>
                  <div className="relative mb-4">
                    <User size={18} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" />
                    <input
                      type="text"
                      autoFocus
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter your Worker ID, email or phone"
                      className="w-full h-[54px] pl-11 pr-4 rounded-2xl border-2 border-slate-200 bg-slate-50/60 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                  </div>

                  <label className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 mb-2">
                    Password
                  </label>
                  <div className="relative mb-4">
                    <Lock size={18} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && passwordLogin()}
                      placeholder="Enter your password"
                      className="w-full h-[54px] pl-11 pr-12 rounded-2xl border-2 border-slate-200 bg-slate-50/60 text-[15px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                    >
                      {showPassword ? <EyeOff size={18} strokeWidth={2.1} /> : <Eye size={18} strokeWidth={2.1} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between mb-6">
                    <label className="flex items-center gap-2.5 cursor-pointer w-fit select-none">
                      <span
                        onClick={() => setRemember((v) => !v)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${remember ? 'bg-blue-600' : 'bg-white border-2 border-slate-300'}`}
                      >
                        {remember && <Check size={13} strokeWidth={3.5} className="text-white" />}
                      </span>
                      <span className="text-[13.5px] font-semibold text-slate-600">Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={forgotPassword}
                      disabled={sendingReset}
                      className="text-[13px] font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors disabled:opacity-60"
                    >
                      {sendingReset ? 'Sending…' : 'Forgot password?'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={passwordLogin}
                    disabled={pwLoggingIn}
                    className="w-full h-[54px] rounded-2xl font-bold text-[15.5px] text-white flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    {pwLoggingIn ? <Loader2 size={19} className="animate-spin" /> : <>Sign in <ArrowRight size={19} strokeWidth={2.6} /></>}
                  </button>

                  <div className="flex items-center gap-3 my-6">
                    <span className="flex-1 h-px bg-slate-100" />
                    <span className="text-[12px] font-semibold text-slate-300">or</span>
                    <span className="flex-1 h-px bg-slate-100" />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <KeyRound size={19} className="text-blue-600" strokeWidth={2.2} />
                    </div>
                    <div>
                      <p className="text-[13.5px] font-bold text-slate-800 leading-tight">Password set up after approval</p>
                      <p className="text-[12px] font-medium text-slate-400 leading-tight mt-0.5">New here? Use OTP to get started</p>
                    </div>
                  </div>
                </motion.div>

              ) : (
                /* ── OTP STEP ── */
                <motion.div key="otp" initial={false} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }} className="w-full">

                  <p className="text-[13.5px] font-medium text-slate-500 mb-4">
                    Enter the 6-digit code sent to{' '}
                    <span className="font-bold text-slate-800">+91 {phone}</span>
                  </p>

                  <div className="flex justify-between gap-1.5 sm:gap-2 mb-5" onPaste={handleOtpPaste}>
                    {otpDigits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => (otpRefs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={d}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKey(i, e)}
                        className={`w-full aspect-[5/6] max-w-[52px] text-center text-xl sm:text-2xl font-black rounded-xl border-2 outline-none transition-all ${
                          d
                            ? 'border-blue-600 bg-blue-50/40 text-slate-900 shadow-sm'
                            : 'border-slate-200 bg-slate-50/60 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10'
                        }`}
                      />
                    ))}
                  </div>

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

                  {isNewUser && (
                    <div className="space-y-5 mb-6 text-left">
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 mb-2">
                          Your Name
                        </label>
                        <div className="relative">
                          <User size={18} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" />
                          <input
                            type="text"
                            className="w-full h-[52px] pl-11 pr-4 rounded-2xl border-2 border-slate-200 bg-slate-50/60 outline-none font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium transition-all focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                            placeholder="e.g. Rajesh Kumar"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 mb-2.5">
                          Select Your Skills
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {SKILLS.map((s) => {
                            const on = skills.includes(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSkills((p) => (on ? p.filter((x) => x !== s) : [...p, s]))}
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

                  <button
                    type="button"
                    onClick={verify}
                    disabled={loggingIn || otp.length < OTP_LEN}
                    className="w-full h-[54px] rounded-2xl font-bold text-[15.5px] text-white flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loggingIn ? <Loader2 size={19} className="animate-spin" /> : <>Verify &amp; Start Earning <ArrowRight size={19} strokeWidth={2.6} /></>}
                  </button>

                  <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 text-xs font-medium">
                    <Lock size={13} className="text-slate-400" />
                    <span>Your data is 256-bit SSL encrypted &amp; secure</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </>
  );
}
