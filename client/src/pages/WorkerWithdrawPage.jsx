import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Wallet, Zap, Clock, ChevronRight, Loader2, Building2, Smartphone, AlertCircle, Info, Banknote, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetWorkerBankAccountsQuery, useGetWalletQuery, useRequestPayoutMutation } from '../services/api';

const MIN_PAISE = 5000;   // ₹50 — must match server payout.service.js
const MAX_PAISE = 2500000; // ₹25,000

const SETTLE_OPTS = [
  { id: 'instant',  label: 'Instant Transfer',   desc: 'Within 30 minutes',  feeRs: 9,   Icon: Zap,   color: 'amber' },
  { id: 'next_day', label: 'Next Day Transfer',   desc: 'By 9 AM tomorrow',   feeRs: 0,   Icon: Clock, color: 'indigo' },
];

export default function WorkerWithdrawPage() {
  const nav = useNavigate();
  const { data: walletData, isLoading: walletLoading } = useGetWalletQuery();
  const { data: bankData, isLoading: bankLoading } = useGetWorkerBankAccountsQuery();
  const [requestPayout, { isLoading: submitting }] = useRequestPayoutMutation();

  const [amountRs, setAmountRs] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [settlementType, setSettlementType] = useState('next_day');

  const balancePaise = walletData?.balance ?? 0;
  const balanceRs = (balancePaise / 100).toFixed(2);

  const banks = bankData?.banks ?? [];
  const upiIds = bankData?.upiIds ?? [];
  const allMethods = [
    ...banks.map(b => ({ id: b._id, type: 'bank', label: b.label || b.bankName || 'Bank Account', sub: b.accountNumber, isDefault: b.isDefault, accountName: b.accountName, ifsc: b.ifsc })),
    ...upiIds.map(u => ({ id: u._id, type: 'upi', label: u.label || 'UPI', sub: u.upiId, isDefault: u.isDefault })),
  ];
  const defaultMethod = allMethods.find(m => m.isDefault) ?? allMethods[0];
  const selected = allMethods.find(m => m.id === selectedId) ?? defaultMethod;

  const amtRs = parseFloat(amountRs) || 0;
  const feeRs = SETTLE_OPTS.find(o => o.id === settlementType)?.feeRs ?? 0;
  const netRs = Math.max(0, amtRs - feeRs);
  const amtPaise = Math.round(amtRs * 100);

  const validationError = amtPaise < MIN_PAISE && amtRs > 0
    ? `Minimum withdrawal is ₹${MIN_PAISE / 100}`
    : amtPaise > MAX_PAISE
    ? `Maximum withdrawal is ₹${MAX_PAISE / 100}`
    : amtPaise > balancePaise
    ? 'Insufficient wallet balance'
    : !selected
    ? 'Add a bank account or UPI ID first'
    : null;

  async function submit() {
    if (validationError) return toast.error(validationError);
    if (!amtRs) return toast.error('Enter an amount');

    // Build body matching payout.routes.js Joi schema exactly
    const body = {
      amountPaise: amtPaise,
      method: selected.type,
    };
    if (selected.type === 'upi') {
      body.upiId = selected.sub;
    } else {
      body.bankAccount = selected.sub; // masked account number
      body.bankIfsc = selected.ifsc ?? '';
      body.accountName = selected.accountName ?? '';
    }

    try {
      await requestPayout(body).unwrap();
      toast.success('Withdrawal requested successfully!');
      nav('/worker');
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to request withdrawal. Try again.');
    }
  }

  const isLoading = walletLoading || bankLoading;

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center md:bg-gradient-to-br md:from-slate-100 md:to-indigo-50/40">
      <div className="w-full max-w-lg lg:max-w-2xl bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] lg:shadow-[0_0_60px_rgba(0,0,0,0.08)] md:border-x border-slate-200/60 pb-8">
        
        {/* Cinematic Header */}
        <header className="relative pt-6 pb-28 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 6, repeat: Infinity, delay: 1 }} />
          
          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-8">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Withdraw Funds</h1>
              <div className="w-10 h-10" /> {/* Balancer */}
            </div>

            <div className="text-center">
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-1.5">Available Balance</p>
              <h2 className="text-white font-black text-5xl tracking-tight drop-shadow-lg flex items-center justify-center gap-1">
                <span className="text-3xl text-emerald-400 opacity-80">₹</span>{balanceRs}
              </h2>
              {balancePaise < MIN_PAISE && (
                <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-full border border-amber-500/30 text-xs font-bold backdrop-blur-sm">
                  <AlertCircle size={12} strokeWidth={2.5} /> Min. withdrawal ₹{MIN_PAISE / 100}
                </div>
              )}
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 relative z-20">
            <Loader2 size={28} className="animate-spin text-indigo-400 mb-3" />
            <p className="text-sm font-semibold text-slate-400">Loading wallet...</p>
          </div>
        ) : (
          <div className="relative z-20 px-4 -mt-16 space-y-5">
            
            {/* Amount Input */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Amount to Withdraw</p>
                <button onClick={() => setAmountRs(String(Math.min(Math.floor(balancePaise / 100), MAX_PAISE / 100)))} 
                  className="text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors uppercase tracking-wider">
                  Use Max
                </button>
              </div>
              
              <div className={`flex items-center gap-2 border-2 rounded-2xl px-4 py-3 transition-all duration-300 ${validationError && amtRs > 0 ? 'border-red-300 bg-red-50/50' : 'border-slate-100 focus-within:border-indigo-500 focus-within:shadow-[0_0_0_4px_rgba(99,102,241,0.1)]'}`}>
                <span className={`text-2xl font-black ${amtRs ? 'text-indigo-600' : 'text-slate-300'}`}>₹</span>
                <input
                  type="number" min={MIN_PAISE / 100} max={MAX_PAISE / 100} step={1}
                  value={amountRs} onChange={e => setAmountRs(e.target.value)}
                  placeholder="0" className={`flex-1 text-4xl font-black outline-none bg-transparent ${validationError && amtRs > 0 ? 'text-red-600' : 'text-slate-800'}`}
                />
              </div>
              
              <AnimatePresence>
                {validationError && amtRs > 0 && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-xs font-bold text-red-500 mt-2 flex items-center gap-1.5">
                    <AlertCircle size={12} strokeWidth={2.5} />{validationError}
                  </motion.p>
                )}
              </AnimatePresence>
              
              <div className="flex gap-2 mt-4">
                {[500, 1000, 2000, 5000].map(v => (
                  <button key={v} onClick={() => setAmountRs(String(v))}
                    className="flex-1 text-[13px] py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-bold hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors shadow-sm active:scale-95">
                    +₹{v}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Destination Selection */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Send To</p>
                <button onClick={() => nav('/worker/bank')} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md">
                  + Add New
                </button>
              </div>
              
              {allMethods.length === 0 ? (
                <button onClick={() => nav('/worker/bank')}
                  className="w-full py-6 flex flex-col items-center justify-center text-indigo-600 bg-indigo-50/50 border-2 border-dashed border-indigo-200 rounded-2xl hover:bg-indigo-50 transition-colors group">
                  <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Banknote size={20} className="text-indigo-500" strokeWidth={2} />
                  </div>
                  <span className="font-bold text-sm">Add Bank Account or UPI</span>
                  <span className="text-xs text-indigo-400 font-medium mt-0.5">Required to withdraw</span>
                </button>
              ) : (
                <div className="space-y-2.5">
                  {allMethods.map(m => {
                    const isSelected = selected?.id === m.id;
                    return (
                      <button key={m.id} onClick={() => setSelectedId(m.id)}
                        className={`w-full flex items-center gap-4 p-3.5 rounded-2xl border-2 transition-all duration-200 relative overflow-hidden ${isSelected ? 'border-indigo-500 bg-indigo-50/50 shadow-[0_4px_12px_rgba(99,102,241,0.08)]' : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'}`}>
                        
                        {isSelected && <div className="absolute inset-y-0 left-0 w-1 bg-indigo-500" />}
                        
                        <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-500'}`}>
                          {m.type === 'upi' ? <Smartphone size={18} strokeWidth={2} /> : <Building2 size={18} strokeWidth={2} />}
                        </div>
                        
                        <div className="flex-1 text-left min-w-0">
                          <p className={`text-[15px] font-black truncate leading-tight ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{m.label}</p>
                          <p className={`text-xs font-semibold truncate mt-0.5 ${isSelected ? 'text-indigo-600/70' : 'text-slate-400'}`}>{m.sub}</p>
                        </div>
                        
                        {m.isDefault && !isSelected && <span className="text-[9px] bg-slate-100 text-slate-500 font-bold uppercase tracking-wider px-2 py-1 rounded-md shrink-0">Default</span>}
                        
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Settlement Speed */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 space-y-3">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Transfer Speed</p>
              {SETTLE_OPTS.map(opt => {
                const Icon = opt.Icon;
                const active = settlementType === opt.id;
                const isAmber = opt.color === 'amber';
                return (
                  <button key={opt.id} onClick={() => setSettlementType(opt.id)}
                    className={`w-full flex items-center gap-4 p-3.5 rounded-2xl border-2 transition-all duration-200 relative overflow-hidden ${active ? `border-${opt.color}-500 bg-${opt.color}-50/50 shadow-sm` : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}>
                    
                    {active && <div className={`absolute inset-y-0 left-0 w-1 bg-${opt.color}-500`} />}
                    
                    <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 transition-colors ${active ? `bg-${opt.color}-600 text-white shadow-md shadow-${opt.color}-600/20` : 'bg-slate-100 text-slate-500'}`}>
                      <Icon size={18} strokeWidth={2.5} />
                    </div>
                    
                    <div className="flex-1 text-left">
                      <p className={`text-[14px] font-black leading-tight ${active ? `text-${opt.color}-900` : 'text-slate-700'}`}>{opt.label}</p>
                      <p className={`text-xs font-semibold mt-0.5 ${active ? `text-${opt.color}-700/70` : 'text-slate-400'}`}>{opt.desc}</p>
                    </div>
                    
                    <div className="text-right shrink-0 mr-3">
                      <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${opt.feeRs > 0 ? (active ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500') : (active ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-50 text-emerald-600')}`}>
                        {opt.feeRs > 0 ? `₹${opt.feeRs} Fee` : 'Free'}
                      </span>
                    </div>
                    
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${active ? `border-${opt.color}-600 bg-${opt.color}-600` : 'border-slate-300'}`}>
                      {active && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </motion.div>

            {/* Summary */}
            <AnimatePresence>
              {amtRs > 0 && !validationError && (
                <motion.div initial={{ opacity: 0, height: 0, scale: 0.95 }} animate={{ opacity: 1, height: 'auto', scale: 1 }} exit={{ opacity: 0, height: 0, scale: 0.95 }} 
                  className="bg-slate-800 rounded-[1.5rem] p-5 shadow-xl shadow-slate-900/10 text-white space-y-3 overflow-hidden">
                  <div className="flex justify-between items-center"><span className="text-slate-400 font-semibold text-sm">Withdrawal amount</span><span className="font-bold">₹{amtRs.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-400 font-semibold text-sm">Transfer fee</span><span className={`font-bold ${feeRs > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>-₹{feeRs.toFixed(2)}</span></div>
                  <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                    <span className="text-slate-200 font-black">You receive</span>
                    <span className="text-2xl font-black text-emerald-400">₹{netRs.toFixed(2)}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Security Notice */}
            <div className="flex items-start gap-2.5 bg-slate-100/80 rounded-2xl p-4 border border-slate-200 text-xs font-semibold text-slate-500 shadow-inner">
              <ShieldCheck size={16} className="shrink-0 text-emerald-500 mt-0.5" strokeWidth={2} />
              <p className="leading-relaxed">All withdrawals are securely processed. Instant transfers may take up to 30 mins depending on your bank's IMPS network status.</p>
            </div>

            {/* Submit Button */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="pt-2">
              <button
                onClick={submit}
                disabled={submitting || !!validationError || !amtRs || allMethods.length === 0 || balancePaise < MIN_PAISE}
                className="w-full py-4 rounded-[1.25rem] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:bg-indigo-600 shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98]">
                {submitting ? <Loader2 size={20} className="animate-spin" /> : <Wallet size={20} strokeWidth={2.5} />}
                {submitting ? 'Processing Request…' : `Withdraw ₹${netRs > 0 ? netRs.toFixed(2) : '0.00'}`}
              </button>
            </motion.div>
            
          </div>
        )}
      </div>
    </div>
  );
}
