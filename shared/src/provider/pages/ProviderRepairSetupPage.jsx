import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Loader2, MapPin, IndianRupee,
  Wrench, Search, Plus, X, AlertTriangle, ShieldCheck, Store, Clock, Sparkles,
} from 'lucide-react';
import {
  useProviderOnboardingStatusQuery,
  useRepairBrandsQuery,
  useRepairWorkCatalogQuery,
  useSaveRepairCapabilitiesMutation,
  useRequestRepairCatalogAdditionMutation,
  useRepairServiceAreasQuery, useUpsertRepairServiceAreaMutation,
  useRepairProviderPricingQuery, useBulkRepairProviderPricingMutation,
  useLazyRepairProviderSuggestedPricingQuery,
  useRepairModelsQuery,
} from '../../services/api';
import { useUpdateShopMeMutation } from '../../services/api';
import { CATEGORY_ICONS } from '../../components/home/LiveServices';
import LocationPicker from '../../modules/booking/LocationPicker';
import toast from 'react-hot-toast';
import WeeklyHours, { incompleteDay } from '../../components/provider/WeeklyHours';
import { formatPaise } from '../../utils/money';

/**
 * Provider setup — the mirror image of the customer's booking flow.
 *
 * A customer walks brand → model → heading → symptom. A provider walks the same
 * catalog from the other side: the brands they handle, then the same headings a
 * customer sees, ticking the work they do under each. One screen, one decision,
 * in the order the trade actually thinks in:
 *
 *   Brands → What you fix → Where you work → Your prices
 *
 * It replaced a four-tab panel whose first control was a dropdown of every
 * repair in the catalog. That asked a shop owner to think like a database.
 *
 * Nothing here is hardcoded: the brands, the headings and the repairs under
 * them are the same admin-managed rows the customer screens read.
 */

const rupees = formatPaise;

const BASE_STEPS = [
  { key: 'brands', label: 'Brands', Icon: Store },
  { key: 'work', label: 'What you fix', Icon: Wrench },
  { key: 'area', label: 'Where', Icon: MapPin },
  { key: 'pricing', label: 'Prices', Icon: IndianRupee },
];

/** A shop states its opening hours; an independent technician has none to state. */
function stepsFor(isShop) {
  if (!isShop) return BASE_STEPS;
  const at = BASE_STEPS.findIndex((s) => s.key === 'pricing');
  return [
    ...BASE_STEPS.slice(0, at),
    { key: 'hours', label: 'Timings', Icon: Clock },
    ...BASE_STEPS.slice(at),
  ];
}

const SERVICE_MODES = [
  { key: 'doorstep', label: 'At the customer', hint: 'You travel to them' },
  { key: 'workshop', label: 'At my workshop', hint: 'They come to you' },
  { key: 'pickup_repair', label: 'Pickup & return', hint: 'You collect and drop back' },
];

/* Chrome */

function Spinner({ pad = 'py-16' }) {
  return <div className={`flex justify-center ${pad}`}><Loader2 size={22} className="animate-spin text-zappy-400" /></div>;
}

