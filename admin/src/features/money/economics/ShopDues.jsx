import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useAdminShopDuesQuery, useAdminRecordShopDuesPaymentMutation } from '@shared/services/api';
import { Card, PageLoader, fmt } from '../../../ui/kit';
import { RupeeInput } from './fields';

const TYPE = { shop: 'Shop', agency: 'Agency', company: 'Company', individual: 'Independent' };

function Row({ row }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [record, { isLoading }] = useAdminRecordShopDuesPaymentMutation();
  async function submit() {
    const rupees = Number(amount);
    if (!(rupees > 0)) return toast.error('Enter the amount received');
    if (reference.trim().length < 3) return toast.error('Enter the UPI or bank reference');
    try {
      const out = await record({ shopId: row.shopId, amountRupees: rupees, reference: reference.trim() }).unwrap();
      toast.success(`Recorded. ${row.businessName} now owes ${fmt(out.dues.duesPaise)}.`);
      setOpen(false);
    } catch (err) { toast.error(err?.data?.error || 'Could not record it'); }
  }
  return (
    <div className="space-y-2 border-t border-slate-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{row.businessName}
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{TYPE[row.partnerType] || 'Shop'}</span>
            {row.blocked && <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">New jobs stopped</span>}
          </p>
          <p className="text-[12px] text-slate-500">{row.phone || 'No phone'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tabular-nums text-slate-900">{fmt(row.duesPaise)}</span>
          {row.phone && <a href={`tel:${row.phone}`} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">Call</a>}
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Record payment</button>
        </div>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          <RupeeInput value={amount} onChange={setAmount} max={10000000} label="Amount received" />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / bank reference" maxLength={80}
            className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
          <button type="button" onClick={submit} disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Record payment
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-slate-500">Cancel</button>
        </div>
      )}
    </div>
  );
}

// Partner businesses that owe commission from cash jobs; the same limits as workers stop their new jobs (server shop/shop-dues).
export default function ShopDues() {
  const { data, isLoading } = useAdminShopDuesQuery(undefined, { pollingInterval: 60000 });
  const rows = data?.shops || [];
  return (
    <Card className="overflow-hidden p-0">
      <div className="px-4 py-3">
        <h3 className="text-sm font-bold text-slate-800">Partner businesses that owe</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">Shops, agencies, companies and independent pros. Online jobs pay it down by themselves; record any payment they make to ZappyOne here.</p>
      </div>
      {isLoading ? <PageLoader /> : rows.length
        ? rows.map((r) => <Row key={r.shopId} row={r} />)
        : <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-400">No partner business owes anything right now.</p>}
    </Card>
  );
}
