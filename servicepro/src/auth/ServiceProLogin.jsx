import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowRight, Briefcase, ChevronLeft, Loader2, PartyPopper, Store, UserRound, Wrench } from 'lucide-react';
import PasswordLogin from '@shared/components/account/PasswordLogin';
import { useScrollTopOnChange } from '@shared/components/common/ScrollToTop';
import LegalConsent from '@shared/components/auth/LegalConsent';
import ResendOtp from '@shared/components/auth/ResendOtp';
import { PARTNER_TYPES } from '@shared/provider/partnerBoard';
import PartnerTermsList from '@shared/provider/components/PartnerTermsList';
import { setAuth } from '@shared/modules/auth/authSlice';
import { usePartnerTermsQuery, useRequestOtpMutation, useServiceproLoginMutation, useServiceproRegisterMutation } from '@shared/services/api';

// Where each kind of account lands after signing in (App.jsx routes).
export const HOME = { shop: '/shop', worker: '/worker', event_partner: '/partner' };
const ACCOUNT = {
  shop: { Icon: Store, title: (a) => a.name, sub: (a) => PARTNER_TYPES.find((t) => t.key === a.kind)?.label || 'Your business' },
  worker: { Icon: Wrench, title: (a) => a.name, sub: (a) => (a.shopName ? `Technician at ${a.shopName}` : 'Technician') },
  event_partner: { Icon: PartyPopper, title: (a) => a.name, sub: () => 'Event partner' },
};
const profileOf = (role, a) => (role === 'worker' ? a : { name: a.businessName, phone: a.phone, _id: a._id });

function OtpBoxes({ digits, setDigits, refs, onDone }) {
  const put = (i, v) => {
    if (!/^[0-9]?$/.test(v)) return;
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < 5) setTimeout(() => refs.current[i + 1]?.focus(), 0);
    if (next.every(Boolean) && i === 5) setTimeout(() => onDone(next.join('')), 80);
  };
  return (
    <div className="mb-6 flex justify-between gap-1.5 sm:gap-2">
      {digits.map((d, i) => (
        <motion.input key={i} ref={(el) => { refs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d} aria-label={`Digit ${i + 1}`}
          onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && refs.current[i - 1]?.focus()}
          animate={d ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.15 }}
          className={`h-12 w-0 flex-1 rounded-xl border-2 bg-white text-center text-lg font-black text-slate-900 outline-none sm:h-14 sm:rounded-2xl ${d ? 'border-zappy-600 ring-4 ring-zappy-100' : 'border-slate-200'}`} />
      ))}
    </div>
  );
}

