import { useState } from 'react';
import SEO, { PLANS_SCHEMA, BASE_URL } from '@shared/components/SEO';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle2, Zap, ShieldOff, Award, TrendingUp, TrendingDown,
  Target, Loader2, AlertCircle, Crown, Star, Shield, Rocket, Check, X
} from 'lucide-react';
import {
  useListPlansQuery, useMySubscriptionQuery,
  useSubscribeMutation, useCancelSubscriptionMutation, useVerifyPaymentMutation,
} from '@shared/services/api';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { openCheckout } from '@shared/services/cashfree';
import toast from 'react-hot-toast';

export default function PlansPage() {
  const nav = useNavigate();
  const { profile, role } = useSelector(selectAuth);
  const audience = role === 'worker' ? 'worker' : 'user';
  const { data: plansData, isLoading } = useListPlansQuery(audience);
  const { data: subData, refetch: refetchSub } = useMySubscriptionQuery();
  const [subscribe] = useSubscribeMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [cancel] = useCancelSubscriptionMutation();
  const [purchasing, setPurchasing] = useState(null);
  const [showCancel, setShowCancel] = useState(false);

  const activeSub = subData?.subscription;

  async function handleSubscribe(plan) {
    try {
      setPurchasing(plan.code);
      const orderInfo = await subscribe(plan.code).unwrap();
      const checkoutResp = await openCheckout({
        paymentSessionId: orderInfo.paymentSessionId,
        cfOrderId:        orderInfo.cfOrderId,
        cashfreeEnv:      orderInfo.cashfreeEnv || 'sandbox',
        amountPaise:      orderInfo.amountPaise,
        purpose:          `${plan.name} Plan`,
      });
      await verifyPayment({
        cfOrderId:   checkoutResp.cfOrderId,
        cfPaymentId: checkoutResp.cfPaymentId,
      }).unwrap();
      toast.success(`${plan.name} activated!`);
      refetchSub();
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Subscription failed';
      if (msg.includes('cancelled')) toast('Payment cancelled');
      else toast.error(msg);
    } finally {
      setPurchasing(null);
    }
  }

  async function handleCancel() {
    try {
      await cancel(activeSub._id).unwrap();
      toast.success('Subscription cancelled');
      setShowCancel(false);
      refetchSub();
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to cancel');
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 size={32} className="text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center">
      <SEO
        title="Zappy Premium Plans — No Surge Pricing, Max Cashback | Zappy India"
        description="Upgrade to Zappy Premium. Get zero surge pricing, zero platform fees, 10% cashback, and priority worker dispatch. Plans starting from ₹99/month."
        canonical={`${BASE_URL}/plans`}
        keywords="Zappy premium, Zappy gold, Zappy platinum, home services subscription India, no surge pricing app"
        jsonLd={PLANS_SCHEMA}
      />
      <div className="w-full max-w-lg bg-slate-900 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.2)] md:border-x border-slate-800 pb-12 overflow-hidden">
        
        {/* Dark Cinematic Background */}
        <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px]" />
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-500/20 rounded-full blur-[100px]" />
          <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-slate-900/0 via-slate-900/80 to-slate-900" />
        </div>

        <header className="relative z-10 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-900/50 backdrop-blur-xl border-b border-white/5">
          <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors border border-white/10">
            <ArrowLeft size={20} strokeWidth={2.5} />
          </motion.button>
          <div className="text-center">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{audience === 'worker' ? 'Partner Pro' : 'Zappy Premium'}</p>
            <h1 className="text-white font-black tracking-wide text-[15px]">Subscription Plans</h1>
          </div>
          <div className="w-10 h-10" />
        </header>

        <div className="relative z-10 px-4 pt-6 space-y-6">

          {/* Hero */}
          <div className="text-center pb-4">
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }} className="w-20 h-20 bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(251,191,36,0.3)] border-4 border-slate-900">
              <Crown size={36} className="text-slate-900" strokeWidth={2} />
            </motion.div>
            <motion.h2 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-3xl font-black text-white mb-3">
              {audience === 'worker' ? 'Maximize Your Earnings' : 'Experience Zappy Premium'}
            </motion.h2>
            <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="text-slate-400 font-medium px-4">
              {audience === 'worker' ? 'Keep more of what you earn, get priority matching, and unlock premium badges.' : 'No surge pricing, priority matching, and exclusive premium support.'}
            </motion.p>
          </div>

          {/* Active plan banner */}
          <AnimatePresence>
            {activeSub && !showCancel && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, scale: 0.9 }} className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-[1.5rem] p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 size={24} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Active Plan</p>
                      <p className="font-black text-white text-lg tracking-wide">{activeSub.planCode}</p>
                      <p className="text-[11px] font-medium text-emerald-200/70 mt-0.5">Renews {new Date(activeSub.endAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowCancel(true)} className="text-[11px] font-bold text-slate-400 bg-white/5 hover:bg-white/10 hover:text-white px-3 py-1.5 rounded-lg transition-colors border border-white/5">
                    Manage
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cancel confirmation */}
          <AnimatePresence>
            {showCancel && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-[1.5rem] p-5 space-y-4 shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                    <AlertCircle size={20} className="text-rose-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="font-bold text-white text-[15px]">Cancel Subscription?</p>
                    <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">If you cancel, you will lose your premium benefits at the end of your current billing cycle.</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowCancel(false)} className="flex-1 bg-white/10 hover:bg-white/15 text-white font-bold py-3 rounded-xl transition-colors">Keep Plan</button>
                  <button onClick={handleCancel} className="flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-bold py-3 rounded-xl transition-colors">Yes, Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Commission Calculator — workers only */}
          {audience === 'worker' && <CommissionCalculator plans={plansData?.plans ?? []} activePlanCode={activeSub?.planCode} />}

          {/* Plans */}
          <div className="space-y-6 pt-4 pb-8">
            {(plansData?.plans?.length === 0) && (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-3xl">
                <Crown size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No plans available right now</p>
              </div>
            )}

            {plansData?.plans?.map((plan, idx) => {
              const isCurrent  = activeSub?.planCode === plan.code;
              const isPremium  = idx > 0;
              const price      = plan.priceInPaise / 100;
              const monthLabel = plan.durationDays === 30 ? '/mo' : `/${plan.durationDays}d`;

              return (
                <motion.div
                  key={plan.code}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + (idx * 0.1) }}
                  className={`relative rounded-[2rem] overflow-hidden ${isPremium ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 p-[2px]' : 'bg-slate-800 p-[1px]'}`}
                >
                  {/* Metallic Border Effect Container */}
                  <div className={`h-full w-full rounded-[2rem] overflow-hidden ${isPremium ? 'bg-slate-900' : 'bg-slate-800/80'} backdrop-blur-xl relative`}>
                    
                    {/* Glow effect for premium */}
                    {isPremium && (
                      <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/30 rounded-full blur-[50px]" />
                    )}

                    {isPremium && (
                      <div className="bg-gradient-to-r from-amber-400 to-orange-500 py-1.5 px-4 flex items-center justify-center gap-2 relative z-10 shadow-md shadow-amber-500/20">
                        <Star size={12} strokeWidth={2.5} className="text-white fill-white drop-shadow-md" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest drop-shadow-md">Recommended</span>
                        <Star size={12} strokeWidth={2.5} className="text-white fill-white drop-shadow-md" />
                      </div>
                    )}

                    <div className="p-6 relative z-10">
                      {isCurrent && (
                        <div className="inline-flex items-center gap-1.5 mb-4 text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 rounded-full shadow-inner">
                          <CheckCircle2 size={12} strokeWidth={3} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Active Now</span>
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className={`font-black text-2xl tracking-tight ${isPremium ? 'bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-amber-500' : 'text-white'}`}>{plan.name}</h3>
                          {plan.description && <p className="text-[13px] text-slate-400 mt-1.5 max-w-[200px] leading-relaxed">{plan.description}</p>}
                          {plan.trialDays > 0 && (
                            <span className={`inline-flex items-center gap-1.5 mt-3 text-[10px] font-black px-2.5 py-1 rounded border uppercase tracking-widest ${isPremium ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                              <Zap size={10} strokeWidth={2.5} />
                              {plan.trialDays} Day Free Trial
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="flex items-start justify-end">
                            <span className={`text-sm font-bold mt-1.5 mr-0.5 ${isPremium ? 'text-amber-500' : 'text-slate-400'}`}>₹</span>
                            <span className="text-4xl font-black text-white tracking-tight">{price}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-1">{monthLabel}</p>
                        </div>
                      </div>

                      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent mb-6" />

                      {/* Benefits */}
                      <PlanBenefits effects={plan.effects} audience={audience} isPremium={isPremium} />

                      {/* CTA */}
                      <button
                        onClick={() => handleSubscribe(plan)}
                        disabled={isCurrent || !!activeSub || purchasing === plan.code}
                        className={`w-full mt-8 py-4 rounded-[1.25rem] font-black text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                          isCurrent
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isPremium
                            ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40'
                            : 'bg-white/10 text-white hover:bg-white/20 border border-white/5'
                        } disabled:opacity-60 disabled:hover:scale-100`}
                      >
                        {purchasing === plan.code ? (
                          <><Loader2 size={18} className="animate-spin" /> Processing…</>
                        ) : isCurrent ? (
                          <><CheckCircle2 size={18} strokeWidth={2.5} /> Your Current Plan</>
                        ) : activeSub ? (
                          'Cancel Current Plan First'
                        ) : (
                          <><Rocket size={18} strokeWidth={2.5} /> Upgrade to {plan.name}</>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanBenefits({ effects, audience, isPremium }) {
  const items = [];
  if (audience === 'user') {
    if (effects?.surgeCap === 1.0) items.push({ text: 'No surge pricing, ever' });
    else if (effects?.surgeCap) items.push({ text: `Surge capped at ${effects.surgeCap}×` });
    if (effects?.waivePlatformFee) items.push({ text: 'Zero platform fees on bookings' });
    if (effects?.priorityAssignment) items.push({ text: 'Priority worker assignment' });
  } else {
    if (effects?.commissionDelta < 0) {
      items.push({ text: `${Math.abs(effects.commissionDelta * 100).toFixed(0)}% lower platform commission` });
    }
    if (effects?.proBoost) items.push({ text: 'Pro badge on your profile' });
    if (effects?.visibilityMultiplier > 1) items.push({ text: `${effects.visibilityMultiplier}× more job offers sent to you` });
  }

  if (!items.length) return null;

  return (
    <div className="space-y-3.5">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">What's Included</p>
      {items.map(({ text }, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isPremium ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-300'}`}>
            <Check size={12} strokeWidth={3} />
          </div>
          <span className="text-[14px] text-slate-300 font-medium leading-snug">{text}</span>
        </div>
      ))}
    </div>
  );
}

