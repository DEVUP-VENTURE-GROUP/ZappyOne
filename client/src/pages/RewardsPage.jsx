import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ChevronLeft, Gift, Sparkles, Coins, Loader2, Wallet, Clock } from 'lucide-react';
import { useGetRewardsQuery, useRedeemRewardPointsMutation, useScratchRewardCardMutation } from '@shared/services/api';
import { useT } from '@shared/i18n/I18nProvider';

function ScratchCard({ card, onScratch, revealing }) {
  const t = useT();
  const scratched = card.status === 'scratched';
  const r = card.reward;
  const label = scratched ? (r?.type === 'none' ? t('rewards.betterLuck', 'Better luck next time') : r?.label) : null;
  const win = scratched && r && r.type !== 'none';
  return (
    <motion.button
      onClick={() => !scratched && onScratch(card.id)}
      disabled={scratched || revealing}
      whileTap={{ scale: scratched ? 1 : 0.95 }}
      className="relative aspect-[4/5] rounded-2xl overflow-hidden shadow-md text-center flex flex-col items-center justify-center p-3"
      style={{ background: scratched ? (win ? 'linear-gradient(160deg,#ecfdf5,#fff)' : '#f8fafc') : 'linear-gradient(145deg,#3B82F6,#7c3aed)' }}
    >
      {scratched ? (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-1.5">
          {win ? <Sparkles size={26} className="text-emerald-500" /> : <Gift size={26} className="text-slate-300" />}
          <span className={`text-sm font-black leading-tight ${win ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</span>
          {win && <span className="text-[10px] font-bold text-emerald-500">{t('rewards.added', 'Added')} ✓</span>}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-white">
          {revealing ? <Loader2 size={26} className="animate-spin" /> : <Gift size={30} />}
          <span className="text-[11px] font-black uppercase tracking-widest opacity-90">{t('rewards.tapScratch', 'Tap to scratch')}</span>
          {card.expiresAt && (
            <span className="text-[9px] opacity-70 flex items-center gap-0.5">
              <Clock size={9} /> {t('rewards.exp', 'exp')} {new Date(card.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      )}
    </motion.button>
  );
}

const REASON_LABEL = { order: 'Order reward', referral: 'Referral bonus', referee_join: 'Welcome bonus', scratch: 'Scratch card', redeem: 'Redeemed to wallet', admin_grant: 'Bonus from Zappy' };

export default function RewardsPage() {
  const nav = useNavigate();
  const t = useT();
  const reasonLabel = (reason) => t(`rewards.reason.${reason}`, REASON_LABEL[reason] || reason);
  const { data, isLoading } = useGetRewardsQuery();
  const [redeem, { isLoading: redeeming }] = useRedeemRewardPointsMutation();
  const [scratch, { isLoading: scratching }] = useScratchRewardCardMutation();
  const [reveal, setReveal] = useState(null);

  const d = data || {};
  const points = d.points || 0;
  const canRedeem = points >= (d.minRedeemPoints || 100);

  async function doScratch(cardId) {
    try {
      const res = await scratch(cardId).unwrap();
      const r = res.reward;
      if (r && r.type !== 'none') { setReveal(r); toast.success(t('rewards.toast.won', 'You won {x}!').replace('{x}', r.label)); }
      else toast(t('rewards.toast.betterLuck', 'Better luck next time!'), { icon: '🎁' });
    } catch (err) { toast.error(err?.data?.error || t('rewards.toast.scratchFailed', 'Could not scratch')); }
  }

  async function doRedeem() {
    try {
      const res = await redeem(points).unwrap();
      toast.success(t('rewards.toast.redeemed', '₹{x} added to your wallet').replace('{x}', res.creditedRupees));
    } catch (err) { toast.error(err?.data?.error || t('rewards.toast.redeemFailed', 'Redeem failed')); }
  }

  const activeCards = (d.scratchCards || []).filter((c) => c.status === 'active');
  const scratchedCards = (d.scratchCards || []).filter((c) => c.status === 'scratched');

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><ChevronLeft size={18} className="text-slate-600" /></button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-zappy-600 flex items-center justify-center"><Gift size={16} className="text-white" /></div>
          <h1 className="font-extrabold text-lg text-[#0F172A]">{t('rewards.title', 'Rewards')}</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-zappy-500" /></div>
      ) : !d.enabled ? (
        <p className="text-center text-slate-400 py-20 text-sm">{t('rewards.comingSoon', 'Rewards are coming soon.')}</p>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
          {/* Points balance */}
          <div className="rounded-3xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#2563EB,#7c3aed)' }}>
            <div className="flex items-center gap-1.5 text-white/80 text-xs font-bold uppercase tracking-widest"><Coins size={14} /> {t('rewards.yourPoints', 'Your points')}</div>
            <div className="flex items-end justify-between mt-1">
              <span className="text-4xl font-black">{points.toLocaleString('en-IN')}</span>
              <span className="text-sm text-white/80 mb-1">≈ ₹{d.redeemableRupees || 0}</span>
            </div>
            <button onClick={doRedeem} disabled={!canRedeem || redeeming}
              className="mt-4 w-full bg-white/15 hover:bg-white/25 backdrop-blur border border-white/20 rounded-xl py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
              {redeeming ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
              {canRedeem ? t('rewards.redeemAll', 'Redeem all → ₹{x}').replace('{x}', d.redeemableRupees) : t('rewards.earnMore', 'Earn {n} more to redeem').replace('{n}', (d.minRedeemPoints || 100) - points)}
            </button>
          </div>

          {/* Active scratch cards */}
          {activeCards.length > 0 && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5"><Sparkles size={13} className="text-zappy-500" /> {t('rewards.scratchWin', 'Scratch & win')}</p>
              <div className="grid grid-cols-3 gap-3">
                {activeCards.map((c) => <ScratchCard key={c.id} card={c} onScratch={doScratch} revealing={scratching} />)}
              </div>
            </div>
          )}

          {/* Recently revealed */}
          {scratchedCards.length > 0 && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{t('rewards.recentlyOpened', 'Recently opened')}</p>
              <div className="grid grid-cols-3 gap-3">
                {scratchedCards.slice(0, 6).map((c) => <ScratchCard key={c.id} card={c} onScratch={() => {}} />)}
              </div>
            </div>
          )}

          {activeCards.length === 0 && scratchedCards.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Gift size={40} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">{t('rewards.earnHint', 'Complete a booking to earn scratch cards and points.')}</p>
            </div>
          )}

          {/* History */}
          {(d.history || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-2">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 px-2 pt-2 pb-1">{t('rewards.pointsActivity', 'Points activity')}</p>
              {d.history.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-2.5 border-t border-slate-50 first:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{reasonLabel(h.reason)}</p>
                    <p className="text-[11px] text-slate-400">{new Date(h.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <span className={`text-sm font-black ${h.delta >= 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{h.delta >= 0 ? '+' : ''}{h.delta}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reward reveal celebration */}
      <AnimatePresence>
        {reveal && (
          <motion.div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReveal(null)}>
            <motion.div initial={{ scale: 0.5, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.5, opacity: 0 }}
              className="bg-white rounded-3xl p-7 text-center max-w-xs w-full">
              <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                <Sparkles size={48} className="mx-auto text-amber-400" />
              </motion.div>
              <p className="text-2xl font-black text-slate-900 mt-3">{t('rewards.youWon', 'You won!')}</p>
              <p className="text-lg font-bold text-zappy-600 mt-1">{reveal.label}</p>
              <p className="text-sm text-slate-500 mt-1">{reveal.type === 'cashback' ? t('rewards.toWallet', 'Added to your wallet') : t('rewards.toBalance', 'Points added to your balance')}</p>
              <button onClick={() => setReveal(null)} className="mt-5 w-full bg-slate-900 text-white font-bold py-3 rounded-xl">{t('rewards.awesome', 'Awesome')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
