import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, ArrowRight, ChevronLeft, Loader2, Wrench, ShieldCheck, Users } from 'lucide-react';
import { useRequestOtpMutation, useLoginShopMutation } from '@shared/services/api';
import ResendOtp from '@shared/components/auth/ResendOtp';
import { setAuth } from '@shared/modules/auth/authSlice';
import toast from 'react-hot-toast';
import LoginRoleSwitch from '../components/LoginRoleSwitch';

function OtpBox({ value, onChange, onKeyDown, inputRef, filled }) {
  return (
    <motion.input ref={inputRef} type="text" inputMode="numeric" maxLength={1}
      value={value} onChange={onChange} onKeyDown={onKeyDown}
      animate={filled ? { scale: [1, 1.08, 1] } : {}}
      transition={{ duration: 0.15 }}
      className="flex-1 w-0 h-12 sm:h-14 text-center text-lg sm:text-xl font-black rounded-xl sm:rounded-2xl border-2 outline-none bg-white text-slate-900 transition-colors"
      style={{ borderColor: filled ? '#4f46e5' : '#e2e8f0', boxShadow: filled ? '0 0 0 4px rgba(79,70,229,0.12)' : 'none' }}
    />
  );
}

export default function ShopLoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [step, setStep] = useState('phone'); // phone -> otp -> register
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [otpMeta, setOtpMeta] = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [isNew, setIsNew] = useState(false);
  const [regForm, setRegForm] = useState({ businessName: '', ownerName: '' });

  const otpRefs = useRef([]);
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [loginShop, { isLoading: logging }] = useLoginShopMutation();
  const otp = digits.join('');

  function finishLogin(res) {
    dispatch(setAuth({
      accessToken: res.accessToken,
      role: 'shop',
      profile: { name: res.shop.businessName, phone: res.shop.phone, _id: res.shop._id },
    }));
    toast.success(`Welcome, ${res.shop.businessName}!`);
    navigate('/shop', { replace: true });
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    if (phone.length < 10) return toast.error('Enter a valid phone number');
    try {
      const res = await requestOtp({ phone, role: 'shop' }).unwrap();
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

  /**
   * @param {string} [codeOverride] the freshly-typed code, when auto-submitting
   *   before React has re-rendered with it.
   */
  async function handleVerify(codeOverride) {
    const code = typeof codeOverride === 'string' ? codeOverride : otp;
    if (code.length < 6) return toast.error('Enter all 6 digits');
    if (isNew && step === 'otp') { setStep('register'); return; }
    await doLogin({}, code);
  }

  async function doLogin(extra = {}, codeOverride) {
    // Same reason as handleVerify: on auto-submit, `otp` is one render behind.
    const code = typeof codeOverride === 'string' ? codeOverride : otp;
    try {
      const res = await loginShop({ phone, otp: code, ...extra }).unwrap();
      finishLogin(res);
    } catch (err) {
      if (err?.data?.code === 'SHOP_ONBOARDING_REQUIRED') { setStep('register'); return; }
      toast.error(err?.data?.error || 'Invalid OTP');
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!regForm.businessName || !regForm.ownerName) return toast.error('Fill in all required fields');
    await doLogin(regForm);
  }

  function handleDigit(i, val) {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) setTimeout(() => otpRefs.current[i + 1]?.focus(), 0);
    /**
     * Auto-submit on the last digit, using the code we just built.
     *
     * `handleVerify` used to be called with no argument, so it read `otp` from
     * the render that was still on screen — the one BEFORE this digit landed.
     * Typing the sixth digit therefore verified a five-character code and was
     * rejected with "Enter all 6 digits", on a screen showing six filled boxes.
     * Passing the value through sidesteps the stale closure entirely.
     */
    if (next.every((d) => d) && i === 5) {
      const code = next.join('');
      setTimeout(() => handleVerify(code), 100);
    }
  }

  function handleKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  return (
    <div className="min-h-screen bg-[#f8f7fc] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[440px]">

        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-zappy-600 flex items-center justify-center shadow-lg shadow-zappy-200 mb-4">
            <Store size={26} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight">Zappy Shop Partner</h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Manage your shop, workers & earnings</p>
        </div>

        <div className="bg-white rounded-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.form key="phone" onSubmit={handleSendOtp} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Log in or register</h2>
                  <p className="text-sm text-slate-500">Enter your shop's mobile number</p>
                </div>
                <div className="mb-8">
                  <div className="flex items-center border border-slate-200 rounded-xl px-3 sm:px-4 py-3 focus-within:border-zappy-500 focus-within:ring-1 focus-within:ring-zappy-500 transition-all bg-white overflow-hidden">
                    <span className="text-[13px] font-bold text-slate-700 mr-2 flex items-center gap-1 shrink-0">+91 <ChevronLeft size={12} className="-rotate-90 text-slate-400" /></span>
                    <div className="w-px h-5 bg-slate-200 mx-1 sm:mx-2 shrink-0" />
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mobile number" autoFocus
                      className="flex-1 w-full min-w-0 text-[13px] font-medium text-slate-900 placeholder-slate-400 outline-none bg-transparent" />
                  </div>
                </div>
                <button type="submit" disabled={sending || phone.length < 10}
                  className="w-full py-3.5 bg-zappy-600 hover:bg-zappy-700 text-white rounded-xl font-bold text-[14px] flex items-center justify-center transition-all disabled:opacity-50 relative">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <span>Get OTP</span>}
                  {!sending && <ArrowRight size={16} className="absolute right-4" />}
                </button>
                <p className="text-center text-[12px] font-medium text-slate-500 mt-5">
                  New shop? You'll set up your business right after verification.
                </p>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">
                <button onClick={() => setStep('phone')} className="self-start flex items-center gap-1 text-[13px] font-bold text-zappy-600 mb-6 hover:underline">
                  <ChevronLeft size={16} /> Back
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
                  className="w-full mt-6 py-4 bg-zappy-600 hover:bg-zappy-700 text-white rounded-xl font-bold text-[15px] flex items-center justify-center transition-all disabled:opacity-50 shadow-md">
                  {logging ? <Loader2 size={20} className="animate-spin" /> : <><ArrowRight size={18} className="mr-2" /><span>{isNew ? 'Continue' : 'Enter Dashboard'}</span></>}
                </button>
              </motion.div>
            )}

            {step === 'register' && (
              <motion.form key="register" onSubmit={handleRegister} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Set up your shop 🎉</h3>
                  <p className="text-sm text-slate-500">You can add services, address & KYC after this</p>
                </div>
                <div className="space-y-4 mb-8">
                  {[
                    { k: 'businessName', label: 'Shop / Business Name', placeholder: 'e.g. Sharma Mobile Repair' },
                    { k: 'ownerName', label: 'Your Name', placeholder: 'e.g. Ramesh Sharma' },
                  ].map(({ k, label, placeholder }) => (
                    <div key={k}>
                      <label className="text-[12px] font-bold text-slate-700 block mb-1.5">{label} <span className="text-red-500">*</span></label>
                      <input value={regForm[k]} onChange={e => setRegForm(p => ({ ...p, [k]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none text-sm focus:border-zappy-500 focus:bg-white focus:ring-2 focus:ring-zappy-100 transition-all" />
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={logging || !regForm.businessName || !regForm.ownerName}
                  className="w-full py-4 bg-zappy-600 hover:bg-zappy-700 text-white rounded-xl font-bold text-[15px] flex items-center justify-center transition-all disabled:opacity-50 shadow-md">
                  {logging ? <Loader2 size={20} className="animate-spin" /> : <span>Create Shop Account</span>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-6 mt-6">
          {[
            { icon: Wrench, label: 'Add services' },
            { icon: Users, label: 'Add workers' },
            { icon: ShieldCheck, label: 'Get verified' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-full bg-white shadow-sm border border-zappy-100 flex items-center justify-center text-zappy-600">
                <Icon size={16} />
              </div>
              <span className="text-[10px] font-bold text-slate-500 text-center">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <LoginRoleSwitch active="owner" />
        </div>
      </div>
    </div>
  );
}
