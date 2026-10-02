import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Loader2,
  Wallet,
  Gift,
  Trophy,
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  Percent,
  Users,
  Star,
  RefreshCw,
  Crown,
  ShieldCheck,
  ChevronRight,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import {
  useGetWalletQuery, useWalletTransactionsQuery,
  useWalletTopupMutation, useVerifyPaymentMutation,
} from '@shared/services/api';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { openCheckout } from '@shared/services/cashfree';
import PageTransition from '../components/common/PageTransition';
import { staggerContainer, fadeInUp, scaleIn } from '../lib/animations';
import { useT } from '@shared/i18n/I18nProvider';
import toast from 'react-hot-toast';

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export default function WalletPage() {
  const nav = useNavigate();
  const tr = useT();
  const { profile } = useSelector(selectAuth);
  const { data: wallet, refetch: refetchWallet, isError: walletError } = useGetWalletQuery();
  const { data: txns, refetch: refetchTxns } = useWalletTransactionsQuery({ page: 1 });
  const [topup, { isLoading: starting }] = useWalletTopupMutation();
  const [verify] = useVerifyPaymentMutation();
  const [busy, setBusy] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [showAddMoney, setShowAddMoney] = useState(false);

  const isFrozen = wallet?.wallet?.isFrozen;
  const balance = (wallet?.wallet?.balancePaise || 0) / 100;

  async function handleTopup(amountRs) {
    try {
      setBusy(true);
      const orderInfo = await topup(amountRs * 100).unwrap();
      const checkoutResp = await openCheckout({
        paymentSessionId: orderInfo.paymentSessionId,
        cfOrderId:        orderInfo.cfOrderId,
        cashfreeEnv:      orderInfo.cashfreeEnv || 'sandbox',
        amountPaise:      orderInfo.amountPaise,
        purpose:          'Wallet Top-up',
      });
      await verify({
        cfOrderId:   checkoutResp.cfOrderId,
        cfPaymentId: checkoutResp.cfPaymentId,
      }).unwrap();
      toast.success(tr('wallet.toast.added', '₹{n} added to wallet!').replace('{n}', amountRs));
      setCustomAmount('');
      setShowAddMoney(false);
      refetchWallet();
      refetchTxns();
    } catch (err) {
      const msg = err?.message || err?.data?.error || tr('wallet.toast.failed', 'Top-up failed');
      if (msg.includes('cancelled')) toast(tr('wallet.toast.cancelled', 'Payment cancelled'));
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleCustomTopup(e) {
    e.preventDefault();
    const amt = parseInt(customAmount, 10);
    if (!amt || amt < 10) { toast.error(tr('wallet.toast.minTopup', 'Minimum top-up is ₹10')); return; }
    handleTopup(amt);
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 md:flex md:justify-center">
        <div className="w-full max-w-md bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] md:border-x border-slate-200/60 overflow-hidden">

          {walletError && (
            <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2">
              <span className="text-xs font-semibold text-rose-700">{tr('wallet.refreshFailed', "Couldn't refresh your balance")}</span>
              <button onClick={() => { refetchWallet(); refetchTxns(); }} className="text-xs font-bold text-rose-600 underline">{tr('wallet.retry', 'Retry')}</button>
            </div>
          )}

          {/* Balance first, then the one thing you do here: add money. */}
          <header className="page-header">
            <div className="page-header-inner">
              <button onClick={() => nav(-1)} className="back-btn" aria-label="Back"><ArrowLeft size={18} /></button>
              <h1 className="h-card">{tr('wallet.title', 'Wallet')}</h1>
            </div>
          </header>
          <div className="px-4 pt-4">
            <section className="card">
              <p className="t-label">{tr('wallet.availableBalance', 'Available balance')}</p>
              <p className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink-900 tabular-nums">
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </p>
              {isFrozen ? (
                <p className="chip mt-3 bg-red-50 text-red-700"><AlertCircle size={13} /> {tr('wallet.frozen', 'Wallet frozen. Contact support.')}</p>
              ) : (
                <button onClick={() => setShowAddMoney(!showAddMoney)} className="btn-primary mt-4 w-full sm:w-auto">
                  <Plus size={16} /> {tr('wallet.addMoney', 'Add money')}
                </button>
              )}
            </section>
          </div>

          <div className="relative px-4 pt-4 space-y-5 pb-36">
            
            <AnimatePresence>
              {showAddMoney && !isFrozen && (
                <motion.div initial={{ opacity: 0, y: -20, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -20, height: 0 }} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-5 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{tr('wallet.quickTopup', 'Quick Top-up')}</p>
                    <button onClick={() => setShowAddMoney(false)} className="text-[11px] font-bold text-slate-400 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">{tr('common.cancel', 'Cancel')}</button>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {QUICK_AMOUNTS.map((amt) => (
                      <button key={amt} onClick={() => handleTopup(amt)} disabled={busy || starting}
                        className="py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-700 font-black text-sm hover:border-zappy-500 hover:text-zappy-600 transition-all active:scale-95 disabled:opacity-50">
                        +₹{amt}
                      </button>
                    ))}
                  </div>
                  
                  <form onSubmit={handleCustomTopup} className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-black text-slate-400">₹</span>
                      <input type="number" min="10" placeholder={tr('wallet.customAmount', 'Custom amount')} value={customAmount} onChange={(e) => setCustomAmount(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-zappy-500 focus:bg-white rounded-[1.25rem] py-3.5 pl-9 pr-4 text-[15px] font-black text-slate-800 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium" />
                    </div>
                    <button type="submit" disabled={busy || !customAmount} className="bg-zappy-600 text-white px-5 rounded-[1.25rem] font-black text-sm flex items-center justify-center shadow-lg shadow-zappy-600/20 active:scale-95 transition-all disabled:opacity-50">
                      {busy ? <Loader2 size={18} className="animate-spin" /> : tr('wallet.add', 'Add')}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Referral: the real reward (server REFERRER_REWARD_PAISE), stated plainly. */}
            <button type="button" onClick={() => nav('/referral')} className="card flex w-full items-center gap-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-sunken text-ink-700"><Gift size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink-900">{tr('wallet.referTitle', 'Refer a friend, get ₹100')}</span>
                <span className="block text-[13px] text-ink-500">{tr('wallet.referLine', 'Paid to your wallet when they complete their first booking.')}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-400" />
            </button>

            {/* Transactions */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-[1.5rem] border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{tr('wallet.recentActivity', 'Recent Activity')}</p>
                {txns?.items?.length > 0 && <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{tr('wallet.records', '{n} records').replace('{n}', txns.items.length)}</span>}
              </div>

              <div className="divide-y divide-slate-100">
                {!txns?.items?.length ? (
                  <div className="py-12 text-center flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                      <Receipt size={24} className="text-slate-300" strokeWidth={1.5} />
                    </div>
                    <p className="text-[15px] font-black text-slate-700">{tr('wallet.noTxns', 'No Transactions')}</p>
                    <p className="text-[13px] text-slate-500 font-medium mt-1 px-4">{tr('wallet.noTxnsHint', 'Your wallet activity, deposits, and withdrawals will appear here.')}</p>
                  </div>
                ) : (
                  txns.items.map((t, i) => {
                    const positive = t.amountPaise > 0;
                    const TXN_META = {
                      cashback:                { Icon: Gift, bg: 'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-600', label: tr('wallet.txn.cashback', 'Cashback Reward') },
                      referral_reward:         { Icon: Gift,     bg: 'bg-rose-50 border-rose-100 text-rose-600',   label: tr('wallet.txn.referral', 'Referral Bonus') },
                      admin_adjustment_credit: { Icon: Crown,    bg: 'bg-amber-50 border-amber-100 text-amber-600',  label: tr('wallet.txn.bonusCredit', 'Bonus Credit') },
                      admin_adjustment_debit:  { Icon: Receipt,  bg: 'bg-slate-50 border-slate-200 text-slate-600',    label: tr('wallet.txn.adjustmentDebit', 'Adjustment Debit') },
                      wallet_topup:            { Icon: ArrowDownToLine, bg: 'bg-emerald-50 border-emerald-100 text-emerald-600', label: tr('wallet.txn.topup', 'Top-up Added') },
                      withdrawal:              { Icon: ArrowUpFromLine, bg: 'bg-zappy-50 border-zappy-100 text-zappy-600',  label: tr('wallet.txn.withdrawal', 'Withdrawal') },
                      refund:                  { Icon: RefreshCw, bg: 'bg-sky-50 border-sky-100 text-sky-600',    label: tr('wallet.txn.refund', 'Refund') },
                      worker_earning:          { Icon: TrendingUp, bg: 'bg-emerald-50 border-emerald-100 text-emerald-600', label: tr('wallet.txn.earnings', 'Job Earnings') },
                      platform_commission:     { Icon: Percent,  bg: 'bg-slate-50 border-slate-200 text-slate-500',  label: tr('wallet.txn.platformFee', 'Platform Fee') },
                      cancellation_fee:        { Icon: AlertCircle, bg: 'bg-rose-50 border-rose-100 text-rose-600',   label: tr('wallet.txn.cancelFee', 'Cancel Fee') },
                      subscription_revenue:    { Icon: Star,     bg: 'bg-amber-50 border-amber-100 text-amber-600',  label: tr('wallet.txn.subscription', 'Subscription') },
                    };

                    const meta = TXN_META[t.reason] || (positive
                      ? { Icon: TrendingUp,   bg: 'bg-emerald-50 border-emerald-100 text-emerald-600',  label: t.reason?.replace(/_/g, ' ') || tr('wallet.txn.credit', 'Credit') }
                      : { Icon: TrendingDown, bg: 'bg-slate-50 border-slate-200 text-slate-600',    label: t.reason?.replace(/_/g, ' ') || tr('wallet.txn.debit', 'Debit') });
                    
                    const { Icon: TxnIcon, bg, label } = meta;
                    const isReward = ['cashback', 'referral_reward', 'admin_adjustment_credit'].includes(t.reason);

                    return (
                      <motion.div key={t._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + (i * 0.05) }}
                        className={`flex items-center gap-4 p-4 transition-colors hover:bg-slate-50 ${isReward ? 'bg-gradient-to-r from-fuchsia-50/30 to-transparent' : ''}`}>
                        
                        <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 border shadow-sm ${bg}`}>
                          <TxnIcon size={20} strokeWidth={2} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-[14px] font-black text-slate-800 truncate leading-tight">{label}</p>
                            {isReward && <span className="text-[9px] font-black bg-fuchsia-500 text-white px-2 py-0.5 rounded shadow-sm uppercase tracking-widest shrink-0">{tr('wallet.reward', 'Reward')}</span>}
                          </div>
                          <p className="text-[11px] font-bold text-slate-400">
                            {new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <p className={`font-black text-[16px] ${positive ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {positive ? '+' : ''}₹{Math.abs(t.amountPaise) / 100}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

    </PageTransition>
  );
}