// One door into ServicePro for every partner: phone and code once; the number's accounts decide what opens, and a new number picks what it does.
export default function ServiceProLogin() {
  const dispatch = useDispatch();
  const nav = useNavigate();
  const [step, setStep] = useState('phone');
  useScrollTopOnChange(step);
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [otpMeta, setOtpMeta] = useState({ cooldownSec: 30, resendsLeft: 3 });
  const [ticket, setTicket] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [kind, setKind] = useState('services');
  const [reg, setReg] = useState({ businessName: '', ownerName: '', partnerType: 'individual', acceptTerms: false });
  const refs = useRef([]);
  const [requestOtp, { isLoading: sending }] = useRequestOtpMutation();
  const [login, { isLoading: logging }] = useServiceproLoginMutation();
  const [register, { isLoading: registering }] = useServiceproRegisterMutation();
  const { data: terms } = usePartnerTermsQuery(reg.partnerType, { skip: step !== 'register' || kind !== 'services' });

  function enter(r) {
    dispatch(setAuth({ accessToken: r.accessToken, refreshToken: r.refreshToken, role: r.role, profile: profileOf(r.role, r.account) }));
    toast.success(r.isNew ? 'Welcome to ZappyOne. Add your first service next.' : 'Welcome back');
    nav(r.isNew && r.role === 'shop' ? '/provider/onboarding' : r.isNew && r.role === 'event_partner' ? '/partner/profile' : HOME[r.role], { replace: true });
  }
  function next(r) {
    if (r.accessToken) return enter(r);
    setTicket(r.ticket);
    setAccounts(r.accounts || []);
    setStep(r.needsRegistration ? 'register' : 'choose');
    return null;
  }
  async function sendOtp(e) {
    e.preventDefault();
    try {
      const r = await requestOtp({ phone, role: 'shop' }).unwrap();
      setOtpMeta({ cooldownSec: r.cooldownSec ?? 30, resendsLeft: r.resendsLeft ?? 3 });
      setStep('otp');
      setTimeout(() => refs.current[0]?.focus(), 200);
    } catch (err) { toast.error(err?.data?.error || 'Could not send the code'); }
  }
  async function verify(code = digits.join('')) {
    if (code.length < 6) return toast.error('Enter all 6 digits');
    try { next(await login({ phone, otp: code }).unwrap()); } catch (err) {
      toast.error(err?.data?.error || 'That code is not right');
      setDigits(Array(6).fill(''));
      setTimeout(() => refs.current[0]?.focus(), 150);
    }
  }
  async function pick(role) {
    try { next(await login({ ticket, role }).unwrap()); } catch (err) { toast.error(err?.data?.error || 'Could not open that account'); if (err?.data?.code === 'TICKET_EXPIRED') setStep('phone'); }
  }
  async function create(e) {
    e.preventDefault();
    try { enter(await register({ ticket, kind, businessName: reg.businessName.trim(), ownerName: reg.ownerName.trim(), acceptTerms: true, ...(kind === 'services' && { partnerType: reg.partnerType }) }).unwrap()); } catch (err) {
      toast.error(err?.data?.error || 'Could not create the account');
      if (err?.data?.code === 'TICKET_EXPIRED') setStep('phone');
    }
  }
  const slide = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };
  const canCreate = reg.businessName.trim().length >= 2 && reg.ownerName.trim().length >= 2 && reg.acceptTerms;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f7fc] p-4 sm:p-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zappy-600 shadow-lg shadow-zappy-200"><Briefcase size={26} className="text-white" /></div>
          <h1 className="text-[22px] font-black tracking-tight text-slate-900">ZappyOne ServicePro</h1>
          <p className="mt-1 text-[13px] font-medium text-slate-500">For every business, team and professional on ZappyOne</p>
        </div>
        <div className="rounded-card bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.form key="phone" {...slide} onSubmit={sendOtp} className="flex flex-col">
                <h2 className="mb-1 text-lg font-bold text-slate-900">Sign in or join</h2>
                <p className="mb-6 text-sm text-slate-500">Shop owners, solo pros, technicians and event partners all sign in here.</p>
                <label className="mb-6 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-zappy-500 focus-within:ring-1 focus-within:ring-zappy-500">
                  <span className="mr-2 text-[13px] font-bold text-slate-700">+91</span>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Mobile number" aria-label="Mobile number" autoFocus className="w-full min-w-0 flex-1 bg-transparent text-[14px] font-medium text-slate-900 outline-none placeholder:text-slate-400" />
                </label>
                <button type="submit" disabled={sending || phone.length < 10} className="relative flex w-full items-center justify-center rounded-xl bg-zappy-600 py-3.5 text-[14px] font-bold text-white hover:bg-zappy-700 disabled:opacity-50">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : 'Get code'}{!sending && <ArrowRight size={16} className="absolute right-4" />}
                </button>
                <button type="button" onClick={() => setStep('password')} className="mt-4 text-center text-[14px] font-semibold text-zappy-600">Shop owner? Sign in with password</button>
                <LegalConsent audience="provider" className="mt-3" />
              </motion.form>
            )}
            {step === 'password' && (
              <motion.div key="password" {...slide}>
                <h2 className="mb-4 text-lg font-bold text-slate-900">Sign in with password</h2>
                <PasswordLogin role="shop" onSuccess={(r) => enter({ ...r, role: 'shop', account: r.shop })} onUseOtp={() => setStep('phone')} />
              </motion.div>
            )}
            {step === 'otp' && (
              <motion.div key="otp" {...slide} className="flex flex-col">
                <button type="button" onClick={() => setStep('phone')} className="mb-6 flex items-center gap-1 self-start text-[13px] font-bold text-zappy-600"><ChevronLeft size={16} /> Back</button>
                <h3 className="mb-1 text-lg font-bold text-slate-900">Enter the code</h3>
                <p className="mb-6 text-sm text-slate-500">Sent to +91 {phone}</p>
                <OtpBoxes digits={digits} setDigits={setDigits} refs={refs} onDone={verify} />
                <ResendOtp phone={phone} tone="light" cooldownSec={otpMeta.cooldownSec} resendsLeft={otpMeta.resendsLeft} onResent={() => setDigits(Array(6).fill(''))} onStartOver={() => setStep('phone')} />
                <button type="button" onClick={() => verify()} disabled={digits.join('').length < 6 || logging} className="mt-6 flex w-full items-center justify-center rounded-xl bg-zappy-600 py-4 text-[15px] font-bold text-white hover:bg-zappy-700 disabled:opacity-50">
                  {logging ? <Loader2 size={20} className="animate-spin" /> : 'Continue'}
                </button>
              </motion.div>
            )}
            {step === 'choose' && (
              <motion.div key="choose" {...slide} className="space-y-3">
                <h3 className="text-lg font-bold text-slate-900">Which account?</h3>
                <p className="text-sm text-slate-500">This number has more than one ZappyOne account.</p>
                {accounts.map((a, i) => { const A = ACCOUNT[a.role]; return (
                  <motion.button key={a.role} type="button" onClick={() => pick(a.role)} disabled={logging} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileTap={{ scale: 0.98 }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left hover:border-zappy-400">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zappy-50 text-zappy-700"><A.Icon size={18} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{A.title(a)}</span><span className="block text-xs text-slate-500">{A.sub(a)}</span></span>
                    <ArrowRight size={16} className="text-slate-400" />
                  </motion.button>
                ); })}
              </motion.div>
            )}
            {step === 'register' && (
              <motion.form key="register" {...slide} onSubmit={create} className="space-y-4">
                <div><h3 className="text-lg font-bold text-slate-900">What do you do?</h3><p className="text-sm text-slate-500">You choose your exact services and get verified for each right after this.</p></div>
                <div className="grid grid-cols-2 gap-2">
                  {[['services', 'Doorstep services', 'Repairs, cleaning, beauty, vehicles, tutoring and more', UserRound], ['events', 'Events & decor', 'Decorators, planners and event vendors', PartyPopper]].map(([k, l, h, I]) => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-xl border p-3 text-left ${kind === k ? 'border-zappy-500 bg-zappy-50 ring-2 ring-zappy-100' : 'border-slate-200'}`}>
                      <I size={16} className="mb-1 text-zappy-700" /><span className="block text-[13px] font-bold text-slate-900">{l}</span><span className="block text-[11px] leading-snug text-slate-500">{h}</span>
                    </button>
                  ))}
                </div>
                {kind === 'services' && (
                  <div className="grid grid-cols-2 gap-2">
                    {PARTNER_TYPES.map((t) => (
                      <button key={t.key} type="button" aria-pressed={reg.partnerType === t.key} onClick={() => setReg((r) => ({ ...r, partnerType: t.key }))} className={`rounded-xl border px-3 py-2 text-left ${reg.partnerType === t.key ? 'border-zappy-500 bg-zappy-50' : 'border-slate-200'}`}>
                        <span className="block text-[13px] font-bold text-slate-900">{t.label}</span><span className="block text-[11px] leading-snug text-slate-500">{t.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
                {[['businessName', kind === 'events' ? 'Business name' : reg.partnerType === 'individual' ? 'Your work name' : 'Business name', 'e.g. Ramesh Electricals'], ['ownerName', 'Your name', 'e.g. Ramesh Sharma']].map(([k, l, ph]) => (
                  <label key={k} className="block text-[12px] font-bold text-slate-700">{l}
                    <input value={reg[k]} onChange={(e) => setReg((r) => ({ ...r, [k]: e.target.value }))} placeholder={ph} maxLength={120} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none focus:border-zappy-500 focus:bg-white" />
                  </label>
                ))}
                {kind === 'services' && <PartnerTermsList terms={terms} />}
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={reg.acceptTerms} onChange={(e) => setReg((r) => ({ ...r, acceptTerms: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded text-zappy-600" />
                  <span className="text-[13px] font-semibold text-slate-700">I accept the ZappyOne partner terms.</span>
                </label>
                <button type="submit" disabled={registering || !canCreate} className="flex w-full items-center justify-center rounded-xl bg-zappy-600 py-4 text-[15px] font-bold text-white hover:bg-zappy-700 disabled:opacity-50">
                  {registering ? <Loader2 size={20} className="animate-spin" /> : 'Create my account'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
