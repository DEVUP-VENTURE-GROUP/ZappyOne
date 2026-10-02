/**
 * BoostOfferCard
 * ---------------------------------------------------------------------------
 * Shown during the searching phase. Lets the user optionally increase the
 * worker incentive to get faster acceptance.
 *
 * UX principles:
 *   - Optional, never pressuring ("Faster acceptance available" not "Pay more")
 *   - Confirmation modal before any charge — no accidental taps
 *   - 100% of boost goes to worker earnings — transparent
 *   - Real price breakdown: Base + Platform Fee + Boost = Total
 *   - Vibration on confirm (Android)
 * ---------------------------------------------------------------------------
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronRight, X, ArrowRight, Flame, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

function buildOptions(amounts) {
  return (amounts ?? [10, 20, 30, 50, 100]).map((n) => ({
    amount: n,
    label:  `+₹${n}`,
    emoji:  n >= 100 ? '🚀' : n >= 30 ? '🔥' : '⚡',
  }));
}

export default function BoostOfferCard({ orderId, baseTotal, sendTip, boostOptions, boostMax, boostEnabled = true }) {
  if (!boostEnabled) return null;
  const [appliedBoost, setAppliedBoost] = useState(0);   // confirmed boosts
  const [pendingAmt, setPendingAmt]     = useState(null); // selected but unconfirmed
  const [confirming, setConfirming]     = useState(false);

  const BOOST_OPTIONS  = buildOptions(boostOptions);
  const maxBoostRs     = boostMax ?? 200;

  const totalWithBoost = baseTotal + appliedBoost;
  const newTotal       = pendingAmt ? baseTotal + appliedBoost + pendingAmt : null;

  function selectBoost(amt) {
    if (appliedBoost + amt > maxBoostRs) {
      toast.error(`Maximum boost is ₹${maxBoostRs}`);
      return;
    }
    setPendingAmt(amt);
    setConfirming(true);
  }

  async function confirmBoost() {
    if (!pendingAmt) return;
    setConfirming(false);
    const amt = pendingAmt;
    setPendingAmt(null);

    try {
      await sendTip({ orderId, amountPaise: amt * 100 }).unwrap();
      setAppliedBoost((prev) => prev + amt);
      try { navigator.vibrate?.([40, 30, 80, 30, 120]); } catch {}
      toast.success(
        amt >= 50
          ? `₹${amt} boost applied — workers are racing to accept!`
          : `₹${amt} added to worker offer — acceptance likely faster`,
        {
          duration: 3000,
          style: { background: '#0f172a', color: '#f8fafc', fontWeight: 700, border: '1px solid rgba(59,130,246,0.4)' },
          icon: amt >= 50 ? '🚀' : '⚡',
        }
      );
    } catch {
      toast.error('Could not apply boost. Try again.');
    }
  }

  function cancelBoost() {
    setPendingAmt(null);
    setConfirming(false);
  }

  return (
    <>
      {/* Main card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(#0f172a, #0f172a)',
          boxShadow: appliedBoost > 0
            ? '0 8px 32px rgba(249,115,22,0.18)'
            : '0 4px 20px rgba(15,23,42,0.20)',
          border: appliedBoost > 0
            ? '1px solid rgba(249,115,22,0.25)'
            : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Active boost indicator strip */}
        {appliedBoost > 0 && (
          <motion.div
            className="h-0.5"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{
              transformOrigin: 'left',
              background: 'linear-gradient(#f97316, #f97316)',
            }}
          />
        )}

        <div className="px-4 pt-4 pb-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: appliedBoost > 0 ? 'rgba(249,115,22,0.15)' : 'rgba(59,130,246,0.12)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {appliedBoost > 0
                  ? <Flame size={16} strokeWidth={2} className="text-orange-400" />
                  : <TrendingUp size={16} strokeWidth={2} className="text-zappy-400" />
                }
              </div>
              <div>
                <p className="text-[13px] font-black text-white leading-tight">
                  {appliedBoost > 0 ? 'Offer boosted — workers notified' : 'Faster acceptance available'}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                  {appliedBoost > 0
                    ? '100% of boost goes directly to worker earnings'
                    : 'Optionally increase worker incentive'}
                </p>
              </div>
            </div>
            {appliedBoost > 0 && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)' }}
              >
                <Zap size={10} strokeWidth={2.5} className="text-orange-400" />
                <span className="text-[11px] font-black text-orange-400">+₹{appliedBoost}</span>
              </motion.div>
            )}
          </div>

          {/* Boost amount buttons */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {BOOST_OPTIONS.map(({ amount, label }) => {
              const isSelected = amount === pendingAmt;
              return (
                <motion.button
                  key={amount}
                  onClick={() => selectBoost(amount)}
                  whileTap={{ scale: 0.88 }}
                  className="relative h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 overflow-hidden"
                  style={{
                    background: isSelected
                      ? 'linear-gradient(#c2410c, #c2410c)'
                      : 'rgba(255,255,255,0.06)',
                    border: isSelected
                      ? 'none'
                      : '1px solid rgba(255,255,255,0.09)',
                    boxShadow: isSelected ? '0 4px 16px rgba(249,115,22,0.4)' : 'none',
                  }}
                >
                  <span
                    className="text-[12px] font-black leading-none"
                    style={{ color: isSelected ? 'white' : 'rgba(255,255,255,0.5)' }}
                  >
                    {label}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Price row when boosted */}
          <AnimatePresence>
            {appliedBoost > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex-1 text-[11px] text-white/40 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Base price</span>
                      <span className="text-white/60">₹{baseTotal}</span>
                    </div>
                    <div className="flex justify-between text-orange-400/80">
                      <span>Worker boost</span>
                      <span>+₹{appliedBoost}</span>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-white/10 mx-1" />
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-white/30">Total</p>
                    <p className="text-base font-black text-white">₹{totalWithBoost}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirming && pendingAmt && (
          <motion.div
            key="confirm-overlay"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
              onClick={cancelBoost}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />

            {/* Sheet */}
            <motion.div
              className="relative w-full sm:max-w-sm rounded-t-sheet sm:rounded-2xl overflow-hidden"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              style={{ background: 'linear-gradient(#0f172a, #0f172a)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {/* Drag handle (mobile) */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* Close */}
              <button onClick={cancelBoost} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/08 flex items-center justify-center">
                <X size={14} className="text-white/50" />
              </button>

              <div className="px-6 pt-4 pb-8">
                {/* Icon */}
                <motion.div
                  className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,rgba(249,115,22,0.2),rgba(251,146,60,0.1))', border: '1px solid rgba(249,115,22,0.3)' }}
                  animate={{ boxShadow: ['0 0 0 0px rgba(249,115,22,0.2)', '0 0 0 10px rgba(249,115,22,0)', '0 0 0 0px rgba(249,115,22,0)'] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  <Zap size={24} strokeWidth={2} className="text-orange-400" />
                </motion.div>

                {/* Copy */}
                <p className="text-lg font-black text-white text-center leading-tight mb-1">
                  Increase worker incentive by ₹{pendingAmt}?
                </p>
                <p className="text-[13px] text-white/45 text-center leading-relaxed mb-6">
                  This amount goes <span className="text-white/70 font-semibold">100% to the worker</span> as extra earnings.
                  Workers see the higher offer and are more likely to accept your request faster.
                </p>

                {/* Price breakdown */}
                <div className="rounded-xl px-4 py-3 mb-6 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-white/40">Base price</span>
                    <span className="text-white/65">₹{baseTotal + appliedBoost}</span>
                  </div>
                  <div className="flex justify-between text-[12px] text-orange-400">
                    <span className="flex items-center gap-1.5">
                      <Zap size={10} strokeWidth={2.5} />
                      Worker boost
                    </span>
                    <span className="font-bold">+₹{pendingAmt}</span>
                  </div>
                  <div className="h-px bg-white/08" />
                  <div className="flex justify-between">
                    <span className="text-[12px] text-white/50">New total</span>
                    <motion.span
                      key={newTotal}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-[15px] font-black text-white"
                    >
                      ₹{newTotal}
                    </motion.span>
                  </div>
                </div>

                {/* CTA buttons */}
                <motion.button
                  onClick={confirmBoost}
                  whileTap={{ scale: 0.96 }}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white text-[15px] mb-3"
                  style={{ background: 'linear-gradient(#ea580c, #ea580c)', boxShadow: '0 4px 20px rgba(249,115,22,0.40)' }}
                >
                  <Zap size={16} strokeWidth={2.5} />
                  Confirm +₹{pendingAmt} boost
                  <ArrowRight size={14} strokeWidth={2.5} />
                </motion.button>

                <button
                  onClick={cancelBoost}
                  className="w-full py-3 rounded-2xl text-[13px] font-semibold text-white/40 hover:text-white/60 transition-colors"
                >
                  Keep standard offer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
