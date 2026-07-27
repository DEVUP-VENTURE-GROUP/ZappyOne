import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, Zap, CheckCircle, Loader2, ChevronRight, ChevronDown, Search, X,
  Smartphone, Laptop, Car, Bike, Sparkles, Users, Wifi, PlugZap, Bolt, Droplets,
  Hammer, ShieldCheck, Truck, Wrench, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetWorkerProfileQuery, useUpdateWorkerSkillsMutation,
  useGetPlansQuery, useListServicesQuery,
} from '../services/api';
import {
  groupCatalog, groupKeyForService,
  DEVICE_EXPERTISE_GROUPS, CATEGORY_BRANDS,
} from '../lib/serviceCatalogGroups';

// Per-group icon + accent. Keyed by the group keys in serviceCatalogGroups.js.
const GROUP_UI = {
  mobile:        { Icon: Smartphone,  color: 'text-indigo-500',  bg: 'bg-indigo-50'  },
  laptop:        { Icon: Laptop,      color: 'text-slate-600',   bg: 'bg-slate-100'  },
  car:           { Icon: Car,         color: 'text-blue-500',    bg: 'bg-blue-50'    },
  bike:          { Icon: Bike,        color: 'text-amber-500',   bg: 'bg-amber-50'   },
  event:         { Icon: Star,        color: 'text-pink-500',    bg: 'bg-pink-50'    },
  pet:           { Icon: Sparkles,    color: 'text-orange-500',  bg: 'bg-orange-50'  },
  family:        { Icon: Users,       color: 'text-emerald-500', bg: 'bg-emerald-50' },
  smart:         { Icon: Wifi,        color: 'text-cyan-500',    bg: 'bg-cyan-50'    },
  appliance:     { Icon: PlugZap,     color: 'text-violet-500',  bg: 'bg-violet-50'  },
  electrical:    { Icon: Bolt,        color: 'text-yellow-500',  bg: 'bg-yellow-50'  },
  plumbing:      { Icon: Droplets,    color: 'text-sky-500',     bg: 'bg-sky-50'     },
  carpentry:     { Icon: Hammer,      color: 'text-stone-500',   bg: 'bg-stone-100'  },
  cleaning:      { Icon: Droplets,    color: 'text-teal-500',    bg: 'bg-teal-50'    },
  commercial:    { Icon: Truck,       color: 'text-slate-700',   bg: 'bg-slate-100'  },
  other_services:{ Icon: Wrench,      color: 'text-slate-500',   bg: 'bg-slate-50'   },
};
const groupUi = (key) => GROUP_UI[key] || GROUP_UI.other_services;

const CATEGORY_LABEL = { mobile: 'Phone Repair', laptop: 'Laptop Repair' };

