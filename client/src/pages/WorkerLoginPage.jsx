import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, ArrowRight, ChevronLeft, CheckCircle2, Loader2, Shield,
  Zap, Star, Wallet, TrendingUp, Clock, BadgeCheck, Wrench, Users, MapPin, Eye, EyeOff
} from 'lucide-react';
import { useRequestOtpMutation, useLoginWorkerMutation,
  useLoginWorkerPasswordMutation, useForgotWorkerPasswordMutation, useResetWorkerPasswordMutation,
  useListServicesQuery } from '../services/api';
import ResendOtp from '../components/auth/ResendOtp';
import OtpOrbit from '../components/auth/OtpOrbit';
import { setAuth } from '../modules/auth/authSlice';
import { ZappyLogo } from '../components/common/ZappyLogo';
import toast from 'react-hot-toast';
import SEO, { LOGIN_SCHEMA, BASE_URL } from '../components/SEO';

/* ── Skills ──────────────────────────────────────────────────────────────
   Onboarding skills come from the LIVE admin catalog, never a hardcoded list —
   worker registration must match the customer catalog, and dispatch matches
   worker.skills to order.service by exact code, so a hardcoded/subset list would
   leave new admin services with no eligible workers. Sourced inside the component
   via useListServicesQuery. */

/* ── Stats for the showcase ──────────────────────────────────────────── */
const STATS = [
  { icon: Users,       value: '10,000+', label: 'Active Partners' },
  { icon: Wallet,      value: '₹45K',    label: 'Avg Monthly Earnings' },
  { icon: Star,        value: '4.8★',     label: 'Partner Rating' },
  { icon: Clock,       value: '< 2 min',  label: 'Avg Job Assignment' },
];

const PERKS = [
  { icon: TrendingUp,  title: 'Daily Payments',      desc: 'Get paid every day directly to your bank' },
  { icon: Shield,      title: 'Insurance Cover',     desc: 'Free accident insurance while on duty' },
  { icon: BadgeCheck,  title: 'Skill Certification', desc: 'Get certified and earn more per job' },
  { icon: Wrench,      title: 'Tool Support',        desc: 'Get tool kits at subsidized rates' },
];

