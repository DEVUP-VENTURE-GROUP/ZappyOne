import { useScrollTopOnChange } from '@shared/components/common/ScrollToTop';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, MapPin, Check, PawPrint, Star, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import GrowingHere from '../../components/serviceability/GrowingHere';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import {
  useMyPetsQuery, usePetVariantsQuery, usePetAddonsQuery, useLazyPetCompatibilityQuery,
  usePetQuoteMutation, usePetProviderSearchMutation, useCreatePetBookingMutation,
} from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';
import { PayMethodPicker } from '@shared/components/common/PayMethodPicker';
import { usePayBooking } from '@shared/hooks/usePayBooking';

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

export default function PetBookingFlowPage() {
  const { categoryCode } = useParams();
  const nav = useNavigate();
  const [step, setStep] = useState('pets');
  useScrollTopOnChange(step);

  const { data: petsData } = useMyPetsQuery();
  const { data: variantsData } = usePetVariantsQuery({ categoryCode });
  const pets = petsData?.pets || [];
  const variants = variantsData?.variants || [];

  const [selectedPetIds, setSelectedPetIds] = useState([]);
  const [variantByPet, setVariantByPet] = useState({}); // petId -> variantCode
  const [addonsByPet, setAddonsByPet] = useState({}); // petId -> [addonCode]
  const [checkInAt, setCheckInAt] = useState('');
  const [checkOutAt, setCheckOutAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loc, setLoc] = useState(null);
  const [destLoc, setDestLoc] = useState(null);
  const [pickerFor, setPickerFor] = useState(null);
  const [provider, setProvider] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
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
        serviceLocation: loc ? { type: 'Point', coordinates: [loc.lng, loc.lat], address: loc.address } : null,
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
        serviceLocation: loc ? { type: 'Point', coordinates: [loc.lng, loc.lat], address: loc.address } : null,
        checkInAt: checkInAt || null,
        checkOutAt: checkOutAt || null,
      }).unwrap();
      setStep('providers');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not find providers');
    }
  }

  async function book() {
    if (!loc) { toast.error('Choose a location'); return; }
    try {
      const res = await create({
        categoryCode,
        serviceMode: primaryVariant?.allowedModes?.[0] || 'doorstep',
        pets: petEntries(),
        scheduledAt: scheduledAt || null,
        checkInAt: checkInAt || null,
        checkOutAt: checkOutAt || null,
        serviceLocation: { type: 'Point', coordinates: [loc.lng, loc.lat], address: loc.address },
        destination: destLoc ? { type: 'Point', coordinates: [destLoc.lng, destLoc.lat], address: destLoc.address } : undefined,
        workerId: provider?.workerId || undefined,
        shopId: provider?.shopId || undefined,
        paymentMethod,
        idempotencyKey,
      }).unwrap();
      toast.success('Booked');
      if (res.booking?.paymentMethod === 'online') {
        await pay({ bookingSource: 'pet', bookingId: res.booking._id, label: 'Pet care booking' });
      }
      nav(`/pet/bookings/${res.booking._id}`);
    } catch (err) {
      if (err?.data?.code === 'NOT_COMPATIBLE') {
        toast.error(err.data.error);
      } else {
        toast.error(err?.data?.error || 'Could not create the booking');
      }
    }
  }

  const quote = quoteData?.quote;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A] capitalize">{categoryCode.replace(/_/g, ' ')}</h1>
      </div>

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
              {quote.travelPaise > 0 && <div className="flex justify-between text-slate-500"><span>Travel</span><span>{formatPaise(quote.travelPaise)}</span></div>}
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
                  <Star size={11} className="fill-amber-400 text-amber-400" /> {p.rating?.toFixed(1) || '—'}
                  {p.distanceKm != null && <span>· {p.distanceKm} km</span>}
                  {p.completedJobs > 0 && <span>· {p.completedJobs} jobs</span>}
                </span>
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
            <div className="rounded-2xl border-2 border-zappy-100 bg-zappy-50/50 p-4 flex justify-between font-black">
              <span>Total</span><span>{formatPaise(quote.totalPaise)}</span>
            </div>
          )}
          <PayMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
          <button type="button" onClick={book} disabled={booking || paying}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50">
            {paying ? 'Opening payment…' : booking ? 'Booking…' : 'Confirm booking'}
          </button>
        </Shell>
      )}

      {pickerFor && (
        <LocationPicker
          serviceLabel="Pet Services"
          onCancel={() => setPickerFor(null)}
          onConfirm={(l) => { if (pickerFor === 'loc') setLoc(l); else setDestLoc(l); setPickerFor(null); }}
        />
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
