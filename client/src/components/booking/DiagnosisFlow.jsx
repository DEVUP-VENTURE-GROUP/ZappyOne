/**
 * Pre-Diagnosis Questionnaire
 * Service-specific questions before booking. Worker arrives prepared.
 * Conditional question flow (showIf), multi-select support.
 * No Indian competitor collects structured service context at booking time.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Stethoscope, CheckCircle2 } from 'lucide-react';
import { useGetDiagnosisFlowQuery, useAnalyseDiagnosisMutation } from '@shared/services/api';

export default function DiagnosisFlow({ service, onComplete, onSkip }) {
  const [answers,   setAnswers]   = useState({});
  const [step,      setStep]      = useState(0);
  const [analysing, setAnalysing] = useState(false);

  const { data: flowData, isLoading } = useGetDiagnosisFlowQuery(service);
  const [analyse] = useAnalyseDiagnosisMutation();

  const flow = flowData?.flow || [];
  if (!flow.length || isLoading) return null;

  /* Filter questions based on showIf conditions */
  const visibleFlow = flow.filter(q => {
    if (!q.showIf) return true;
    return Object.entries(q.showIf).every(([qId, allowedIds]) => {
      const ans = answers[qId];
      if (Array.isArray(ans)) return ans.some(a => allowedIds.includes(a));
      return allowedIds.includes(ans);
    });
  });

  const currentQ = visibleFlow[step];
  const isLast   = step >= visibleFlow.length - 1;

  function selectOption(qId, optionId, isMulti) {
    if (isMulti) {
      setAnswers(prev => {
        const curr = prev[qId] || [];
        const next = curr.includes(optionId) ? curr.filter(x => x !== optionId) : [...curr, optionId];
        return { ...prev, [qId]: next };
      });
    } else {
      setAnswers(prev => ({ ...prev, [qId]: optionId }));
    }
  }

  function canProceed() {
    if (!currentQ) return false;
    const ans = answers[currentQ.id];
    if (currentQ.type === 'multi') return Array.isArray(ans) && ans.length > 0;
    return !!ans;
  }

  async function handleFinish() {
    setAnalysing(true);
    try {
      const result = await analyse({ service, answers }).unwrap();
      onComplete?.({ answers, ...result });
    } catch {
      onComplete?.({ answers });
    } finally {
      setAnalysing(false);
    }
  }

  if (!currentQ) return null;

  const progress = ((step + 1) / visibleFlow.length) * 100;
  const currentAnswers = answers[currentQ.id] || (currentQ.type === 'multi' ? [] : null);

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
          <Stethoscope size={15} strokeWidth={2} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#0F172A]">Quick Diagnosis</p>
          <p className="text-[11px] text-slate-400">{step + 1} of {visibleFlow.length} — worker comes prepared</p>
        </div>
        <button onClick={onSkip} className="text-xs text-slate-400 font-medium">Skip</button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${progress}%` }}
          className="h-full bg-blue-600 rounded-full"
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-sm font-bold text-[#0F172A] mb-3 leading-snug">{currentQ.text}</p>
          {currentQ.type === 'multi' && (
            <p className="text-[10px] text-slate-400 mb-2 font-medium">Select all that apply</p>
          )}
          <div className="space-y-2">
            {currentQ.options.map(opt => {
              const isSelected = currentQ.type === 'multi'
                ? currentAnswers.includes(opt.id)
                : currentAnswers === opt.id;
              const isUrgent = opt.urgency === 'urgent';
              return (
                <button
                  key={opt.id}
                  onClick={() => selectOption(currentQ.id, opt.id, currentQ.type === 'multi')}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all ${
                    isSelected
                      ? isUrgent
                        ? 'bg-red-50 ring-2 ring-red-400'
                        : 'bg-blue-50 ring-2 ring-blue-400'
                      : 'bg-slate-50 ring-1 ring-slate-200 hover:ring-blue-300'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected
                      ? isUrgent ? 'border-red-500 bg-red-500' : 'border-blue-500 bg-blue-500'
                      : 'border-slate-300'
                  }`}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-sm font-medium flex-1 ${isSelected ? (isUrgent ? 'text-red-700' : 'text-blue-700') : 'text-[#0F172A]'}`}>
                    {opt.label}
                  </span>
                  {isUrgent && isSelected && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Urgent</span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex gap-2 pt-1">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-sm font-semibold text-slate-500"
          >
            <ChevronLeft size={14} /> Back
          </button>
        )}
        {isLast ? (
          <button
            onClick={handleFinish}
            disabled={!canProceed() || analysing}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            {analysing ? 'Analysing…' : 'Done — Continue Booking'}
          </button>
        ) : (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Next <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
