import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, MapPin, Loader2, ShoppingBasket, PackageSearch, Info,
} from 'lucide-react';
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
 * "Shop for Me" / "Pick Up for Me" — §4 to §11.
 *
 * Every item carries its OWN ceiling (§6) — there is no single pooled budget
 * a helper could spend unevenly. The price shown before booking is always
 * two numbers (§9): the service charge, and the item budget, never combined
 * into one figure that reads as "what ZappyOne charges".
 */

function emptyItem() {
  return {
    key: Math.random().toString(36).slice(2),
    name: '', quantity: 1, preferredBrand: '', preferredSize: '', preferredVariant: '',
    maxApprovedPricePaise: '', notes: '', referenceImageKey: '',
  };
}

function Shell({ children }) {
  return <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-32">{children}</div>;
}

export default function ShoppingTaskPage() {
  const nav = useNavigate();
  // A tile on the home showcase can open this straight on "pick up for me".
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'pickup' ? 'pickup' : 'shop'); // 'shop' | 'pickup'
  const [items, setItems] = useState([emptyItem()]);
  const [instructions, setInstructions] = useState('');
  const [pickupLoc, setPickupLoc] = useState(null);
  // Nobody verified covers the pickup yet: show GrowingHere instead of booking.
  const covered = useCoverageCheck();
  const [notHere, setNotHere] = useState(false);
  const [destLoc, setDestLoc] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // 'pickup' | 'dest'

  const [getQuote, { data: quoteData, isLoading: quoting }] = useHelpingQuoteMutation();
  const [create, { isLoading: booking }] = useCreateHelpingTaskMutation();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  // One key per visit to this screen, so a double tap cannot book twice.
  const [idempotencyKey] = useState(() => `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const { pay, paying } = usePayBooking();

  const itemBudgetPaise = useMemo(
    () => items.reduce((s, i) => s + (Number(i.maxApprovedPricePaise) || 0) * 100 * (i.quantity || 1), 0),
    [items],
  );

  function updateItem(key, patch) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(key) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  async function refreshQuote() {
    if (!pickupLoc) return;
    try {
      await getQuote({
        serviceType: mode === 'shop' ? 'shopping' : 'pickup',
        pickupLocation: { type: 'Point', coordinates: [pickupLoc.lng, pickupLoc.lat], address: pickupLoc.address },
        destination: destLoc
          ? { type: 'Point', coordinates: [destLoc.lng, destLoc.lat], address: destLoc.address } : null,
        items: mode === 'shop' ? items.filter((i) => i.name).map((i) => ({
          ...i, maxApprovedPricePaise: Math.round((Number(i.maxApprovedPricePaise) || 0) * 100),
        })) : [],
      }).unwrap();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not price this yet');
    }
  }

  async function book() {
    if (!pickupLoc) { toast.error(mode === 'shop' ? 'Where should the helper shop?' : 'Where is the pickup?'); return; }
    if (mode === 'shop' && !items.some((i) => i.name.trim())) { toast.error('Add at least one item'); return; }

    if (!(await covered('shopping_pickup', pickupLoc))) { setNotHere(true); window.scrollTo({ top: 0 }); return; }

    try {
      const res = await create({
        serviceType: mode === 'shop' ? 'shopping' : 'pickup',
        title: mode === 'shop' ? 'Shopping task' : 'Pickup task',
        instructions,
        pickupLocation: { type: 'Point', coordinates: [pickupLoc.lng, pickupLoc.lat], address: pickupLoc.address },
        destination: destLoc
          ? { type: 'Point', coordinates: [destLoc.lng, destLoc.lat], address: destLoc.address } : undefined,
        items: mode === 'shop'
          ? items.filter((i) => i.name.trim()).map((i) => ({
            ...i, maxApprovedPricePaise: Math.round((Number(i.maxApprovedPricePaise) || 0) * 100),
          }))
          : [],
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
  const canQuote = !!pickupLoc && (mode === 'pickup' || items.some((i) => i.name.trim()));


  if (notHere) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <GrowingHere
          service={{ code: 'shopping_pickup', domainCode: 'helping_services', name: 'shopping and pickup' }}
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
        <h1 className="text-lg font-black text-[#0F172A]">{mode === 'shop' ? 'Shopping for Me' : 'Pick Up for Me'}</h1>
      </div>

      <Shell>
        <div className="flex rounded-2xl bg-slate-100 p-1">
          {[['shop', 'Shop for Me', ShoppingBasket], ['pickup', 'Pick Up for Me', PackageSearch]].map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition ${
                mode === k ? 'bg-white text-[#0F172A] shadow' : 'text-slate-400'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {mode === 'shop' ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">What do you need?</p>
            {items.map((item, idx) => (
              <div key={item.key} className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">Item {idx + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(item.key)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <input
                  value={item.name}
                  onChange={(e) => updateItem(item.key, { name: e.target.value })}
                  placeholder="e.g. 12W LED bulb"
                  className="w-full rounded-xl border-2 border-slate-200 p-2.5 font-medium"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    placeholder="Qty"
                    className="w-full rounded-xl border-2 border-slate-200 p-2.5"
                  />
                  <input
                    type="number" min={0}
                    value={item.maxApprovedPricePaise}
                    onChange={(e) => updateItem(item.key, { maxApprovedPricePaise: e.target.value })}
                    placeholder="Max price ₹"
                    className="w-full rounded-xl border-2 border-slate-200 p-2.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={item.preferredBrand}
                    onChange={(e) => updateItem(item.key, { preferredBrand: e.target.value })}
                    placeholder="Brand (any)"
                    className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm"
                  />
                  <input
                    value={item.preferredVariant}
                    onChange={(e) => updateItem(item.key, { preferredVariant: e.target.value })}
                    placeholder="Variant / size"
                    className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm"
                  />
                </div>
                <input
                  value={item.notes}
                  onChange={(e) => updateItem(item.key, { notes: e.target.value })}
                  placeholder="Notes for the helper (optional)"
                  className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm"
                />
                <ImageUploadField
                  value={item.referenceImageKey}
                  onChange={(v) => updateItem(item.key, { referenceImageKey: v })}
                  folder="helping/items"
                  label="reference photo"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="w-full rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 font-bold py-3 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Add another item
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">What's being picked up?</p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Repaired laptop from City Electronics, reference #4521"
              rows={3}
              className="w-full rounded-xl border-2 border-slate-200 p-2.5"
            />
          </div>
        )}

        {mode === 'shop' && (
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Anything else the helper should know?"
            rows={2}
            className="w-full rounded-xl border-2 border-slate-200 p-2.5 text-sm"
          />
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Where</p>
          <button
            type="button"
            onClick={() => setPickerFor('pickup')}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left"
          >
            <MapPin size={18} className="text-zappy-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">{mode === 'shop' ? 'Shop / market' : 'Pickup location'}</span>
              <span className="block font-bold text-[#0F172A] truncate">{pickupLoc?.address || 'Choose a location'}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPickerFor('dest')}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left"
          >
            <MapPin size={18} className="text-emerald-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">Bring it to</span>
              <span className="block font-bold text-[#0F172A] truncate">{destLoc?.address || 'Choose a destination'}</span>
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={refreshQuote}
          disabled={!canQuote || quoting}
          className="w-full rounded-2xl bg-slate-100 text-slate-700 font-bold py-3 disabled:opacity-50"
        >
          {quoting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'See the price'}
        </button>

        {charge && (
          <div className="rounded-2xl border-2 border-zappy-100 bg-zappy-50/50 p-4 space-y-2">
            <div className="flex items-start gap-2 text-xs text-zappy-700">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>{quoteData.authorisation.note}</span>
            </div>
            <div className="space-y-1 text-sm">
              <Row label="Base fee" value={charge.baseFeePaise} />
              {charge.distanceFeePaise > 0 && <Row label="Distance" value={charge.distanceFeePaise} />}
              {charge.platformFeePaise > 0 && <Row label="Platform fee" value={charge.platformFeePaise} />}
              {charge.taxPaise > 0 && <Row label="Tax" value={charge.taxPaise} />}
              <div className="flex justify-between font-bold pt-1 border-t border-zappy-100">
                <span>ZappyOne service fee</span>
                <span>{formatPaise(charge.serviceChargePaise)}</span>
              </div>
              {mode === 'shop' && itemBudgetPaise > 0 && (
                <div className="flex justify-between font-bold text-slate-500">
                  <span>Item budget (max)</span>
                  <span>up to {formatPaise(itemBudgetPaise)}</span>
                </div>
              )}
            </div>
          </div>
        )}
        <PayMethodPicker
          value={paymentMethod}
          onChange={setPaymentMethod}
          cashNote="Pay the helper's service charge in cash when the task is done."
        />
      </Shell>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-4">
        <button
          type="button"
          onClick={book}
          disabled={booking || paying || !pickupLoc}
          className="max-w-lg mx-auto w-full block rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50"
        >
          {paying ? 'Opening payment…' : booking ? 'Requesting…' : 'Request a helper'}
        </button>
      </div>

      {pickerFor && (
        <LocationPicker
          serviceLabel="Helping Services"
          onCancel={() => setPickerFor(null)}
          onConfirm={(loc) => {
            if (pickerFor === 'pickup') setPickupLoc(loc); else setDestLoc(loc);
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{formatPaise(value)}</span>
    </div>
  );
}
