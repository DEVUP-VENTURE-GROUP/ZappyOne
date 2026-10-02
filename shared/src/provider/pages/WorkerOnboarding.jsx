/**
 * The one-time gate a worker passes before reaching their dashboard.
 *
 * It asks for two things only: who they are, and who to call if something
 * happens on a job. It used to ask a third — "what services do you offer?" —
 * with the whole catalog as tick-boxes. That was self-certification: ticking a
 * box made you dispatchable, with nothing verified behind it.
 *
 * What a worker may do is now decided by enrolling in a service and passing ITS
 * verification (see /provider/onboarding), so this screen hands them straight
 * there instead of collecting a claim we cannot stand behind.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Phone, Heart, ChevronRight, CheckCircle2, Loader2, ArrowLeft, ShieldCheck,
} from 'lucide-react';
import { useWorkerCompleteOnboardingMutation, useGetWorkerMeQuery } from '../../services/api';
import { ZappyLogo } from '../../components/common/ZappyLogo';
import toast from 'react-hot-toast';

const STEPS = ['name', 'emergency'];

export default function WorkerOnboarding({ onComplete }) {
  const nav = useNavigate();
  const { data: meData } = useGetWorkerMeQuery();
  const [complete, { isLoading }] = useWorkerCompleteOnboardingMutation();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(meData?.worker?.name ?? '');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');

  const phone = meData?.worker?.phone ?? '';

  // Optional, but if it is given it has to be reachable — a wrong number in an
  // emergency contact is worse than a blank one, because it is trusted.
  const ecPhoneDigits = ecPhone.replace(/\D/g, '');
  const ecPhoneValid = ecPhoneDigits.length === 0 || /^[6-9]\d{9}$/.test(ecPhoneDigits);

  async function handleFinish({ withContact }) {
    if (withContact && !ecPhoneValid) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    try {
      await complete({
        name: name.trim(),
        ...(withContact && (ecName.trim() || ecPhoneDigits)
          ? { emergencyContact: { name: ecName.trim(), phone: ecPhoneDigits } }
          : {}),
      }).unwrap();

      onComplete?.();
      // The account exists; nothing can be earned from it until they are
      // verified for a service, so that is where they go next.
      nav('/provider/onboarding', { replace: true });
    } catch (err) {
      toast.error(err.data?.error || 'Setup failed');
    }
  }

  const field = 'input text-[16px] font-semibold';
  const label = 'mb-1.5 block text-[13px] font-semibold text-ink-700';

  const stepContent = [
    /* Step 0 — Name */
    <div key="name" className="flex flex-1 flex-col gap-6">
      <div className="space-y-1.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-zappy-50 text-zappy-600">
          <User size={20} />
        </span>
        <h1 className="pt-2 text-[24px] font-bold leading-tight text-ink-900">What's your name?</h1>
        <p className="text-[15px] text-ink-500">Customers see this when you're assigned to their job.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="ob-name" className={label}>Full name</label>
          <input
            id="ob-name"
            autoFocus
            autoComplete="name"
            className={field}
            placeholder="e.g. Ravi Kumar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <span className={label}>Mobile number</span>
          <div className="flex min-h-[44px] items-center gap-2 rounded-btn border border-line bg-sunken px-3.5">
            <Phone size={16} className="text-ink-400" />
            <span className="text-[16px] font-semibold tabular-nums text-ink-700">{phone}</span>
            <span className="chip ml-auto bg-green-50 text-green-700"><CheckCircle2 size={12} /> Verified</span>
          </div>
        </div>
      </div>

      {/* Said up front, so the verification step is expected rather than a wall. */}
      <div className="flex items-start gap-2.5 rounded-card border border-line bg-sunken p-3.5">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-zappy-600" />
        <p className="text-[13px] leading-relaxed text-ink-700">
          Next you'll choose what you work on: phones, laptops and more. Each one is verified
          separately, so customers know exactly what you're qualified for.
        </p>
      </div>

      <button
        disabled={name.trim().length < 2}
        onClick={() => setStep(1)}
        className="btn-primary mt-auto w-full"
      >
        Continue <ChevronRight size={18} />
      </button>
    </div>,

    /* Step 1 — Emergency contact */
    <div key="emergency" className="flex flex-1 flex-col gap-6">
      <div className="space-y-1.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-btn bg-red-50 text-red-600">
          <Heart size={20} />
        </span>
        <h1 className="pt-2 text-[24px] font-bold leading-tight text-ink-900">Emergency contact</h1>
        <p className="text-[15px] text-ink-500">
          Who should we call if something happens on a job? Optional, but strongly recommended.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="ob-ec-name" className={label}>Contact name</label>
          <input
            id="ob-ec-name"
            className={field}
            placeholder="e.g. Wife, Mother, Friend"
            value={ecName}
            onChange={(e) => setEcName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="ob-ec-phone" className={label}>Contact phone</label>
          <input
            id="ob-ec-phone"
            type="tel"
            inputMode="numeric"
            className={`${field} ${ecPhoneValid ? '' : 'border-red-300 bg-red-50'}`}
            placeholder="10-digit mobile number"
            value={ecPhone}
            onChange={(e) => setEcPhone(e.target.value)}
          />
          {!ecPhoneValid && (
            <p className="mt-1.5 text-[13px] font-semibold text-red-600">
              That doesn't look like an Indian mobile number.
            </p>
          )}
        </div>
      </div>

      <div className="mt-auto space-y-2">
        <div className="flex gap-2">
          <button onClick={() => setStep(0)} className="btn-outline px-4">
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={() => handleFinish({ withContact: true })}
            disabled={isLoading || !ecPhoneValid}
            className="btn-primary flex-1"
          >
            {isLoading && <Loader2 size={18} className="animate-spin" />}
            {isLoading ? 'Setting up…' : 'Continue'}
          </button>
        </div>
        <button
          onClick={() => handleFinish({ withContact: false })}
          disabled={isLoading}
          className="min-h-[44px] w-full text-[13px] font-semibold text-ink-500 hover:text-ink-700"
        >
          Skip for now
        </button>
      </div>
    </div>,
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto w-full max-w-md px-5 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <ZappyLogo size={24} />
            <span className="text-[13px] font-semibold tabular-nums text-ink-500">Step {step + 1} of {STEPS.length}</span>
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-zappy-600' : 'bg-line'}`} />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col bg-white px-5 pb-6 pt-6 sm:my-6 sm:flex-none sm:rounded-card sm:border sm:border-line sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex flex-1 flex-col"
          >
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
