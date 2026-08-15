import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, ChevronLeft, Loader2, Sparkles, EyeOff, CalendarDays, Smile, Users, Award, Palette, ShieldCheck, Flower2 } from 'lucide-react';
import { useRequestOtpMutation, useLoginEventPartnerMutation, useGooglePartnerLoginMutation } from '../../services/api';
import ResendOtp from '../../components/auth/ResendOtp';
import { setAuth } from '../../modules/auth/authSlice';
import { signInWithGoogle } from '../../lib/firebase';
import toast from 'react-hot-toast';

function OtpBox({ value, onChange, onKeyDown, inputRef, filled }) {
  return (
    <motion.input ref={inputRef} type="text" inputMode="numeric" maxLength={1}
      value={value} onChange={onChange} onKeyDown={onKeyDown}
      animate={filled ? { scale: [1, 1.08, 1] } : {}}
      transition={{ duration: 0.15 }}
      className="flex-1 w-0 h-12 sm:h-14 text-center text-lg sm:text-xl font-black rounded-xl sm:rounded-2xl border-2 outline-none bg-white text-slate-900 transition-colors"
      style={{ borderColor: filled ? '#7c3aed' : '#e2e8f0', boxShadow: filled ? '0 0 0 4px rgba(124,58,237,0.12)' : 'none' }}
    />
  );
}

