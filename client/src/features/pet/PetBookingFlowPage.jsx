import { useScrollTopOnChange } from '@shared/components/common/ScrollToTop';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useFlowStep, useDraft, readDraft, clearDraft, useSafeBack } from '../../hooks/useBookingFlow';
import ResumeBanner from '../../components/common/ResumeBanner';
import {
  ArrowLeft, Loader2, MapPin, Check, PawPrint, Star, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GrowingHere from '../catalog/serviceability/GrowingHere';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import {
  useMyPetsQuery, usePetVariantsQuery, usePetAddonsQuery, useLazyPetCompatibilityQuery,
  usePetQuoteMutation, usePetProviderSearchMutation, useCreatePetBookingMutation,
} from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayMethodPicker } from '@shared/components/common/PayMethodPicker';
import SomeoneElse from '@shared/components/booking/SomeoneElse';
import PendingFeeNotice from '@shared/components/booking/PendingFeeNotice';
import { usePayBooking } from '@shared/hooks/usePayBooking';
import { doorAddress } from '@shared/utils/doorAddress';
import ArrivalBadge from '@shared/components/common/ArrivalBadge';
import SurgeLines, { useSurge, surgeChanged } from '@shared/components/common/SurgeLines';
import TipAtCheckout from '@shared/components/common/TipAtCheckout';

/**
 * One adaptive booking flow for all seven categories (§3, §54).
 *
 * §54's rule is the point of this file existing as ONE component instead of
 * seven near-identical ones: "do not make the customer fill a huge form —
 * ask only what is relevant." Which fields appear is decided by the
 * VARIANT's own `pricingUnit` — boarding asks for check-in/check-out,
 * a walk asks for nothing but a time, transport asks for a destination —
 * so adding an eighth category never means writing an eighth screen.
 */
