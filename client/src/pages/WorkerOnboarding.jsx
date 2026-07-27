/**
 * WorkerOnboarding — shown once before the dashboard when the worker hasn't
 * completed their profile. Collects: full name, confirms phone, selects skills,
 * optional emergency contact.
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Phone, Briefcase, Heart, ChevronRight,
  CheckCircle2, Loader2, ArrowLeft,
} from 'lucide-react';
import {
  useWorkerCompleteOnboardingMutation, useGetWorkerMeQuery, useListServicesQuery,
} from '../services/api';
import { groupCatalog } from '../lib/serviceCatalogGroups';
import { ZappyLogo } from '../components/common/ZappyLogo';
import toast from 'react-hot-toast';

const STEPS = ['name', 'skills', 'emergency'];

export default function WorkerOnboarding({ onComplete }) {
  const { data: meData } = useGetWorkerMeQuery();
  const { data: catalog, isLoading: catalogLoading } = useListServicesQuery();
  const [complete, { isLoading }] = useWorkerCompleteOnboardingMutation();

  const [step, setStep]         = useState(0);
  const [name, setName]         = useState(meData?.worker?.name ?? '');
  const [skills, setSkills]     = useState([]);
  const [ecName, setEcName]     = useState('');
  const [ecPhone, setEcPhone]   = useState('');

  const phone = meData?.worker?.phone ?? '';

  // Skills come straight from the live catalog, grouped into the same categories
  // customers see — so a worker opts into services by their real dispatch codes.
  const groups = useMemo(() => groupCatalog(catalog?.list ?? []), [catalog]);
  const selectedSet = useMemo(() => new Set(skills), [skills]);

  function toggleSkill(id) {
    setSkills(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  function toggleGroup(group) {
    const codes = group.services.map(s => s.code);
    const allOn = codes.every(c => selectedSet.has(c));
    setSkills(prev => {
      const next = new Set(prev);
      if (allOn) codes.forEach(c => next.delete(c));
      else codes.forEach(c => next.add(c));
      return [...next];
    });
  }

  async function handleFinish() {
    if (skills.length === 0) { toast.error('Select at least one skill'); return; }
    try {
      await complete({
        name: name.trim(),
        skills,
        ...(ecName || ecPhone ? { emergencyContact: { name: ecName, phone: ecPhone } } : {}),
      }).unwrap();
      toast.success('Welcome to Zappy! 🎉');
      onComplete?.();
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
            onChange={e => setName(e.target.value)}
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

      <button
        disabled={name.trim().length < 2}
        onClick={() => setStep(1)}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-base py-4 rounded-2xl transition"
      >
        Continue <ChevronRight size={18} />
      </button>
    </div>,

    /* Step 1 — Skills */
    <div key="skills" className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
          <Briefcase size={28} className="text-green-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900">What services do you offer?</h2>
        <p className="text-sm text-slate-400">Tap a category to add all its services, or pick individual ones. You can change these later.</p>
      </div>

      {catalogLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {groups.map((group) => {
            const codes = group.services.map(s => s.code);
            const selectedCount = codes.filter(c => selectedSet.has(c)).length;
            const allOn = selectedCount === codes.length && codes.length > 0;
            return (
              <div key={group.key} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
                  <p className="text-sm font-black text-slate-800 flex-1">{group.label}</p>
                  {selectedCount > 0 && <span className="text-[10px] font-bold text-indigo-600">{selectedCount}/{codes.length}</span>}
                  <button
                    onClick={() => toggleGroup(group)}
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border transition ${allOn ? 'bg-indigo-600 text-white border-transparent' : 'bg-white text-indigo-600 border-indigo-200'}`}>
                    {allOn ? 'Clear' : 'All'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-2">
                  {group.services.map((svc) => {
                    const selected = selectedSet.has(svc.code);
                    return (
                      <button
                        key={svc.code}
                        onClick={() => toggleSkill(svc.code)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border-2 text-left transition font-semibold text-[13px] ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span className="leading-tight line-clamp-2">{svc.name}</span>
                        {selected && <CheckCircle2 size={13} className="text-indigo-500 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setStep(0)} className="flex items-center gap-1 text-slate-500 font-semibold text-sm px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
          <ArrowLeft size={14} /> Back
        </button>
        <button
          disabled={skills.length === 0}
          onClick={() => setStep(2)}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-base py-3 rounded-2xl transition"
        >
          {skills.length > 0 ? `${skills.length} selected` : 'Select skills'} <ChevronRight size={18} />
        </button>
      </div>
    </div>,

    /* Step 2 — Emergency contact */
    <div key="emergency" className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
          <Heart size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Emergency contact</h2>
        <p className="text-sm text-slate-400">Who should we call if something happens on the job? (Optional but strongly recommended)</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Contact Name</label>
          <input
            className="w-full border-2 border-slate-200 focus:border-red-400 rounded-2xl px-4 py-3.5 text-base font-semibold text-slate-900 outline-none transition"
            placeholder="e.g. Wife, Mother, Friend"
            value={ecName}
            onChange={e => setEcName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Contact Phone</label>
          <input
            type="tel"
            className="w-full border-2 border-slate-200 focus:border-red-400 rounded-2xl px-4 py-3.5 text-base font-semibold text-slate-900 outline-none transition"
            placeholder="10-digit mobile number"
            value={ecPhone}
            onChange={e => setEcPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setStep(1)} className="flex items-center gap-1 text-slate-500 font-semibold text-sm px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={handleFinish}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-base py-3 rounded-2xl transition"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {isLoading ? 'Setting up…' : 'Complete Setup'}
        </button>
      </div>

      <button onClick={handleFinish} disabled={isLoading} className="w-full text-xs text-slate-400 hover:text-slate-600 transition">
        Skip emergency contact for now
      </button>
    </div>,
  ];

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col flex-1 h-full">
        {/* logo */}
        <div className="px-5 pt-8 pb-4 flex justify-center sm:justify-start">
          <ZappyLogo size={26} />
        </div>

        {/* step dots */}
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
