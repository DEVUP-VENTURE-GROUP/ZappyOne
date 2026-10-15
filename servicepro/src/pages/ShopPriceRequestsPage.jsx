import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Clock, MapPin, Send, CheckCircle2, Inbox } from 'lucide-react';
import { useShopPriceRequestsQuery, useOfferPriceMutation } from '@shared/services/api';
import { useSocketEvent } from '@shared/hooks/useSocket';

/**
 * Customers near the shop asking for its price on a repair it has not priced
 * for their device. The answer goes to the customer straight away and is
 * saved as the shop's price for that device, so the next customer sees it
 * without asking. It can be changed until the customer books.
 */
const GRADES = [
  { code: 'oem', label: 'Original' },
  { code: 'premium', label: 'Premium' },
  { code: 'standard', label: 'Standard' },
];
const MODE = { doorstep: 'At the customer', pickup_repair: 'Pickup & return', workshop: 'At your shop', roadside: 'Roadside' };

function left(at) {
  const m = Math.max(0, Math.round((new Date(at) - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
}

function RequestCard({ r }) {
  const [offer, { isLoading }] = useOfferPriceMutation();
  const mine = r.myOffer;
  const [rupees, setRupees] = useState(mine ? String(Math.round(mine.totalPaise / 100)) : '');
  const [grade, setGrade] = useState(mine?.qualityCode || (r.needsGrade ? 'premium' : null));
  const [warranty, setWarranty] = useState(String(mine?.warrantyDays ?? 90));
  const [note, setNote] = useState(mine?.note || '');

  async function send() {
    const total = Math.round(Number(rupees) * 100);
    if (!(total >= 5000)) return toast.error('Enter your price in rupees (at least ₹50)');
    try {
      await offer({ id: r._id, totalPaise: total, qualityCode: r.needsGrade ? grade : null, warrantyDays: Number(warranty) || 0, note }).unwrap();
      toast.success(mine ? 'Price updated — the customer sees it now' : 'Price sent — the customer sees it now');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send your price');
    }
    return undefined;
  }

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-sm font-bold text-[#0F172A]">{r.repairName}</p>
        <p className="text-xs text-slate-600">{r.deviceName}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500">
          <span>{MODE[r.serviceMode] || r.serviceMode}</span>
          {r.distanceKm != null && <span className="flex items-center gap-1"><MapPin size={11} /> {r.distanceKm} km{r.area ? `, ${r.area}` : ''}</span>}
          <span className="flex items-center gap-1"><Clock size={11} /> {left(r.expiresAt)}</span>
          {r.answers > 0 && <span>{r.answers} {r.answers === 1 ? 'shop has' : 'shops have'} answered</span>}
        </p>
      </div>

      {mine && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={13} /> You sent ₹{Math.round(mine.totalPaise / 100).toLocaleString('en-IN')} — you can change it until they book
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Your price (₹, all-in)</span>
          <input inputMode="numeric" value={rupees} onChange={(e) => setRupees(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="e.g. 1450" className="input mt-1 w-full text-sm" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500">Warranty (days)</span>
          <input inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/[^\d]/g, ''))} className="input mt-1 w-full text-sm" />
        </label>
      </div>
      {r.needsGrade && (
        <div>
          <span className="text-[11px] font-semibold text-slate-500">Part you will fit</span>
          <div className="mt-1 flex gap-1.5">
            {GRADES.map((g) => (
              <button key={g.code} type="button" onClick={() => setGrade(g.code)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${grade === g.code ? 'border-zappy-600 bg-zappy-50 text-zappy-700' : 'border-slate-200 text-slate-600'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
        placeholder="A line for the customer (optional), e.g. done in 1 hour" className="input w-full text-sm" />
      <button type="button" onClick={send} disabled={isLoading} className="btn-primary w-full">
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />} {mine ? 'Update my price' : 'Send my price'}
      </button>
    </div>
  );
}

export default function ShopPriceRequestsPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useShopPriceRequestsQuery(undefined, { pollingInterval: 60000 });
  // A new request rings in live.
  useSocketEvent('price_request.new', () => { refetch(); toast('A customer near you asked for your price'); });
  const rows = data?.requests || [];

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-12">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <div>
          <h1 className="h-card">Price requests</h1>
          <p className="text-xs text-slate-500">Customers near you asking what you charge</p>
        </div>
      </div></header>
      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4 lg:max-w-2xl">
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-zappy-500" /></div>}
        {!isLoading && !rows.length && (
          <div className="card flex flex-col items-center py-10 text-center">
            <Inbox size={22} className="text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-700">No requests right now</p>
            <p className="mt-1 text-xs text-slate-500">When a customer nearby needs a repair you have not priced, it shows here and you get a notification.</p>
          </div>
        )}
        {rows.map((r) => <RequestCard key={r._id} r={r} />)}
      </div>
    </div>
  );
}
