import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone, ShieldCheck, CheckCircle2, ChevronRight, Search,
  Wrench, BatteryCharging, Zap, AlertTriangle, ArrowRight, RefreshCw, HelpCircle,
} from 'lucide-react';
import {
  useGetCatalogBrandsQuery,
  useGetCatalogModelsQuery,
  useGetCatalogVariantsQuery,
  useGetDiagnosticFlowQuery,
  useRecordDemandEventMutation,
} from '../../services/api';

export default function PhoneDiagnosticWizard({ onSelectServiceQuote }) {
  const [step, setStep] = useState(1); // 1: Brand/Model -> 2: Problem/Diagnostic -> 3: Variant & Quote
  const [selectedBrand, setSelectedBrand] = useState('apple');
  const [selectedModel, setSelectedModel] = useState(null);
  const [searchModelQ, setSearchModelQ] = useState('');
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [answers, setAnswers] = useState({});
  const [resolvedServiceCode, setResolvedServiceCode] = useState('screen_replacement');
  const [selectedTier, setSelectedTier] = useState('Compatible');

  // API Queries
  const { data: brandsData }   = useGetCatalogBrandsQuery('mobile');
  const { data: modelsData }   = useGetCatalogModelsQuery({ brandCode: selectedBrand, search: searchModelQ });
  const { data: flowData }     = useGetDiagnosticFlowQuery('mobile_diagnostic');
  const { data: variantsData } = useGetCatalogVariantsQuery(
    { serviceCode: resolvedServiceCode, modelCode: selectedModel?.code },
    { skip: !selectedModel }
  );
  const [recordDemand] = useRecordDemandEventMutation();

  const brands = brandsData?.brands || [];
  const models = modelsData?.models || [];
  const flow   = flowData?.flow || null;
  const variants = variantsData?.variants || [];

  // Find active variant or construct default tier estimate
  const activeVariant = variants.find(v => v.qualityTier === selectedTier) || variants[0];

  function handleSelectBrand(bCode) {
    setSelectedBrand(bCode);
    setSelectedModel(null);
  }

  function handleSelectModel(m) {
    setSelectedModel(m);
    setStep(2);
  }

  function handleSelectProblem(option) {
    setSelectedProblem(option.id);
    if (option.recommendedServiceCode) {
      setResolvedServiceCode(option.recommendedServiceCode);
    }
  }

  function handleAnswerQuestion(qId, option) {
    setAnswers(prev => ({ ...prev, [qId]: option.id }));
    if (option.recommendedServiceCode) {
      setResolvedServiceCode(option.recommendedServiceCode);
    }
    if (option.recommendedPartQuality) {
      setSelectedTier(option.recommendedPartQuality);
    }
  }

  function handleProceedToQuote() {
    if (!selectedModel) return;
    setStep(3);
  }

  function handleConfirmQuote() {
    if (!selectedModel) return;
    const finalPricePaise = activeVariant ? activeVariant.totalPricePaise : 180000;
    const finalWarrantyDays = activeVariant ? activeVariant.warrantyDays : 30;

    onSelectServiceQuote({
      serviceCode: resolvedServiceCode,
      deviceBrand: selectedBrand,
      deviceModel: selectedModel.name,
      partsTier: selectedTier,
      estimatedPriceRs: Math.round(finalPricePaise / 100),
      warrantyDays: finalWarrantyDays,
    });
  }

  function handleReportUnserved() {
    recordDemand({
      brandName: selectedBrand,
      modelName: selectedModel?.name || searchModelQ,
      requestedService: resolvedServiceCode,
      reason: 'no_part',
    });
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden my-4">
      {/* Wizard Header */}
      <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center">
            <Smartphone size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-extrabold text-base leading-tight">Phone Repair Estimator</h3>
            <p className="text-xs text-slate-400">Select model & problem for an accurate quote</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1.5 text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full">
          <span className={step >= 1 ? 'text-indigo-400' : 'text-slate-500'}>1. Model</span>
          <ChevronRight size={12} className="text-slate-600" />
          <span className={step >= 2 ? 'text-indigo-400' : 'text-slate-500'}>2. Issue</span>
          <ChevronRight size={12} className="text-slate-600" />
          <span className={step >= 3 ? 'text-indigo-400' : 'text-slate-500'}>3. Quote</span>
        </div>
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* STEP 1: Select Brand & Model */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block mb-2.5">1. Select Brand</label>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {brands.map(b => (
                    <button
                      key={b.code}
                      onClick={() => handleSelectBrand(b.code)}
                      className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border shrink-0 ${
                        selectedBrand === b.code
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block mb-2">2. Search or Pick Model</label>
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={searchModelQ}
                    onChange={e => setSearchModelQ(e.target.value)}
                    placeholder="Search model (e.g. iPhone 15 Pro, Galaxy S24)..."
                    className="w-full pl-9 pr-4 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {models.map(m => (
                    <button
                      key={m.code}
                      onClick={() => handleSelectModel(m)}
                      className={`p-3 rounded-2xl text-left border transition-all ${
                        selectedModel?.code === m.code
                          ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 hover:border-indigo-300 bg-white'
                      }`}
                    >
                      <p className="font-bold text-xs text-slate-800">{m.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{m.seriesName || selectedBrand}</p>
                    </button>
                  ))}
                  {models.length === 0 && (
                    <div className="col-span-2 text-center py-6 bg-slate-50 rounded-2xl">
                      <p className="text-xs font-semibold text-slate-500">Model not listed?</p>
                      <button onClick={handleReportUnserved} className="mt-1 text-xs text-indigo-600 font-bold hover:underline">
                        Request model support & notify me
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Problem & Diagnostic Questions */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              <div className="flex items-center justify-between bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">{selectedModel?.name}</span>
                </div>
                <button onClick={() => setStep(1)} className="text-[11px] font-bold text-indigo-600 hover:underline">Change</button>
              </div>

              {flow && (
                <div className="space-y-4">
                  {flow.questions.map(q => {
                    // Check showIf condition if any
                    if (q.showIf) {
                      const reqKey = Object.keys(q.showIf)[0];
                      const reqVals = q.showIf[reqKey];
                      const selectedVal = selectedProblem || answers[reqKey];
                      if (!reqVals.includes(selectedVal)) return null;
                    }

                    return (
                      <div key={q.id} className="space-y-2">
                        <p className="text-xs font-bold text-slate-800">{q.text}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {q.options.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => {
                                if (q.id === 'q1') handleSelectProblem(opt);
                                else handleAnswerQuestion(q.id, opt);
                              }}
                              className={`p-3 rounded-2xl text-left border transition-all flex items-center justify-between ${
                                (selectedProblem === opt.id || answers[q.id] === opt.id)
                                  ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                                  : 'border-slate-200 hover:bg-slate-50 bg-white'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-800">{opt.label}</p>
                                {opt.description && <p className="text-[11px] text-slate-400 mt-0.5">{opt.description}</p>}
                              </div>
                              <CheckCircle2 size={16} className={(selectedProblem === opt.id || answers[q.id] === opt.id) ? 'text-indigo-600' : 'text-slate-200'} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleProceedToQuote}
                disabled={!selectedProblem}
                className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-lg shadow-indigo-200"
              >
                <span>Calculate Accurate Quote</span>
                <ArrowRight size={14} />
              </button>
            </motion.div>
          )}

          {/* STEP 3: Quality Tier & Final Quote */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                <p className="text-[10px] uppercase font-extrabold text-slate-400">Selected Repair</p>
                <p className="text-sm font-black text-slate-900">{selectedModel?.name} • {resolvedServiceCode.replace(/_/g, ' ')}</p>
              </div>

              {/* Part Quality Options */}
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block mb-2.5">Choose Part Quality</label>
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { tier: 'OEM', label: 'OEM Original Quality', desc: '100% Factory specs, highest brightness & durability', warranty: 180 },
                    { tier: 'Premium', label: 'Premium Grade', desc: 'High resolution, excellent color accuracy', warranty: 90 },
                    { tier: 'Compatible', label: 'Standard Compatible', desc: 'Reliable tested replacement with 60d warranty', warranty: 60 },
                    { tier: 'Budget', label: 'Budget Economy Tier', desc: 'Most affordable option, basic HD display & touch', warranty: 30 },
                  ].map(item => {
                    const matchV = variants.find(v => v.qualityTier === item.tier);
                    const priceRs = matchV ? Math.round(matchV.totalPricePaise / 100) : (item.tier === 'OEM' ? 3800 : item.tier === 'Premium' ? 2400 : item.tier === 'Compatible' ? 1500 : 800);

                    return (
                      <button
                        key={item.tier}
                        onClick={() => setSelectedTier(item.tier)}
                        className={`p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between ${
                          selectedTier === item.tier
                            ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 hover:bg-slate-50 bg-white'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-slate-900">{item.label}</span>
                            <span className="text-[10px] font-bold bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-200">{item.warranty} Days Warranty</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{item.desc}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-indigo-600">₹{priceRs}</p>
                          <p className="text-[10px] text-slate-400">All inclusive</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Confirm & Book */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button onClick={() => setStep(2)} className="text-xs font-bold text-slate-500 hover:text-slate-700">Back</button>
                <button
                  onClick={handleConfirmQuote}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-extrabold text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 flex items-center gap-2"
                >
                  <span>Lock Price & Confirm Location</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
