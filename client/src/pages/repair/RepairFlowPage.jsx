import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatPaise } from '@shared/utils/money';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Star,
  MapPin,
  Clock,
  Check,
  AlertTriangle,
  Smartphone,
  Laptop,
  Wrench,
  HelpCircle,
  X,
  Home,
  Truck,
  Lock,
  Plus,
} from 'lucide-react';
import {
  useRepairBrandsQuery, useRepairModelsQuery, useRepairProblemsQuery,
  useRepairProductTypesQuery, useRepairFamiliesQuery, useRepairConfigurationsQuery,
  useSubmitModelIdentificationMutation, useMyModelIdentificationsQuery,
  useSubmitRepairDiagnosticMutation, useRepairProvidersQuery, useRepairPricePreviewQuery,
  useCreateRepairBookingMutation, useSubmitRepairCatalogRequestMutation,
  useRepairAddOnsQuery,
} from '@shared/services/api';
import { selectLocation, selectHasLocation, setLocation } from '@shared/store/locationSlice';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import toast from 'react-hot-toast';
import GrowingHere from '../../components/serviceability/GrowingHere';
import { PayMethodPicker } from '@shared/components/common/PayMethodPicker';
import BrandLogo from '@shared/components/common/BrandLogo';
import { usePayBooking } from '@shared/hooks/usePayBooking';

/**
 * Customer repair booking flow — one engine, every vertical.
 *
 * Phones: Brand → Model → Problem → Diagnosis → Repair → Provider → Confirm.
 * Laptops insert the layers a laptop actually needs to be identified by:
 * Brand → Type → Family → Model → Configuration → …
 *
 * The extra steps are not switched on by naming a vertical. They appear when
 * the catalog returns something to put in them — a vertical with no product
 * types simply never sees that step, and one whose model has a single build
 * skips the configuration picker. That way a third vertical is a seed script,
 * not another copy of this file (§91).
 *
 * Two product rules are enforced visually, not just server-side:
 *
 *   The customer is never shown a firm price for a repair that genuinely needs
 *   inspection (§56). Those paths say "diagnosis required" and explain that a
 *   quote will follow — showing ₹0 or a guess would be the dishonest option.
 *
 *   Providers are compared on real differences — price, warranty, ETA, rating
 *   (§70) — rather than presented as one anonymous "book now", because the
 *   whole point of a marketplace is that those differences are visible.
 *
 * Every list on this screen comes from the API. There is no hardcoded brand,
 * model, problem or price anywhere in this file.
 */

/**
 * The funnel is not the same length in every vertical, so the step list is
 * built rather than declared. `skipped` holds steps the catalog turned out to
 * have nothing for, so going back does not bounce forward off them again.
 */
function buildSteps(deep) {
  /*
   * `fuel` sits in the deep flow for every vertical and removes itself when the
   * catalog has nothing to ask — a laptop has no powertrain, a scooter carries
   * its fuel in its product type, and only cars are genuinely sold as the same
   * model with different engines. Gating it on the data rather than on the
   * vertical name is what keeps this list free of `if (vertical === ...)`.
   */
  /*
   * `addons` sits AFTER the provider, because an add-on is priced by the shop
   * that is already coming — not by the cheapest provider of that add-on in
   * the city. It removes itself when the vertical (or the chosen provider) has
   * no add-ons priced, so nothing gains an empty screen.
   */
  return deep
    ? ['brand', 'type', 'family', 'model', 'config', 'fuel', 'problem', 'diagnose', 'mode', 'provider', 'addons', 'confirm']
    : ['brand', 'model', 'problem', 'diagnose', 'mode', 'provider', 'addons', 'confirm'];
}

/**
 * How each vertical talks about the thing being repaired.
 *
 * The step titles used to be a single ternary between "phone" and "laptop",
 * which silently asked a car owner for their phone brand the moment a third
 * vertical existed. Wording is content, so it lives in one table that a new
 * vertical extends — and an unknown vertical still gets sensible generic
 * wording rather than the wrong vertical's.
 */
const NOUNS = {
  mobile: { brand: 'phone brand', type: 'kind of device', build: 'build', it: 'your phone' },
  laptop: { brand: 'laptop brand', type: 'kind of machine', build: 'build', it: 'your laptop' },
  two_wheeler: { brand: 'brand', type: 'kind of vehicle', build: 'variant', it: 'your vehicle' },
  four_wheeler: { brand: 'car brand', type: 'body type', build: 'variant', it: 'your car' },
};
const DEFAULT_NOUNS = { brand: 'brand', type: 'type', build: 'variant', it: 'it' };

/** Display names for the fuel codes the catalog stores. */
const FUEL_LABELS = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  cng: 'CNG',
  hybrid: 'Hybrid',
  electric: 'Electric',
};

/**
 * Which engine or powertrain this particular car has.
 *
 * Read from the MODEL rather than offered as a global list: a Swift is sold as
 * petrol and CNG, a Nexon as petrol, diesel and electric. A single list would
 * invite someone to describe a car nobody built and then be asked about a CNG
 * kit their vehicle does not have.
 *
 * The answer is not cosmetic — it decides which symptoms the next screen shows.
 */
