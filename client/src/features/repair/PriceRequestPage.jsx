import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Store, Star, MapPin, ShieldCheck, Clock, X } from 'lucide-react';
import { usePriceRequestQuery, useCancelPriceRequestMutation, useCreateRepairBookingMutation } from '@shared/services/api';
import { useSocketEvent } from '@shared/hooks/useSocket';
import { formatPaise } from '@shared/utils/money';

/**
 * The customer's price request: the shops around them were asked for their
 * price; answers arrive live and each is booked like any shop booking.
 */
const GRADE = { oem: 'Original part', premium: 'Premium part', standard: 'Standard part' };

function timeLeft(at) {
  const ms = new Date(at) - Date.now();
  if (ms <= 0) return null;
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export default function PriceRequestPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = usePriceRequestQuery(id, { pollingInterval: 30000 });
  const [cancel, { isLoading: cancelling }] = useCancelPriceRequestMutation();
  const [book, { isLoading: booking }] = useCreateRepairBookingMutation();
  const [confirming, setConfirming] = useState(null);
  // A new answer arrives the moment a shop sends it.
  useSocketEvent('price_request.offer', (p) => { if (p?.id === id) refetch(); });

  const r = data?.request;
  const offers = useMemo(() => {
    const byShop = new Map((r?.offers || []).map((o) => [String(o.shopId), o]));
    return (data?.providers || [])
      .map((p) => ({ ...p, offer: byShop.get(String(p.shopId)) }))
      .sort((a, b) => (a.offer?.totalPaise ?? a.totalPaise) - (b.offer?.totalPaise ?? b.totalPaise));
  }, [data, r]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-zappy-500" /></div>;
  if (!r) return <div className="py-24 text-center text-sm text-slate-500">We could not find that request.</div>;

  const open = r.status === 'open';
  const left = timeLeft(r.expiresAt);

  async function choose(p) {
    if (confirming !== p.shopId) { setConfirming(p.shopId); return; }
    try {
      const res = await book({
        vertical: r.vertical, brandCode: r.brandCode, modelCode: r.modelCode, configurationCode: r.configurationCode || null,
        problemCodes: r.problemCodes, repairCode: r.repairCode, qualityCode: p.offer?.qualityCode || null,
        serviceMode: r.serviceMode, shopId: p.shopId, workerId: null,
        location: { coordinates: r.location.coordinates, address: r.location.address || 'Your location' },
        paymentMethod: 'cash', idempotencyKey: `pr-${r._id}-${p.shopId}`, priceRequestId: r._id,
      }).unwrap();
      toast.success(`Booked with ${p.name}`);
      nav(`/repair/bookings/${res.booking._id}`, { replace: true });
    } catch (err) {
      toast.error(err?.data?.error || 'Could not book that shop');
    }
  }

  async function stop() {
    try { await cancel(r._id).unwrap(); toast.success('Request closed'); refetch(); } catch (err) { toast.error(err?.data?.error || 'Could not close it'); }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Prices from shops near you</p>
          <h1 className="truncate text-[15px] font-bold text-slate-900">{r.repairName}, {r.deviceName}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {open ? (
            <>
              <p className="text-sm font-bold text-slate-900">
                {offers.length ? `${offers.length} of ${r.shopsAsked} shops sent their price` : `We asked ${r.shopsAsked} ${r.shopsAsked === 1 ? 'shop' : 'shops'} near you`}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Clock size={12} /> {left ? `Open for ${left} more. Prices appear here as they come in.` : 'Closing now.'}
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-slate-900">
              {r.status === 'booked' ? 'You booked one of these shops.' : r.status === 'cancelled' ? 'You closed this request.' : 'This request has closed.'}
            </p>
          )}
        </div>

        {open && !offers.length && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Loader2 size={18} className="shrink-0 animate-spin text-zappy-500" />
            <p className="text-xs leading-relaxed text-slate-600">Shops usually answer within the hour. You will get a notification for each price.</p>
          </div>
        )}

        {offers.map((p) => (
          <div key={p.shopId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Store size={18} className="text-slate-500" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{p.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
                  {p.rating ? <span className="flex items-center gap-1"><Star size={11} className="text-amber-500" /> {Number(p.rating).toFixed(1)}</span> : <span>New</span>}
                  {p.distanceKm != null && <span className="flex items-center gap-1"><MapPin size={11} /> {Number(p.distanceKm).toFixed(1)} km</span>}
                  {p.offer?.qualityCode && <span>{GRADE[p.offer.qualityCode] || p.offer.qualityCode}</span>}
                  {(p.offer?.warrantyDays || p.warrantyDays) > 0 && <span className="flex items-center gap-1"><ShieldCheck size={11} /> {p.offer?.warrantyDays || p.warrantyDays}-day warranty</span>}
                </p>
                {p.offer?.note && <p className="mt-1 text-[12px] text-slate-600">“{p.offer.note}”</p>}
              </div>
              <p className="shrink-0 text-base font-black text-slate-900">{formatPaise(p.offer?.totalPaise ?? p.totalPaise)}</p>
            </div>
            {open && (
              <button type="button" onClick={() => choose(p)} disabled={booking}
                className={`mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60 ${confirming === p.shopId ? 'bg-emerald-600' : 'bg-zappy-600'}`}>
                {booking && confirming === p.shopId ? <Loader2 size={15} className="mx-auto animate-spin" />
                  : confirming === p.shopId ? `Confirm booking with ${p.name}` : `Book for ${formatPaise(p.offer?.totalPaise ?? p.totalPaise)}`}
              </button>
            )}
          </div>
        ))}

        {!open && r.status !== 'booked' && (
          <button type="button" onClick={() => nav('/repair')} className="w-full rounded-xl bg-[#0F172A] py-3 text-sm font-bold text-white">
            Book an inspection instead
          </button>
        )}
        {open && (
          <button type="button" onClick={stop} disabled={cancelling}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600">
            <X size={13} /> Close this request
          </button>
        )}
      </div>
    </div>
  );
}
