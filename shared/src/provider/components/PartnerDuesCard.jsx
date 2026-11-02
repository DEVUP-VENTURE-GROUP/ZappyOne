import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CircleCheck, Clock3, Wallet } from 'lucide-react';
import { useShopDuesQuery, useClaimShopDuesPaymentMutation } from '../../services/api';
import { formatPaise } from '../../utils/money';

const STATE = { pending: ['Being checked', Clock3, 'text-amber-700'], confirmed: ['Received', CircleCheck, 'text-emerald-700'], rejected: ['Not found', AlertTriangle, 'text-red-700'] };

// What this business owes ZappyOne from cash jobs, and telling ZappyOne once it has paid; hidden when nothing is owed (server shop/shop-dues).
export default function PartnerDuesCard() {
  const { data } = useShopDuesQuery(undefined, { pollingInterval: 120000 });
  const [claim, { isLoading }] = useClaimShopDuesPaymentMutation();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: '', reference: '' });
  if (!data || (data.duesPaise <= 0 && !data.claims?.some((c) => c.status === 'pending'))) return null;
  const stopped = data.isBlocked;
  const near = !stopped && data.duesPaise >= data.warnPaise;
  async function send(e) {
    e.preventDefault();
    try {
      await claim({ amountRupees: Number(f.amount), reference: f.reference.trim(), method: 'upi' }).unwrap();
      toast.success('Sent. ZappyOne will check it and update your balance.');
      setOpen(false); setF({ amount: '', reference: '' });
    } catch (err) { toast.error(err?.data?.error || 'Could not send. Try again.'); }
  }
  return (
    <section className={`rounded-2xl border p-4 ${stopped ? 'border-red-200 bg-red-50/70' : near ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        {stopped ? <AlertTriangle size={18} className="text-red-600" /> : <Wallet size={18} className="text-slate-600" />}
        <h2 className="text-[15px] font-bold text-slate-900">You owe ZappyOne {formatPaise(data.duesPaise)}</h2>
      </div>
      <p className="mt-1 text-[13px] text-slate-600">
        {stopped
          ? `New jobs are paused until it is under ${formatPaise(data.limitPaise)}.`
          : `ZappyOne fees from cash jobs. New jobs pause at ${formatPaise(data.limitPaise)}.`}
        {' '}Online jobs pay it down by themselves.
      </p>
      {data.payInstructions && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[12.5px] font-semibold text-slate-700">{data.payInstructions}</p>}
      {(data.claims || []).slice(0, 3).map((c) => { const [label, Icon, tone] = STATE[c.status] || STATE.pending; return (
        <p key={c._id} className={`mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold ${tone}`}><Icon size={14} /> {formatPaise(c.amountPaise)} · {c.reference} · {label}</p>
      ); })}
      {open ? (
        <form onSubmit={send} className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
          <input required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="Amount ₹" aria-label="Amount paid in rupees" className="input text-sm" />
          <input required minLength={4} maxLength={80} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="UPI or bank reference" aria-label="Payment reference" className="input text-sm" />
          <button type="submit" disabled={isLoading} className="btn-primary px-4 text-sm">Send</button>
        </form>
      ) : data.duesPaise > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[13px] font-bold text-zappy-600">I have paid, tell ZappyOne</button>
      )}
    </section>
  );
}