function Shell({ children }) { return <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-32">{children}</div>; }

const STEPS = ['pets', 'variant', 'addons', 'schedule', 'location', 'providers', 'confirm'];

/**
 * Everything on a pet quote besides each pet's own line, so the breakdown
 * adds up to the total. Peak-time pricing and waiting time show as one
 * balancing line rather than leaving the sum short.
 */
function petExtraLines(q) {
  const lines = [
    ['Add-ons', q.addonsPaise], ['Travel', q.travelPaise], ['Pickup', q.pickupPaise],
    ['Drop back', q.returnPaise], ['Special handling', q.specialHandlingPaise],
    ['Stay discount', -(q.stayDiscountPaise || 0)], ['Coupon', -(q.couponPaise || 0)],
    ['Platform fee', q.platformFeePaise], ['Taxes', q.taxPaise],
  ].filter(([, p]) => p);
  const shown = (q.lines || []).reduce((t, l) => t + (l.linePaise || 0), 0) + lines.reduce((t, [, p]) => t + p, 0);
  const gap = (q.totalPaise || 0) - shown;
  if (Math.abs(gap) >= 100) lines.splice(lines.length - 2, 0, [gap > 0 ? 'Peak time & waiting' : 'Adjustment', gap]);
  return lines;
}

/**
 * Pet care booking. Each step is in the address so the phone's Back goes one
 * step back, and the choices are saved on the device as the customer goes, so
 * leaving and coming back resumes (useBookingFlow). "Start over" clears it.
 */
export default function PetBookingFlowPage() {
  const { categoryCode } = useParams();
  const nav = useNavigate();
  const draftKey = `pet:${categoryCode}`;
  const [run, setRun] = useState(0);
  const saved = useMemo(() => readDraft(draftKey), [draftKey, run]);
  return (
    <PetBookingFlow key={`${categoryCode}-${run}`} categoryCode={categoryCode} saved={saved} draftKey={draftKey}
      onStartOver={() => { clearDraft(draftKey); nav({ search: '' }, { replace: true }); setRun((n) => n + 1); }} />
  );
}

function PetBookingFlow({ categoryCode, saved, draftKey, onStartOver }) {
  const nav = useNavigate();
  const safeBack = useSafeBack('/pet');

  const { data: petsData } = useMyPetsQuery();
  const { data: variantsData } = usePetVariantsQuery({ categoryCode });
  const pets = petsData?.pets || [];
  const variants = variantsData?.variants || [];

  const [selectedPetIds, setSelectedPetIds] = useState(saved?.selectedPetIds ?? []);
  const [variantByPet, setVariantByPet] = useState(saved?.variantByPet ?? {}); // petId -> variantCode
  const [addonsByPet, setAddonsByPet] = useState(saved?.addonsByPet ?? {}); // petId -> [addonCode]
  const [checkInAt, setCheckInAt] = useState(saved?.checkInAt ?? '');
  const [checkOutAt, setCheckOutAt] = useState(saved?.checkOutAt ?? '');
  const [scheduledAt, setScheduledAt] = useState(saved?.scheduledAt ?? '');
  const [loc, setLoc] = useState(saved?.loc ?? null);
  const [destLoc, setDestLoc] = useState(saved?.destLoc ?? null);
  const [pickerFor, setPickerFor] = useState(null);
  const [provider, setProvider] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(saved?.paymentMethod ?? 'cash');
  // Booking for someone else: who the provider meets ('incomplete' while being typed).
  const [onSite, setOnSite] = useState(null);
  // One key per visit to this screen, so a double tap cannot book twice.
  const [idempotencyKey] = useState(() => `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const { pay, paying } = usePayBooking();
  const [checkCompat] = useLazyPetCompatibilityQuery();

  const selectedPets = pets.filter((p) => selectedPetIds.includes(p._id));
  const primaryVariant = variants.find((v) => v.code === variantByPet[selectedPetIds[0]]);
  const isStay = primaryVariant && ['boarding', 'daycare'].includes(primaryVariant.allowedModes?.[0]);
  const needsDates = primaryVariant?.pricingUnit === 'per_night' || primaryVariant?.pricingUnit === 'per_day';
  const needsTransport = primaryVariant?.pricingUnit === 'per_km';

  const [getQuote, { data: quoteData, isLoading: quoting }] = usePetQuoteMutation();
  const [searchProviders, { data: providersData, isLoading: searching }] = usePetProviderSearchMutation();
  const [create, { isLoading: booking }] = useCreatePetBookingMutation();

  /*
   * A step opens only with what it needs. Providers are a fresh search each
   * time (availability changes), so a resume lands on the location step.
   */
  const hasVariant = !!variantByPet[selectedPetIds[0]];
  const NEEDS = {
    variant: selectedPetIds.length > 0, addons: hasVariant, schedule: hasVariant, location: hasVariant,
    providers: !!providersData, confirm: !!provider,
  };
  const valid = (st) => st in NEEDS && NEEDS[st];
  const [step, setStep, backTo] = useFlowStep('pets', { valid });
  useScrollTopOnChange(step);
  const PREV = {
    variant: 'pets', addons: 'variant', schedule: 'addons',
    location: needsDates || needsTransport ? 'addons' : 'schedule', providers: 'location', confirm: 'providers',
  };
  const back = () => (PREV[step] ? backTo(PREV[step]) : safeBack());

  useDraft(draftKey, {
    selectedPetIds, variantByPet, addonsByPet, checkInAt, checkOutAt, scheduledAt, loc, destLoc, paymentMethod,
    step: ['providers', 'confirm'].includes(step) ? 'location' : step,
  }, selectedPetIds.length > 0);
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (saved?.step && saved.step !== 'pets' && step === 'pets' && valid(saved.step)) {
      setStep(saved.step, { replace: true });
      setResumed(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePet(petId) {
    setSelectedPetIds((prev) => (prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]));
  }

  function petEntries() {
    return selectedPetIds.map((petId) => ({
      petId, variantCode: variantByPet[petId], addonCodes: addonsByPet[petId] || [],
    })).filter((e) => e.variantCode);
  }

  async function pickVariant(v) {
    // Checked here, at the moment of choosing — not after a price is already
    // shown and the customer has invested in the flow (§51, §54).
    for (const p of selectedPets) {
      const result = await checkCompat({ species: p.species, categoryCode, variantCode: v.code, size: p.size }).unwrap().catch(() => ({ allowed: true }));
      if (!result.allowed) {
        toast.error(`${p.name}: ${result.reason}`);
        return;
      }
    }
    setVariantByPet(Object.fromEntries(selectedPetIds.map((id) => [id, v.code])));
  }

  // Opened from a showcase tile ("?variant=…"): choose it for the selected pets
  // once they reach that step — with the same compatibility check as a tap.
  const [params] = useSearchParams();
  const presetDone = useRef(false);
  useEffect(() => {
    const preset = variants.find((v) => v.code === params.get('variant'));
    if (step !== 'variant' || presetDone.current || !preset || variantByPet[selectedPetIds[0]]) return;
    presetDone.current = true;
    pickVariant(preset);
  }, [step, variants]); // eslint-disable-line react-hooks/exhaustive-deps

  async function goSchedule() {
    setStep(needsDates || needsTransport ? 'location' : 'schedule');
  }

  async function refreshQuote() {
    try {
      await getQuote({
        categoryCode,
        pets: petEntries(),
        checkInAt: checkInAt || null,
        checkOutAt: checkOutAt || null,
        serviceLocation: loc ? { type: 'Point', coordinates: [loc.lng, loc.lat], address: doorAddress(loc) } : null,
      }).unwrap();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not price this');
    }
  }

  async function findProviders() {
    try {
      await searchProviders({
        categoryCode,
        variantCode: variantByPet[selectedPetIds[0]],
        serviceMode: primaryVariant?.allowedModes?.[0] || 'doorstep',
        pets: petEntries(),
        serviceLocation: loc ? { type: 'Point', coordinates: [loc.lng, loc.lat], address: doorAddress(loc) } : null,
        checkInAt: checkInAt || null,
        checkOutAt: checkOutAt || null,
        // Only pros whose hours cover a visit booked for later.
        scheduledAt: scheduledAt || null,
      }).unwrap();
      setStep('providers');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not find providers');
    }
  }

  async function book() {
    if (!loc) { toast.error('Choose a location'); return; }
    try {
      if (onSite === 'incomplete') { toast.error('Add their name and mobile number, or untick "for someone else".'); return; }
      const res = await create({
        ...(onSite && { onSite }),
        categoryCode,
        serviceMode: primaryVariant?.allowedModes?.[0] || 'doorstep',
        pets: petEntries(),
        scheduledAt: scheduledAt || null,
        checkInAt: checkInAt || null,
        checkOutAt: checkOutAt || null,
        serviceLocation: { type: 'Point', coordinates: [loc.lng, loc.lat], address: doorAddress(loc) },
        destination: destLoc ? { type: 'Point', coordinates: [destLoc.lng, destLoc.lat], address: destLoc.address } : undefined,
        workerId: provider?.workerId || undefined,
        shopId: provider?.shopId || undefined,
        paymentMethod,
        idempotencyKey,
        ...surge.bookingFields,
        ...(tip > 0 && { tipPaise: tip * 100 }),
      }).unwrap();
      toast.success('Booked');
      if (res.booking?.paymentMethod === 'online') {
        await pay({ bookingSource: 'pet', bookingId: res.booking._id, label: 'Pet care booking' });
      }
      clearDraft(draftKey);
      nav(`/pet/bookings/${res.booking._id}`, { replace: true });
    } catch (err) {
      if (surgeChanged(err, surge.refetch)) {
        toast(err.data.error, { icon: '⚡' });
      } else if (err?.data?.code === 'NOT_COMPATIBLE') {
        toast.error(err.data.error);
      } else {
        toast.error(err?.data?.error || 'Could not create the booking');
      }
    }
  }

  const quote = quoteData?.quote;
  // Busy area, rain, night on a visit: own lines, held while they decide (jobs/surge).
  const surge = useSurge({
    kind: 'pet', line: categoryCode, serviceMode: primaryVariant?.allowedModes?.[0] || 'doorstep', loc,
    basePaise: quote ? Math.max(0, (quote.totalPaise || 0) - (quote.taxPaise || 0) - (quote.platformFeePaise || 0)) : null,
    skip: step !== 'confirm' || !quote,
  });
  // An optional tip, in the total before paying (jobs/boost-tip tipAtBooking). Rupees.
  const [tip, setTip] = useState(0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={back} aria-label="Back" className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A] capitalize">{categoryCode.replace(/_/g, ' ')}</h1>
      </div>
      {resumed && <ResumeBanner onStartOver={onStartOver} onDismiss={() => setResumed(false)} />}

      {step === 'pets' && (
        <Shell>
          <p className="text-sm font-bold text-slate-500">Which pet is this for?</p>
          {!pets.length && (
            <div className="text-center py-10 text-slate-400">
              <PawPrint size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Add a pet first.</p>
              <button type="button" onClick={() => nav('/pet/my-pets')} className="mt-3 text-zappy-600 font-bold text-sm">Add a pet</button>
            </div>
          )}
          <div className="space-y-2">
            {pets.map((p) => (
              <button
                key={p._id} type="button" onClick={() => togglePet(p._id)}
                className={`w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left ${
                  selectedPetIds.includes(p._id) ? 'border-zappy-500 bg-zappy-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <span className={`shrink-0 w-6 h-6 rounded-lg border-2 grid place-items-center ${
                  selectedPetIds.includes(p._id) ? 'border-zappy-500 bg-zappy-500 text-white' : 'border-slate-300'
                }`}><Check size={14} strokeWidth={3} /></span>
                <span className="font-bold text-[#0F172A]">{p.name}</span>
                <span className="text-xs text-slate-400 capitalize ml-auto">{p.species} · {p.size?.replace('_', ' ')}</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={!selectedPetIds.length} onClick={() => setStep('variant')}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-40">Continue</button>
        </Shell>
      )}

      {step === 'variant' && (
        <Shell>
          <p className="text-sm font-bold text-slate-500">Choose the service</p>
          <div className="space-y-2">
            {variants.filter((v) => selectedPets.every((p) => v.species.includes(p.species))).map((v) => (
              <button
                key={v.code} type="button"
                onClick={() => pickVariant(v)}
                className={`w-full flex items-center justify-between rounded-2xl border-2 p-4 text-left ${
                  selectedPetIds.every((id) => variantByPet[id] === v.code) ? 'border-zappy-500 bg-zappy-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <span>
                  <span className="block font-bold text-[#0F172A]">{v.name}</span>
                  {v.description && <span className="block text-xs text-slate-500 mt-0.5">{v.description}</span>}
                </span>
                {v.isPopular && <Star size={14} className="text-amber-400 fill-amber-400 shrink-0" />}
              </button>
            ))}
          </div>
          <button type="button" disabled={!selectedPetIds.every((id) => variantByPet[id])} onClick={() => setStep('addons')}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-40">Continue</button>
        </Shell>
      )}

      {step === 'addons' && (
        <AddonsStep
          categoryCode={categoryCode} selectedPets={selectedPets} variantByPet={variantByPet}
          addonsByPet={addonsByPet} setAddonsByPet={setAddonsByPet}
          onContinue={goSchedule}
        />
      )}

      {step === 'schedule' && (
        <Shell>
          <p className="text-sm font-bold text-slate-500">When?</p>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-xl border-2 border-slate-200 p-3" />
          <button type="button" disabled={!scheduledAt} onClick={() => setStep('location')}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-40">Continue</button>
        </Shell>
      )}

      {step === 'location' && (
        <Shell>
          {needsDates && (
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Stay dates</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} className="rounded-xl border-2 border-slate-200 p-2.5" />
                <input type="date" value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} className="rounded-xl border-2 border-slate-200 p-2.5" />
              </div>
            </div>
          )}
          <button type="button" onClick={() => setPickerFor('loc')}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left">
            <MapPin size={18} className="text-zappy-500 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">Where</span>
              <span className="block font-bold text-[#0F172A] truncate">{loc?.address || 'Choose a location'}</span>
            </span>
          </button>
          {needsTransport && (
            <button type="button" onClick={() => setPickerFor('dest')}
              className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left">
              <MapPin size={18} className="text-emerald-500 shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs text-slate-400">Destination</span>
                <span className="block font-bold text-[#0F172A] truncate">{destLoc?.address || 'Choose a destination'}</span>
              </span>
            </button>
          )}
          <button type="button" onClick={refreshQuote} disabled={!loc || quoting || (needsDates && (!checkInAt || !checkOutAt))}
            className="w-full rounded-2xl bg-slate-100 text-slate-700 font-bold py-3 disabled:opacity-50">
            {quoting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'See the price'}
          </button>
          {quote && (
            <div className="rounded-2xl border-2 border-zappy-100 bg-zappy-50/50 p-4 space-y-1 text-sm">
              {quote.lines.map((l, i) => (
                <div key={i} className="flex justify-between"><span>{selectedPets[i]?.name}</span><span>{formatPaise(l.linePaise)}</span></div>
              ))}
              {petExtraLines(quote).map(([label, p]) => (
                <div key={label} className="flex justify-between text-slate-500">
                  <span>{label}</span><span>{p < 0 ? `− ${formatPaise(-p)}` : formatPaise(p)}</span>
                </div>
              ))}
              <div className="flex justify-between font-black pt-1 border-t border-zappy-100"><span>Total</span><span>{formatPaise(quote.totalPaise)}</span></div>
            </div>
          )}
          <button type="button" onClick={findProviders} disabled={!loc || searching}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-40">
            {searching ? 'Finding providers…' : 'Find a provider'}
          </button>
        </Shell>
      )}

      {step === 'providers' && (
        <Shell>
          <p className="text-sm font-bold text-slate-500">{(providersData?.providers || []).length} providers available</p>
          {!(providersData?.providers || []).length && (() => {
            const nearby = providersData?.nearbyCount || 0;
            const reason = providersData?.primaryReason;
            // Nobody onboarded near this address: we're growing here — record it,
            // offer to notify, take no booking.
            if (nearby === 0) {
              return (
                <GrowingHere
                  service={{ code: categoryCode, domainCode: 'pet_services', name: 'pet care' }}
                  lat={loc?.lat}
                  lng={loc?.lng}
                  address={loc?.address || ''}
                  onChangeLocation={() => setStep('location')}
                />
              );
            }
            let text = 'No provider is free for this yet — try a different time.';
            if (reason === 'outside_radius') {
              text = `${nearby} ${nearby === 1 ? 'provider covers' : 'providers cover'} this service nearby, but not this address — try a location closer to town.`;
            } else if (reason === 'no_capacity') {
              text = `${nearby} ${nearby === 1 ? 'provider is' : 'providers are'} fully booked for those dates — try different dates.`;
            }
            return (
              <div className="text-center py-10 text-slate-400 text-sm px-4">
                {text}
              </div>
            );
          })()}
          {(providersData?.providers || []).map((p) => (
            <button
              key={p.capabilityId} type="button"
              onClick={() => { setProvider(p); setStep('confirm'); }}
              className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left"
            >
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[#0F172A]">{p.name}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" /> {p.rating != null ? p.rating.toFixed(1) : 'New'}
                  {p.distanceKm != null && <span>· {p.distanceKm} km</span>}
                  {p.completedJobs > 0 && <span>· {p.completedJobs} jobs</span>}
                </span>
                {/* A visit: how soon they can be at the door (jobs/arrival). */}
                {p.arrivalMinutes != null && <ArrivalBadge minutes={p.arrivalMinutes} withinPromise={p.arrivalWithinPromise} className="mt-1.5" />}
              </span>
            </button>
          ))}
        </Shell>
      )}

      {step === 'confirm' && (
        <Shell>
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-1 text-sm">
            <p className="font-black text-[#0F172A]">{provider?.name}</p>
            <p className="text-slate-500">{primaryVariant?.name} · {selectedPets.map((p) => p.name).join(', ')}</p>
          </div>
          {quote && (
            <div className="rounded-2xl border-2 border-zappy-100 bg-zappy-50/50 p-4">
              <div className="flex justify-between font-black">
                <span>Total</span><span>{formatPaise(quote.totalPaise + surge.totalPaise + tip * 100)}</span>
              </div>
              <SurgeLines quote={surge.quote} className="mt-2" />
              {tip > 0 && <p className="mt-1 flex justify-between text-[12.5px] font-semibold text-rose-600"><span>Tip for your pro</span><span>+₹{tip}</span></p>}
            </div>
          )}
          {quote && <TipAtCheckout value={tip} onChange={setTip} />}
          <SomeoneElse onChange={setOnSite} />
          <PendingFeeNotice />
          <PayMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
          <button type="button" onClick={book} disabled={booking || paying}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50">
            {paying ? 'Opening payment…' : booking ? 'Booking…' : 'Confirm booking'}
          </button>
        </Shell>
      )}

      {pickerFor && (
        // The picker fills its container: give it the whole screen, above the bottom bar.
        <div className="fixed inset-0 z-[150] bg-white">
          <LocationPicker
            serviceLabel="Pet Services"
            onCancel={() => setPickerFor(null)}
            onConfirm={(l) => { if (pickerFor === 'loc') setLoc(l); else setDestLoc(l); setPickerFor(null); }}
          />
        </div>
      )}
    </div>
  );
}