function CommissionCalculator({ plans, activePlanCode }) {
  const [weeklyJobs, setWeeklyJobs] = useState(10);
  const [avgJobRs, setAvgJobRs] = useState(500);

  const basePct = 20;
  const weeklyGross = weeklyJobs * avgJobRs;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-[1.5rem] p-5 shadow-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-inner">
          <TrendingUp size={18} strokeWidth={2.5} className="text-indigo-400" />
        </div>
        <div>
          <p className="font-black text-white text-[15px] tracking-wide">ROI Calculator</p>
          <p className="text-[11px] font-medium text-slate-400">See how much you can save</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-700/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Jobs / week</p>
          <input type="number" min={1} max={100} value={weeklyJobs} onChange={e => setWeeklyJobs(Number(e.target.value) || 1)}
            className="w-full text-xl font-black text-white outline-none bg-transparent px-1" />
        </div>
        <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-700/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Avg Job (₹)</p>
          <div className="flex items-center gap-1 px-1">
            <span className="text-slate-500 font-bold">₹</span>
            <input type="number" min={100} max={10000} step={50} value={avgJobRs} onChange={e => setAvgJobRs(Number(e.target.value) || 100)}
              className="w-full text-xl font-black text-white outline-none bg-transparent" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700">
          <div>
            <p className="text-[13px] font-bold text-slate-300">Basic Tier</p>
            <p className="text-[10px] font-bold text-slate-500">{basePct}% fee</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-black text-white">₹{Math.round(weeklyGross * (1 - basePct / 100)).toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-bold text-slate-500">-₹{Math.round(weeklyGross * basePct / 100).toLocaleString('en-IN')} fee</p>
          </div>
        </div>
        
        {plans.filter(p => p.audience === 'worker' || !p.audience).map(plan => {
          const commPct = basePct + (plan.effects?.commissionDelta ?? 0) * 100;
          const net = Math.round(weeklyGross * (1 - commPct / 100));
          const feeAmt = Math.round(weeklyGross * commPct / 100);
          const baseNet = Math.round(weeklyGross * (1 - basePct / 100));
          const savingsWk = net - baseNet;
          const savingsMo = savingsWk * 4.3;
          const isActive = activePlanCode === plan.code;
          return (
            <div key={plan.code} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isActive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30'}`}>
              <div>
                <p className={`text-[13px] font-bold ${isActive ? 'text-emerald-400' : 'text-amber-400'}`}>{plan.name} {isActive && <span className="text-[9px] uppercase tracking-widest bg-emerald-500/20 px-1.5 py-0.5 rounded ml-1">Active</span>}</p>
                <p className="text-[10px] font-bold text-slate-400">{Math.round(commPct)}% fee · ₹{Math.round(plan.priceInPaise / 100)}/mo</p>
              </div>
              <div className="text-right">
                <p className={`text-[15px] font-black ${isActive ? 'text-emerald-400' : 'text-amber-400'}`}>₹{net.toLocaleString('en-IN')}</p>
                {savingsWk > 0 ? (
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-sm inline-block mt-1">+₹{Math.round(savingsMo).toLocaleString('en-IN')}/mo extra</p>
                ) : (
                  <p className="text-[10px] font-bold text-slate-500 mt-1">-₹{feeAmt.toLocaleString('en-IN')} fee</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
