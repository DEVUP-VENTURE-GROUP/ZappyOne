import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Star, Users, X } from 'lucide-react';
import { useCreateRepairGroupMutation, useQuoteRepairGroupMutation } from '@shared/services/api';
import { choiceOf } from '@shared/customer/repairBasket';
import { formatPaise } from '@shared/utils/money';

/**
 * Checkout for several vehicles or devices in one visit (server
 * repair/services/group): who can do them all (cheapest first) or, when nobody
 * can, which pro does which; the items with their prices; one visit and
 * service fee; any multi-item discount; then Book. Prices come from the server.
 */
export default function GroupCheckout({ items, shown, location, serviceMode, scheduledAt, slotLabel, onRemove, onBooked }) {
  const [quote, { data, isLoading, error }] = useQuoteRepairGroupMutation();
  const [create, { isLoading: booking }] = useCreateRepairGroupMutation();
  const [picked, setPicked] = useState(null);
  const idempotencyKey = useMemo(() => `web-grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);
  const where = location?.lat != null ? { address: location.address || location.primary || 'My location', coordinates: [location.lng, location.lat], cityCode: location.cityCode || undefined } : null;
  const key = JSON.stringify({ items, serviceMode, scheduledAt, where });

  useEffect(() => {
    if (!where || items.length < 2) return;
    setPicked(null);
    quote({ items, location: where, serviceMode, scheduledAt: scheduledAt || null }).unwrap().catch(() => {});
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = data?.options?.length ? data.options : data?.split ? [data.split] : [];
  const chosen = picked || options[0] || null;

  async function book() {
    try {
      const res = await create({
        items, location: where, serviceMode, scheduledAt: scheduledAt || null, slotLabel: slotLabel || '',
        paymentMethod: 'cash', choice: choiceOf(chosen), idempotencyKey,
      }).unwrap();
      onBooked(res.group);
    } catch (err) { toast.error(err?.data?.error || 'Could not book these together. Try again.'); }
  }

  if (!where) return <div className="card text-sm text-slate-500">Pick the address first.</div>;
  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">In this visit</p>
        {shown.map((it, i) => (
          <div key={`${it.vertical}-${it.modelCode}-${it.repairCode}-${i}`} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-[#0F172A]">{it.show?.title}</span>
              <span className="block truncate text-[12px] text-slate-500">{it.show?.service}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {chosen?.lines?.[i] && <span className="text-[13px] font-bold">{formatPaise(chosen.lines[i].pricePaise)}</span>}
              {i < shown.length - 1 && <button type="button" onClick={() => onRemove(i)} aria-label="Remove" className="p-1 text-slate-400 hover:text-slate-700"><X size={14} /></button>}
            </span>
          </div>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-zappy-400" /></div>
        : error || (data && !options.length) ? (
          <div className="card text-sm text-slate-600">Nobody nearby can do {data?.unavailable?.length ? 'one of these' : 'these'} right now. Remove an item, or book them separately.</div>
        ) : (
          <>
            {options.length > 0 && (
              <div className="card space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{options[0].plan === 'split' ? 'Two pros will come' : 'One pro for everything'}</p>
                {options.map((o) => {
                  const on = choiceOf(o) === choiceOf(chosen);
                  const who = o.plan === 'split' ? [...new Set(o.providers.map((p) => p.name))].join(' + ') : o.provider.name;
                  return (
                    <button key={choiceOf(o)} type="button" onClick={() => setPicked(o)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left ${on ? 'border-zappy-500 bg-zappy-50' : 'border-slate-200'}`}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-[14px] font-bold text-[#0F172A]">{o.plan === 'split' && <Users size={14} />}{who}</span>
                        {o.provider?.rating != null && <span className="flex items-center gap-1 text-[11px] text-slate-500"><Star size={11} className="fill-amber-400 text-amber-400" /> {Number(o.provider.rating).toFixed(1)}</span>}
                      </span>
                      <span className="shrink-0 text-[15px] font-black">{formatPaise(o.totals.totalPaise)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {chosen && (
              <div className="card space-y-1.5">
                <Row label={`${shown.length} items`} paise={chosen.totals.itemsPaise} />
                {chosen.totals.discountPaise > 0 && <Row label="Multi-item discount" paise={-chosen.totals.discountPaise} green />}
                {chosen.totals.journeyPaise + chosen.totals.platformFeePaise > 0 && <Row label="Visit & service fee (once)" paise={chosen.totals.journeyPaise + chosen.totals.platformFeePaise} />}
                {chosen.totals.taxPaise > 0 && <Row label="Taxes" paise={chosen.totals.taxPaise} />}
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="text-sm font-bold">Total</span>
                  <span className="text-2xl font-black text-[#0F172A]">{formatPaise(chosen.totals.totalPaise)}</span>
                </div>
                <p className="text-[11px] text-slate-500">Pay in cash when the work is done. Each item keeps its own warranty and report.</p>
                <button type="button" onClick={book} disabled={booking}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-zappy-600 py-3 text-[15px] font-bold text-white disabled:opacity-60">
                  {booking && <Loader2 size={16} className="animate-spin" />} Book {shown.length} items
                </button>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function Row({ label, paise, green = false }) {
  return (
    <div className={`flex justify-between text-[13px] font-semibold ${green ? 'text-emerald-600' : 'text-slate-600'}`}>
      <span>{label}</span><span>{paise < 0 ? `−${formatPaise(-paise)}` : formatPaise(paise)}</span>
    </div>
  );
}
