import PasswordLogin from '@shared/components/account/PasswordLogin';
import { useScrollTopOnChange } from '@shared/components/common/ScrollToTop';
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useRequestOtpMutation, useLoginUserMutation } from '@shared/services/api';
import ResendOtp from '@shared/components/auth/ResendOtp';
import LegalConsent from '@shared/components/auth/LegalConsent';
import AuthShell from '@shared/components/auth/AuthShell';
import PhoneField from '@shared/components/auth/PhoneField';
import OtpBoxes from '@shared/components/auth/OtpBoxes';
import OtpOrbit from './OtpOrbit';
import { setAuth } from '@shared/modules/auth/authSlice';
import toast from 'react-hot-toast';
import SEO, { LOGIN_SCHEMA, BASE_URL } from '@shared/components/SEO';


export default function LoginPage() {
  const [phone, setPhone]       = useState('');
  const OTP_LEN = 6; // 2Factor plain AUTOGEN (no template) sends 6-digit SMS OTP
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(''));
  const [name, setName]         = useState('');
  const [step, setStep]         = useState('phone');
  useScrollTopOnChange(step);
  const [otpMeta, setOtpMeta]   = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [isNewUser, setIsNewUser] = useState(true);
  // Returning customers who set a password skip the paid OTP entirely.
  const [withPassword, setWithPassword] = useState(false);
  const pendingOtp = useRef(null);
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [loginUser,  { isLoading: loggingUser }]   = useLoginUserMutation();
  const nav      = useNavigate();
  const loc      = useLocation();
  const dispatch = useDispatch();
  const isLoading = loggingUser;
  const otpRefs   = useRef([]);
  const otpRowRef = useRef(null);
  const verifiedAuth = useRef(null);   // server response held while the ring lands
  const landingTimer = useRef(null);
  const landedRef    = useRef(false);
  const [otpStatus, setOtpStatus] = useState('idle'); // idle|verifying|success|error

  const otp = otpDigits.join('');

  // After OTP form mounts: fill digits from API response (dev auto-fill)
  useEffect(() => {
    if (step !== 'otp' || !pendingOtp.current) return;
    const code = String(pendingOtp.current);
    pendingOtp.current = null;
    const digits = code.slice(0, OTP_LEN).split('').concat(Array(Math.max(0, OTP_LEN - code.length)).fill(''));
    setOtpDigits(digits);
    setTimeout(() => otpRefs.current[OTP_LEN - 1]?.focus(), 80);
  }, [step]);

  // Auto-submit once all digits filled (existing users only — new users must enter name)
  useEffect(() => {
    if (step === 'otp' && otp.length === OTP_LEN && !isNewUser) verify();
  }, [otp]);

  async function send() {
    if (!/^[0-9]{10,15}$/.test(phone)) { toast.error('Enter a valid phone number'); return; }
    try {
      const r = await requestOtp({ phone, role: 'user' }).unwrap();
      pendingOtp.current = r.otp || null;
      setIsNewUser(r.isNewUser ?? true);
      // Server-owned resend rules — never hardcode these client-side.
      setOtpMeta({ cooldownSec: r.cooldownSec ?? 30, resendsLeft: r.resendsLeft ?? 3 });
      setStep('otp');
    } catch (err) {
      toast.error(err.data?.error || 'Failed to send OTP');
    }
  }

  // A resend issues a NEW code — clear the old digits so a stale one can't be submitted,
  // and auto-fill the fresh code in dev (prod never returns it).
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

  // The orbit animation runs while the server checks the code; the session is
  // applied when the ring lands. A timeout fallback guarantees the user is never
  // stranded if the animation callback doesn't fire.
  function finishLogin() {
    const r = verifiedAuth.current;
    if (!r || landedRef.current) return;
    landedRef.current = true;
    window.clearTimeout(landingTimer.current);
    const profile = r.user;
    dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, profile, role: 'user' }));
    // Anything still missing (name, password, email) is asked once by the
    // app-wide setup screen, so it is the same for OTP and password sign-ins.
    nav(loc.state?.from || '/', { replace: true });
  }

  async function verify() {
    setOtpStatus('verifying');
    try {
      const r = await loginUser({
        phone,
        otp,
        ...(name.trim() ? { name: name.trim() } : {}),
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
      console.error('[verify] status:', err.status, 'body:', err.data);
    }
  }


  const otpTitle = isNewUser ? 'Welcome to ZappyOne' : 'Enter the code';
  return (
    <>
      <SEO
        title="Login to ZappyOne - Book Home Services Instantly"
        description="Login to ZappyOne with your phone number. Book verified professionals for home services instantly - puncture repair, phone repair, laptop repair and more."
        canonical={`${BASE_URL}/login`}
        keywords="ZappyOne login, book home services India, on-demand services app login"
        jsonLd={LOGIN_SCHEMA}
      />
      <AuthShell
        photos={['/hero/helping.webp', '/hero/phone-repair.webp', '/hero/pet-care.webp']}
        eyebrow="ZappyOne"
        pitch="Verified pros at your door, tracked live."
        points={['Every pro is ID-checked before their first job', 'See the price before you book', 'Pay the pro after the work, by UPI or cash']}
        title={step === 'otp' ? otpTitle : withPassword ? 'Sign in with password' : 'Sign in or create an account'}
        subtitle={step === 'otp' ? `We sent a 6-digit code to +91 ${phone}.` : withPassword ? null : 'Book verified pros near you and track them live.'}
        footer={step === 'phone' && !withPassword ? <LegalConsent /> : null}
      >
        <AnimatePresence mode="wait">
          {step === 'phone' ? (
            <motion.div key="phone" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
              {withPassword ? (
                <PasswordLogin
                  role="user"
                  onUseOtp={() => setWithPassword(false)}
                  onSuccess={(r) => {
                    dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, profile: r.user, role: 'user' }));
                    nav(loc.state?.from || '/', { replace: true });
                  }}
                />
              ) : (
                <>
                  <PhoneField value={phone} onChange={setPhone} onEnter={send} maxDigits={15} />
                  <button
                    type="button"
                    onClick={send}
                    disabled={sending || phone.length < 10}
                    className="mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-zappy-600 text-[16px] font-bold text-white transition hover:bg-zappy-700 active:scale-[0.98] disabled:bg-zappy-200 disabled:text-white"
                  >
                    {sending && <Loader2 size={18} className="animate-spin" />}
                    Get code
                  </button>
                  <button type="button" onClick={() => setWithPassword(true)} className="mt-5 w-full text-center text-[14px] font-semibold text-zappy-700 hover:underline">
                    Use password instead
                  </button>
                </>
              )}
            </motion.div>
          ) : step === 'otp' ? (
            <motion.div key="otp" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
              <motion.div
                ref={otpRowRef}
                className="relative"
                animate={{ height: otpStatus === 'idle' ? 'auto' : 236 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={`transition-opacity duration-300 ${otpStatus === 'idle' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                  <OtpBoxes digits={otpDigits} setDigits={setOtpDigits} refs={otpRefs} disabled={otpStatus !== 'idle'} />
                </div>
                <OtpOrbit
                  digits={otpDigits}
                  status={otpStatus}
                  accent="#1F4FD8"
                  tone="light"
                  inputRefs={otpRefs}
                  containerRef={otpRowRef}
                  onSuccessComplete={finishLogin}
                />
              </motion.div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <ResendOtp phone={phone} cooldownSec={otpMeta.cooldownSec} resendsLeft={otpMeta.resendsLeft} onResent={handleResent} onStartOver={startOver} />
                <button type="button" onClick={startOver} className="flex items-center gap-0.5 text-[13px] font-semibold text-zappy-700 hover:underline">
                  <ChevronLeft size={15} /> Change number
                </button>
              </div>

              {isNewUser && (
                <label className="mt-7 block text-[13px] font-semibold text-ink-700">
                  Your name
                  <input
                    type="text"
                    autoComplete="name"
                    className="mt-1.5 h-[52px] w-full rounded-btn border border-line-strong bg-white px-3.5 text-[16px] font-medium text-ink-900 outline-none transition placeholder:font-normal placeholder:text-ink-400 focus:border-zappy-600 focus:ring-2 focus:ring-zappy-100"
                    placeholder="e.g. Priya Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}

              <button
                type="button"
                onClick={verify}
                disabled={isLoading || otp.length < OTP_LEN}
                className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-zappy-600 text-[16px] font-bold text-white transition hover:bg-zappy-700 active:scale-[0.98] disabled:bg-zappy-200"
              >
                {isLoading && <Loader2 size={18} className="animate-spin" />}
                {isNewUser ? 'Create account' : 'Continue'}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </AuthShell>
    </>
  );
}
