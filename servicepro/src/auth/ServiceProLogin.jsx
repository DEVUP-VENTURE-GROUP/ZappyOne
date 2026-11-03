import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, ChevronLeft, Loader2, PartyPopper, Store, UserRound, Wrench } from 'lucide-react';
import PasswordLogin from '@shared/components/account/PasswordLogin';
import { useScrollTopOnChange } from '@shared/components/common/ScrollToTop';
import LegalConsent from '@shared/components/auth/LegalConsent';
import AuthShell from '@shared/components/auth/AuthShell';
import PhoneField from '@shared/components/auth/PhoneField';
import ResendOtp from '@shared/components/auth/ResendOtp';
import OtpBoxes from '@shared/components/auth/OtpBoxes';
import { PARTNER_TYPES } from '@shared/provider/partnerBoard';
import PartnerTermsList from '@shared/provider/components/PartnerTermsList';
import PolicySheet from '@shared/components/support/PolicySheet';
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
  const [readingTerms, setReadingTerms] = useState(false);
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
                <div className="mb-4"><OtpBoxes digits={digits} setDigits={setDigits} refs={refs} onComplete={verify} /></div>
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
                <fieldset>
                  <legend className="mb-2 text-[12px] font-bold text-slate-700">What do you do?</legend>
                  <div role="radiogroup" className="grid grid-cols-2 gap-2">
                    {[['services', 'Doorstep services', 'Repairs, cleaning, beauty, vehicles, tutoring and more', UserRound], ['events', 'Events & decor', 'Decorators, planners and event vendors', PartyPopper]].map(([k, l, h, I]) => (
                      <motion.button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} whileTap={{ scale: 0.97 }}
                        className={`relative rounded-2xl border p-3.5 text-left transition-colors ${kind === k ? 'border-zappy-600 bg-zappy-50 ring-2 ring-zappy-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        {kind === k && <CheckCircle2 size={16} className="absolute right-3 top-3 text-zappy-600" />}
                        <I size={18} className="mb-1.5 text-zappy-700" /><span className="block text-[13.5px] font-bold text-slate-900">{l}</span><span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">{h}</span>
                      </motion.button>
                    ))}
                  </div>
                </fieldset>
                <AnimatePresence initial={false}>
                  {kind === 'services' && (
                    <motion.fieldset key="how" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <legend className="text-[12px] font-bold text-slate-700">How do you work?</legend>
                      <p className="mb-2 text-[11.5px] text-slate-500">This sets your partner terms and how customers see you. You can change it later.</p>
                      <div role="radiogroup" className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        {PARTNER_TYPES.map((t) => {
                          const on = reg.partnerType === t.key;
                          return (
                            <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => setReg((r) => ({ ...r, partnerType: t.key }))}
                              className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${on ? 'bg-zappy-50' : 'hover:bg-slate-50'}`}>
                              <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-zappy-600' : 'border-slate-300'}`}>{on && <span className="h-2 w-2 rounded-full bg-zappy-600" />}</span>
                              <span className="min-w-0"><span className="block text-[13px] font-bold text-slate-900">{t.label}</span><span className="block text-[11.5px] leading-snug text-slate-500">{t.hint}</span></span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.fieldset>
                  )}
                </AnimatePresence>
                {[['businessName', kind === 'events' ? 'Business name' : reg.partnerType === 'individual' ? 'Your work name' : 'Business name', 'e.g. Ramesh Electricals'], ['ownerName', 'Your name', 'e.g. Ramesh Sharma']].map(([k, l, ph]) => (
                  <label key={k} className="block text-[12px] font-bold text-slate-700">{l}
                    <input value={reg[k]} onChange={(e) => setReg((r) => ({ ...r, [k]: e.target.value }))} placeholder={ph} maxLength={120} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none focus:border-zappy-500 focus:bg-white" />
                  </label>
                ))}
                {kind === 'services' && <PartnerTermsList terms={terms} onRead={() => setReadingTerms(true)} />}
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={reg.acceptTerms} onChange={(e) => setReg((r) => ({ ...r, acceptTerms: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded text-zappy-600" />
                  <span className="text-[13px] font-semibold text-slate-700">I accept the ZappyOne partner terms. <button type="button" onClick={(e) => { e.preventDefault(); setReadingTerms(true); }} className="font-semibold text-zappy-600 underline-offset-2 hover:underline">Read them</button></span>
                </label>
                <PolicySheet slug="partner-terms" open={readingTerms} onClose={() => setReadingTerms(false)} />
                <button type="submit" disabled={registering || !canCreate} className={primary}>
                  {registering && <Loader2 size={18} className="animate-spin" />} Create my account
                </button>
              </motion.form>
            )}
          </AnimatePresence>
    </AuthShell>
  );
}