/** Progress rail. Compact on a phone, labelled on a laptop. */
function StepRail({ steps, current, onJump, done }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const isDone = done.has(s.key);
        const isCurrent = s.key === current;
        return (
          <button
            key={s.key}
            onClick={() => onJump(s.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              isCurrent ? 'bg-zappy-600 text-white'
                : isDone ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200'
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
              isCurrent ? 'bg-white/20' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100'
            }`}>
              {isDone ? <Check size={10} strokeWidth={3.5} /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepShell({ title, hint, children, onBack, onNext, nextLabel = 'Continue', busy, canNext = true }) {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-lg font-black tracking-tight text-[#0F172A]">{title}</h2>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
      </div>

      {children}

      {/* Sticky on a phone, where the list is long and the thumb is at the bottom. */}
      <div className="sticky bottom-[var(--frame-bottom,0px)] -mx-4 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:border-slate-200">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500">
              Back
            </button>
          )}
          <button
            onClick={onNext}
            disabled={busy || !canNext}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zappy-600 py-2.5 text-sm font-bold text-white transition hover:bg-zappy-700 disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <>{nextLabel} <ArrowRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* 1. Brands */

/**
 * Which makes they handle.
 *
 * First because it is the question a provider can answer instantly, and because
 * it is the same first question the customer is asked — the two sides of the
 * catalog meeting at the same point.
 */
function BrandsStep({ vertical, selected, onChange, onNext }) {
  const { data, isLoading } = useRepairBrandsQuery(vertical);
  const brands = data?.brands || [];
  const all = brands.length > 0 && selected.length === brands.length;

  if (isLoading) return <Spinner />;

  return (
    <StepShell
      title="Which brands do you work on?"
      hint="Customers see these on your profile. You can change them any time."
      onNext={onNext}
      canNext={selected.length > 0}
      nextLabel={selected.length ? `Continue with ${selected.length}` : 'Pick at least one'}
    >
      <button
        onClick={() => onChange(all ? [] : brands.map((b) => b.code))}
        className="text-xs font-bold text-zappy-600"
      >
        {all ? 'Clear all' : 'Select all brands'}
      </button>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {brands.map((b) => {
          const on = selected.includes(b.code);
          return (
            <button
              key={b.code}
              onClick={() => onChange(on ? selected.filter((c) => c !== b.code) : [...selected, b.code])}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition ${
                on ? 'border-zappy-500 bg-zappy-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {b.logoUrl
                ? <img src={b.logoUrl} alt="" className="h-7 object-contain" />
                : (
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black ${
                    on ? 'bg-zappy-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {b.name[0]}
                  </span>
                )}
              <span className={`text-center text-[11px] font-bold leading-tight ${on ? 'text-zappy-700' : 'text-slate-600'}`}>
                {b.name}
              </span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

/* 2. What you fix */

/** Propose a repair the catalog is missing. Admin reviews it. */
function MissingWorkSheet({ vertical, group, cityCode, onClose }) {
  const [form, setForm] = useState({ proposedName: '', description: '' });
  const [submit, { isLoading }] = useRequestRepairCatalogAdditionMutation();

  async function send() {
    try {
      await submit({
        vertical,
        categoryCode: group?.code || '',
        cityCode,
        ...form,
      }).unwrap();
      toast.success("Sent — we'll review it and add it if it checks out.");
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send that');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full space-y-3 rounded-t-3xl bg-white p-6 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Add a job we don't list</h3>
          <button onClick={onClose} className="text-slate-400"><X size={20} /></button>
        </div>
        <p className="-mt-1 text-xs leading-relaxed text-slate-500">
          Under <span className="font-semibold">{group?.name || 'this heading'}</span>. We check it before customers
          can book it — it needs a price, a skill level and a quality check behind it. Approved jobs start in your
          city only.
        </p>
        <input
          className="input w-full text-sm"
          placeholder="What is the job called?"
          value={form.proposedName}
          onChange={(e) => setForm((f) => ({ ...f, proposedName: e.target.value }))}
        />
        <textarea
          rows={3}
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zappy-100"
          placeholder="What does it involve, and roughly how long does it take?"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <button onClick={send} disabled={isLoading || !form.proposedName.trim()} className="btn-primary w-full">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send for review'}
        </button>
      </div>
    </div>
  );
}

/**
 * The headings a customer sees, with the work under each.
 *
 * A provider picks a heading, ticks what they do, and moves on — the same
 * two-level shape the customer uses to describe a problem. Repairs above the
 * provider's skill level are shown but locked, with the reason, rather than
 * hidden: "why can't I do board work?" is answerable here instead of becoming
 * a rejection three days later.
 */
function WorkStep({ vertical, cityCode, brandCodes, onBack, onNext }) {
  const { data, isLoading, refetch } = useRepairWorkCatalogQuery({ vertical, cityCode });
  const [save, { isLoading: saving }] = useSaveRepairCapabilitiesMutation();

  const [openGroup, setOpenGroup] = useState(null);
  const [selected, setSelected] = useState(null);   // Set of repair codes
  const [skillLevel, setSkillLevel] = useState(null);
  const [missingFor, setMissingFor] = useState(null);

  const groups = useMemo(() => data?.groups || [], [data]);

  // Seed from what the server already knows, once.
  useEffect(() => {
    if (!data || selected) return;
    setSelected(new Set(groups.flatMap((g) => g.repairs.filter((r) => r.selected).map((r) => r.code))));
    setSkillLevel(data.skillLevel || 2);
  }, [data, groups, selected]);

  if (isLoading || !selected) return <Spinner />;

  const levels = data.skillLevels || [];
  // A repair can sit under two headings; count and tick it once.
  const allRepairs = [...new Map(groups.flatMap((g) => g.repairs).map((r) => [r.code, r])).values()];
  const allCodes = allRepairs.map((r) => r.code);

  /**
   * The lowest level that can carry everything currently ticked.
   *
   * The level control cannot go below this — dropping it would silently discard
   * claimed work on save, which is how a provider loses a job they thought they
   * had listed.
   */
  const requiredLevel = allRepairs
    .filter((r) => selected.has(r.code))
    .reduce((max, r) => Math.max(max, r.minSkillLevel || 1), 1);

  const needsCheck = levels.find((l) => l.level === skillLevel)?.requiresVerification;

  /**
   * Tick or untick one job.
   *
   * Claiming work above your stated level RAISES the level rather than refusing
   * the tick. The old screen greyed out anything above the default of Level 2,
   * which hid 14 of the 25 phone jobs and 17 of the 39 laptop jobs behind a
   * control most people never touched — a shop that does micro-soldering opened
   * the catalog and found more than half of it untouchable, with no way to say
   * so.
   *
   * The verification rule is untouched: the server still marks a level that
   * requires checking as `pending`, so claiming Level 4 does not send Level 4
   * work to anyone. It only means they can SAY they do it.
   */
  function toggle(code, minLevel = 1) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
    if (minLevel > skillLevel) setSkillLevel(minLevel);
  }

  // One tap instead of opening every heading: all work at or below their level.
  const upToLevel = allRepairs.filter((r) => (r.minSkillLevel || 1) <= skillLevel).map((r) => r.code);
  const allUpToLevelTicked = upToLevel.length > 0 && upToLevel.every((c) => selected.has(c));
  function tickUpToLevel() {
    setSelected((prev) => new Set([...prev, ...upToLevel]));
  }

  async function persist() {
    try {
      const res = await save({
        vertical,
        repairCodes: [...selected],
        candidateCodes: allCodes,
        brandCodes,
        skillLevel,
        serviceModes: ['doorstep', 'workshop', 'pickup_repair'],
      }).unwrap();

      if (res.skipped?.length) {
        toast.error(`${res.skipped.length} need a higher skill level — raise it or untick them`);
        await refetch();
        return false;
      }
      await refetch();
      return true;
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
      return false;
    }
  }

  /* Inside one heading */
  if (openGroup) {
    const group = groups.find((g) => g.code === openGroup);
    return (
      <>
        {missingFor && (
          <MissingWorkSheet vertical={vertical} group={group} cityCode={cityCode} onClose={() => setMissingFor(null)} />
        )}
        <StepShell
          title={group.name}
          hint="Tick everything you can do. One job here answers several of the issues customers search for."
          onBack={() => setOpenGroup(null)}
          onNext={async () => { if (await persist()) setOpenGroup(null); }}
          busy={saving}
          nextLabel="Save"
        >
          <div className="space-y-2">
            {group.repairs.map((r) => {
              const on = selected.has(r.code);
              // Above their stated level — claimable, but it will be checked.
              const raises = r.minSkillLevel > skillLevel;
              return (
                <button
                  key={r.code}
                  onClick={() => toggle(r.code, r.minSkillLevel)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                    on ? 'border-zappy-500 bg-zappy-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    on ? 'border-zappy-600 bg-zappy-600' : 'border-slate-300 bg-white'
                  }`}>
                    {on && <Check size={12} className="text-white" strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#0F172A]">{r.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="text-[11px] text-slate-400">Level {r.minSkillLevel}</span>
                      {r.estimatedDurationMin && <span className="text-[11px] text-slate-400">~{r.estimatedDurationMin} min</span>}
                      {r.warrantyDays > 0 && <span className="text-[11px] text-emerald-600">{r.warrantyDays}-day warranty</span>}
                      {r.isLocal && <span className="text-[11px] font-semibold text-violet-600">Added locally</span>}
                      {raises && (
                        <span className="text-[11px] font-semibold text-amber-600">
                          Raises you to level {r.minSkillLevel}
                        </span>
                      )}
                    </span>

                    {/* The customer's words for this job — what ticking it wins you. */}
                    {r.answers?.length > 0 && (
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">
                        Customers ask for this as: {r.answers.slice(0, 3).join(', ')}
                        {r.answers.length > 3 && ` +${r.answers.length - 3} more`}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setMissingFor(group.code)}
            className="flex w-full items-center justify-center gap-1.5 py-3 text-sm font-semibold text-zappy-600"
          >
            <Plus size={15} /> I do something not listed here
          </button>
        </StepShell>
      </>
    );
  }

  /* The headings */
  return (
    <StepShell
      title="What do you fix?"
      hint="Pick your level and tick everything at once, or open a heading to choose job by job."
      onBack={onBack}
      onNext={async () => { if (await persist()) onNext(); }}
      busy={saving}
      canNext={selected.size > 0}
      nextLabel={selected.size ? `Continue with ${selected.size} jobs` : 'Pick at least one job'}
    >
      {/* Skill level drives what can be claimed, so it sits above the choice. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your level</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {levels.map((l) => {
            const below = l.level < requiredLevel;
            return (
              <button
                key={l.level}
                onClick={() => (below
                  ? toast.error(`Level ${requiredLevel} — you have ticked work that needs it. Untick it to come down.`)
                  : setSkillLevel(l.level))}
                className={`rounded-xl py-2 text-xs font-bold transition ${
                  skillLevel === l.level ? 'bg-zappy-600 text-white'
                    : below ? 'bg-slate-50 text-slate-300' : 'bg-slate-100 text-slate-600'
                }`}
              >
                L{l.level}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {levels.find((l) => l.level === skillLevel)?.description
            || 'Higher levels unlock harder work.'}
        </p>
        {needsCheck && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed text-amber-600">
            <AlertTriangle size={12} className="mt-px shrink-0" />
            This level is verified before those jobs start reaching you.
          </p>
        )}
        <button
          type="button"
          onClick={tickUpToLevel}
          disabled={allUpToLevelTicked}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-zappy-600 py-2.5 text-[13px] font-semibold text-white disabled:bg-emerald-50 disabled:text-emerald-700"
        >
          {allUpToLevelTicked
            ? <><Check size={14} /> All {upToLevel.length} jobs up to level {skillLevel} ticked</>
            : <>Tick all {upToLevel.length} jobs up to level {skillLevel}</>}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-slate-500">Then open any heading to untick what you don&apos;t do.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {groups.map((g) => {
          const Icon = CATEGORY_ICONS[g.code] || Wrench;
          const count = g.repairs.filter((r) => selected.has(r.code)).length;
          return (
            <button
              key={g.code}
              onClick={() => setOpenGroup(g.code)}
              className={`flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition ${
                count ? 'border-zappy-500 bg-zappy-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl ${count ? 'bg-zappy-600' : 'bg-slate-100'}`}>
                {g.imageUrl
                  ? <img src={g.imageUrl} alt="" className="h-full w-full object-cover" />
                  : <Icon size={17} className={count ? 'text-white' : 'text-slate-500'} strokeWidth={1.9} />}
              </span>
              <span className="block text-[12.5px] font-bold leading-tight text-[#0F172A]">{g.name}</span>
              <span className={`text-[11px] font-semibold ${count ? 'text-zappy-600' : 'text-slate-400'}`}>
                {count ? `${count} of ${g.repairs.length} selected` : `${g.repairs.length} jobs`}
              </span>
              {/*
                * Reconciles this screen against the customer's.
                *
                * They browse symptoms and see eleven under Display; a provider
                * claims fixes and sees three. Both are right — one fix answers
                * many symptoms — but without saying so, "3 jobs" next to the
                * customer's "11 issues" reads as a catalog with things missing.
                */}
              {g.problemCount > 0 && (
                <span className="text-[10.5px] text-slate-400">
                  covers {g.problemCount} customer issue{g.problemCount === 1 ? '' : 's'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

/* 3. Where you work */

function AreaStep({ vertical, profile, onBack, onNext, onCity }) {
  const { data, isLoading } = useRepairServiceAreasQuery(vertical);
  const [save, { isLoading: saving }] = useUpsertRepairServiceAreaMutation();
  const existing = data?.areas?.[0];

  const [form, setForm] = useState(null);
  const [picking, setPicking] = useState(false);

  // A shop already told us where it is: start from its address, not a blank map.
  const shopPin = profile?.address?.location?.coordinates?.length === 2 ? profile.address.location.coordinates : null;
  const shopAddress = profile?.address?.text || '';

  useEffect(() => {
    if (!data || form) return;
    setForm({
      // Launch city by default; editable for anyone outside it.
      cityCode: existing?.cityCode || 'hyderabad',
      // 20 km by default — the cap, and what most shops actually want. Starting
      // at 10 quietly halved the reach of everyone who never touched the slider.
      radiusKm: existing?.radiusKm || 20,
      pincodes: (existing?.pincodes || []).join(', '),
      serviceModes: existing?.serviceModes || ['doorstep'],
      workshopAddress: existing?.workshopAddress || shopAddress,
      // [lng, lat], the GeoJSON order the server stores.
      center: existing?.center?.coordinates || shopPin,
      centerAddress: existing?.workshopAddress || shopAddress,
    });
  }, [data, existing, form]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !form) return <Spinner />;

  if (picking) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <LocationPicker
          serviceLabel="Your shop location"
          service={vertical}
          onCancel={() => setPicking(false)}
          onConfirm={({ address, lat, lng }) => {
            setForm((f) => ({
              ...f,
              center: [lng, lat],
              centerAddress: address,
              // The shop address doubles as the drop-off address unless they
              // have already written a different one.
              workshopAddress: f.workshopAddress || address,
            }));
            setPicking(false);
          }}
        />
      </div>
    );
  }

  const needsWorkshop = form.serviceModes.some((m) => m === 'workshop' || m === 'pickup_repair');

  function toggleMode(key) {
    setForm((f) => ({
      ...f,
      serviceModes: f.serviceModes.includes(key)
        ? f.serviceModes.filter((m) => m !== key)
        : [...f.serviceModes, key],
    }));
  }

  async function persist() {
    if (!form.cityCode.trim()) { toast.error('Which city do you work in?'); return; }
    if (!form.serviceModes.length) { toast.error('Pick at least one way of working'); return; }
    // Without a pin the radius means nothing and no customer can reach them.
    if (!form.center) { toast.error('Set your shop location on the map first'); return; }
    if (needsWorkshop && !form.workshopAddress.trim()) {
      toast.error('A workshop address is required for workshop or pickup work');
      return;
    }
    try {
      await save({
        vertical,
        cityCode: form.cityCode.trim().toLowerCase(),
        center: form.center,
        radiusKm: Number(form.radiusKm),
        pincodes: form.pincodes.split(',').map((s) => s.trim()).filter(Boolean),
        serviceModes: form.serviceModes,
        workshopAddress: form.workshopAddress,
      }).unwrap();
      onCity(form.cityCode.trim().toLowerCase());
      onNext();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your area');
    }
  }

  return (
    <StepShell
      title="Where do you work?"
      hint="Pin your shop, then say how far around it you will go. Jobs outside that circle never reach you."
      onBack={onBack}
      onNext={persist}
      busy={saving}
    >
      {/*
        * The shop pin comes first, because the radius below is measured from it
        * and means nothing without it.
        */}
      <button
        onClick={() => setPicking(true)}
        className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
          form.center ? 'border-slate-200 bg-white' : 'border-zappy-300 bg-zappy-50/60'
        }`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          form.center ? 'bg-emerald-50' : 'bg-zappy-600'
        }`}>
          <MapPin size={17} className={form.center ? 'text-emerald-600' : 'text-white'} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#0F172A]">
            {form.center ? 'Your shop location' : 'Set your shop location'}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-500">
            {form.center
              ? (form.centerAddress || 'Pin dropped on the map')
              : 'Drop a pin where your shop actually is. Everything below is measured from it.'}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-bold text-zappy-600">
          {form.center ? 'Change' : 'Set'}
        </span>
      </button>

      <p className="-mt-1 px-1 text-[11px] leading-relaxed text-slate-400">
        This is a fixed address, not where you happen to be. Jobs are matched to your
        shop even when you are out — you can hand them to a technician from anywhere.
      </p>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">City</label>
          <input
            className="input mt-1.5 w-full text-sm"
            placeholder="e.g. hyderabad"
            value={form.cityCode}
            onChange={(e) => setForm((f) => ({ ...f, cityCode: e.target.value }))}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">How far from the shop</label>
            <span className="text-sm font-black text-zappy-600">{form.radiusKm} km</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={form.radiusKm}
            onChange={(e) => setForm((f) => ({ ...f, radiusKm: e.target.value }))}
            className="mt-2 w-full accent-zappy-600"
          />
          {/* 20km is the cap: past that the travel eats the job. */}
          <p className="mt-1 text-[11px] text-slate-400">
            Measured from your shop pin. Up to 20 km — beyond that the travel costs more than the repair.
          </p>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Pincodes you cover</label>
          <input
            className="input mt-1.5 w-full text-sm"
            placeholder="500081, 500084 — optional"
            value={form.pincodes}
            onChange={(e) => setForm((f) => ({ ...f, pincodes: e.target.value }))}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">How you work</p>
        <div className="mt-2 space-y-2">
          {SERVICE_MODES.map((m) => {
            const on = form.serviceModes.includes(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMode(m.key)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  on ? 'border-zappy-500 bg-zappy-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  on ? 'border-zappy-600 bg-zappy-600' : 'border-slate-300'
                }`}>
                  {on && <Check size={12} className="text-white" strokeWidth={3.5} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#0F172A]">{m.label}</span>
                  <span className="block text-[11px] text-slate-500">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {needsWorkshop && (
          <div className="mt-3">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Workshop address</label>
            <input
              className="input mt-1.5 w-full text-sm"
              placeholder="Where customers drop devices off"
              value={form.workshopAddress}
              onChange={(e) => setForm((f) => ({ ...f, workshopAddress: e.target.value }))}
            />
          </div>
        )}
      </div>
    </StepShell>
  );
}


/* 3b. When you are open */

/**
 * Shop hours, in the setup flow rather than buried in a profile page.
 *
 * A shop with no stated hours is invisible to a customer deciding whether it is
 * worth walking over, and takes bookings for times nobody is there. It belongs
 * with the other things that decide whether the shop is live.
 *
 * Only shops see this step. An independent technician's availability is their
 * online toggle, not a shutter.
 */
function HoursStep({ profile, onBack, onNext }) {
  const [update, { isLoading }] = useUpdateShopMeMutation();
  // Most shops keep Mon–Sat 10 to 9 and close Sunday: start there, edit if not.
  const [hours, setHours] = useState(() => (profile?.hours?.length ? profile.hours : [
    ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, opensAt: '10:00', closesAt: '21:00', isClosed: false })),
    { day: 0, opensAt: '', closesAt: '', isClosed: true },
  ]));

  async function save() {
    // An open day with no times is a promise nobody can keep.
    const bad = incompleteDay(hours);
    if (bad) return toast.error(`Set opening and closing times for ${bad}`);

    try {
      await update({ hours }).unwrap();
      onNext();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save your timings');
    }
    return undefined;
  }

  return (
    <StepShell
      title="When are you open?"
      hint="Customers see this before booking. A day left closed takes no bookings."
      onBack={onBack}
      onNext={save}
      busy={isLoading}
    >
      <WeeklyHours hours={hours} onChange={setHours} />
    </StepShell>
  );
}

/* 4. Prices */

/**
 * The part grades a repair can be quoted at, best first.
 *
 * Mirrors the seeded PartQuality ranks. A technician does not price "a screen" —
 * they price an original panel and a compatible one differently, and a customer
 * choosing between two shops is really choosing between those grades. Flattening
 * that to one number is what made every shop look identical.
 */
const QUALITY_TIERS = [
  { code: 'oem', label: 'OEM / Genuine', hint: 'Manufacturer channel' },
  { code: 'premium', label: 'Premium', hint: 'High-grade compatible' },
  { code: 'standard', label: 'Standard', hint: 'Budget compatible' },
];

/** Key for one price cell — a repair, at a model, at a grade. */
function cellKey(repairCode, qualityCode) {
  return `${repairCode}::${qualityCode || '_'}`;
}

/**
 * One repair, priced for the model on screen.
 *
 * Collapsed it is a summary; expanded it offers a box per part grade — one
 * price per grade, because the grade is what the customer is actually buying.
 * No Zappy band is fetched or shown: the provider names their own number.
 */
function PriceRow({
  repair, values, onChange, existing,
}) {
  const [open, setOpen] = useState(false);

  const tiers = repair.usesPart ? QUALITY_TIERS : [{ code: '', label: 'Your price', hint: '' }];

  function toggle() {
    setOpen((v) => !v);
  }

  // What is already live or awaiting review, so an edit starts from the truth.
  const live = tiers
    .map((t) => existing.get(cellKey(repair.code, t.code)))
    .filter(Boolean);
  const typed = tiers.filter((t) => values[cellKey(repair.code, t.code)]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button onClick={toggle} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#0F172A]">{repair.name}</span>
          {live.length ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {live.map((row) => (
                <span key={row._id} className="flex items-center gap-1">
                  <span className="text-[12px] font-black text-[#0F172A]">{rupees(row.totalPaise)}</span>
                  {row.qualityCode && (
                    <span className="text-[10px] font-semibold uppercase text-slate-400">{row.qualityCode}</span>
                  )}
                  {!['approved', 'auto_approved'].includes(row.approvalStatus) && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700">
                      {row.approvalStatus === 'rejected' ? 'rejected' : 'in review'}
                    </span>
                  )}
                </span>
              ))}
            </span>
          ) : typed.length ? (
            <span className="mt-0.5 block text-[11px] font-semibold text-zappy-600">
              {typed.length} price{typed.length === 1 ? '' : 's'} typed — not saved yet
            </span>
          ) : (
            <span className="mt-0.5 block text-[11px] font-semibold text-amber-600">No price yet</span>
          )}
        </span>
        <ChevronRight size={16} className={`shrink-0 text-slate-300 transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3.5">
          {/*
            * No band is shown here on purpose.
            *
            * Zappy still keeps a reference internally to catch a price that is
            * wildly wrong, but showing "₹1,400–₹1,800" to the person about to
            * type a number just anchors them to it — every provider converges
            * on the same figure and the marketplace stops competing. They quote
            * what the job is worth to them; the review catches the outliers.
            */}
          {repair.usesPart && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Quote the <strong className="font-bold text-slate-700">final price</strong> the customer pays,
              part included. Fill only the grades you actually fit.
            </p>
          )}

          <div className="mt-2 space-y-2">
            {tiers.map((t) => {
              const k = cellKey(repair.code, t.code);
              const row = existing.get(k);
              return (
                <div key={t.code || 'flat'} className="flex items-center gap-2">
                  <div className="w-28 shrink-0">
                    <p className="text-[12px] font-bold text-slate-700">{t.label}</p>
                    {t.hint && <p className="text-[10px] text-slate-400">{t.hint}</p>}
                  </div>
                  <div className="relative flex-1">
                    <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input w-full !pl-8 text-sm"
                      placeholder={row ? String(Math.round(row.totalPaise / 100)) : 'Not offered'}
                      value={values[k] ?? ''}
                      onChange={(e) => onChange(k, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What you charge — brand, then model, then each job.
 *
 * The old version asked for ONE price per repair across every device, which is
 * not a price any technician would give: a screen for a Redmi and a screen for
 * an iPhone 16 Pro Max are not the same job or the same part. So this walks the
 * same path the trade thinks in — pick the brand, pick the model, then say what
 * that model costs for each job you do, at each part grade you fit.
 *
 * The first entry in every brand is a baseline covering every model of that
 * brand. That is not a shortcut bolted on: a brand-level row is what the pricing
 * hierarchy falls back to when a model has no row of its own, so a provider can
 * set a sensible default once and override only the handsets that differ,
 * instead of typing 150 model sheets before they can take a booking.
 */
function PricingStep({ vertical, onBack, onNext }) {
  const { data: catalog } = useRepairWorkCatalogQuery({ vertical });
  const { data: pricing, isLoading, refetch } = useRepairProviderPricingQuery(vertical);
  const [bulkSave, { isLoading: saving }] = useBulkRepairProviderPricingMutation();
  const [fetchSuggested, { isFetching: suggesting }] = useLazyRepairProviderSuggestedPricingQuery();

  const brandCodes = catalog?.brands || [];
  const [brand, setBrand] = useState(null);
  // undefined = the model list; null = the brand-level baseline; a code = that
  // specific model. The name is held alongside it because the list it came from
  // reloads when the search changes, and the open sheet must keep its title.
  const [model, setModel] = useState(undefined);
  const [modelLabel, setModelLabel] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState({});
  const [fillingAll, setFillingAll] = useState(false);

  const activeBrand = brand || brandCodes[0] || null;

  const { data: brandsData } = useRepairBrandsQuery(vertical);
  const { data: modelsData, isFetching: loadingModels } = useRepairModelsQuery(
    // Searching server-side rather than filtering the loaded page: the endpoint
    // returns 50 at a time, and a brand that grows past that would otherwise
    // have models that exist but can never be found.
    { vertical, brandCode: activeBrand, q: search || undefined },
    { skip: !activeBrand },
  );

  // One row per job: a repair listed under two headings is still one price.
  const claimed = useMemo(() => {
    const byCode = new Map();
    for (const r of (catalog?.groups || []).flatMap((g) => g.repairs)) {
      if (r.selected && !byCode.has(r.code)) byCode.set(r.code, r);
    }
    return [...byCode.values()];
  }, [catalog]);

  /** The provider's live rows, indexed by the exact cell they belong to. */
  const existing = useMemo(() => {
    const map = new Map();
    for (const row of pricing?.pricing || []) {
      if ((row.brandCode || null) !== (activeBrand || null)) continue;
      if ((row.modelCode || null) !== (model ?? null)) continue;
      map.set(cellKey(row.repairCode, row.qualityCode), row);
    }
    return map;
  }, [pricing, activeBrand, model]);

  /** How many of this provider's rows land on a given model — the list badge. */
  const pricedCountFor = useMemo(() => {
    const counts = new Map();
    for (const row of pricing?.pricing || []) {
      if ((row.brandCode || null) !== (activeBrand || null)) continue;
      const key = row.modelCode || '__brand__';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [pricing, activeBrand]);

  if (isLoading) return <Spinner />;

  const brandName = (code) => brandsData?.brands?.find((b) => b.code === code)?.name || code;
  const filtered = modelsData?.models || [];

  function setValue(key, raw) {
    setValues((v) => ({ ...v, [key]: raw }));
  }

  function openSheet(modelCode, label = '') {
    setModel(modelCode);
    setModelLabel(label);
    setValues({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Fill every empty box on this sheet with the ZappyOne market price, so a
   * shop prices a whole brand in one tap and only edits what it charges
   * differently. Nothing saves until the owner taps Save.
   */
  async function fillMarketPrices() {
    try {
      const { suggestions = [] } = await fetchSuggested({
        vertical, brandCode: activeBrand, modelCode: model ?? undefined,
      }).unwrap();
      const fill = {};
      for (const s of suggestions) {
        const k = cellKey(s.repairCode, s.qualityCode);
        if (values[k] || existing.has(k)) continue;
        fill[k] = String(Math.round(s.totalPaise / 100));
      }
      const n = Object.keys(fill).length;
      if (!n) return toast('No market prices to add here — enter yours below.');
      setValues((v) => ({ ...v, ...fill }));
      toast.success(`${n} price${n === 1 ? '' : 's'} filled — change any, then Save prices`);
    } catch {
      toast.error('Could not load market prices');
    }
  }

  /**
   * Every brand at once: the market price becomes each brand's baseline
   * wherever the shop has not set its own. One tap instead of a sheet per
   * brand; any brand or model can still be edited after.
   */
  async function priceAllBrandsAtMarket() {
    setFillingAll(true);
    try {
      // Brands are independent prices, so they are set side by side.
      const counts = await Promise.all(brandCodes.map(async (code) => {
        const have = new Set((pricing?.pricing || [])
          .filter((r) => r.brandCode === code && !r.modelCode)
          .map((r) => cellKey(r.repairCode, r.qualityCode)));
        const { suggestions = [] } = await fetchSuggested({ vertical, brandCode: code }).unwrap();
        const rows = suggestions
          .filter((x) => !have.has(cellKey(x.repairCode, x.qualityCode)))
          .map((x) => ({
            repairCode: x.repairCode,
            brandCode: code,
            modelCode: null,
            qualityCode: x.qualityCode,
            totalPaise: x.totalPaise,
            warrantyDays: claimed.find((r) => r.code === x.repairCode)?.warrantyDays || 0,
          }));
        if (!rows.length) return 0;
        const res = await bulkSave({ vertical, rows }).unwrap();
        return res.savedCount || 0;
      }));
      const saved = counts.reduce((a, n) => a + n, 0);
      toast.success(saved
        ? `${saved} prices set across ${brandCodes.length} brands — edit any brand or model to change them`
        : 'Every brand already has its prices');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not set market prices');
    } finally {
      setFillingAll(false);
    }
  }

  async function saveSheet() {
    const rows = [];
    for (const [key, raw] of Object.entries(values)) {
      const amount = Number(raw);
      if (!raw || !amount || amount <= 0) continue;
      const [repairCode, qualityPart] = key.split('::');
      const repair = claimed.find((r) => r.code === repairCode);
      rows.push({
        repairCode,
        brandCode: activeBrand,
        modelCode: model ?? null,
        qualityCode: qualityPart === '_' ? null : qualityPart,
        totalPaise: Math.round(amount * 100),
        warrantyDays: repair?.warrantyDays || 0,
      });
    }

    if (!rows.length) return toast.error('Enter at least one price');

    try {
      const res = await bulkSave({ vertical, rows }).unwrap();
      if (res.rejectedCount) {
        toast.error(res.note, { duration: 6000 });
      } else {
        toast.success(res.note);
      }
      setValues({});
      setModel(undefined);
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save those prices');
    }
  }

  /* The price sheet for one model (or the brand baseline) */
  if (model !== undefined) {
    const label = model === null
      ? `Every ${brandName(activeBrand)} model`
      : modelLabel || model;

    return (
      <StepShell
        title={label}
        hint={model === null
          ? 'A starting price for the whole brand. Any model you price separately overrides this.'
          : 'Your final price for this model — part and labour together.'}
        onBack={() => { setModel(undefined); setValues({}); }}
        onNext={saveSheet}
        nextLabel={saving ? 'Saving…' : 'Save prices'}
        busy={saving}
      >
        {!claimed.length ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
            <p className="text-sm font-bold text-slate-700">No jobs selected yet</p>
            <p className="mt-0.5 text-xs text-slate-500">Go back and tick the work you do first.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={fillMarketPrices}
              disabled={suggesting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zappy-200 bg-zappy-50/60 px-3 py-3 text-sm font-bold text-zappy-800 disabled:opacity-60"
            >
              {suggesting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Fill with ZappyOne market prices
            </button>
            {claimed.map((r) => (
              <PriceRow
                key={r.code}
                repair={r}
                values={values}
                onChange={setValue}
                existing={existing}
              />
            ))}
          </div>
        )}
      </StepShell>
    );
  }

  /* Brand, then the model list */
  return (
    <StepShell
      title="What do you charge?"
      hint="Fastest: one tap sets ZappyOne market prices for every brand. Then change only what you charge differently — a brand, or a single model."
      onBack={onBack}
      onNext={onNext}
      nextLabel={pricing?.pricing?.length ? 'Continue' : 'Skip for now'}
    >
      {!brandCodes.length && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
          <p className="text-sm font-bold text-slate-700">No brands chosen yet</p>
          <p className="mt-0.5 text-xs text-slate-500">Go back to the first step and pick the brands you handle.</p>
        </div>
      )}

      {brandCodes.length > 0 && (
        <>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {brandCodes.map((code) => (
              <button
                key={code}
                onClick={() => { setBrand(code); setSearch(''); }}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  activeBrand === code ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {brandName(code)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={priceAllBrandsAtMarket}
            disabled={fillingAll}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-zappy-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {fillingAll ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {fillingAll ? 'Setting prices…' : `Use ZappyOne market prices for all ${brandCodes.length} brands`}
          </button>

          {/* The brand-wide baseline, before the individual handsets. */}
          <button
            onClick={() => openSheet(null)}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-zappy-200 bg-zappy-50/60 p-3.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-zappy-900">
                Every {brandName(activeBrand)} model
              </span>
              <span className="mt-0.5 block text-[11px] text-zappy-700">
                {pricedCountFor.get('__brand__')
                  ? `${pricedCountFor.get('__brand__')} price${pricedCountFor.get('__brand__') === 1 ? '' : 's'} set — used where a model has none of its own`
                  : 'Set one price sheet that covers the whole brand'}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-zappy-400" />
          </button>

          <div className="relative mt-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-full !pl-9 text-sm"
              placeholder={`Search ${brandName(activeBrand)} models`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadingModels ? <Spinner pad="py-8" /> : (
            <div className="mt-2 space-y-1.5">
              {filtered.map((m) => {
                const count = pricedCountFor.get(m.code) || 0;
                return (
                  <button
                    key={m.code}
                    onClick={() => openSheet(m.code, m.name)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-zappy-200"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#0F172A]">{m.name}</span>
                      <span className={`mt-0.5 block text-[11px] font-semibold ${
                        count ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        {count ? `${count} price${count === 1 ? '' : 's'} set` : 'Uses the brand price'}
                      </span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-slate-300" />
                  </button>
                );
              })}

              {!filtered.length && !loadingModels && (
                <p className="py-6 text-center text-xs text-slate-400">
                  {search
                    ? `No ${brandName(activeBrand)} model matches "${search}".`
                    : 'No models listed for this brand yet.'}
                </p>
              )}

              {/* §67 — the catalog is never presented as complete. */}
              <p className="pt-2 text-center text-[11px] text-slate-400">
                Model not listed? Set the brand price above — it covers every model,
                including ones we have not added yet.
              </p>
            </div>
          )}
        </>
      )}
    </StepShell>
  );
}

/* Flow */

export default function ProviderRepairSetupPage() {
  const nav = useNavigate();
  const { data: onboarding } = useProviderOnboardingStatusQuery();

  const verticals = onboarding?.repairVerticals?.length ? onboarding.repairVerticals : ['mobile'];
  const [vertical, setVertical] = useState(null);
  const active = vertical && verticals.includes(vertical) ? vertical : verticals[0];

  const [step, setStep] = useState('brands');
  const [brandCodes, setBrandCodes] = useState(null);
  const [cityCode, setCityCode] = useState('');

  const { data: work } = useRepairWorkCatalogQuery({ vertical: active });

  // Seed brands from what they already claim, so a return visit is not blank.
  useEffect(() => {
    if (work && brandCodes === null) setBrandCodes(work.brands || []);
  }, [work, brandCodes]);

  const isShop = onboarding?.providerKind === 'shop';
  const LABEL = { mobile: 'Phone repair', laptop: 'Laptop repair' };

  const done = useMemo(() => {
    const set = new Set();
    if (brandCodes?.length) set.add('brands');
    if (work?.selectedCount) set.add('work');
    return set;
  }, [brandCodes, work]);

  const go = (next) => { setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(isShop ? '/shop' : '/worker')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100"
            >
              <ArrowLeft size={17} strokeWidth={2.5} />
            </button>
            <div className="min-w-0">
              <p className="truncate font-bold text-[#0F172A]">Set up {LABEL[active] || active}</p>
              <p className="text-xs text-slate-400">A few quick steps — you can come back any time</p>
            </div>
          </div>

          {verticals.length > 1 && (
            <div className="mt-2.5 flex gap-1.5">
              {verticals.map((v) => (
                <button
                  key={v}
                  onClick={() => { setVertical(v); setBrandCodes(null); setStep('brands'); }}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                    active === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {LABEL[v] || v}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2.5">
            <StepRail steps={stepsFor(isShop)} current={step} done={done} onJump={go} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${active}:${step}`}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            {step === 'brands' && brandCodes !== null && (
              <BrandsStep
                vertical={active}
                selected={brandCodes}
                onChange={setBrandCodes}
                onNext={() => go('work')}
              />
            )}
            {step === 'work' && (
              <WorkStep
                vertical={active}
                cityCode={cityCode}
                brandCodes={brandCodes || []}
                onBack={() => go('brands')}
                onNext={() => go('area')}
              />
            )}
            {step === 'area' && (
              <AreaStep
                vertical={active}
                profile={onboarding?.profile}
                onBack={() => go('work')}
                onNext={() => go(isShop ? 'hours' : 'pricing')}
                onCity={setCityCode}
              />
            )}
            {step === 'hours' && (
              <HoursStep
                profile={onboarding?.profile}
                onBack={() => go('area')}
                onNext={() => go('pricing')}
              />
            )}
            {step === 'pricing' && (
              <PricingStep
                vertical={active}
                onBack={() => go(isShop ? 'hours' : 'area')}
                onNext={() => {
                  toast.success("Setup saved — you're ready for jobs");
                  nav(isShop ? '/shop' : '/worker');
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <button
          onClick={() => nav('/provider/onboarding')}
          className="mt-4 flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-400"
        >
          <ShieldCheck size={13} /> Services &amp; verification
        </button>
      </div>
    </div>
  );
}