export default function WorkerLoginPage() {
  const [phone, setPhone]         = useState('');
  const [showPass, setShowPass]   = useState(false);
  const OTP_LEN = 6;
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(''));
  const [name, setName]           = useState('');
  const [skills, setSkills]       = useState([]);
  const [step, setStep]           = useState('phone');
  const [otpMeta, setOtpMeta]     = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [isNewUser, setIsNewUser] = useState(true);
  const pendingOtp = useRef(null);
  const [requestOtp, { isLoading: sending }]      = useRequestOtpMutation();
  const [loginWorker, { isLoading: loggingIn }]    = useLoginWorkerMutation();
  const { data: catalog } = useListServicesQuery();
  const skillOptions = (catalog?.list ?? [])
    .map((s) => ({ code: s.code, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Credential login (#2): password path + forgot/reset
  const [loginMode, setLoginMode]   = useState('otp'); // 'otp' | 'password'
  const [identifier, setIdentifier] = useState('');    // Worker ID / email / phone
  const [password, setPassword]     = useState('');
  const [resetOtp, setResetOtp]     = useState('');
  const [newPass, setNewPass]       = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loginWorkerPassword, { isLoading: pwLoggingIn }] = useLoginWorkerPasswordMutation();
  const [forgotWorkerPassword, { isLoading: forgotSending }] = useForgotWorkerPasswordMutation();
  const [resetWorkerPassword, { isLoading: resetting }]      = useResetWorkerPasswordMutation();
  const nav      = useNavigate();
  const loc      = useLocation();
  const dispatch = useDispatch();
  const otpRefs  = useRef([]);
  const otpRowRef = useRef(null);
  const verifiedAuth = useRef(null);   // server response held while the ring lands
  const landingTimer = useRef(null);
  const landedRef    = useRef(false);
  const [otpStatus, setOtpStatus] = useState('idle'); // idle|verifying|success|error

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

  // Hands off to the orbit animation: the ring only turns green once the server
  // has actually confirmed the code, and the session is applied when the
  // animation lands (with a timeout fallback so login can never get stuck).
  function finishLogin() {
    const r = verifiedAuth.current;
    if (!r || landedRef.current) return;
    landedRef.current = true;
    window.clearTimeout(landingTimer.current);
    dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, profile: r.worker, role: 'worker' }));
    nav(loc.state?.from || '/worker', { replace: true });
  }

  async function verify() {
    setOtpStatus('verifying');
    try {
      const r = await loginWorker({
        phone,
        otp,
        ...(name.trim()  ? { name: name.trim() } : {}),
        ...(skills.length ? { skills }            : {}),
      }).unwrap();
      verifiedAuth.current = r;
      landedRef.current = false;
      setOtpStatus('success');
      landingTimer.current = window.setTimeout(finishLogin, 2200);
    } catch (err) {
      setOtpStatus('error');
      window.setTimeout(() => setOtpStatus('idle'), 650);
      const detail = typeof err.data?.details?.[0] === 'string' ? err.data.details[0] : err.data?.error || 'Verification failed';
      toast.error(detail);
    }
  }

  // ── Credential login (#2) ──────────────────────────────────────────────────
  async function loginWithPassword() {
    if (!identifier.trim() || !password) { toast.error('Enter your Worker ID and password'); return; }
    try {
      const r = await loginWorkerPassword({ identifier: identifier.trim(), password }).unwrap();
      dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, profile: r.worker, role: 'worker' }));
      nav(loc.state?.from || '/worker', { replace: true });
    } catch (err) {
      toast.error(err.data?.error || 'Invalid credentials');
    }
  }

  async function sendForgot() {
    if (!identifier.trim()) { toast.error('Enter your Worker ID, email or phone'); return; }
    try {
      const r = await forgotWorkerPassword({ identifier: identifier.trim() }).unwrap();
      setMaskedPhone(r.maskedPhone || '');
      setStep('reset');
      toast.success(r.maskedPhone ? `OTP sent to ${r.maskedPhone}` : 'If the account exists, an OTP was sent');
    } catch (err) {
      toast.error(err.data?.error || 'Could not send reset OTP');
    }
  }

  async function doReset() {
    if (!/^[0-9]{10,15}$/.test(phone)) { toast.error('Enter the phone number on your account'); return; }
    if (newPass.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await resetWorkerPassword({ phone, otp: resetOtp, newPassword: newPass }).unwrap();
      toast.success('Password reset — sign in with your new password');
      setPassword(''); setNewPass(''); setResetOtp(''); setLoginMode('password'); setStep('phone');
    } catch (err) {
      toast.error(err.data?.error || 'Reset failed');
    }
  }

  return (
    <>
      <div className="hidden lg:block w-full">
<SEO
        title="Worker Login — Join Zappy & Earn Daily | Zappy India"
        description="Join Zappy as a service professional. Earn ₹500–₹2000/day. Verified workers get instant job notifications and daily payments."
        canonical={`${BASE_URL}/worker/login`}
        keywords="join Zappy as worker, earn money home services, service professional jobs India"
        jsonLd={LOGIN_SCHEMA}
      />
      <div className="h-screen w-full flex font-sans relative overflow-hidden">

        {/* ─── LEFT PANEL — Worker Showcase (Desktop) ─── */}
        <div className="hidden lg:flex lg:w-[48%] xl:w-[50%] relative flex-col overflow-hidden bg-slate-900"
          style={{ background: 'radial-gradient(circle at 30% 20%, #2e1065 0%, #0f172a 100%)' }}
        >
          {/* Subtle animated grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />

          {/* Glowing orbs */}
          <motion.div
            className="absolute w-[400px] h-[400px] rounded-full blur-[120px] opacity-20 pointer-events-none"
            style={{ top: '-10%', right: '-10%', background: '#7c3aed' }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute w-[300px] h-[300px] rounded-full blur-[100px] opacity-20 pointer-events-none"
            style={{ bottom: '10%', left: '-5%', background: '#f59e0b' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />

          <div className="relative z-10 h-full flex flex-col justify-between px-10 xl:px-14 py-10 xl:py-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <ZappyLogo size={36} />
              <div>
                <span className="text-amber-400 text-xs font-bold bg-amber-400/10 px-2 py-0.5 rounded-full">PARTNER</span>
              </div>
            </div>

            {/* Hero text */}
            <div className="flex-1 flex flex-col justify-center -mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="text-[40px] xl:text-[48px] font-black text-white leading-[1.08] tracking-tight mb-4">
                  Earn on{' '}
                  <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                    your schedule.
                  </span>
                </h1>
                <p className="text-white/60 text-base xl:text-lg font-medium leading-relaxed max-w-sm">
                  Join 10,000+ service professionals earning ₹500 – ₹2,000 daily with Zappy.
                </p>
              </motion.div>

              {/* Stats grid */}
              <motion.div
                className="grid grid-cols-2 gap-3 mt-10 max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                {STATS.map((s, i) => (
                  <div key={i} className="rounded-2xl p-4 flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <s.icon size={18} className="text-amber-400" />
                    </div>
                    <div>
                      <p className="text-white font-black text-lg leading-none">{s.value}</p>
                      <p className="text-white/40 text-xs font-medium mt-0.5">{s.label}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Perks row */}
            <motion.div
              className="grid grid-cols-2 gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              {PERKS.map((p, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(245,158,11,0.12)' }}>
                    <p.icon size={15} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white/90 text-[13px] font-bold leading-tight">{p.title}</p>
                    <p className="text-white/35 text-[11px] font-medium mt-0.5 leading-snug">{p.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* ─── RIGHT PANEL — Login Form ─── */}
        <div className="w-full lg:w-[52%] xl:w-[50%] flex flex-col items-center justify-center min-h-screen relative z-0 p-4 sm:p-6"
          style={{ background: 'linear-gradient(180deg, #0f0c29 0%, #1a1744 50%, #0f0c29 100%)' }}
        >
          {/* Mobile decorative elements */}
          <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-[80px] opacity-15 pointer-events-none lg:hidden"
            style={{ background: '#7c3aed' }} />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-[80px] opacity-10 pointer-events-none lg:hidden"
            style={{ background: '#f59e0b' }} />

          {/* Desktop: clean white background */}
          <div className="hidden lg:block absolute inset-0 bg-white" />

          {/* Form container */}
          <div className="w-full max-w-[440px] relative z-10">

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
              <ZappyLogo size={40} />
              <div>
                <span className="text-amber-400 text-[10px] font-bold bg-amber-400/15 px-2 py-0.5 rounded-full">PARTNER</span>
              </div>
            </div>

            {/* Form card */}
            <div className="rounded-3xl p-8 sm:p-10 lg:bg-transparent lg:p-0"
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {/* Remove glass on desktop */}
              <style>{`@media (min-width: 1024px) { .worker-form-card { background: transparent !important; backdrop-filter: none !important; border: none !important; } }`}</style>

              <div className="mb-8">
                <h2 className="text-[26px] font-black text-white lg:text-slate-900 tracking-tight mb-1">
                  {step === 'phone' ? 'Partner Login' : step === 'otp' ? 'Verify OTP'
                   : step === 'forgot' || step === 'reset' ? 'Reset Password' : 'Almost there'}
                </h2>
                <p className="text-white/50 lg:text-slate-500 text-[15px] font-medium">
                  {step === 'phone' ? 'Sign in to your partner dashboard'
                   : step === 'otp' ? `Code sent to +91 ${phone}`
                   : step === 'forgot' ? 'We’ll text a reset code to your number'
                   : step === 'reset' ? 'Enter the code and your new password'
                   : 'Set up your profile to start earning'}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {/* ── PHONE STEP ── */}
                {step === 'phone' ? (
                  <motion.div
                    key="phone"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full"
                  >
                    {/* Mode toggle: OTP vs Password (#2) */}
                    <div className="flex gap-1 mb-5 p-1 rounded-xl bg-white/5 lg:bg-slate-100">
                      {[['otp', 'OTP'], ['password', 'Password']].map(([m, label]) => (
                        <button key={m} onClick={() => setLoginMode(m)}
                          className={`flex-1 py-2 rounded-lg text-[13px] font-bold transition-all ${loginMode === m ? 'bg-amber-400 text-slate-900 shadow' : 'text-white/50 lg:text-slate-500 hover:text-white/80 lg:hover:text-slate-700'}`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {loginMode === 'otp' ? (
                      <>
                        <div className="mb-6">
                          <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">
                            Mobile Number
                          </label>
                          <div className="flex rounded-xl overflow-hidden border transition-all bg-white/5 lg:bg-white border-white/10 lg:border-slate-300 focus-within:border-amber-500 lg:focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500">
                            <div className="flex items-center justify-center px-4 border-r border-white/10 lg:border-slate-200 text-white/70 lg:text-slate-600 font-semibold text-sm gap-1">
                              <span className="text-lg leading-none">🇮🇳</span> +91
                            </div>
                            <input
                              type="tel"
                              inputMode="numeric"
                              className="w-full py-[15px] px-4 outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-transparent text-[15px]"
                              placeholder="Enter your phone number"
                              value={phone}
                              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                              onKeyDown={e => e.key === 'Enter' && send()}
                              autoFocus
                            />
                          </div>
                        </div>

                        <button
                          onClick={send}
                          disabled={sending || phone.length < 10}
                          className="w-full py-[14px] rounded-xl font-bold text-[16px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-slate-900 bg-amber-400 hover:bg-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.3)]"
                        >
                          {sending ? <Loader2 size={18} className="animate-spin" /> : null}
                          Continue
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="mb-4">
                          <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">
                            Worker ID / Email / Phone
                          </label>
                          <input
                            type="text"
                            className="w-full py-[15px] px-4 rounded-xl outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[15px]"
                            placeholder="Your Worker ID, email or phone"
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="mb-3">
                          <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">
                            Password
                          </label>
                          <input
                            type="password"
                            className="w-full py-[15px] px-4 rounded-xl outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[15px]"
                            placeholder="Enter your password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && loginWithPassword()}
                          />
                        </div>
                        <button
                          onClick={loginWithPassword}
                          disabled={pwLoggingIn || !identifier.trim() || !password}
                          className="w-full py-[14px] rounded-xl font-bold text-[16px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-slate-900 bg-amber-400 hover:bg-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.3)]"
                        >
                          {pwLoggingIn ? <Loader2 size={18} className="animate-spin" /> : null}
                          Sign in
                        </button>
                        <button onClick={() => setStep('forgot')}
                          className="w-full text-center mt-3 text-[12px] font-semibold text-amber-400/80 hover:text-amber-400">
                          Forgot password?
                        </button>
                      </>
                    )}

                    {/* Trust badges */}
                    <div className="flex items-center justify-center gap-4 mt-6 text-white/30 lg:text-slate-400">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium">
                        <Shield size={12} /> Secure Login
                      </div>
                      <div className="w-px h-3 bg-white/10 lg:bg-slate-200" />
                      <div className="flex items-center gap-1.5 text-[11px] font-medium">
                        <Zap size={12} /> Instant Verification
                      </div>
                    </div>
                  </motion.div>

                ) : step === 'forgot' ? (
                  /* ── FORGOT PASSWORD STEP (#2) ── */
                  <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                    <p className="text-[13px] text-white/50 lg:text-slate-500 mb-5">Enter your Worker ID, email or phone and we'll send a reset OTP to your registered number.</p>
                    <div className="mb-4">
                      <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">Worker ID / Email / Phone</label>
                      <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendForgot()} autoFocus
                        placeholder="Your Worker ID, email or phone"
                        className="w-full py-[15px] px-4 rounded-xl outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[15px]" />
                    </div>
                    <button onClick={sendForgot} disabled={forgotSending || !identifier.trim()}
                      className="w-full py-[14px] rounded-xl font-bold text-[16px] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-slate-900 bg-amber-400 hover:bg-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.3)]">
                      {forgotSending ? <Loader2 size={18} className="animate-spin" /> : null} Send reset OTP
                    </button>
                    <button onClick={() => { setLoginMode('password'); setStep('phone'); }}
                      className="w-full text-center mt-3 text-[12px] font-semibold text-white/50 lg:text-slate-500 hover:text-white/80 lg:hover:text-slate-700">Back to sign in</button>
                  </motion.div>

                ) : step === 'reset' ? (
                  /* ── RESET PASSWORD STEP (#2) ── */
                  <motion.div key="reset" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                    <p className="text-[13px] text-white/50 lg:text-slate-500 mb-5">{maskedPhone ? `OTP sent to ${maskedPhone}. ` : ''}Enter your phone, the OTP and a new password.</p>
                    <div className="mb-3">
                      <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">Account phone</label>
                      <input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                        placeholder="Phone on your account"
                        className="w-full py-[15px] px-4 rounded-xl outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[15px]" />
                    </div>
                    <div className="mb-3">
                      <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">OTP</label>
                      <input type="text" inputMode="numeric" value={resetOtp} onChange={e => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code"
                        className="w-full py-[15px] px-4 rounded-xl outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[15px]" />
                    </div>
                    <div className="mb-3">
                      <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">New password</label>
                      <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && doReset()} placeholder="At least 8 characters"
                        className="w-full py-[15px] px-4 rounded-xl outline-none text-white lg:text-slate-900 font-medium placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-[15px]" />
                    </div>
                    <button onClick={doReset} disabled={resetting || !phone || !resetOtp || newPass.length < 8}
                      className="w-full py-[14px] rounded-xl font-bold text-[16px] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-slate-900 bg-amber-400 hover:bg-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.3)]">
                      {resetting ? <Loader2 size={18} className="animate-spin" /> : null} Reset password
                    </button>
                    <button onClick={() => { setLoginMode('password'); setStep('phone'); }}
                      className="w-full text-center mt-3 text-[12px] font-semibold text-white/50 lg:text-slate-500 hover:text-white/80 lg:hover:text-slate-700">Back to sign in</button>
                  </motion.div>

                ) : step === 'otp' ? (
                  /* ── OTP STEP ── */
                  <motion.div
                    key="otp"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full"
                  >
                    {/* OTP boxes — the orbit animation overlays this row while
                        verifying, so the row itself is untouched. */}
                    <motion.div
                      ref={otpRowRef}
                      className="relative mb-6"
                      animate={{ height: otpStatus === 'idle' ? 'auto' : 236 }}
                      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    >
                    <div
                      className={`flex justify-between gap-1.5 sm:gap-2 transition-opacity duration-300 ${
                        otpStatus === 'idle' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                      onPaste={handleOtpPaste}
                    >
                      {otpDigits.map((d, i) => (
                        <input
                          key={i}
                          ref={el => otpRefs.current[i] = el}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={d}
                          onChange={e => handleOtpChange(i, e.target.value)}
                          onKeyDown={e => handleOtpKey(i, e)}
                          className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-[22px] font-black rounded-xl border outline-none transition-all ${
                            d
                              ? 'border-amber-500 ring-1 ring-amber-500/30 text-white lg:text-slate-900 bg-amber-500/10 lg:bg-amber-50'
                              : 'border-white/15 lg:border-slate-300 text-white lg:text-slate-900 bg-white/5 lg:bg-white focus:border-amber-500'
                          }`}
                        />
                      ))}
                    </div>

                      <OtpOrbit
                        digits={otpDigits}
                        status={otpStatus}
                        accent="#F59E0B"
                        tone="dark"
                        inputRefs={otpRefs}
                        containerRef={otpRowRef}
                        onSuccessComplete={finishLogin}
                      />
                    </motion.div>

                    {/* Resend + change */}
                    <div className="flex items-center justify-between mb-6">
                      <ResendOtp
                        phone={phone}
                        cooldownSec={otpMeta.cooldownSec}
                        resendsLeft={otpMeta.resendsLeft}
                        onResent={handleResent}
                        onStartOver={startOver}
                      />
                      <button
                        onClick={startOver}
                        className="text-[13px] text-amber-500 lg:text-amber-600 hover:underline font-semibold"
                      >
                        Change number
                      </button>
                    </div>

                    {/* New user fields */}
                    {isNewUser && (
                      <div className="space-y-5 mb-6">
                        <div>
                          <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2">Your Name</label>
                          <input
                            type="text"
                            className="w-full py-3.5 px-4 rounded-xl border outline-none font-medium transition-all text-white lg:text-slate-900 placeholder-white/30 lg:placeholder-slate-400 bg-white/5 lg:bg-white border-white/10 lg:border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                            placeholder="e.g. Rajesh Kumar"
                            value={name}
                            onChange={e => setName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-white/40 lg:text-slate-500 uppercase tracking-widest mb-2.5">Select Your Skills</label>
                          <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto">
                            {skillOptions.length === 0 && (
                              <p className="text-[12px] text-white/40 lg:text-slate-400">Loading services…</p>
                            )}
                            {skillOptions.map(({ code, name }) => {
                              const on = skills.includes(code);
                              return (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => setSkills(p => on ? p.filter(x => x !== code) : [...p, code])}
                                  className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all border ${
                                    on
                                      ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-sm shadow-amber-500/20'
                                      : 'bg-white/5 lg:bg-white border-white/10 lg:border-slate-200 text-white/60 lg:text-slate-600 hover:bg-white/10 lg:hover:bg-slate-50'
                                  }`}
                                >
                                  {on && <CheckCircle2 size={13} className="inline-block mr-1 -mt-0.5" />}
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={verify}
                      disabled={loggingIn || otp.length < 4}
                      className="w-full py-[14px] rounded-xl font-bold text-[16px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-slate-900 bg-amber-400 hover:bg-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.3)]"
                    >
                      {loggingIn ? <Loader2 size={18} className="animate-spin" /> : null}
                      Verify & Start Earning
                    </button>
                  </motion.div>

                ) : null}
              </AnimatePresence>
            </div>

            {/* Bottom trust text (Mobile) */}
            <div className="lg:hidden mt-10 flex flex-col items-center text-center gap-1">
              <div className="flex items-center gap-2 text-white/40 text-[12px] font-medium">
                <Shield size={14} className="text-amber-400/60" />
                Your data is safe & encrypted
              </div>
            </div>

            {/* Bottom trust text (Desktop) */}
            <div className="hidden lg:flex mt-12 flex-col items-center text-center gap-1.5">
              <div className="flex items-center gap-2 text-slate-600 text-[13px] font-bold">
                <div className="w-8 h-8 rounded-full bg-violet-50 flex items-center justify-center">
                  <Shield size={15} className="text-violet-600" />
                </div>
                Partner Support: <a href="mailto:partners@zappyone.com" className="text-indigo-600 hover:underline ml-1">partners@zappyone.com</a>
              </div>
              <p className="text-slate-400 text-xs font-medium">Questions about onboarding? Email our partner team.</p>
            </div>
          </div>
        </div>

      </div>
    
      </div>

    {/* MOBILE UI (hidden on desktop) */}
    <div className="flex lg:hidden min-h-screen w-full font-sans bg-gradient-to-b from-[#f8fafe] to-[#e6edfb] relative flex-col">
      <div className="w-full px-6 pt-12 pb-24 relative overflow-hidden shrink-0">
        <div className="flex items-center gap-2 mb-8 relative z-10">
          <ZappyLogo size={32} />
          <span className="text-[22px] font-bold text-slate-900 tracking-tight">Zappy</span>
          <div className="flex flex-col ml-1">
            <span className="text-[10px] font-bold bg-[#0a44ff] text-white px-2 py-0.5 rounded uppercase tracking-wider leading-none">WORKER</span>
            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5 whitespace-nowrap">Worker Portal</span>
          </div>
        </div>

        <div className="relative z-10 mb-8 max-w-[280px]">
          <h1 className="text-3xl sm:text-4xl leading-[1.15] font-black tracking-tight text-[#0f172a]">
            Work on<br />your time.<br />
            <span className="text-[#0a44ff]">Earn on<br />every job.</span>
          </h1>
          <div className="w-12 h-1 bg-[#ffb300] mt-5 mb-5 rounded-full"></div>
          <p className="text-[15px] font-medium text-slate-600 leading-snug pr-4">
            Join thousands of professionals earning ₹500 – ₹2,000 daily with Zappy.
          </p>
        </div>

        <div className="absolute right-[-40px] top-[40px] w-[240px] h-[300px] pointer-events-none opacity-90">
          <div className="absolute top-10 right-10 text-[#0a44ff]"><MapPin size={64} fill="#0a44ff" className="text-white" /></div>
          <div className="absolute bottom-10 right-0 w-[200px] h-[150px] bg-[#0a44ff] rounded-t-full rounded-bl-full shadow-2xl opacity-10"></div>
          <div className="absolute top-[100px] right-5 bg-white p-3 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3 w-[160px]">
            <div className="w-8 h-8 rounded-lg bg-[#0a44ff] flex items-center justify-center text-white"><Wallet size={16} /></div>
            <div>
              <p className="text-[9px] font-bold text-slate-500 uppercase">Earnings</p>
              <p className="text-[15px] font-black text-[#0a44ff]">₹1,750</p>
            </div>
          </div>
          <div className="absolute top-[160px] right-5 bg-white p-3 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3 w-[160px]">
            <div className="w-8 h-8 rounded-lg bg-[#0a44ff] flex items-center justify-center text-white"><CheckCircle2 size={16} /></div>
            <div>
              <p className="text-[9px] font-bold text-slate-500 uppercase">Jobs Completed</p>
              <p className="text-[15px] font-black text-slate-900">12</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 w-full -mt-10 relative z-20 flex-1 flex flex-col pb-10">
        <div className="bg-white rounded-[32px] shadow-[0_4px_40px_rgba(0,0,0,0.06)] p-6 sm:p-8 flex-1 border border-slate-100 flex flex-col">
           <h2 className="text-[26px] font-black text-slate-900 tracking-tight mb-1">Worker Login</h2>
           <p className="text-[14px] text-slate-500 font-medium mb-8">Sign in to your worker dashboard</p>

           <AnimatePresence mode="wait">
             {step === 'phone' ? (
               <motion.div key="phone_mobile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                 <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
                    <button onClick={() => setLoginMode('otp')} className={`flex-1 py-3.5 rounded-xl text-[14px] font-bold transition-all ${loginMode === 'otp' ? 'bg-[#0a44ff] text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50'}`}>OTP</button>
                    <button onClick={() => setLoginMode('password')} className={`flex-1 py-3.5 rounded-xl text-[14px] font-bold transition-all ${loginMode === 'password' ? 'bg-[#0a44ff] text-white shadow-md' : 'text-slate-600 hover:bg-slate-200/50'}`}>Password</button>
                 </div>

                 {loginMode === 'password' ? (
                   <>
                     <div className="mb-5">
                       <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">Worker ID / Email / Phone</label>
                       <div className="relative">
                         <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Users size={20} /></div>
                         <input type="text" className="w-full py-4 pl-12 pr-4 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-400 border border-slate-200 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 text-[15px] transition-all bg-white" placeholder="Enter your Worker ID, email or phone" value={identifier} onChange={e => setIdentifier(e.target.value)} />
                       </div>
                     </div>
                     <div className="mb-6">
                       <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">Password</label>
                       <div className="relative">
                         <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Shield size={20} /></div>
                         <input type={showPass ? 'text' : 'password'} className="w-full py-4 pl-12 pr-12 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-400 border border-slate-200 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 text-[15px] transition-all bg-white" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loginWithPassword()} />
                         <button onClick={() => setShowPass(!showPass)} type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPass ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                       </div>
                     </div>
                     <div className="flex items-center justify-between mb-8">
                       <label className="flex items-center gap-2 cursor-pointer">
                         <div className="w-5 h-5 rounded flex items-center justify-center bg-[#0a44ff] text-white">
                           <CheckCircle2 size={14} strokeWidth={3} />
                         </div>
                         <span className="text-[13px] font-semibold text-slate-700">Remember me</span>
                       </label>
                       <button onClick={() => setStep('forgot')} className="text-[13px] font-semibold text-[#0a44ff] hover:underline">Forgot password?</button>
                     </div>
                     <button onClick={loginWithPassword} disabled={pwLoggingIn || !identifier.trim() || !password} className="w-full py-4 rounded-2xl font-bold text-[16px] flex items-center justify-between px-6 text-white bg-[#0a44ff] hover:bg-blue-700 disabled:opacity-50 transition-all shadow-[0_4px_20px_rgba(10,68,255,0.3)]">
                       <span className="flex-1 text-center pr-5">{pwLoggingIn ? <Loader2 size={18} className="animate-spin inline" /> : 'Sign in'}</span>
                       {!pwLoggingIn && <ArrowRight size={20} className="absolute right-6" />}
                     </button>
                   </>
                 ) : (
                   <>
                     <div className="mb-6">
                       <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">
                         Mobile Number
                       </label>
                       <div className="flex rounded-2xl overflow-hidden border border-slate-200 transition-all focus-within:border-[#0a44ff] focus-within:ring-4 focus-within:ring-[#0a44ff]/10 bg-white">
                         <div className="flex items-center justify-center px-4 border-r border-slate-200 text-slate-900 font-bold text-[15px] gap-1.5 bg-slate-50">
                           IN +91
                         </div>
                         <input
                           type="tel"
                           inputMode="numeric"
                           className="w-full py-4 px-4 outline-none text-slate-900 font-semibold placeholder-slate-400 bg-transparent text-[15px]"
                           placeholder="Enter your phone number"
                           value={phone}
                           onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                           onKeyDown={e => e.key === 'Enter' && send()}
                         />
                       </div>
                     </div>
                     <button
                       onClick={send}
                       disabled={sending || phone.length < 10}
                       className="w-full py-4 rounded-2xl font-bold text-[16px] flex items-center justify-between px-6 text-white bg-[#0a44ff] hover:bg-blue-700 disabled:opacity-50 transition-all shadow-[0_4px_20px_rgba(10,68,255,0.3)]"
                     >
                       <span className="flex-1 text-center pr-5">{sending ? <Loader2 size={18} className="animate-spin inline" /> : 'Continue'}</span>
                       {!sending && <ArrowRight size={20} className="absolute right-6" />}
                     </button>
                   </>
                 )}
               </motion.div>
             ) : step === 'forgot' ? (
               <motion.div key="forgot_mobile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                 <p className="text-[14px] text-slate-500 mb-6">Enter your Worker ID, email or phone and we'll send a reset OTP to your registered number.</p>
                 <div className="mb-6">
                   <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">Worker ID / Email / Phone</label>
                   <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && sendForgot()} autoFocus
                     placeholder="Your Worker ID, email or phone"
                     className="w-full py-4 px-4 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-400 border border-slate-200 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 bg-white text-[15px] transition-all" />
                 </div>
                 <button onClick={sendForgot} disabled={forgotSending || !identifier.trim()}
                   className="w-full py-4 rounded-2xl font-bold text-[16px] flex items-center justify-center text-white bg-[#0a44ff] hover:bg-blue-700 disabled:opacity-50 transition-all shadow-[0_4px_20px_rgba(10,68,255,0.3)]">
                   {forgotSending ? <Loader2 size={18} className="animate-spin inline mr-2" /> : null} Send reset OTP
                 </button>
                 <button onClick={() => { setLoginMode('password'); setStep('phone'); }}
                   className="w-full text-center mt-4 text-[14px] font-bold text-slate-500 hover:text-slate-700">Back to sign in</button>
               </motion.div>

             ) : step === 'reset' ? (
               <motion.div key="reset_mobile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                 <p className="text-[14px] text-slate-500 mb-6">{maskedPhone ? `OTP sent to ${maskedPhone}. ` : ''}Enter your phone, the OTP and a new password.</p>
                 <div className="mb-4">
                   <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">Account phone</label>
                   <input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                     placeholder="Phone on your account"
                     className="w-full py-4 px-4 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-400 border border-slate-200 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 bg-white text-[15px] transition-all" />
                 </div>
                 <div className="mb-4">
                   <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">OTP</label>
                   <input type="text" inputMode="numeric" value={resetOtp} onChange={e => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                     placeholder="6-digit code"
                     className="w-full py-4 px-4 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-400 border border-slate-200 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 bg-white text-[15px] transition-all" />
                 </div>
                 <div className="mb-6">
                   <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">New password</label>
                   <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && doReset()} placeholder="At least 8 characters"
                     className="w-full py-4 px-4 rounded-2xl outline-none text-slate-900 font-semibold placeholder-slate-400 border border-slate-200 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 bg-white text-[15px] transition-all" />
                 </div>
                 <button onClick={doReset} disabled={resetting || !phone || !resetOtp || newPass.length < 8}
                   className="w-full py-4 rounded-2xl font-bold text-[16px] flex items-center justify-center text-white bg-[#0a44ff] hover:bg-blue-700 disabled:opacity-50 transition-all shadow-[0_4px_20px_rgba(10,68,255,0.3)]">
                   {resetting ? <Loader2 size={18} className="animate-spin inline mr-2" /> : null} Reset password
                 </button>
                 <button onClick={() => { setLoginMode('password'); setStep('phone'); }}
                   className="w-full text-center mt-4 text-[14px] font-bold text-slate-500 hover:text-slate-700">Back to sign in</button>
               </motion.div>

             ) : step === 'otp' ? (
               <motion.div key="otp_mobile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="w-full">
                 <div className="mb-8">
                   <h2 className="text-[26px] font-black text-slate-900 tracking-tight mb-2">Verify OTP</h2>
                   <p className="text-slate-500 text-[14px] font-medium">Code sent to +91 {phone}</p>
                 </div>
                 <div className="relative mb-6" ref={otpRowRef}>
                   <div className={`flex justify-between gap-1.5 transition-opacity duration-300 ${otpStatus === 'idle' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onPaste={handleOtpPaste}>
                     {otpDigits.map((d, i) => (
                       <input key={i} ref={el => otpRefs.current[i] = el} type="text" inputMode="numeric" maxLength={1} value={d} onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKey(i, e)}
                         className={`w-11 h-14 sm:w-14 sm:h-16 text-center text-[22px] font-black rounded-xl border-2 outline-none transition-all ${
                           d ? 'border-[#0a44ff] bg-blue-50 text-[#0a44ff]' : 'border-slate-100 bg-white text-slate-900 focus:border-[#0a44ff]'
                         }`} />
                     ))}
                   </div>
                   <OtpOrbit digits={otpDigits} status={otpStatus} accent="#0a44ff" tone="light" inputRefs={otpRefs} containerRef={otpRowRef} onSuccessComplete={finishLogin} />
                 </div>
                 <div className="flex items-center justify-between mb-8">
                   <ResendOtp phone={phone} cooldownSec={otpMeta.cooldownSec} resendsLeft={otpMeta.resendsLeft} onResent={handleResent} onStartOver={startOver} />
                   <button onClick={startOver} className="text-[13px] text-[#0a44ff] hover:underline font-bold">Change number</button>
                 </div>
                 {isNewUser && (
                   <div className="space-y-6 mb-8">
                     <div>
                       <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">Your Name</label>
                       <input type="text" className="w-full py-4 px-4 rounded-2xl border-2 border-slate-100 outline-none font-semibold transition-all text-slate-900 placeholder-slate-400 focus:border-[#0a44ff] focus:ring-4 focus:ring-[#0a44ff]/10 bg-white text-[15px]" placeholder="e.g. Rajesh Kumar" value={name} onChange={e => setName(e.target.value)} />
                     </div>
                     <div>
                       <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-2.5">Select Your Skills</label>
                       <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto pb-4">
                         {skillOptions.length === 0 && <p className="text-[12px] text-slate-400 font-semibold">Loading services…</p>}
                         {skillOptions.map(({ code, name: skillName }) => {
                           const on = skills.includes(code);
                           return (
                             <button key={code} type="button" onClick={() => setSkills(p => on ? p.filter(x => x !== code) : [...p, code])}
                               className={`px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border-2 ${
                                 on ? 'bg-[#0a44ff] text-white border-[#0a44ff] shadow-md shadow-[#0a44ff]/20' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'
                               }`}>
                               {on && <CheckCircle2 size={14} className="inline-block mr-1.5 -mt-0.5" />}
                               {skillName}
                             </button>
                           );
                         })}
                       </div>
                     </div>
                   </div>
                 )}
                 <button onClick={verify} disabled={loggingIn || otp.length < 4}
                   className="w-full py-4 rounded-2xl font-bold text-[16px] flex items-center justify-center text-white bg-[#0a44ff] hover:bg-blue-700 disabled:opacity-50 transition-all shadow-[0_4px_20px_rgba(10,68,255,0.3)]">
                   {loggingIn ? <Loader2 size={18} className="animate-spin inline mr-2" /> : null} Verify
                 </button>
               </motion.div>
             ) : null}
           </AnimatePresence>

           {/* Removed footer as requested */}
        </div>
      </div>
    </div>

    </>
  );
}
