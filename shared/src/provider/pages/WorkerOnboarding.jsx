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

  const stepContent = [
    /* Step 0 — Name */
    <div key="name" className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto">
          <User size={28} className="text-indigo-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900">What's your name?</h2>
        <p className="text-sm text-slate-400">This is shown to customers when you're assigned a job.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Full Name</label>
          <input
            autoFocus
            className="w-full border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3.5 text-lg font-semibold text-slate-900 outline-none transition"
            placeholder="e.g. Ravi Kumar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Mobile Number</label>
          <div className="w-full border-2 border-slate-100 bg-slate-50 rounded-2xl px-4 py-3.5 flex items-center gap-2">
            <Phone size={16} className="text-slate-400" />
            <span className="text-lg font-semibold text-slate-500">{phone}</span>
            <span className="ml-auto text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Verified</span>
          </div>
        </div>
      </div>

      {/* Said up front, so the verification step is expected rather than a wall. */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-indigo-50 p-3.5">
        <ShieldCheck size={17} className="text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-[12.5px] leading-relaxed text-indigo-900">
          Next you'll choose what you work on — phones, laptops and more. Each one is verified
          separately, so customers know exactly what you're qualified for.
        </p>
      </div>

      <button
        disabled={name.trim().length < 2}
        onClick={() => setStep(1)}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-base py-4 rounded-2xl transition"
      >
        Continue <ChevronRight size={18} />
      </button>
    </div>,

    /* Step 1 — Emergency contact */
    <div key="emergency" className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
          <Heart size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Emergency contact</h2>
        <p className="text-sm text-slate-400">
          Who should we call if something happens on the job? Optional, but strongly recommended.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Contact Name</label>
          <input
            className="w-full border-2 border-slate-200 focus:border-red-400 rounded-2xl px-4 py-3.5 text-base font-semibold text-slate-900 outline-none transition"
            placeholder="e.g. Wife, Mother, Friend"
            value={ecName}
            onChange={(e) => setEcName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Contact Phone</label>
          <input
            type="tel"
            inputMode="numeric"
            className={`w-full border-2 rounded-2xl px-4 py-3.5 text-base font-semibold text-slate-900 outline-none transition ${
              ecPhoneValid ? 'border-slate-200 focus:border-red-400' : 'border-red-300 bg-red-50'
            }`}
            placeholder="10-digit mobile number"
            value={ecPhone}
            onChange={(e) => setEcPhone(e.target.value)}
          />
          {!ecPhoneValid && (
            <p className="mt-1.5 text-xs font-semibold text-red-600">
              That doesn't look like an Indian mobile number.
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setStep(0)}
          className="flex items-center gap-1 text-slate-500 font-semibold text-sm px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={() => handleFinish({ withContact: true })}
          disabled={isLoading || !ecPhoneValid}
          className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-base py-3 rounded-2xl transition"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {isLoading ? 'Setting up…' : 'Continue'}
        </button>
      </div>

      <button
        onClick={() => handleFinish({ withContact: false })}
        disabled={isLoading}
        className="w-full text-xs text-slate-400 hover:text-slate-600 transition"
      >
        Skip emergency contact for now
      </button>
    </div>,
  ];

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col flex-1 h-full">
        <div className="px-5 pt-8 pb-4 flex justify-center sm:justify-start">
          <ZappyLogo size={26} />
        </div>

        <div className="flex gap-1.5 px-5 pb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 rounded-full flex-1 transition-all ${i <= step ? 'bg-indigo-500' : 'bg-white/10'}`} />
          ))}
        </div>

        <div className="flex-1 bg-white rounded-t-[2rem] sm:rounded-[2rem] sm:mb-8 px-5 sm:px-8 pt-8 pb-6 overflow-y-auto shadow-2xl flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              {stepContent[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
