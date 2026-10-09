import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Landmark, Smartphone, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useShopPayoutsQuery, useRequestShopPayoutMutation, useGetWorkerBankAccountsQuery } from '@shared/services/api';
import { useOtpGate } from '@shared/components/common/OtpGate';
import { formatPaise } from '@shared/utils/money';

/**
 * Withdraw — what ZappyOne owes the shop, and asking for it (server shop/shop-payout).
 * Earned online (jobs, tips, surge shares) minus what the shop owes from cash
 * jobs minus payouts already asked for. Paid to a saved bank account or UPI id.
 */
const STATUS = {
  requested: ['On its way', Clock, 'text-amber-700 bg-amber-50'],
  paid: ['Paid', CheckCircle2, 'text-emerald-700 bg-emerald-50'],
  rejected: ['Not sent', XCircle, 'text-red-700 bg-red-50'],
};

export default function ShopWithdrawPage() {
  const nav = useNavigate();
  const { data, isLoading } = useShopPayoutsQuery();
  const { data: accounts } = useGetWorkerBankAccountsQuery();
  const [request, { isLoading: sending }] = useRequestShopPayoutMutation();
  const otp = useOtpGate();
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState(null);

  const options = useMemo(() => [
    ...(accounts?.banks || []).map((b) => ({ key: `bank:${b._id}`, type: 'bank', id: b._id, label: `${b.bankName || b.label || 'Bank'} · ${b.accountNumber}`, isDefault: b.isDefault })),
    ...(accounts?.upiIds || []).map((u) => ({ key: `upi:${u._id}`, type: 'upi', id: u._id, label: u.upiId, isDefault: u.isDefault })),
  ], [accounts]);
  useEffect(() => { if (!dest && options.length) setDest(options.find((o) => o.isDefault) || options[0]); }, [options, dest]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-zappy-500" /></div>;
  const b = data || {};
  const paise = Math.round(Number(amount || 0) * 100);

  async function submit() {
    if (!dest) return toast.error('Add a bank account or UPI id first');
    try {
      const r = await otp.run(() => request({ amountPaise: paise, type: dest.type, accountId: dest.id }).unwrap());
      toast.success(r.message);
      setAmount('');
    } catch (err) { if (err?.message !== 'cancelled') toast.error(err?.data?.error || 'Could not ask for the payout'); }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      {otp.modal}
      <header className="page-header"><div className="page-header-inner">
        <button type="button" onClick={() => nav('/shop')} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">Withdraw</h1>
      </div></header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 lg:max-w-2xl">
        <section className="rounded-3xl bg-[#0F172A] p-5 text-white">
          <p className="text-[12px] font-semibold text-white/60">Available to withdraw</p>
          <p className="mt-1 text-[32px] font-black tabular-nums">{formatPaise(b.availablePaise)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
            <div><p className="text-white/50">Earned online</p><p className="font-bold tabular-nums">{formatPaise(b.earnedPaise)}</p></div>
            <div><p className="text-white/50">Owed from cash jobs</p><p className="font-bold tabular-nums">− {formatPaise(b.owedPaise)}</p></div>
            <div><p className="text-white/50">Paid out</p><p className="font-bold tabular-nums">− {formatPaise(b.paidOutPaise)}</p></div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm font-bold text-slate-900">Ask for a payout</p>
          {!options.length ? (
            <button type="button" onClick={() => nav('/shop/bank')} className="w-full rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm font-semibold text-zappy-700">
              Add a bank account or UPI id first
            </button>
          ) : (
            <>
              <div className="space-y-2">
                {options.map((o) => (
                  <button key={o.key} type="button" onClick={() => setDest(o)}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${dest?.key === o.key ? 'border-zappy-600 bg-zappy-50' : 'border-slate-200'}`}>
                    {o.type === 'bank' ? <Landmark size={16} className="text-slate-500" /> : <Smartphone size={16} className="text-slate-500" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{o.label}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center rounded-xl border border-slate-200 px-3">
                <span className="text-slate-400">₹</span>
                <input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`At least ${formatPaise(b.minPaise)}`}
                  className="w-full bg-transparent px-2 py-2.5 text-sm tabular-nums outline-none" />
                <button type="button" onClick={() => setAmount(String(Math.floor((b.availablePaise || 0) / 100)))} className="text-[12px] font-bold text-zappy-600">All</button>
              </label>
              <button type="button" onClick={submit} disabled={sending || b.open || paise < (b.minPaise || 0) || paise > (b.availablePaise || 0)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0F172A] text-sm font-bold text-white disabled:opacity-40">
                {sending && <Loader2 size={15} className="animate-spin" />} {b.open ? 'A payout is already on its way' : `Withdraw ${paise ? formatPaise(paise) : ''}`}
              </button>
              <p className="text-[11.5px] text-slate-500">Reaches your account within 2 working days. You can have one payout on its way at a time.</p>
            </>
          )}
        </section>

        {(b.history || []).length > 0 && (
          <section className="rounded-2xl bg-white ring-1 ring-slate-100">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Payouts</p>
            <ul className="divide-y divide-slate-100">
              {b.history.map((h) => {
                const [label, Icon, tone] = STATUS[h.status] || STATUS.requested;
                return (
                  <li key={h._id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}><Icon size={11} /> {label}</span>
                    <span className="min-w-0 flex-1 text-[12.5px] text-slate-600">
                      {h.destination?.label}{h.reference ? ` · ref ${h.reference}` : ''}{h.reason ? ` · ${h.reason}` : ''}
                      <span className="block text-[11px] text-slate-400">{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-900">{formatPaise(h.amountPaise)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