function AddonsStep({ categoryCode, selectedPets, variantByPet, addonsByPet, setAddonsByPet, onContinue }) {
  const { data } = usePetAddonsQuery({ categoryCode });
  const addons = data?.addons || [];

  function toggle(petId, code) {
    setAddonsByPet((prev) => {
      const list = prev[petId] || [];
      return { ...prev, [petId]: list.includes(code) ? list.filter((c) => c !== code) : [...list, code] };
    });
  }

  if (!addons.length) {
    onContinue();
    return null;
  }

  return (
    <Shell>
      <p className="text-sm font-bold text-slate-500">Add extras (optional)</p>
      {selectedPets.map((p) => (
        <div key={p._id} className="space-y-1.5">
          <p className="text-xs font-bold text-slate-400">{p.name}</p>
          {addons.map((a) => (
            <button
              key={a.code} type="button" onClick={() => toggle(p._id, a.code)}
              className={`w-full flex items-center justify-between rounded-xl border-2 p-3 text-left text-sm ${
                (addonsByPet[p._id] || []).includes(a.code) ? 'border-zappy-500 bg-zappy-50/60' : 'border-slate-200 bg-white'
              }`}
            >
              <span>{a.name}</span>
              <span className="font-bold flex items-center gap-1"><Plus size={11} />{formatPaise(a.pricePaise)}</span>
            </button>
          ))}
        </div>
      ))}
      <button type="button" onClick={onContinue} className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4">Continue</button>
    </Shell>
  );
}
