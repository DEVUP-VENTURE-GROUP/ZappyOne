import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import GrowingHere from '../../components/serviceability/GrowingHere';
import { useCoverageCheck } from '../../hooks/useCoverageCheck';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { useHelpingQuoteMutation, useCreateHelpingTaskMutation } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayMethodPicker } from '@shared/components/common/PayMethodPicker';
import { usePayBooking } from '@shared/hooks/usePayBooking';

/**
 * Return / Exchange — §22 to §31.
 *
 * §24, §60: this screen never claims eligibility, never promises acceptance,
 * and never promises a refund. The disclaimer is not fine print here — it is
 * the most important sentence on the page, so it sits above the button, not
 * below it.
 */
const METHODS = [
  { value: 'store_dropoff', label: 'Take it to the store' },
  { value: 'courier_dropoff', label: 'Drop at a courier point' },
  { value: 'merchant_handover', label: "Follow the merchant's instructions" },
];

function Shell({ children }) {
  return <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-32">{children}</div>;
}

export default function ReturnTaskPage() {
  const nav = useNavigate();
  const [isExchange, setIsExchange] = useState(false);
  const [form, setForm] = useState({
    merchantName: '', orderId: '', returnId: '', productName: '', quantity: 1,
    returnReason: '', returnMethod: 'store_dropoff', merchantInstructions: '',
    desiredReplacement: '', customerConfirmedEligibility: false, packagingConfirmed: false,
  });
  const [invoiceKey, setInvoiceKey] = useState('');
  const [pickupLoc, setPickupLoc] = useState(null);
  // Nobody verified covers the pickup yet: show GrowingHere instead of booking.
  const covered = useCoverageCheck();
  const [notHere, setNotHere] = useState(false);
  const [destLoc, setDestLoc] = useState(null);
  const [pickerFor, setPickerFor] = useState(null);

  const [getQuote, { data: quoteData, isLoading: quoting }] = useHelpingQuoteMutation();
  const [create, { isLoading: booking }] = useCreateHelpingTaskMutation();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  // One key per visit to this screen, so a double tap cannot book twice.
  const [idempotencyKey] = useState(() => `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const { pay, paying } = usePayBooking();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function refreshQuote() {
    if (!pickupLoc) return;
    try {
      await getQuote({
        serviceType: isExchange ? 'exchange' : 'return',
        pickupLocation: { type: 'Point', coordinates: [pickupLoc.lng, pickupLoc.lat], address: pickupLoc.address },
        destination: destLoc
          ? { type: 'Point', coordinates: [destLoc.lng, destLoc.lat], address: destLoc.address } : null,
        items: [],
      }).unwrap();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not price this yet');
    }
  }

  async function book() {
    if (!pickupLoc) { toast.error('Where should we collect the item?'); return; }
    if (!form.productName.trim()) { toast.error('What product is this?'); return; }
    if (!form.customerConfirmedEligibility) {
      toast.error('Please confirm the merchant has approved this return first');
      return;
    }

    if (!(await covered('returns_exchange', pickupLoc))) { setNotHere(true); window.scrollTo({ top: 0 }); return; }

    try {
      const res = await create({
        serviceType: isExchange ? 'exchange' : 'return',
        title: isExchange ? 'Exchange task' : 'Return task',
        pickupLocation: { type: 'Point', coordinates: [pickupLoc.lng, pickupLoc.lat], address: pickupLoc.address },
        destination: destLoc
          ? { type: 'Point', coordinates: [destLoc.lng, destLoc.lat], address: destLoc.address } : undefined,
        returnDetail: { ...form, merchantInstructions: form.merchantInstructions || (invoiceKey ? `Invoice: ${invoiceKey}` : '') },
        paymentMethod,
        idempotencyKey,
      }).unwrap();
      toast.success('Task requested');
      if (res.task?.paymentMethod === 'online') {
        await pay({ bookingSource: 'helping', bookingId: res.task._id, label: 'Helper service charge' });
      }
      nav(`/helping/tasks/${res.task._id}`);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not create the task');
    }
  }

  const charge = quoteData?.charge;


  if (notHere) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <GrowingHere
          service={{ code: 'returns_exchange', domainCode: 'helping_services', name: 'returns' }}
          lat={pickupLoc?.lat}
          lng={pickupLoc?.lng}
          address={pickupLoc?.address || ''}
          onChangeLocation={() => setNotHere(false)}
        />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">{isExchange ? 'Exchange an Item' : 'Return an Item'}</h1>
      </div>

      <Shell>
        <div className="flex rounded-2xl bg-slate-100 p-1">
          {[['return', 'Return'], ['exchange', 'Exchange']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setIsExchange(k === 'exchange')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                (k === 'exchange') === isExchange ? 'bg-white text-[#0F172A] shadow' : 'text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* §24, §60 — the sentence this whole screen exists to say plainly. */}
        <div className="flex items-start gap-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            ZappyOne will assist with the physical {isExchange ? 'exchange' : 'return'} task.
            Final acceptance{!isExchange && ', refund'}{isExchange && ', replacement availability'} remain
            subject to the merchant's own policy — we don't decide that.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">The order</p>
          <input value={form.merchantName} onChange={(e) => set('merchantName', e.target.value)}
            placeholder="Merchant / store name" className="w-full rounded-xl border-2 border-slate-200 p-2.5" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.orderId} onChange={(e) => set('orderId', e.target.value)}
              placeholder="Order ID" className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
            <input value={form.returnId} onChange={(e) => set('returnId', e.target.value)}
              placeholder="Return ID (if any)" className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
          </div>
          <input value={form.productName} onChange={(e) => set('productName', e.target.value)}
            placeholder="Product name" className="w-full rounded-xl border-2 border-slate-200 p-2.5" />
          <textarea value={form.returnReason} onChange={(e) => set('returnReason', e.target.value)}
            placeholder={isExchange ? 'Why are you exchanging it?' : 'Reason for return'}
            rows={2} className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
          {isExchange && (
            <input value={form.desiredReplacement} onChange={(e) => set('desiredReplacement', e.target.value)}
              placeholder="What would you like instead?" className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm" />
          )}
          <ImageUploadField value={invoiceKey} onChange={setInvoiceKey} folder="helping/returns" label="order screenshot / invoice" />
        </div>

        {!isExchange && (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">How is it being returned?</p>
            {METHODS.map((m) => (
              <label key={m.value} className="flex items-center gap-2.5 py-1.5">
                <input type="radio" name="method" checked={form.returnMethod === m.value}
                  onChange={() => set('returnMethod', m.value)} />
                <span className="text-sm font-medium">{m.label}</span>
              </label>
            ))}
          </div>
        )}

        <label className="flex items-start gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-4">
          <input type="checkbox" checked={form.customerConfirmedEligibility}
            onChange={(e) => set('customerConfirmedEligibility', e.target.checked)} className="mt-0.5" />
          <span className="text-sm">I confirm the merchant has approved this {isExchange ? 'exchange' : 'return'} according to its own policy.</span>
        </label>
        <label className="flex items-start gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-4">
          <input type="checkbox" checked={form.packagingConfirmed}
            onChange={(e) => set('packagingConfirmed', e.target.checked)} className="mt-0.5" />
          <span className="text-sm">The item is packed and ready, with tags/accessories and invoice as required.</span>
        </label>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Where</p>
          <button type="button" onClick={() => setPickerFor('pickup')}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left">
            <MapPin size={18} className="text-zappy-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">Collect the item from</span>
              <span className="block font-bold text-[#0F172A] truncate">{pickupLoc?.address || 'Choose a location'}</span>
            </span>
          </button>
          <button type="button" onClick={() => setPickerFor('dest')}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left">
            <MapPin size={18} className="text-emerald-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">Store / courier destination (optional)</span>
              <span className="block font-bold text-[#0F172A] truncate">{destLoc?.address || 'Choose a destination'}</span>
            </span>
          </button>
        </div>

        <button type="button" onClick={refreshQuote} disabled={!pickupLoc || quoting}
          className="w-full rounded-2xl bg-slate-100 text-slate-700 font-bold py-3 disabled:opacity-50">
          {quoting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'See the price'}
        </button>

        {charge && (
          <div className="rounded-2xl border-2 border-zappy-100 bg-zappy-50/50 p-4 flex justify-between font-bold">
            <span>ZappyOne service fee</span>
            <span>{formatPaise(charge.serviceChargePaise)}</span>
          </div>
        )}
        <PayMethodPicker
          value={paymentMethod}
          onChange={setPaymentMethod}
          cashNote="Pay the helper's service charge in cash when the task is done."
        />
      </Shell>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4">
        <button type="button" onClick={book} disabled={booking || paying || !pickupLoc}
          className="max-w-lg mx-auto w-full block rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50">
          {paying ? 'Opening payment…' : booking ? 'Requesting…' : 'Request a helper'}
        </button>
      </div>

      {pickerFor && (
        <LocationPicker
          serviceLabel="Helping Services"
          onCancel={() => setPickerFor(null)}
          onConfirm={(loc) => { if (pickerFor === 'pickup') setPickupLoc(loc); else setDestLoc(loc); setPickerFor(null); }}
        />
      )}
    </div>
  );
}
