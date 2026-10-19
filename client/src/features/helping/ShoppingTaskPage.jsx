import { useSafeBack } from '../../hooks/useBookingFlow';
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, MapPin, Loader2, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GrowingHere from '../catalog/serviceability/GrowingHere';
import { useCoverageCheck } from '../catalog/useCoverageCheck';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { useHelpingQuoteMutation, useCreateHelpingTaskMutation } from '@shared/services/api';
import { useSelector } from 'react-redux';
import { useCheckoutDraft } from '@shared/customer/useCheckoutDraft';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { formatPaise } from '@shared/utils/money';
import { PayMethodPicker } from '@shared/components/common/PayMethodPicker';
import SomeoneElse from '@shared/components/booking/SomeoneElse';
import PendingFeeNotice from '@shared/components/booking/PendingFeeNotice';
import { usePayBooking } from '@shared/hooks/usePayBooking';
import { doorAddress } from '@shared/utils/doorAddress';
import NearestArrival from '@shared/components/common/NearestArrival';
import SurgeLines, { useSurge, surgeChanged } from '@shared/components/common/SurgeLines';
import TipAtCheckout from '@shared/components/common/TipAtCheckout';
import { HELP_MODES, helpMode, helpPlaces } from '@shared/customer/helpModes';

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
  // Back to the previous page, or to /helping when this page was opened directly.
  const goBack = useSafeBack('/helping');
  // A tile on the home showcase can open this straight on "pick up for me".
  const [params] = useSearchParams();
  const [mode, setMode] = useState(HELP_MODES[params.get('mode')] ? params.get('mode') : 'shop');
  const spec = helpMode(mode);
  const shopping = !!spec.items;
  const [scheduledAt, setScheduledAt] = useState('');
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
  // Booking for someone else: who the provider meets ('incomplete' while being typed).
  const [onSite, setOnSite] = useState(null);
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

  const point = (l) => (l ? { type: 'Point', coordinates: [l.lng, l.lat], address: doorAddress(l) } : null);
  const places = helpPlaces(spec, pickupLoc, destLoc);

  async function refreshQuote() {
    if (!pickupLoc) return;
    try {
      await getQuote({
        serviceType: spec.type,
        pickupLocation: point(places.pickup),
        destination: point(places.destination),
        items: shopping ? items.filter((i) => i.name).map((i) => ({
          ...i, maxApprovedPricePaise: Math.round((Number(i.maxApprovedPricePaise) || 0) * 100),
        })) : [],
      }).unwrap();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not price this yet');
    }
  }

  async function book() {
    if (!pickupLoc) { toast.error(mode === 'shop' ? 'Where should the helper shop?' : `Choose: ${spec.start}`); return; }
    if (spec.endRequired && !destLoc) { toast.error(`Choose: ${spec.end}`); return; }
    if (shopping && !items.some((i) => i.name.trim())) { toast.error('Add at least one item'); return; }
    if (spec.when && !scheduledAt) { toast.error('Pick a day and time'); return; }

    if (!(await covered(spec.line, pickupLoc))) { setNotHere(true); window.scrollTo({ top: 0 }); return; }

    try {
      if (onSite === 'incomplete') { toast.error('Add their name and mobile number, or untick "for someone else".'); return; }
      const res = await create({
        ...(onSite && { onSite }),
        serviceType: spec.type,
        title: spec.task || spec.title,
        instructions,
        pickupLocation: point(places.pickup),
        destination: point(places.destination) || undefined,
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt).toISOString() }),
        items: shopping
          ? items.filter((i) => i.name.trim()).map((i) => ({
            ...i, maxApprovedPricePaise: Math.round((Number(i.maxApprovedPricePaise) || 0) * 100),
          }))
          : [],
        paymentMethod,
        idempotencyKey,
        ...surge.bookingFields,
        ...(tip > 0 && { tipPaise: tip * 100 }),
      }).unwrap();
      toast.success('Task requested');
      if (res.task?.paymentMethod === 'online') {
        await pay({ bookingSource: 'helping', bookingId: res.task._id, label: 'Helper service charge' });
      }
      draftDone();
      nav(`/helping/tasks/${res.task._id}`);
    } catch (err) {
      if (surgeChanged(err, surge.refetch)) { toast(err.data.error, { icon: '⚡' }); return; }
      toast.error(err?.data?.error || 'Could not create the task');
    }
  }

  const charge = quoteData?.charge;
  // Priced and ready to request: home's "Continue your booking" and one reminder push (jobs/checkout-draft).
  const signedIn = !!useSelector(selectAuth)?.accessToken;
  const draftDone = useCheckoutDraft('helping', charge ? {
    title: spec.draft || spec.title, step: 'Confirm', path: `/helping/shopping?mode=${mode}`, pricePaise: charge.serviceChargePaise ?? null,
  } : null, signedIn);
  // Busy area, rain, night: own lines on the service fee, held while they decide (jobs/surge).
  const surge = useSurge({
    kind: 'helping', line: spec.type, loc: pickupLoc,
    basePaise: charge ? Math.max(0, (charge.serviceChargePaise || 0) - (charge.taxPaise || 0) - (charge.platformFeePaise || 0)) : null,
    skip: !charge,
  });
  // An optional tip, in the total before paying (jobs/boost-tip tipAtBooking). Rupees.
  const [tip, setTip] = useState(0);
  const canQuote = !!pickupLoc && (!spec.endRequired || !!destLoc) && (!shopping || items.some((i) => i.name.trim()));


  if (notHere) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <GrowingHere
          service={{ code: spec.line, domainCode: spec.assist ? 'family_assist' : 'helping_services', name: spec.assist ? spec.title.toLowerCase() : 'shopping and pickup' }}
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
        <button type="button" onClick={() => goBack()} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">{spec.title}</h1>
      </div>

      <Shell>
        {spec.assist ? (
          <p className="rounded-2xl bg-zappy-50 px-4 py-3 text-sm font-semibold text-zappy-800">{spec.blurb}</p>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          {[['shop', 'Shop for Me', '/services/helping/shopping.webp'], ['pickup', 'Pick Up for Me', '/services/helping/pickup.webp']].map(([k, label, photo]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              aria-pressed={mode === k}
              className={`overflow-hidden rounded-2xl bg-white text-left ring-2 transition ${mode === k ? 'ring-zappy-600 shadow-sm' : 'ring-slate-100 hover:ring-slate-200'}`}
            >
              <img src={photo} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
              <span className={`block px-3 py-2.5 text-sm font-bold ${mode === k ? 'text-[#0F172A]' : 'text-slate-500'}`}>{label}</span>
            </button>
          ))}
        </div>
        )}

        {shopping ? (
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
                  label={spec.photo || 'reference photo'}
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
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{spec.ask}</p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={spec.hint}
              rows={3}
              className="w-full rounded-xl border-2 border-slate-200 p-2.5"
            />
          </div>
        )}

        {shopping && (
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={spec.hint || 'Anything else the helper should know?'}
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
              <span className="block text-xs text-slate-400">{spec.start}</span>
              <span className="block font-bold text-[#0F172A] truncate">{pickupLoc?.address || 'Choose a location'}</span>
            </span>
          </button>
          <NearestArrival line={spec.type} loc={pickupLoc} noun="helper" />
          {spec.end && (
          <button
            type="button"
            onClick={() => setPickerFor('dest')}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left"
          >
            <MapPin size={18} className="text-emerald-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">{spec.end}</span>
              <span className="block font-bold text-[#0F172A] truncate">{destLoc?.address || 'Choose a destination'}</span>
            </span>
          </button>
          )}
        </div>

        {spec.assist && (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{spec.when ? 'When' : 'When (leave empty for now)'}</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 bg-white p-2.5 font-medium"
            />
          </label>
        )}

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
                <span>{formatPaise(charge.serviceChargePaise + surge.totalPaise + tip * 100)}</span>
              </div>
              <SurgeLines quote={surge.quote} />
              {tip > 0 && <p className="flex justify-between text-[12.5px] font-semibold text-rose-600"><span>Tip for your helper</span><span>+₹{tip}</span></p>}
              {shopping && itemBudgetPaise > 0 && (
                <div className="flex justify-between font-bold text-slate-500">
                  <span>Item budget (max)</span>
                  <span>up to {formatPaise(itemBudgetPaise)}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {charge && <TipAtCheckout value={tip} onChange={setTip} />}
        <SomeoneElse onChange={setOnSite} />
        <PendingFeeNotice />
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
        // The picker fills its container: give it the whole screen, above the bottom bar.
        <div className="fixed inset-0 z-[150] bg-white">
          <LocationPicker
            serviceLabel={spec.assist ? 'Family Assist' : 'Helping Services'}
            onCancel={() => setPickerFor(null)}
            onConfirm={(loc) => {
              if (pickerFor === 'pickup') setPickupLoc(loc); else setDestLoc(loc);
              setPickerFor(null);
            }}
          />
        </div>
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