export default function PartnerLoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  // steps: 'phone' → 'otp' → 'register' (new partners only)
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [otpMeta, setOtpMeta] = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [isNew, setIsNew] = useState(false);
  const [regForm, setRegForm] = useState({ businessName: '', ownerName: '', cities: '' });
  const [googleIdToken, setGoogleIdToken] = useState(null);
  const [gLoading, setGLoading] = useState(false);

  // UI state for dummy password
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const otpRefs = useRef([]);

  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [loginPartner, { isLoading: logging }] = useLoginEventPartnerMutation();
  const [googlePartnerLogin] = useGooglePartnerLoginMutation();
  const otp = digits.join('');

  async function handleGoogleLogin() {
    setGLoading(true);
    try {
      const idToken = await signInWithGoogle();
      const res = await googlePartnerLogin({ idToken }).unwrap();
      if (res.needsRegistration) {
        setGoogleIdToken(idToken);
        setRegForm(f => ({ ...f, ownerName: res.suggestedName || '' }));
        setStep('register');
        return;
      }
      finishLogin(res);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/user-cancelled' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      const msg = err?.data?.error || err?.message || 'Google sign-in failed';
      toast.error(msg);
      console.error('[Google login]', err);
    } finally {
      setGLoading(false);
    }
  }

  function finishLogin(res) {
    dispatch(setAuth({
      accessToken: res.accessToken,
      role: 'event_partner',
      profile: { name: res.partner.businessName, phone: res.partner.phone, _id: res.partner._id },
    }));
    toast.success(res.isNew ? `Welcome to Zappy, ${res.partner.businessName}! 🎉` : `Welcome to , ${res.partner.businessName}!`);
    navigate('/partner', { replace: true });
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    if (phone.length < 10) return toast.error('Enter a valid phone number');
    try {
      const res = await requestOtp({ phone, role: 'event_partner' }).unwrap();
      setIsNew(!!res.isNewUser);
      setOtpMeta({ cooldownSec: res.cooldownSec ?? 30, resendsLeft: res.resendsLeft ?? 3 });
      setStep('otp');
      toast.success('OTP sent');
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to send OTP');
    }
  }

  function handleResent() {
    setDigits(Array(6).fill(''));
    setTimeout(() => otpRefs.current[0]?.focus(), 80);
  }

  function startOver() {
    setDigits(Array(6).fill(''));
    setStep('phone');
  }

  async function handleVerify() {
    if (otp.length < 6) return toast.error('Enter all 6 digits');
    if (isNew && step === 'otp') { setStep('register'); return; }
    await doLogin();
  }

  async function doLogin(extra = {}) {
    try {
      const res = await loginPartner({ phone, otp, ...extra }).unwrap();
      finishLogin(res);
    } catch (err) {
      toast.error(err?.data?.error || 'Invalid OTP');
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!regForm.businessName || !regForm.ownerName) return toast.error('Fill in all required fields');
    if (googleIdToken) {
      try {
        setGLoading(true);
        const res = await googlePartnerLogin({ idToken: googleIdToken, ...regForm }).unwrap();
        finishLogin(res);
      } catch (err) {
        toast.error(err?.data?.error || 'Registration failed');
      } finally {
        setGLoading(false);
      }
    } else {
      await doLogin(regForm);
    }
  }

  function handleDigit(i, val) {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) setTimeout(() => otpRefs.current[i + 1]?.focus(), 0);
    if (next.every(d => d) && i === 5) setTimeout(handleVerify, 100);
  }

  function handleKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  return (
    <div className="min-h-screen bg-[#f8f7fc] flex flex-col lg:flex-row overflow-hidden font-sans">

      {/* ── LEFT PANEL (Desktop) / TOP (Mobile) ── */}
      <div className="relative w-full lg:w-1/2 flex flex-col pt-10 pb-[220px] lg:pb-12 px-6 sm:px-12 lg:px-16 overflow-hidden min-h-[500px] lg:min-h-screen shrink-0">

        {/* Background Image & Gradient overlay */}
        <div className="absolute inset-0 z-0">
          <img src="/images/events/event_romantic.webp" alt="Event Decor" className="w-full h-full object-cover object-top lg:object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/80 to-[#f8f7fc] lg:bg-gradient-to-r lg:from-[#130927]/90 lg:via-[#130927]/70 lg:to-transparent" />
        </div>

        {/* Left Content (Logo, Text, Features) */}
        <div className="relative z-10 flex flex-col h-full text-slate-900 lg:text-white lg:justify-center mt-2 lg:mt-0">

          {/* Branding Logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:mb-16">
            <img src="/logo.png" alt="Zappy" className="h-8 lg:h-9 object-contain drop-shadow-sm" />
            <div className="flex flex-col">
              <span className="text-[22px] lg:text-2xl font-black leading-none tracking-tight text-slate-900 lg:text-white">
                Zappy<span className="text-[#f59e0b]">one</span>
              </span>
              <span className="text-[10px] font-bold text-violet-700 lg:text-violet-300 uppercase tracking-widest mt-0.5">
                Event Decoration
              </span>
            </div>
          </div>

          <h1 className="text-[34px] sm:text-[40px] lg:text-[46px] font-extrabold leading-[1.15] tracking-tight mb-4 max-w-[340px] lg:max-w-md drop-shadow-sm text-slate-900 lg:text-white">
            We Decorate<br />
            Your <span className="text-[#6d28d9] lg:text-[#a78bfa]">Moments,</span><br />
            You Celebrate <span className="text-[#6d28d9] lg:text-[#a78bfa]">Life.</span>
          </h1>
          <p className="text-[14px] sm:text-[15px] leading-relaxed text-slate-700 lg:text-white/80 font-medium max-w-[320px] lg:max-w-md mb-10 lg:mb-16 drop-shadow-sm">
            From intimate gatherings to grand celebrations - we make every event <span className="text-violet-700 lg:text-violet-300 font-bold">unforgettable.</span>
          </p>

          {/* Features Row */}
          <div className="flex items-center gap-4 sm:gap-6 lg:gap-8 max-w-[340px] lg:max-w-none">
            {[
              { icon: Flower2, text: 'Premium\nDecor' },
              { icon: Palette, text: 'Custom\nDesigns' },
              { icon: Users, text: 'Expert\nTeam' },
              { icon: ShieldCheck, text: 'On-time\nService' }
            ].map((f, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 lg:gap-3 flex-1">
                <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-white lg:bg-white/10 backdrop-blur-md shadow-sm border border-violet-100 lg:border-white/20 flex items-center justify-center text-violet-600 lg:text-white">
                  <f.icon size={22} strokeWidth={2} />
                </div>
                <span className="text-[10px] sm:text-[11px] lg:text-[13px] font-bold text-center leading-tight whitespace-pre-line text-slate-700 lg:text-white/90">
                  {f.text}
                </span>
              </div>
            ))}
          </div>

          {/* Subtle separator line on mobile matching reference */}
          <div className="flex items-center gap-1 mt-6 lg:hidden max-w-[340px]">
            <div className="h-0.5 w-6 rounded-full bg-violet-600" />
            <div className="h-0.5 w-1 rounded-full bg-violet-600" />
            <div className="h-px flex-1 bg-violet-100" />
          </div>

        </div>
      </div>

      {/* ── RIGHT PANEL (White Form Container) ── */}
      <div className="relative w-full lg:w-1/2 flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-12 z-20 -mt-24 lg:mt-0 lg:bg-white overflow-hidden">

        {/* Subtle floral watermark top right (Desktop) */}
        <Flower2 size={280} className="absolute -top-16 -right-16 text-slate-50 pointer-events-none rotate-12 hidden lg:block" strokeWidth={1} />

        {/* Inner Wrapper (Card on mobile, flat on desktop) */}
        <div className="w-full max-w-[440px] bg-white rounded-[32px] lg:rounded-none shadow-[0_8px_40px_rgba(0,0,0,0.06)] lg:shadow-none p-8 sm:p-10 lg:p-0 flex flex-col relative z-20">

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-[26px] font-extrabold text-[#0f172a] tracking-tight mb-2">Welcome to ZappyOne</h2>
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="h-px w-10 bg-violet-200" />
              <Flower2 size={14} className="text-violet-500" strokeWidth={2.5} />
              <div className="h-px w-10 bg-violet-200" />
            </div>
            <p className="text-[13px] text-slate-500 font-medium">Log in to manage events</p>
          </div>

          <AnimatePresence mode="wait">

            {/* ── PHONE STEP (Matching reference exactly) ── */}
            {step === 'phone' && (
              <motion.form key="phone" onSubmit={handleSendOtp} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">

                {/* Social Logins */}
                <div className="mb-6">
                  <button type="button" onClick={handleGoogleLogin} disabled={gLoading}
                    className="w-full py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-2.5 transition-all text-[13px] font-bold text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)] disabled:opacity-50">
                    {gLoading ? <Loader2 size={16} className="animate-spin text-slate-400" /> : (
                      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" /><path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" /><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" /><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" /></svg>
                    )}
                    Continue with Google
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px] font-bold">or</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {/* Form Inputs */}
                <div className="mb-8">
                  {/* Phone */}
                  <div className="flex items-center border border-slate-200 rounded-xl px-3 sm:px-4 py-3 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-all bg-white shadow-[0_1px_2px_rgba(0,0,0,0.01)] overflow-hidden">
                    <span className="text-[13px] font-bold text-slate-700 mr-2 flex items-center gap-1 shrink-0">+91 <ChevronLeft size={12} className="-rotate-90 text-slate-400" /></span>
                    <div className="w-px h-5 bg-slate-200 mx-1 sm:mx-2 shrink-0" />
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mobile number" autoFocus
                      className="flex-1 w-full min-w-0 text-[13px] font-medium text-slate-900 placeholder-slate-400 outline-none bg-transparent ml-1 sm:ml-0" />
                  </div>
                </div>

                <button type="submit" disabled={sending || phone.length < 10}
                  className="w-full py-3.5 bg-[#6d28d9] hover:bg-violet-700 text-white rounded-xl font-medium text-[14px] flex items-center justify-center transition-all disabled:opacity-50 relative">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <span>Get OTP</span>}
                  {!sending && <ArrowRight size={16} className="absolute right-4" />}
                </button>

                <p className="text-center text-[12px] font-medium text-slate-500 mt-5">
                  New? You'll be able to register after OTP verification
                </p>
              </motion.form>
            )}

            {/* ── OTP STEP ── */}
            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">
                <button onClick={() => setStep('phone')} className="self-start flex items-center gap-1 text-[13px] font-bold text-violet-600 mb-6 hover:underline">
                  <ChevronLeft size={16} /> Back to login
                </button>
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Verify Mobile</h3>
                  <p className="text-sm text-slate-500">OTP sent to +91 {phone}</p>
                </div>
                <div className="flex gap-1.5 sm:gap-2 justify-between mb-8">
                  {digits.map((d, i) => (
                    <OtpBox key={i} value={d} filled={!!d}
                      inputRef={el => otpRefs.current[i] = el}
                      onChange={e => handleDigit(i, e.target.value)}
                      onKeyDown={e => handleKey(i, e)} />
                  ))}
                </div>

                <ResendOtp phone={phone} tone="light" cooldownSec={otpMeta.cooldownSec} resendsLeft={otpMeta.resendsLeft} onResent={handleResent} onStartOver={startOver} />

                <button onClick={handleVerify} disabled={otp.length < 6 || logging}
                  className="w-full mt-6 py-4 bg-[#6d28d9] hover:bg-violet-700 text-white rounded-xl font-bold text-[15px] flex items-center justify-center transition-all disabled:opacity-50 shadow-md">
                  {logging ? <Loader2 size={20} className="animate-spin" /> : <><Sparkles size={18} className="mr-2" /><span>{isNew ? 'Continue' : 'Enter Dashboard'}</span></>}
                </button>
              </motion.div>
            )}

            {/* ── REGISTER STEP ── */}
            {step === 'register' && (
              <motion.form key="register" onSubmit={handleRegister} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Complete Profile 🎉</h3>
                  <p className="text-sm text-slate-500">Set up your partner account</p>
                </div>
                <div className="space-y-4 mb-8">
                  {[
                    { k: 'businessName', label: 'Business Name', placeholder: 'e.g. Dream Decors Bangalore' },
                    { k: 'ownerName', label: 'Your Name', placeholder: 'e.g. Ravi Kumar' },
                    { k: 'cities', label: 'Cities you serve', placeholder: 'bangalore, mumbai' },
                  ].map(({ k, label, placeholder }) => (
                    <div key={k}>
                      <label className="text-[12px] font-bold text-slate-700 block mb-1.5">{label} <span className="text-red-500">*</span></label>
                      <input value={regForm[k]} onChange={e => setRegForm(p => ({ ...p, [k]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none text-sm focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-100 transition-all" />
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={logging || !regForm.businessName || !regForm.ownerName}
                  className="w-full py-4 bg-[#6d28d9] hover:bg-violet-700 text-white rounded-xl font-bold text-[15px] flex items-center justify-center transition-all disabled:opacity-50 shadow-md">
                  {logging ? <Loader2 size={20} className="animate-spin" /> : <span>Create Account</span>}
                </button>
              </motion.form>
            )}

          </AnimatePresence>
        </div>

        {/* Stats Footer Container */}
        <div className="w-full max-w-[440px] mt-6 lg:mt-8 bg-violet-50/70 border border-violet-100/50 rounded-[20px] py-4 sm:py-5 px-3 sm:px-5 flex justify-between items-center z-10">
          {[
            { icon: CalendarDays, val: '500+', label: 'Events Decorated' },
            { icon: Smile, val: '100+', label: 'Happy Clients' },
            { icon: Users, val: '50+', label: 'Expert Decorators' },
            { icon: Award, val: '10+', label: 'Years Experience' }
          ].map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 w-1/4 relative">
              {i !== 0 && <div className="absolute -left-1 sm:-left-2.5 top-2 bottom-2 w-px bg-violet-200/50" />}
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-violet-200 flex items-center justify-center bg-white text-violet-600 mb-0.5">
                <s.icon size={14} strokeWidth={2} />
              </div>
              <span className="text-[12px] sm:text-[13px] font-black text-slate-900 leading-none">{s.val}</span>
              <span className="text-[7px] sm:text-[8px] uppercase font-bold text-slate-500 text-center leading-tight tracking-wider w-full truncate">{s.label}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