export default function WorkerSkillsPage() {
  const nav = useNavigate();
  const { data: profile, isLoading: profileLoading } = useGetWorkerProfileQuery();
  const { data: catalog, isLoading: catalogLoading, isError: catalogError, refetch } = useListServicesQuery();
  const [updateSkills, { isLoading: saving }] = useUpdateWorkerSkillsMutation();
  const { data: plansData } = useGetPlansQuery();

  const isLoading = profileLoading || catalogLoading;

  const certifications = profile?.certifications ?? [];

  const [selected, setSelected] = useState(() => new Set());
  const [primary, setPrimary]   = useState(null);
  const [query, setQuery]       = useState('');
  const [openGroups, setOpenGroups] = useState(() => new Set());
  // Per-category expertise (#4): { mobile: { brands: Set, years: n } }
  const [expertise, setExpertise] = useState({});

  // Seed local editing state from the worker profile ONCE it resolves. useState
  // initializers only run on mount (before the async profile arrives), so without
  // this a returning worker's saved services wouldn't pre-select.
  const seededProfile = useRef(false);
  useEffect(() => {
    if (seededProfile.current || !profile) return;
    seededProfile.current = true;
    setSelected(new Set(profile.skills ?? []));
    setPrimary(profile.skillPrimary ?? null);
    const seed = {};
    (profile.expertise ?? []).forEach((e) => {
      seed[e.category] = { brands: new Set(e.brands || []), years: e.yearsExperience || 0 };
    });
    setExpertise(seed);
  }, [profile]);

  // Build the grouped catalog. Group order and membership come straight from the
  // shared catalog-grouping module, so this mirrors the customer booking flow.
  const groups = useMemo(() => groupCatalog(catalog?.list ?? []), [catalog]);

  // Seed the open groups ONCE, after both the catalog and the profile are ready:
  // any category the worker already has a pick in starts expanded so they see it
  // without hunting. Computed from profile.skills directly to avoid racing the
  // separate effect that seeds `selected`.
  const seededOpen = useRef(false);
  useEffect(() => {
    if (seededOpen.current || groups.length === 0 || !profile) return;
    seededOpen.current = true;
    const have = new Set(profile.skills ?? []);
    const initial = new Set();
    for (const g of groups) if (g.services.some((s) => have.has(s.code))) initial.add(g.key);
    setOpenGroups(initial);
    // Run only when groups + profile first populate; selection changes must not re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, profile]);

  const isGroupOpen = (key) => openGroups.has(key);
  function toggleGroup(key) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggle(code) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) { next.delete(code); if (primary === code) setPrimary(null); }
      else next.add(code);
      return next;
    });
  }

  function toggleAllInGroup(group) {
    const codes = group.services.map((s) => s.code);
    const allOn = codes.every((c) => selected.has(c));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) {
        codes.forEach((c) => { next.delete(c); if (primary === c) setPrimary(null); });
      } else {
        codes.forEach((c) => next.add(c));
      }
      return next;
    });
  }

  function toggleBrand(cat, brand) {
    setExpertise((prev) => {
      const cur = prev[cat] || { brands: new Set(), years: 0 };
      const brands = new Set(cur.brands);
      if (brands.has(brand)) brands.delete(brand); else brands.add(brand);
      return { ...prev, [cat]: { ...cur, brands } };
    });
  }
  function setYears(cat, years) {
    setExpertise((prev) => {
      const cur = prev[cat] || { brands: new Set(), years: 0 };
      return { ...prev, [cat]: { ...cur, years } };
    });
  }

  // Filter services by the search box (matches name or code). Empty query = all.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        services: g.services.filter(
          (s) => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.services.length > 0);
  }, [groups, query]);

  // Which device-expertise categories the worker now has at least one service in.
  const activeDeviceCats = useMemo(() => {
    const cats = new Set();
    for (const g of groups) {
      if (!DEVICE_EXPERTISE_GROUPS.includes(g.key)) continue;
      if (g.services.some((s) => selected.has(s.code))) cats.add(g.key);
    }
    return [...cats];
  }, [groups, selected]);

  async function save() {
    if (selected.size === 0) { toast.error('Select at least one service you can perform'); return; }
    try {
      // Send full per-group expertise so the backend derives the complete skills
      // set from the union of every group's services (it overrides `skills` with
      // that union when expertise is present — see worker.controller.updateSkills).
      // Brands/years are only meaningful for device groups; empty elsewhere.
      const codeToGroup = new Map();
      for (const g of groups) for (const s of g.services) codeToGroup.set(s.code, g.key);

      const byGroup = {};
      for (const code of selected) {
        const key = codeToGroup.get(code) || groupKeyForService({ code, category: '' });
        (byGroup[key] ||= []).push(code);
      }

      const expertisePayload = Object.entries(byGroup).map(([cat, services]) => ({
        category:        cat,
        services,
        brands:          DEVICE_EXPERTISE_GROUPS.includes(cat) ? [...(expertise[cat]?.brands ?? [])] : [],
        yearsExperience: DEVICE_EXPERTISE_GROUPS.includes(cat) ? (Number(expertise[cat]?.years) || 0) : 0,
      }));

      await updateSkills({
        skills: [...selected],
        skillPrimary: primary,
        expertise: expertisePayload,
      }).unwrap();
      toast.success('Services saved successfully!');
    } catch (err) { toast.error(err?.data?.error || 'Failed to save services'); }
  }

  const currentPlan = plansData?.current?.name ?? 'basic';
  const isPro = ['pro', 'premium'].includes(currentPlan?.toLowerCase());
  const totalSelected = selected.size;

  return (
    <div className="min-h-screen bg-slate-50 md:flex md:justify-center">
      <div className="w-full max-w-lg bg-slate-50 min-h-screen relative shadow-[0_0_40px_rgba(0,0,0,0.05)] md:border-x border-slate-200/60 pb-8 overflow-hidden">

        {/* Cinematic Header */}
        <header className="relative pt-6 pb-28 overflow-hidden rounded-b-[2.5rem] shadow-sm z-10" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e3a5f 100%)' }}>
          <motion.div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 6, repeat: Infinity, delay: 1 }} />

          <div className="relative z-10 px-5">
            <div className="flex items-center justify-between mb-8">
              <motion.button onClick={() => nav(-1)} whileTap={{ scale: 0.9 }} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white shadow-sm">
                <ArrowLeft size={20} strokeWidth={2.5} />
              </motion.button>
              <h1 className="text-white font-black tracking-wide text-lg">Specialisation</h1>
              <motion.button onClick={save} disabled={saving} whileTap={!saving ? { scale: 0.9 } : {}} className="h-10 px-4 rounded-full bg-white text-indigo-600 font-bold text-sm flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 transition-all">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} strokeWidth={2.5} />}
                Save
              </motion.button>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/20 shadow-inner">
                <Star size={32} className="text-amber-400 fill-amber-400/30" strokeWidth={1.5} />
              </div>
              <p className="text-white font-bold text-lg tracking-tight">Your Services</p>
              <p className="text-white/60 text-xs font-medium mt-1 px-4">Pick every service you can perform. You&apos;ll only get jobs for what you select.</p>
              {totalSelected > 0 && (
                <span className="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white text-[11px] font-bold">
                  <CheckCircle size={12} className="text-amber-300" /> {totalSelected} selected
                </span>
              )}
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 relative z-20">
            <Loader2 size={28} className="animate-spin text-indigo-400 mb-3" />
            <p className="text-sm font-semibold text-slate-400">Loading services...</p>
          </div>
        ) : catalogError ? (
          <div className="flex flex-col items-center justify-center h-64 relative z-20 gap-3 px-6 text-center">
            <p className="text-sm font-semibold text-slate-500">Couldn&apos;t load the service catalog.</p>
            <button onClick={() => refetch()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Retry</button>
          </div>
        ) : (
          <div className="relative z-20 px-4 -mt-16 space-y-4">

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/80 backdrop-blur-xl border border-indigo-100 rounded-[1.25rem] p-4 flex gap-3 text-indigo-700 text-[13px] font-medium shadow-sm">
              <Star size={18} className="shrink-0 mt-0.5 text-indigo-500 fill-indigo-500/20" />
              <p>Set a <span className="font-bold text-indigo-800">Primary Service</span> to boost your visibility and earn up to 20% more in that category.</p>
            </motion.div>

            {/* Plan upgrade prompt */}
            <AnimatePresence>
              {!isPro && (
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} onClick={() => nav('/plans')}
                  className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-[1.25rem] p-4 flex items-center gap-3 text-amber-800 shadow-sm hover:shadow-md transition-all active:scale-[0.98] group">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <Zap size={18} className="text-amber-600 fill-amber-600/30" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[13px] font-bold leading-tight">Upgrade to Zappy Pro</p>
                    <p className="text-[11px] font-medium opacity-80 mt-0.5">Unlock premium categories &amp; higher payouts</p>
                  </div>
                  <ChevronRight size={18} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Certifications summary */}
            <AnimatePresence>
              {certifications.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-emerald-50 border border-emerald-100/50 rounded-[1.25rem] p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1"><ShieldCheck size={14} /> Certifications</p>
                    <button onClick={() => nav('/worker/training')} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-100/50 px-2 py-1 rounded">View All</button>
                  </div>
                  <div className="space-y-2">
                    {certifications.map((c) => (
                      <div key={c.moduleId} className="flex items-center gap-2 bg-white/60 p-2 rounded-lg">
                        <CheckCircle size={14} className="text-emerald-500" />
                        <span className="text-[13px] font-bold text-emerald-800 flex-1">{c.moduleName}</span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">{c.score}%</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services (e.g. screen, tank, pet)"
                className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium"
              />
              {query && (
                <button onClick={() => setQuery('')} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                  <X size={12} className="text-slate-500" />
                </button>
              )}
            </div>

            {/* Grouped catalog */}
            <div className="pt-1 space-y-3 pb-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Service Categories</p>

              {filteredGroups.length === 0 && (
                <div className="bg-white rounded-[1.25rem] p-6 text-center border border-slate-200">
                  <p className="text-sm font-semibold text-slate-500">No services match “{query}”.</p>
                </div>
              )}

              {filteredGroups.map((group) => {
                const ui = groupUi(group.key);
                const codes = group.services.map((s) => s.code);
                const selectedCount = codes.filter((c) => selected.has(c)).length;
                const allOn = selectedCount === codes.length && codes.length > 0;
                // When searching, force groups open so matches are visible.
                const open = query.trim() ? true : isGroupOpen(group.key);

                return (
                  <div key={group.key} className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center gap-3 p-4">
                      <button onClick={() => !query.trim() && toggleGroup(group.key)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${ui.bg} ${ui.color}`}>
                          <ui.Icon size={20} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-black text-slate-800 leading-tight truncate">{group.label}</p>
                          <p className="text-[11px] font-semibold text-slate-400">
                            {selectedCount > 0 ? `${selectedCount} of ${codes.length} selected` : `${codes.length} services`}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => toggleAllInGroup(group)}
                        className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all shrink-0 ${allOn ? 'bg-indigo-600 text-white border-transparent' : 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400'}`}>
                        {allOn ? 'Clear' : 'All'}
                      </button>
                      {!query.trim() && (
                        <button onClick={() => toggleGroup(group.key)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 shrink-0">
                          <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* Group services */}
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-2">
                            {group.services.map((svc) => {
                              const isSel = selected.has(svc.code);
                              const isPrimary = primary === svc.code;
                              const price = Math.round((svc.priceRangeMinPaise || 0) / 100);
                              return (
                                <div key={svc.code}
                                  className={`relative rounded-2xl p-3 border transition-all ${isSel ? (isPrimary ? 'border-amber-400 ring-2 ring-amber-50 bg-amber-50/30' : 'border-indigo-400 ring-2 ring-indigo-50 bg-indigo-50/20') : 'border-slate-150 bg-slate-50/60 hover:border-indigo-200'}`}>
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-[14px] font-bold leading-tight truncate ${isSel ? 'text-slate-900' : 'text-slate-700'}`}>{svc.name}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {price > 0 && <span className="text-[11px] font-bold text-slate-500">from ₹{price}</span>}
                                        {svc.estimatedDurationMinutes ? (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400">
                                            <Clock size={10} /> ~{svc.estimatedDurationMinutes}m
                                          </span>
                                        ) : null}
                                      </div>
                                      {isSel && (
                                        <button onClick={() => setPrimary(isPrimary ? null : svc.code)}
                                          className={`mt-2 text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider transition-all border ${isPrimary ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-300 hover:text-amber-600'}`}>
                                          {isPrimary ? '★ Primary' : 'Set as Primary'}
                                        </button>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => toggle(svc.code)}
                                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? (isPrimary ? 'border-amber-500 bg-amber-500 text-white' : 'border-indigo-600 bg-indigo-600 text-white') : 'border-slate-300 bg-white hover:border-indigo-400'}`}>
                                      {isSel && <CheckCircle size={16} strokeWidth={3} />}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Device Expertise (#4) — brands serviced + experience, shown to customers */}
            <AnimatePresence>
              {activeDeviceCats.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-2 space-y-3 pb-8">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Device Expertise</p>
                  <p className="text-[11px] text-slate-400 px-1 -mt-1">Brands you service and your experience — customers see this when choosing a pro.</p>
                  {activeDeviceCats.map((cat) => {
                    const cur = expertise[cat] || { brands: new Set(), years: 0 };
                    return (
                      <div key={cat} className="bg-white rounded-[1.25rem] p-4 border border-slate-200 space-y-3">
                        <p className="text-[14px] font-black text-slate-800">{CATEGORY_LABEL[cat] || cat}</p>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Brands you repair</p>
                          <div className="flex flex-wrap gap-2">
                            {(CATEGORY_BRANDS[cat] || []).map((brand) => {
                              const on = cur.brands.has(brand);
                              return (
                                <button key={brand} onClick={() => toggleBrand(cat, brand)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${on ? 'bg-indigo-600 text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-150 hover:border-indigo-300'}`}>
                                  {brand}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Years of experience</p>
                          <input type="number" inputMode="numeric" min={0} max={60}
                            value={cur.years}
                            onChange={(e) => setYears(cat, Math.max(0, Math.min(60, Math.floor(Number(e.target.value)) || 0)))}
                            className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}
      </div>
    </div>
  );
}
