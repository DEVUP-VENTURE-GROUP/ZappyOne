import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowRight, ChevronLeft, Loader2, PartyPopper, Store, UserRound, Wrench } from 'lucide-react';
import PasswordLogin from '@shared/components/account/PasswordLogin';
import { useScrollTopOnChange } from '@shared/components/common/ScrollToTop';
import LegalConsent from '@shared/components/auth/LegalConsent';
import AuthShell from '@shared/components/auth/AuthShell';
import PhoneField from '@shared/components/auth/PhoneField';
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
    <div className="mb-4 flex justify-between gap-2">
      {digits.map((d, i) => (
        <motion.input key={i} ref={(el) => { refs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d} aria-label={`Digit ${i + 1}`}
          onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && refs.current[i - 1]?.focus()}
          animate={d ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.15 }}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          className={`h-14 w-0 min-w-0 flex-1 rounded-btn border text-center text-[22px] font-bold text-ink-900 outline-none transition ${d ? 'border-zappy-600 bg-zappy-50 ring-1 ring-zappy-600' : 'border-line-strong bg-white focus:border-zappy-600 focus:ring-2 focus:ring-zappy-100'}`} />
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
  const head = {
    phone: ['Sign in or join ServicePro', 'For shops, solo pros, technicians and event partners.'],
    password: ['Sign in with password', null],
    otp: ['Enter the code', `We sent a 6-digit code to +91 ${phone}.`],
    choose: ['Which account?', 'This number has more than one ZappyOne account.'],
    register: ['What do you do?', 'You choose your exact services and get verified for each right after this.'],
  }[step];
  const primary = 'flex h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-zappy-600 text-[16px] font-bold text-white transition hover:bg-zappy-700 active:scale-[0.98] disabled:bg-zappy-200';
  return (
    <AuthShell
      photos={['/hero/phone-bench.webp', '/hero/vehicle-care.webp', '/hero/water-tank.webp']}
      eyebrow="ZappyOne ServicePro"
      pitch="More customers near you, on your terms."
      points={['Jobs from customers in your area', 'Your own services and prices', 'Customers pay you directly, by UPI or cash']}
      title={head[0]}
      subtitle={head[1]}
      footer={step === 'phone' ? <LegalConsent audience="provider" /> : null}
    >
          <AnimatePresence mode="wait">
            {step === 'phone' && (
              <motion.form key="phone" {...slide} onSubmit={sendOtp} className="flex flex-col">
                <PhoneField value={phone} onChange={setPhone} />
                <button type="submit" disabled={sending || phone.length < 10} className={`mt-4 ${primary}`}>
                  {sending && <Loader2 size={18} className="animate-spin" />} Get code
                </button>
                <button type="button" onClick={() => setStep('password')} className="mt-5 text-center text-[14px] font-semibold text-zappy-700 hover:underline">Shop owner? Use password instead</button>
              </motion.form>
            )}
            {step === 'password' && (
              <motion.div key="password" {...slide}>
                <PasswordLogin role="shop" onSuccess={(r) => enter({ ...r, role: 'shop', account: r.shop })} onUseOtp={() => setStep('phone')} />
              </motion.div>
            )}
            {step === 'otp' && (
              <motion.div key="otp" {...slide} className="flex flex-col">
                <OtpBoxes digits={digits} setDigits={setDigits} refs={refs} onDone={verify} />
                <div className="flex items-center justify-between gap-3">
                  <ResendOtp phone={phone} tone="light" cooldownSec={otpMeta.cooldownSec} resendsLeft={otpMeta.resendsLeft} onResent={() => setDigits(Array(6).fill(''))} onStartOver={() => setStep('phone')} />
                  <button type="button" onClick={() => setStep('phone')} className="flex items-center gap-0.5 text-[13px] font-semibold text-zappy-700 hover:underline"><ChevronLeft size={15} /> Change number</button>
                </div>
                <button type="button" onClick={() => verify()} disabled={digits.join('').length < 6 || logging} className={`mt-6 ${primary}`}>
                  {logging && <Loader2 size={18} className="animate-spin" />} Continue
                </button>
              </motion.div>
            )}
            {step === 'choose' && (
              <motion.div key="choose" {...slide} className="space-y-3">
                {accounts.map((a, i) => { const A = ACCOUNT[a.role]; return (
                  <motion.button key={a.role} type="button" onClick={() => pick(a.role)} disabled={logging} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileTap={{ scale: 0.98 }}
                    className="flex w-full items-center gap-3 rounded-card border border-line p-3.5 text-left transition hover:border-zappy-400">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zappy-50 text-zappy-700"><A.Icon size={18} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{A.title(a)}</span><span className="block text-xs text-slate-500">{A.sub(a)}</span></span>
                    <ArrowRight size={16} className="text-slate-400" />
                  </motion.button>
                ); })}
              </motion.div>
            )}
            {step === 'register' && (
              <motion.form key="register" {...slide} onSubmit={create} className="space-y-4">
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
                <button type="submit" disabled={registering || !canCreate} className={primary}>
                  {registering && <Loader2 size={18} className="animate-spin" />} Create my account
                </button>
              </motion.form>
            )}
          </AnimatePresence>
    </AuthShell>
  );
}