function FuelStep({ model, fuels, onPick }) {
  return (
    <Shell>
      <p className="mb-3 text-[12.5px] text-slate-500">
        {model?.name} is sold with more than one engine. Which one is yours?
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {fuels.map((f) => (
          <button
            key={f.code}
            onClick={() => onPick(f)}
            className="rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:ring-zappy-300"
          >
            <span className="block text-[14px] font-bold text-[#0F172A]">{f.name}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* Shared chrome */

function StepHeader({ steps, step, onBack, title, subtitle }) {
  const index = steps.indexOf(step);
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-100">
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <ArrowLeft size={17} strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-zappy-600 uppercase tracking-wide">
            Step {index + 1} of {steps.length}
          </p>
          <p className="font-bold text-[#0F172A] truncate">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="h-0.5 bg-slate-100">
        <motion.div
          className="h-full bg-zappy-600"
          animate={{ width: `${((index + 1) / steps.length) * 100}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>
    </header>
  );
}

function Shell({ children }) {
  return <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-4 space-y-3">{children}</div>;
}

function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
}

/** "Can't find it?" escape hatch — §67. */
function MissingItemSheet({ kind, brandCode, onClose }) {
  const [form, setForm] = useState({ brandName: '', modelName: '', notes: '' });
  const [submit, { isLoading }] = useSubmitRepairCatalogRequestMutation();

  async function send() {
    try {
      await submit({ kind, ...form, brandName: form.brandName || brandCode }).unwrap();
      toast.success("Thanks — we'll add it and let you know.");
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send the request');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-sheet sm:rounded-card w-full sm:max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Tell us what's missing</h3>
          <button onClick={onClose} className="text-slate-400"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          We'll add it to the catalog. You won't lose your place — we'll message you when it's ready.
        </p>
        {kind === 'brand' && (
          <input className="input text-sm w-full" placeholder="Brand name"
            value={form.brandName} onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))} />
        )}
        <input className="input text-sm w-full" placeholder="Model name (e.g. Galaxy A55 5G)"
          value={form.modelName} onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))} />
        <textarea rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zappy-100 resize-none"
          placeholder="Anything else that helps us identify it"
          value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button onClick={send} disabled={isLoading || (!form.modelName && !form.brandName)} className="btn-primary w-full">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send request'}
        </button>
      </div>
    </div>
  );
}

/* Steps */
/**
 * "I don't know my model" — §7.
 *
 * Laptop owners routinely cannot name their machine, and a guess here becomes
 * the wrong part on a technician's van. So this takes whatever they CAN read
 * off the chassis and hands it to a human, instead of inferring a match.
 */
function IdentifySheet({ vertical, brand, onClose }) {
  const [form, setForm] = useState({ modelText: '', productNumber: '', serialNumber: '', notes: '' });
  const [submit, { isLoading }] = useSubmitModelIdentificationMutation();

  const hasSomething = Object.values(form).some((v) => v.trim());

  async function send() {
    try {
      await submit({
        vertical,
        brandCode: brand?.code || '',
        brandName: brand?.name || '',
        ...form,
      }).unwrap();
      toast.success("Sent — we'll identify it and message you.");
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send that');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Help us identify it</h3>
          <button onClick={onClose} className="text-slate-400"><X size={20} /></button>
        </div>
        <p className="text-xs text-slate-500 -mt-1 leading-relaxed">
          Turn the laptop over. The sticker on the base carries a product number — that identifies the
          exact machine, which decides which parts fit. Anything you can read helps.
        </p>
        <input className="input text-sm w-full" placeholder="Model name, if you know it"
          value={form.modelText} onChange={(e) => setForm((f) => ({ ...f, modelText: e.target.value }))} />
        <input className="input text-sm w-full" placeholder="Product number (e.g. 21JK0005IN)"
          value={form.productNumber} onChange={(e) => setForm((f) => ({ ...f, productNumber: e.target.value }))} />
        <input className="input text-sm w-full" placeholder="Serial number (optional)"
          value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
        <textarea rows={2}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zappy-100 resize-none"
          placeholder="Anything else — screen size, year bought, where it was bought"
          value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button onClick={send} disabled={isLoading || !hasSomething} className="btn-primary w-full">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send for identification'}
        </button>
        <p className="text-[11px] text-slate-400 text-center">
          You can keep browsing — we'll notify you the moment we've identified it.
        </p>
      </div>
    </div>
  );
}


function BrandStep({ vertical, onPick }) {
  const { data, isLoading } = useRepairBrandsQuery(vertical);
  const [showMissing, setShowMissing] = useState(false);
  if (isLoading) return <Spinner />;

  const brands = data?.brands || [];
  const popular = data?.popular || [];
  const rest = brands.filter((b) => !popular.some((p) => p.code === b.code));

  const Tile = ({ b }) => (
    <button onClick={() => onPick(b)}
      className="card flex min-h-[96px] flex-col items-center justify-center gap-2 px-2 py-4 transition-colors duration-150 hover:border-line-strong active:bg-sunken">
      <span className="flex h-10 w-full items-center justify-center">
        <BrandLogo name={b.name} url={b.logoUrl} className="h-8 max-w-[84%]" />
      </span>
      <span className="text-center text-[13px] font-semibold leading-tight text-ink-900">{b.name}</span>
    </button>
  );

  return (
    <Shell>
      {showMissing && <MissingItemSheet kind="brand" onClose={() => setShowMissing(false)} />}
      {popular.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Popular brands</p>
          <div className="grid grid-cols-3 gap-2.5">{popular.map((b) => <Tile key={b.code} b={b} />)}</div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 pt-2">All brands</p>
          <div className="grid grid-cols-3 gap-2.5">{rest.map((b) => <Tile key={b.code} b={b} />)}</div>
        </>
      )}
      <button onClick={() => setShowMissing(true)}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
        <HelpCircle size={15} /> Can't find your brand?
      </button>
    </Shell>
  );
}


/**
 * Which kind of machine — laptop, gaming laptop, MacBook, Chromebook.
 *
 * This is the first branch that changes what everything downstream means: a
 * MacBook's "battery replacement" and a gaming laptop's are different jobs
 * with different parts, skills and prices.
 */
function DeviceTypeStep({ vertical, onPick }) {
  const { data, isLoading } = useRepairProductTypesQuery(vertical);
  if (isLoading) return <Spinner />;

  const types = data?.productTypes || [];
  return (
    <Shell>
      <div className="grid grid-cols-2 gap-2.5">
        {types.map((t) => (
          <button key={t.code} onClick={() => onPick(t)}
            className="card flex flex-col items-start gap-1.5 py-4 hover:ring-2 hover:ring-zappy-100 transition text-left">
            <div className="w-9 h-9 rounded-xl bg-zappy-50 flex items-center justify-center">
              <Laptop size={17} className="text-zappy-600" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-bold text-[#0F172A] leading-tight">{t.name}</span>
            {t.description && <span className="text-[11px] text-slate-400 leading-snug">{t.description}</span>}
          </button>
        ))}
      </div>
    </Shell>
  );
}

/**
 * The product line — Pavilion, ThinkPad, ROG.
 *
 * A brand with no families catalogued yet is not an error: the step reports
 * that upward and the flow moves on to the model list rather than showing the
 * customer an empty screen they cannot leave.
 */
function FamilyStep({ vertical, brand, productType, onPick, onSkip }) {
  const { data, isLoading } = useRepairFamiliesQuery({
    vertical, brandCode: brand.code, productTypeCode: productType?.code,
  });
  const families = data?.families || [];

  useEffect(() => {
    if (!isLoading && families.length === 0) onSkip();
  }, [isLoading, families.length, onSkip]);

  if (isLoading || families.length === 0) return <Spinner />;

  return (
    <Shell>
      <div className="space-y-2">
        {families.map((f) => (
          <button key={f.code} onClick={() => onPick(f)}
            className="card w-full flex items-center gap-3 text-left hover:ring-2 hover:ring-zappy-100 transition">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-[#0F172A]">{f.name}</p>
              {f.description && <p className="text-xs text-slate-400 mt-0.5">{f.description}</p>}
            </div>
            <ChevronRight size={16} className="text-slate-300" />
          </button>
        ))}
      </div>
      <button onClick={onSkip}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
        <HelpCircle size={15} /> Not sure which line it is
      </button>
    </Shell>
  );
}

/**
 * The exact build.
 *
 * Two units of one laptop model can take different panels, and this is the
 * only step that tells them apart. Getting it wrong is a technician arriving
 * with a screen that does not fit — so it is asked, not inferred.
 */
function ConfigurationStep({ vertical, model, onPick, onSkip }) {
  const { data, isLoading } = useRepairConfigurationsQuery({ vertical, modelCode: model.code });
  const configs = data?.configurations || [];

  useEffect(() => {
    if (!isLoading && configs.length === 0) onSkip();
  }, [isLoading, configs.length, onSkip]);

  if (isLoading || configs.length === 0) return <Spinner />;

  return (
    <Shell>
      <p className="text-xs text-slate-500 px-1 leading-relaxed">
        Same model, different builds. The screen and memory that fit depend on which one you own —
        pick the closest match, and the technician confirms it on arrival.
      </p>
      {configs.map((c) => (
        <button key={c.code} onClick={() => onPick(c)}
          className="card w-full text-left hover:ring-2 hover:ring-zappy-100 transition">
          <p className="font-semibold text-sm text-[#0F172A]">{c.name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {c.displaySize && (
              <span className="text-[11px] text-slate-500">
                {c.displaySize}" {c.displayResolution}{c.isTouch ? ' touch' : ''}
              </span>
            )}
            {c.ramGb && <span className="text-[11px] text-slate-500">{c.ramGb}GB {c.ramType}</span>}
            {c.storageGb && <span className="text-[11px] text-slate-500">{c.storageGb}GB {c.storageType}</span>}
          </div>
        </button>
      ))}
      <button onClick={onSkip}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
        <HelpCircle size={15} /> I'm not sure which one I have
      </button>
    </Shell>
  );
}

function ModelStep({ vertical, deep, brand, productType, family, onPick }) {
  const [q, setQ] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const { data, isLoading } = useRepairModelsQuery({
    vertical,
    brandCode: brand.code,
    q: q || undefined,
    productTypeCode: productType?.code,
    familyCode: family?.code,
  });

  /**
   * If a request the customer sent earlier has since been identified, say so
   * here — this is where they gave up, so it is where the answer belongs.
   */
  const { data: identifications } = useMyModelIdentificationsQuery(vertical, { skip: !deep });
  const identified = (identifications?.requests || [])
    .find((r) => r.status === 'identified' && r.resolvedModelId);

  const models = data?.models || [];

  // Series is a label rather than a step: it groups a long list without adding
  // another tap to a funnel that is already deep.
  const grouped = [];
  for (const m of models) {
    const key = m.seriesName || '';
    const bucket = grouped.find((g) => g.key === key);
    if (bucket) bucket.items.push(m);
    else grouped.push({ key, items: [m] });
  }

  return (
    <Shell>
      {showMissing && (deep
        ? <IdentifySheet vertical={vertical} brand={brand} onClose={() => setShowMissing(false)} />
        : <MissingItemSheet kind="model" brandCode={brand.name} onClose={() => setShowMissing(false)} />)}

      {identified && (
        <button onClick={() => onPick(identified.resolvedModelId)}
          className="card w-full text-left bg-emerald-50 ring-emerald-200 hover:ring-2 transition">
          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">We identified your device</p>
          <p className="font-bold text-sm text-emerald-900 mt-0.5">{identified.resolvedModelId.name}</p>
          <p className="text-xs text-emerald-700 mt-0.5">Tap to continue with this one.</p>
        </button>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input text-sm w-full !pl-9"
          placeholder={deep ? `Search ${brand.name} models or product number…` : `Search ${brand.name} models…`}
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>

      {isLoading ? <Spinner /> : (
        <div className="space-y-2">
          {grouped.map((group) => (
            <div key={group.key || 'ungrouped'} className="space-y-2">
              {group.key && (
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 pt-1">{group.key}</p>
              )}
              {group.items.map((m) => (
                <button key={m.code} onClick={() => onPick(m)}
                  className="card w-full flex items-center gap-3 text-left hover:ring-2 hover:ring-zappy-100 transition">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    {m.imageUrl ? <img src={m.imageUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                      : deep ? <Laptop size={18} className="text-slate-400" />
                        : <Smartphone size={18} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0F172A] truncate">{m.name}</p>
                    {m.productNumbers?.length > 0 && (
                      <p className="text-xs text-slate-400 truncate">{m.productNumbers.slice(0, 3).join(' · ')}</p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))}
            </div>
          ))}
          {!models.length && (
            /*
              An empty list is a real state, not an edge case: a brand is added
              to the catalog before its models are, and laptops are catalogued
              as customers identify them. So the way forward is the PRIMARY
              action here — a faint link at the bottom of a blank screen is how
              a customer decides we cannot help them.
            */
            <div className="card text-center py-8">
              <p className="font-bold text-sm text-[#0F172A]">
                {q ? `No ${brand.name} models matched "${q}"` : `We haven't listed ${brand.name} models yet`}
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {deep
                  ? 'Tell us what is on the sticker and we will identify it — usually the same day.'
                  : "Tell us which model you have and we'll add it."}
              </p>
              <button onClick={() => setShowMissing(true)} className="btn-primary w-full mt-4">
                {deep ? 'Help us identify it' : 'Tell us your model'}
              </button>
            </div>
          )}
        </div>
      )}

      {models.length > 0 && (
        <button onClick={() => setShowMissing(true)}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-zappy-600 py-3">
          <HelpCircle size={15} /> {deep ? "I don't know my model" : "Can't find your model?"}
        </button>
      )}
    </Shell>
  );
}

function ProblemStep({ vertical, model, productType, fuelType, presetCode, onPick }) {
  /*
   * The product type narrows the list as much as the model does.
   *
   * A scooter has no chain and an electric has no spark plug, so asking their
   * owners about either wastes the one screen where the customer is telling us
   * what is actually wrong. The model's own type is preferred over the step the
   * customer picked — the catalog knows better than the tap did.
   */
  const { data, isLoading } = useRepairProblemsQuery({
    vertical,
    modelCode: model.code,
    productTypeCode: model.productTypeCode || productType?.code,
    // An EV owner is never asked about spark plugs, a petrol owner never about
    // a CNG regulator, and only a diesel is asked about its DPF.
    fuelType: fuelType || undefined,
  });

  /**
   * Arrived from a "common jobs" chip on the home page.
   *
   * The symptom is selected the moment the list confirms it exists for this
   * model — the customer already told us what is wrong, and asking again is
   * just a tap they have to repeat. It is resolved against the real list rather
   * than trusted from the URL, so a stale link cannot smuggle in a symptom this
   * model does not have.
   */
  const categories = data?.categories || [];
  useEffect(() => {
    if (!presetCode || isLoading) return;
    const match = categories.flatMap((c) => c.problems).find((p) => p.code === presetCode);
    if (match) onPick(match);
  }, [presetCode, isLoading, categories, onPick]);

  if (isLoading) return <Spinner />;

  return (
    <Shell>
      <p className="text-xs text-slate-500 px-1">
        Tell us what you're seeing. We'll work out the repair — we never assume it from the symptom alone.
      </p>
      {categories.map((cat) => (
        <div key={cat.code} className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1 pt-2">{cat.name}</p>
          {cat.problems.map((p) => (
            <button key={p.code} onClick={() => onPick(p)}
              className="card w-full flex items-center gap-3 text-left hover:ring-2 hover:ring-zappy-100 transition">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#0F172A]">{p.name}</p>
                {p.requiresDiagnosis && (
                  <p className="text-[11px] text-amber-600 font-semibold mt-0.5">Needs inspection before pricing</p>
                )}
              </div>
              {p.severity === 'critical' && <AlertTriangle size={15} className="text-red-500 shrink-0" />}
              <ChevronRight size={16} className="text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      ))}
    </Shell>
  );
}

/** Walks the diagnostic tree one question at a time, server-driven. */
function DiagnoseStep({ vertical, problem, onResolved }) {
  const [answers, setAnswers] = useState({});
  /**
   * The same answers in the customer's own words.
   *
   * `answers` is ids — `{ q_display_1: 'opt_cracked' }` — which is what the
   * diagnostic engine needs and what nobody can read. The technician arriving
   * at the door needs the QUESTIONS and the WORDS, so those are kept alongside
   * and travel with the booking.
   */
  const [transcript, setTranscript] = useState([]);
  const [submit, { isLoading }] = useSubmitRepairDiagnosticMutation();
  const [state, setState] = useState(null);

  // Kick off with an empty answer set to get the first question.
  useEffect(() => {
    submit({ vertical, problemCode: problem.code, answers: {} })
      .unwrap().then(setState).catch(() => {});
  }, [problem.code, vertical, submit]);

  async function answer(questionId, optionId, multi) {
    const nextAnswers = multi
      ? { ...answers, [questionId]: [...(answers[questionId] || []), optionId] }
      : { ...answers, [questionId]: optionId };
    setAnswers(nextAnswers);

    // Capture the readable pair before the next question replaces this one.
    const q = state?.nextQuestion;
    const picked = (q?.options || []).find((o) => o.id === optionId);
    const nextTranscript = [
      ...transcript.filter((t) => t.questionId !== questionId || multi),
      { questionId, question: q?.text || questionId, answer: picked?.label || optionId },
    ];
    setTranscript(nextTranscript);

    try {
      const res = await submit({ vertical, problemCode: problem.code, answers: nextAnswers }).unwrap();
      setState(res);
      if (res.complete) onResolved(res.diagnosis, nextAnswers, nextTranscript);
    } catch (err) {
      toast.error(err?.data?.error || 'Something went wrong');
    }
  }

  if (!state) return <Spinner />;

  const q = state.nextQuestion;
  if (!q) {
    // Flow finished (or the problem has no flow) — hand back the diagnosis.
    return (
      <Shell>
        <div className="card text-center py-10">
          <Loader2 size={22} className="animate-spin text-zappy-400 mx-auto" />
          <p className="text-sm text-slate-500 mt-3">Working out the likely repair…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
          <div className="card">
            <p className="font-bold text-[#0F172A]">{q.text}</p>
            {q.subtitle && <p className="text-xs text-slate-400 mt-1">{q.subtitle}</p>}
          </div>
          <div className="space-y-2 mt-3">
            {(q.options || []).map((opt) => (
              <button key={opt.id} onClick={() => answer(q.id, opt.id, q.type === 'multi')} disabled={isLoading}
                className="card w-full text-left hover:ring-2 hover:ring-zappy-100 transition disabled:opacity-60">
                <p className="font-semibold text-sm text-[#0F172A]">{opt.label}</p>
                {opt.description && <p className="text-xs text-slate-400 mt-0.5">{opt.description}</p>}
                {opt.priceHint && <p className="text-[11px] text-emerald-600 font-semibold mt-1">{opt.priceHint}</p>}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

/**
 * How the repair should happen — always the same three choices.
 *
 * All three are ALWAYS on screen, because a customer deciding how to hand over
 * their device is comparing options, and a list that silently drops one reads
 * as "this service doesn't exist here" rather than "not for this repair".
 *
 * Some repairs genuinely cannot be done at a kitchen table — a motherboard IC
 * job needs a microscope and a hot-air station. Those render as a disabled card
 * that says WHY, which is the honest middle ground: the customer sees the full
 * menu and learns something, instead of either a short menu or a promise the
 * technician has to break on arrival.
 */
/** One name per service mode, shared by every screen that shows one. */
const MODE_LABEL = {
  doorstep: 'Home Service',
  pickup_repair: 'Pickup & repair',
  workshop: 'Workshop',
  diagnosis_only: 'Inspection',
};

const MODE_BLOCKED_REASON = {
  doorstep: 'it needs workshop equipment that does not travel.',
  pickup_repair: 'this one is quick enough to finish on the spot.',
};

function ModeStep({ diagnosis, inspectionFeePaise, onPick }) {
  const top = diagnosis?.recommendations?.[0];
  const allowed = top?.allowedServiceModes || ['doorstep', 'workshop', 'pickup_repair'];

  const options = [
    {
      key: 'doorstep',
      title: 'Home Service',
      body: 'A technician comes to your home or office and repairs it there, usually in one visit.',
      icon: Home,
      available: allowed.includes('doorstep'),
    },
    {
      key: 'pickup_repair',
      title: 'Pickup & repair',
      body: 'We collect the device, repair it at the workshop, and return it to you.',
      icon: Truck,
      available: allowed.includes('pickup_repair') || allowed.includes('workshop'),
      note: 'Pickup and return charges may apply.',
    },
    {
      key: 'diagnosis_only',
      title: 'Inspection',
      body: 'A technician inspects the device and gives you a written diagnosis. No repair yet.',
      icon: HelpCircle,
      available: true,
      fee: inspectionFeePaise,
    },
  ];

  return (
    <Shell>
      <div className="card bg-zappy-50 ring-zappy-100">
        <p className="text-xs font-medium text-zappy-700 leading-relaxed">{diagnosis?.summary}</p>
      </div>

      {options.map((o) => {
        const Icon = o.available ? o.icon : Lock;
        return (
          <button
            key={o.key}
            onClick={() => o.available && onPick(o.key)}
            disabled={!o.available}
            className={o.available
              ? 'card w-full text-left hover:ring-2 hover:ring-zappy-100 transition'
              : 'card w-full text-left opacity-60 cursor-not-allowed'}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                o.available ? 'bg-zappy-50' : 'bg-slate-100'
              }`}>
                <Icon size={18} className={o.available ? 'text-zappy-600' : 'text-slate-400'} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${o.available ? 'text-[#0F172A]' : 'text-slate-500'}`}>
                  {o.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{o.body}</p>
                {o.available && o.note && <p className="text-[11px] text-amber-600 mt-1">{o.note}</p>}
                {o.available && o.fee != null && (
                  <p className="text-[11px] font-semibold text-emerald-700 mt-1">
                    {o.fee > 0 ? `${formatPaise(o.fee)} inspection fee` : 'Inspection fee applies'}
                    {' · '}adjusted against the repair if you go ahead
                  </p>
                )}
                {!o.available && (
                  <p className="text-[11px] font-semibold text-slate-400 mt-1">
                    Not for this repair — {MODE_BLOCKED_REASON[o.key]}
                  </p>
                )}
              </div>
              {o.available && <ChevronRight size={16} className="text-slate-300 shrink-0" />}
            </div>
          </button>
        );
      })}
    </Shell>
  );
}

/**
 * Where it is happening, and who is doing it.
 *
 * This step used to dead-end: with no location in the store it rendered "We
 * need your location" and offered nothing to do about it, and nothing anywhere
 * else in the app ever set that location. So the flow simply stopped.
 *
 * Now the step owns the problem. No pin means the map opens — the same
 * drag-to-adjust picker the booking flow already uses, because a customer who
 * has placed a pin in one part of this app should not meet a different one in
 * another. Once there is a pin, the page turns into the thing worth reading:
 * what they chose, then who can actually do it and at what price.
 */
function ProviderStep({
  vertical, diagnosis, model, brand, configuration, problem,
  location, hasLocation, serviceMode, onPick, onInspectInstead, pinConfirmed = true, onPinConfirmed,
}) {
  const dispatch = useDispatch();
  // Map first: the customer checks the pin before seeing who can come.
  const [picking, setPicking] = useState(!pinConfirmed);
  // How the customer wants to compare the shops. 'best' keeps the server's
  // ranking; the others re-sort the SAME list so nobody is hidden.
  const [sortBy, setSortBy] = useState('best');

  const repairCode = diagnosis?.primaryRepairCode || diagnosis?.recommendations?.[0]?.repairCode;
  const needsDiagnosis = diagnosis?.requiresDiagnosis;
  const inspectionOnly = serviceMode === 'diagnosis_only';

  const { data, isLoading, isFetching } = useRepairProvidersQuery(
    {
      vertical,
      repairCode,
      brandCode: brand?.code,
      modelCode: model?.code,
      serviceMode,
      lat: location.lat,
      lng: location.lng,
    },
    // An inspection needs no priced provider — any capable technician can look
    // at the device, so provider matching is skipped entirely for that path.
    { skip: inspectionOnly || !repairCode || !hasLocation },
  );

  function confirmPin({ address, lat, lng }) {
    dispatch(setLocation({ lat, lng, address }));
    onPinConfirmed?.();
    setPicking(false);
  }

  /* The map, on demand or because there is nothing else we can do. */
  if (picking || !hasLocation) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <LocationPicker
          onConfirm={confirmPin}
          // Cancelling the first look keeps the saved spot; nothing is lost.
          onCancel={() => { if (hasLocation) onPinConfirmed?.(); setPicking(false); }}
          serviceLabel={`${brand?.name || ''} ${model?.name || 'device'}`.trim()}
          service={vertical}
        />
      </div>
    );
  }

  if (inspectionOnly) {
    return (
      <Shell>
        <ChosenSummary
          brand={brand} model={model} configuration={configuration}
          problem={problem} diagnosis={diagnosis} serviceMode={serviceMode}
          location={location} onChangeLocation={() => setPicking(true)}
        />
        <div className="card">
          <div className="flex items-start gap-3">
            <HelpCircle size={18} className="text-zappy-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-[#0F172A]">Inspection booking</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                We will assign a qualified technician. They will inspect your device, explain what is wrong,
                and give you a written diagnosis — with no obligation to proceed.
              </p>
            </div>
          </div>
        </div>
        <button onClick={() => onPick(null, repairCode, null)} className="btn-primary w-full">
          Continue
        </button>
      </Shell>
    );
  }

  if (!repairCode) {
    return (
      <Shell>
        <ChosenSummary
          brand={brand} model={model} configuration={configuration}
          problem={problem} diagnosis={diagnosis} serviceMode={serviceMode}
          location={location} onChangeLocation={() => setPicking(true)}
        />
        <div className="card bg-amber-50 ring-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 text-sm">This one needs a look first</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">{diagnosis?.summary}</p>
            </div>
          </div>
        </div>
        <button onClick={() => onPick(null, repairCode, null)} className="btn-primary w-full">
          Book a diagnosis visit
        </button>
      </Shell>
    );
  }

  const providers = data?.providers || [];
  const recommended = data?.recommended;

  /**
   * The full comparison list, ordered by what the customer asked to compare on.
   *
   * `best` is the server's own ranking (price, distance, warranty, history) and
   * keeps the recommended shop pinned first. The other sorts re-order the whole
   * set — recommended included — so choosing "cheapest" or "fastest" never
   * hides the pick, it just stops pretending it is first.
   */
  const priceOf = (p) => (p.totalPaise ?? Math.min(...(p.priceOptions || []).map((o) => o.totalPaise ?? Infinity), Infinity));
  const rankedAll = (() => {
    const all = recommended
      ? [recommended, ...providers.filter((p) => !samePlace(p, recommended))]
      : [...providers];
    if (sortBy === 'fast') return [...all].sort((a, b) => (a.etaMinutes ?? 1e9) - (b.etaMinutes ?? 1e9));
    if (sortBy === 'cheap') return [...all].sort((a, b) => priceOf(a) - priceOf(b));
    return all; // 'best' — server order
  })();

  const SORTS = [
    { key: 'best', label: 'Recommended' },
    { key: 'fast', label: 'Fastest' },
    { key: 'cheap', label: 'Lowest price' },
  ];

  return (
    <Shell>
      <ChosenSummary
        brand={brand} model={model} configuration={configuration}
        problem={problem} diagnosis={diagnosis} serviceMode={serviceMode}
        location={location} onChangeLocation={() => setPicking(true)}
      />

      {needsDiagnosis && (
        <div className="card bg-zappy-50 ring-zappy-100">
          <p className="text-[11px] text-zappy-700 font-semibold leading-relaxed">
            Prices below are estimates. The final figure is confirmed after the technician inspects your device.
          </p>
        </div>
      )}

      {(isLoading || isFetching) && !providers.length && <Spinner />}

      {!isLoading && !isFetching && !providers.length && (() => {
        /*
         * Say what is actually wrong. This used to answer every failure with
         * "no technicians" and a Change location button — even when shops sat
         * right next to the pin and the real gap was that none of them had
         * listed THIS repair. Moving the pin cannot fix that, so the screen
         * must not suggest it.
         */
        const nearby = data?.nearbyCount || 0;
        const repairName = data?.repairName || 'this repair';
        const locationProblem = data?.reason === 'no_provider_in_area';
        const notListed = nearby > 0 && ['no_capability', 'capability_scope', 'no_approved_price']
          .includes(data?.primaryReason);

        // Nobody verified covers this address at all: say we're growing here,
        // record it as demand, and offer to notify — no booking is made.
        if (locationProblem || (nearby === 0 && !data?.reason)) {
          return (
            <GrowingHere
              service={{ code: vertical, name: data?.repairName || 'repair' }}
              lat={location?.lat}
              lng={location?.lng}
              address={location?.address || ''}
              onChangeLocation={() => setPicking(true)}
            />
          );
        }

        let title = 'No technicians available right now';
        let body = 'We could not find anyone able to do this repair today.';
        if (locationProblem) {
          title = 'No repair shops cover this address yet';
          body = 'Moving the pin to a nearby area often finds someone.';
        } else if (data?.reason === 'service_mode_not_allowed') {
          body = 'This repair cannot be done the way you chose. Go back and pick another option.';
        } else if (notListed) {
          title = `${nearby} ${nearby === 1 ? 'shop' : 'shops'} near you, none offering ${repairName} yet`;
          body = 'An inspection finds the exact fault and gets you a firm quote from a nearby technician.';
        } else if (nearby > 0) {
          title = `${nearby} ${nearby === 1 ? 'shop' : 'shops'} near you, none free right now`;
          body = 'Try again shortly, or book an inspection to hold your place.';
        }

        return (
          <div className="card py-8 text-center">
            <Wrench size={24} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {nearby > 0 && onInspectInstead && (
                <button
                  onClick={onInspectInstead}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F172A] px-4 py-2.5 text-xs font-bold text-white"
                >
                  <ShieldCheck size={13} /> Book an inspection instead
                </button>
              )}
              {(locationProblem || nearby === 0) && (
                <button
                  onClick={() => setPicking(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
                >
                  <MapPin size={13} /> Change location
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {rankedAll.length > 0 && (
        <>
          {/* Compare the shops the way you care about — a prominent, tappable
              row so the choice is obvious, not buried. */}
          <div className="flex items-center justify-between px-1 pt-1">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              {rankedAll.length} shop{rankedAll.length === 1 ? '' : 's'} available
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {SORTS.map((sopt) => (
              <button
                key={sopt.key}
                onClick={() => setSortBy(sopt.key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  sortBy === sopt.key
                    ? 'bg-[#0F172A] text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {sopt.label}
              </button>
            ))}
          </div>

          {rankedAll.map((p, i) => {
            const isPick = sortBy === 'best' && recommended && samePlace(p, recommended);
            return (
              <ProviderCard
                key={p.shopId || p.workerId || i}
                p={p}
                recommended={isPick}
                onPick={(qualityCode) => onPick(p, repairCode, qualityCode)}
              />
            );
          })}
        </>
      )}
    </Shell>
  );
}

/** Two results for the same shop or technician. */
function samePlace(a, b) {
  if (!a || !b) return false;
  if (a.shopId && b.shopId) return String(a.shopId) === String(b.shopId);
  if (a.workerId && b.workerId) return String(a.workerId) === String(b.workerId);
  return false;
}

/**
 * Everything the customer has told us, on one card.
 *
 * By this step they have answered six questions across six screens, and they
 * are about to spend money. Showing the answers back — device, fault, how, and
 * where — is what makes that last tap feel safe, and it is the only place the
 * address can be corrected without losing the rest of the flow.
 */
function ChosenSummary({
  brand, model, configuration, problem, diagnosis, serviceMode, location, onChangeLocation,
}) {
  const device = [brand?.name, model?.name].filter(Boolean).join(' ') || 'Your device';
  const fault = problem?.name || diagnosis?.recommendations?.[0]?.repairName || diagnosis?.summary;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-black uppercase tracking-wide text-slate-400">Your booking</p>
          <p className="mt-1 truncate text-sm font-bold text-[#0F172A]">{device}</p>
          {configuration?.name && (
            <p className="text-[11px] text-slate-500">{configuration.name}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-bold text-slate-600">
          {MODE_LABEL[serviceMode] || serviceMode}
        </span>
      </div>

      {fault && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-slate-600">
          <Wrench size={12} className="mt-0.5 shrink-0 text-slate-400" />
          <span className="min-w-0">{fault}</span>
        </p>
      )}

      <button
        onClick={onChangeLocation}
        className="mt-2.5 flex w-full items-start gap-1.5 rounded-xl bg-slate-50 p-2.5 text-left"
      >
        <MapPin size={12} className="mt-0.5 shrink-0 text-zappy-500" />
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-600">
          {location.address || 'Your pinned location'}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-zappy-600">Change</span>
      </button>
    </div>
  );
}

/**
 * One provider, and what they would actually charge.
 *
 * Deliberately shows the differences that make this a marketplace (§70) — and
 * the biggest of those is the part grade. A screen fitted with an original panel
 * and one fitted with a compatible panel are different jobs at different prices
 * with different warranties, so every grade the provider has priced is its own
 * tappable row. Choosing a row IS choosing the grade; there is no separate
 * confirm, because the price and the warranty are the whole decision.
 */
function ProviderCard({ p, recommended, onPick }) {
  const options = p.priceOptions?.length ? p.priceOptions : null;

  return (
    <div className={`card ${recommended ? 'ring-2 ring-zappy-200' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        {/* The shop's own photo, where they have uploaded one. A provider the
            customer recognises from the high street is the difference between
            a list of names and a list of businesses. */}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {p.imageUrl
            ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
            : <span className="text-[15px] font-black text-slate-400">{(p.name || '?')[0].toUpperCase()}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-[#0F172A]">{p.name}</p>
            {recommended && (
              <span className="shrink-0 rounded-full bg-zappy-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-zappy-700">
                Instant
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {p.rating != null && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                <Star size={11} className="fill-amber-400 text-amber-400" /> {Number(p.rating).toFixed(1)}
              </span>
            )}
            {p.etaMinutes && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Clock size={11} /> ~{p.etaMinutes} min
              </span>
            )}
            {p.distanceKm != null && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin size={11} /> {p.distanceKm.toFixed(1)} km
              </span>
            )}
            {p.completedJobs > 0 && (
              <span className="text-[11px] text-slate-500">{p.completedJobs} jobs done</span>
            )}
          </div>
        </div>

        {!options && (
          <div className="shrink-0 text-right">
            {p.totalPaise != null
              ? <p className="text-lg font-black text-[#0F172A]">{formatPaise(p.totalPaise)}</p>
              : <p className="text-xs font-bold text-amber-600">After diagnosis</p>}
          </div>
        )}
      </div>

      {options ? (
        <div className="mt-2.5 space-y-1.5">
          {options.map((o) => (
            <button
              key={o.qualityCode || 'any'}
              onClick={() => onPick(o.qualityCode)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-zappy-300 hover:bg-zappy-50/40"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-[#0F172A]">{o.label}</span>
                  {o.isGenuine && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-emerald-700">
                      Genuine
                    </span>
                  )}
                </span>
                {o.warrantyDays > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <ShieldCheck size={10} /> {o.warrantyDays}-day warranty
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm font-black text-[#0F172A]">{formatPaise(o.totalPaise)}</span>
              <ChevronRight size={14} className="shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => onPick(null)}
          className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-zappy-300"
        >
          <span className="text-[12.5px] font-bold text-slate-700">
            {p.warrantyDays > 0 ? `${p.warrantyDays}-day warranty` : 'Select this technician'}
          </span>
          <ChevronRight size={14} className="shrink-0 text-slate-300" />
        </button>
      )}
    </div>
  );
}

/**
 * Extra services the chosen provider will do on the same visit.
 *
 * Priced by the server against THAT provider, so the figure ticked here is the
 * figure charged. A provider who has not priced an add-on simply does not
 * offer it, rather than offering it and having it vanish at booking.
 *
 * The step skips itself when there is nothing to offer — no empty screen, and
 * no extra tap for verticals that do not use add-ons at all.
 */
function AddOnsStep({
  vertical, provider, repairCode, qualityCode, brand, model, serviceMode,
  selected, onToggle, onContinue, onSkipStep,
}) {
  const { data, isLoading } = useRepairAddOnsQuery({
    vertical,
    repairCode: repairCode || undefined,
    brandCode: brand?.code,
    modelCode: model?.code,
    qualityCode: qualityCode || undefined,
    serviceMode,
    shopId: provider?.shopId || undefined,
    workerId: provider?.workerId || undefined,
  }, { skip: !repairCode });

  const addOns = data?.addOns || [];

  useEffect(() => {
    if (!isLoading && data && addOns.length === 0) onSkipStep();
  }, [isLoading, data, addOns.length, onSkipStep]);

  if (isLoading) return <Shell><Spinner /></Shell>;
  if (!addOns.length) return <Shell><Spinner /></Shell>;

  const extraPaise = addOns
    .filter((a) => selected.includes(a.repairCode))
    .reduce((sum, a) => sum + a.totalPaise, 0);

  return (
    <Shell>
      <div>
        <h2 className="text-xl font-black text-[#0F172A]">Anything else while they&apos;re there?</h2>
        <p className="text-sm text-slate-500 mt-1">
          Optional. Done on the same visit by the same provider.
        </p>
      </div>

      <div className="space-y-2">
        {addOns.map((a) => {
          const on = selected.includes(a.repairCode);
          return (
            <button
              key={a.repairCode}
              type="button"
              onClick={() => onToggle(a.repairCode)}
              className={`w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition ${
                on ? 'border-zappy-500 bg-zappy-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className={`shrink-0 w-6 h-6 rounded-lg border-2 grid place-items-center ${
                on ? 'border-zappy-500 bg-zappy-500 text-white' : 'border-slate-300 text-transparent'
              }`}>
                <Check size={14} strokeWidth={3} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-[#0F172A]">{a.name}</span>
                {a.description && (
                  <span className="block text-xs text-slate-500 mt-0.5">{a.description}</span>
                )}
                <span className="block text-xs text-slate-400 mt-0.5">
                  {a.estimatedDurationMin ? `+${a.estimatedDurationMin} min` : null}
                  {a.estimatedDurationMin && a.warrantyDays ? ' · ' : null}
                  {a.warrantyDays ? `${a.warrantyDays}-day warranty` : null}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black text-[#0F172A]">
                {a.isEstimate ? '~' : '+'}{formatPaise(a.totalPaise)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 mt-2"
      >
        {extraPaise > 0 ? `Continue · +${formatPaise(extraPaise)}` : 'Continue without extras'}
      </button>
    </Shell>
  );
}

function ConfirmStep({
  vertical, brand, model, configuration, problem, diagnosis, provider, repairCode,
  qualityCode, serviceMode, inspectionFeePaise, location, onDone, fuelType,
  diagnosticAnswers, diagnosticTranscript = [], addOnCodes = [],
}) {
  const [create, { isLoading }] = useCreateRepairBookingMutation();
  // A stable key per attempt so a double-tap cannot create two bookings (§46).
  const idempotencyKey = useMemo(() => `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);

  // Whether online payment exists at all. Never assumed — the server decides,
  // because it is the only side that knows if a gateway is configured.
  const { data: payPreview } = useRepairPricePreviewQuery(
    { vertical, repairCode: repairCode || undefined, serviceMode },
    { skip: !repairCode },
  );
  const onlineEnabled = !!payPreview?.payment?.onlineEnabled;
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const { pay, paying } = usePayBooking();

  async function book() {
    try {
      const res = await create({
        vertical,
        brandCode: brand.code,
        modelCode: model.code,
        // Null for phones; for laptops this is what decides which parts fit.
        configurationCode: configuration?.code || null,
        // Which engine the customer told us they have. A CNG Nexon and a petrol
        // Nexon are different jobs needing different parts, and without this the
        // technician finds that out on the driveway.
        fuelType: fuelType || null,
        problemCodes: [problem.code],
        // Extras chosen on the previous step; the server re-prices each one
        // against this provider rather than trusting anything sent from here.
        addOnCodes,
        diagnosticFlowCode: diagnosis?.flowCode || null,
        // What the customer was asked and what they said — carried through so
        // the technician reads the conversation, not a summary of it.
        diagnosticAnswers: (diagnosticAnswers || diagnosticTranscript.length)
          ? { raw: diagnosticAnswers || {}, transcript: diagnosticTranscript }
          : null,
        diagnosisSummary: diagnosis?.summary || '',
        // An inspection is booked without committing to a repair, so the
        // repair code is deliberately not sent for that path.
        repairCode: serviceMode === 'diagnosis_only' ? null : (repairCode || null),
        // What the customer actually chose on the provider card wins. The
        // diagnosis recommendation is only a fallback for the flows that never
        // offered a grade — booking the recommended grade over the chosen one
        // would quote one part and fit another.
        qualityCode: qualityCode || diagnosis?.recommendedQuality || null,
        serviceMode,
        workerId: provider?.workerId || null,
        shopId: provider?.shopId || null,
        zappyRecommended: !!provider?.zappyRecommended,
        location: {
          coordinates: [location.lng, location.lat],
          address: location.address || 'Current location',
        },
        paymentMethod: onlineEnabled ? paymentMethod : 'cash',
        idempotencyKey,
      }).unwrap();
      toast.success('Booking confirmed');
      // A fixed price is paid now; a diagnosis-first job is paid once its quote is approved.
      if (res.booking?.paymentMethod === 'online' && !res.booking?.priceSnapshot?.isEstimate) {
        await pay({ bookingSource: 'repair', bookingId: res.booking._id, label: 'Repair booking' });
      }
      onDone(res.booking);
    } catch (err) {
      toast.error(err?.data?.error || 'Could not create the booking');
    }
  }

  const inspectionOnly = serviceMode === 'diagnosis_only';
  const price = inspectionOnly ? inspectionFeePaise : provider?.totalPaise;

  return (
    <Shell>
      <div className="card space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          {inspectionOnly ? 'Your inspection' : 'Your repair'}
        </p>
        {[
          ['Device', `${brand.name} ${model.name}`],
          ...(configuration ? [['Build', configuration.name]] : []),
          ['Problem', problem.name],
          ['Repair', inspectionOnly
            ? 'Decided after inspection'
            : (diagnosis?.recommendations?.[0]?.name || 'To be confirmed after diagnosis')],
          ['Provider', provider?.name || 'Assigned for you'],
          ['Service', MODE_LABEL[serviceMode] || serviceMode],
        ].map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3">
            <span className="text-xs text-slate-500">{k}</span>
            <span className="text-sm font-semibold text-[#0F172A] text-right">{v}</span>
          </div>
        ))}
      </div>

      <div className="card">
        {inspectionOnly ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#0F172A]">Inspection fee</span>
              <span className="text-2xl font-black text-[#0F172A]">{formatPaise(price)}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Charged by ZappyOne for the technician's visit and diagnosis. If you go ahead with the repair
              afterwards, this amount comes off the repair bill — you are not charged twice for the same visit.
            </p>
          </>
        ) : price != null ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#0F172A]">Total</span>
              <span className="text-2xl font-black text-[#0F172A]">{formatPaise(price)}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Includes parts, labour and taxes. This is the price you pay — nothing is added later without your approval.
            </p>
            {serviceMode === 'pickup_repair' && (
              <p className="text-[11px] text-slate-500 mt-1">
                Pickup and return are included in this total.
              </p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              This repair is priced after inspection. The technician will send you a quote, and no work starts until you approve it.
            </p>
          </div>
        )}
      </div>

      {/* How this gets paid, said plainly before the button. Online appears only when the server can take it. */}
      <PayMethodPicker
        value={paymentMethod}
        onChange={setPaymentMethod}
        onlineAllowed={onlineEnabled}
        cashNote={inspectionOnly
          ? 'Pay the technician directly once the inspection is done.'
          : 'Pay the technician directly once the repair is done.'}
      />

      <button onClick={book} disabled={isLoading || paying} className="btn-primary w-full">
        {isLoading || paying
          ? <><Loader2 size={15} className="animate-spin" /> {paying ? 'Opening payment…' : 'Booking…'}</>
          : <><Check size={16} /> {inspectionOnly ? 'Book inspection' : 'Confirm booking'}</>}
      </button>
    </Shell>
  );
}

/* Flow controller */

export default function RepairFlowPage({ vertical = 'mobile' }) {
  const nav = useNavigate();
  const loc = useSelector(selectLocation);
  const hasLocation = useSelector(selectHasLocation);
  // The address is confirmed on the map once per booking, at the step where it
  // starts to matter (who can come here) — not assumed from wherever the app
  // last saw the phone.
  const [pinConfirmed, setPinConfirmed] = useState(false);

  /**
   * Does this vertical identify devices deeply?
   *
   * Answered by the catalog, not by a list of vertical names here: if product
   * types exist, the deeper steps are real; if not, the flow is Brand → Model
   * exactly as mobile has always been.
   */
  const { data: typeData, isLoading: typesLoading } = useRepairProductTypesQuery(vertical);
  const deep = (typeData?.productTypes || []).length > 0;
  const steps = useMemo(() => buildSteps(deep), [deep]);

  /**
   * A symptom can arrive in the URL from a "common jobs" chip. It is consumed
   * once — clearing it after the first use is what stops the auto-selection
   * from firing again when the customer taps Back to change their answer.
   */
  const [searchParams] = useSearchParams();
  const [presetProblem, setPresetProblem] = useState(() => searchParams.get('problem') || null);

  const [step, setStep] = useState('brand');
  const [skipped, setSkipped] = useState(() => new Set());
  const [brand, setBrand] = useState(null);
  const [productType, setProductType] = useState(null);
  const [family, setFamily] = useState(null);
  const [model, setModel] = useState(null);
  const [configuration, setConfiguration] = useState(null);
  const [problem, setProblem] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState(null);
  const [diagnosticTranscript, setDiagnosticTranscript] = useState([]);
  const [provider, setProvider] = useState(null);
  const [repairCode, setRepairCode] = useState(null);
  // The part grade the customer picked on the provider card. Null means they
  // were not offered a choice, and the diagnosis recommendation stands.
  const [qualityCode, setQualityCode] = useState(null);
  const [addOnCodes, setAddOnCodes] = useState([]);
  const [serviceMode, setServiceMode] = useState('doorstep');
  const [fuelType, setFuelType] = useState(null);

  /**
   * The inspection fee is ZappyOne's, set in admin config — so it is read from
   * the price preview rather than hardcoded here. Fetched once a repair is
   * known, which is also when the inspection option becomes offerable.
   */
  const previewRepair = diagnosis?.primaryRepairCode || diagnosis?.recommendations?.[0]?.repairCode;
  const { data: preview } = useRepairPricePreviewQuery(
    { vertical, repairCode: previewRepair, brandCode: brand?.code, modelCode: model?.code, serviceMode: 'diagnosis_only' },
    { skip: !previewRepair },
  );
  const inspectionFeePaise = preview?.estimate?.totalPaise ?? 0;

  function go(from, delta) {
    const i = steps.indexOf(from);
    let j = i + delta;
    // Walk past steps this catalog had nothing to show for, in both directions.
    while (j > 0 && j < steps.length && skipped.has(steps[j])) j += delta;
    if (j < 0) return nav(-1);
    return setStep(steps[Math.min(j, steps.length - 1)]);
  }

  const next = (from) => go(from, 1);
  const back = () => go(step, -1);

  /** A step with nothing in it records itself and hands over to the next one. */
  const skip = useCallback((name) => {
    setSkipped((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
    setStep((current) => {
      const i = steps.indexOf(current);
      return steps[Math.min(i + 1, steps.length - 1)];
    });
  }, [steps]);

  const skipFamily = useCallback(() => skip('family'), [skip]);
  const skipAddOns = useCallback(() => skip('addons'), [skip]);
  const skipConfig = useCallback(() => skip('config'), [skip]);

  /**
   * The fuels this exact model is sold with.
   *
   * One option is not a question — a Thar is diesel and asking is a tap that
   * teaches the customer nothing, so the step skips itself and answers on their
   * behalf. Zero options means the vertical does not distinguish fuels at all.
   */
  const modelFuels = useMemo(() => {
    const codes = model?.fuelTypes || [];
    return codes.map((c) => ({ code: c, name: FUEL_LABELS[c] || c }));
  }, [model]);

  useEffect(() => {
    if (step !== 'fuel') return;
    if (modelFuels.length === 1) { setFuelType(modelFuels[0].code); skip('fuel'); }
    else if (modelFuels.length === 0) { setFuelType(null); skip('fuel'); }
  }, [step, modelFuels, skip]);

  const deviceLabel = [brand?.name, model?.name].filter(Boolean).join(' ');

  const noun = NOUNS[vertical] || DEFAULT_NOUNS;

  const titles = {
    brand: `Which ${noun.brand}?`,
    type: `What ${noun.type}?`,
    family: `Which ${brand?.name || ''} line?`,
    model: `Which ${brand?.name || ''} model?`,
    config: `Which ${noun.build} do you have?`,
    fuel: 'Which engine does it have?',
    problem: `What's wrong with ${noun.it}?`,
    diagnose: 'A few quick questions',
    mode: 'How should we do it?',
    provider: serviceMode === 'diagnosis_only' ? 'Inspection' : 'Choose who repairs it',
    confirm: serviceMode === 'diagnosis_only' ? 'Confirm your inspection' : 'Confirm your booking',
  };

  if (typesLoading) {
    return <div className="min-h-screen bg-[#F9FAFB]"><Spinner /></div>;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <StepHeader steps={steps} step={step} onBack={back} title={titles[step]}
        subtitle={configuration?.name || deviceLabel || brand?.name} />

      {step === 'brand' && (
        <BrandStep vertical={vertical} onPick={(b) => { setBrand(b); next('brand'); }} />
      )}
      {step === 'type' && (
        <DeviceTypeStep vertical={vertical} onPick={(t) => { setProductType(t); next('type'); }} />
      )}
      {step === 'family' && (
        <FamilyStep vertical={vertical} brand={brand} productType={productType}
          onPick={(f) => { setFamily(f); next('family'); }} onSkip={skipFamily} />
      )}
      {step === 'model' && (
        <ModelStep vertical={vertical} deep={deep} brand={brand} productType={productType} family={family}
          onPick={(m) => { setModel(m); next('model'); }} />
      )}
      {step === 'config' && (
        <ConfigurationStep vertical={vertical} model={model}
          onPick={(c) => { setConfiguration(c); next('config'); }} onSkip={skipConfig} />
      )}
      {step === 'fuel' && (
        <FuelStep model={model} fuels={modelFuels}
          onPick={(f) => { setFuelType(f.code); next('fuel'); }} />
      )}
      {step === 'problem' && (
        <ProblemStep
          vertical={vertical}
          model={model}
          productType={productType}
          fuelType={fuelType}
          presetCode={presetProblem}
          onPick={(p) => { setPresetProblem(null); setProblem(p); next('problem'); }}
        />
      )}
      {step === 'diagnose' && (
        <DiagnoseStep vertical={vertical} problem={problem}
          /*
           * The second and third arguments used to be thrown away here, which
           * is why `diagnosticAnswers` was null on every booking ever made: the
           * model had the field, the API accepted it, the step produced it, and
           * this line dropped it. The technician then arrived knowing only a
           * one-line summary of a conversation the customer had already had.
           */
          onResolved={(d, rawAnswers, qa) => {
            setDiagnosis(d);
            setDiagnosticAnswers(rawAnswers || null);
            setDiagnosticTranscript(qa || []);
            next('diagnose');
          }} />
      )}
      {step === 'mode' && (
        <ModeStep
          diagnosis={diagnosis}
          inspectionFeePaise={inspectionFeePaise}
          onPick={(m) => { setServiceMode(m); next('mode'); }}
        />
      )}
      {step === 'provider' && (
        <ProviderStep
          vertical={vertical} diagnosis={diagnosis} model={model} brand={brand}
          configuration={configuration} problem={problem}
          location={loc} hasLocation={hasLocation}
          pinConfirmed={pinConfirmed} onPinConfirmed={() => setPinConfirmed(true)}
          serviceMode={serviceMode}
          onInspectInstead={() => setServiceMode('diagnosis_only')}
          onPick={(p, code, quality) => {
            setProvider(p);
            setRepairCode(code);
            setQualityCode(quality || null);
            next('provider');
          }}
        />
      )}
      {step === 'addons' && (
        <AddOnsStep
          vertical={vertical} provider={provider} repairCode={repairCode}
          qualityCode={qualityCode} brand={brand} model={model} serviceMode={serviceMode}
          selected={addOnCodes}
          onToggle={(code) => setAddOnCodes((prev) => (
            prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
          ))}
          onContinue={() => next('addons')}
          onSkipStep={skipAddOns}
        />
      )}
      {step === 'confirm' && (
        <ConfirmStep
          vertical={vertical} brand={brand} model={model} configuration={configuration}
          problem={problem} diagnosis={diagnosis}
          provider={provider} repairCode={repairCode} qualityCode={qualityCode} location={loc}
          addOnCodes={addOnCodes}
          diagnosticAnswers={diagnosticAnswers} diagnosticTranscript={diagnosticTranscript}
          serviceMode={serviceMode} inspectionFeePaise={inspectionFeePaise}
          fuelType={fuelType}
          onDone={(b) => nav(`/repair/bookings/${b._id}`)}
        />
      )}
    </div>
  );
}
