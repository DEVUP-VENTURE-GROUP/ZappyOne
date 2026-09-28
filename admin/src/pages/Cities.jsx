import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Globe, Navigation,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAdminCitiesQuery, useAdminCreateCityMutation, useAdminUpdateCityMutation,
  useAdminDeleteCityMutation, useAdminToggleCityActiveMutation,
} from '@shared/services/api';
import { SectionHeader, Card, FormRow, Input, SaveBtn, PageLoader, EmptyState } from './_shared';

const EMPTY_CITY = {
  slug: '', name: '', state: '', lat: '', lng: '',
  population: '', description: '', pinCodes: '', isActive: true,
};

function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/* ─── Area editor row ───────────────────────────────────────────────────── */
function AreaRow({ area, onChange, onRemove }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
      <input
        value={area.name}
        onChange={e => onChange({ ...area, name: e.target.value, slug: slugify(e.target.value) })}
        placeholder="Area name (e.g. Koramangala)"
        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        value={area.slug}
        onChange={e => onChange({ ...area, slug: slugify(e.target.value) })}
        placeholder="slug (auto)"
        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
      />
      <button onClick={onRemove} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
        <X size={13} />
      </button>
    </div>
  );
}

/* ─── City form modal ───────────────────────────────────────────────────── */
function CityFormModal({ initial, onClose, onSave, saving }) {
  const isEdit = !!initial?._id;
  const [form, setForm] = useState(initial
    ? { ...initial, pinCodes: (initial.pinCodes || []).join(', ') }
    : { ...EMPTY_CITY }
  );
  const [areas, setAreas] = useState(initial?.areas || []);

  const f = (key) => ({
    value: form[key] ?? '',
    onChange: (e) => {
      const val = e.target.value;
      setForm(p => ({
        ...p,
        [key]: val,
        ...(key === 'name' && !isEdit ? { slug: slugify(val) } : {}),
      }));
    },
  });

  function addArea() {
    setAreas(p => [...p, { name: '', slug: '' }]);
  }

  function updateArea(i, updated) {
    setAreas(p => p.map((a, idx) => idx === i ? updated : a));
  }

  function removeArea(i) {
    setAreas(p => p.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    if (!form.name || !form.slug || !form.state) {
      toast.error('Name, slug and state are required');
      return;
    }
    if (!form.lat || !form.lng) {
      toast.error('Latitude and longitude are required');
      return;
    }
    const validAreas = areas.filter(a => a.name && a.slug);
    const payload = {
      ...form,
      lat: Number(form.lat),
      lng: Number(form.lng),
      pinCodes: form.pinCodes ? form.pinCodes.split(',').map(p => p.trim()).filter(Boolean) : [],
      areas: validAreas,
    };
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pb-8 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isEdit ? 'Edit City' : 'Add New City'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Basic info */}
          <div className="grid sm:grid-cols-2 gap-4">
            <FormRow label="City Name *">
              <Input {...f('name')} placeholder="e.g. Hyderabad" />
            </FormRow>
            <FormRow label="URL Slug *" hint="Used in /in/:city — auto-filled">
              <Input {...f('slug')} placeholder="hyderabad" className="font-mono text-sm" />
            </FormRow>
            <FormRow label="State *">
              <Input {...f('state')} placeholder="e.g. Telangana" />
            </FormRow>
            <FormRow label="Population" hint="Display string, e.g. 10M+">
              <Input {...f('population')} placeholder="10M+" />
            </FormRow>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <FormRow label="Latitude *" hint="Decimal degrees, e.g. 17.3850">
              <Input type="number" step="0.0001" {...f('lat')} placeholder="17.3850" />
            </FormRow>
            <FormRow label="Longitude *" hint="Decimal degrees, e.g. 78.4867">
              <Input type="number" step="0.0001" {...f('lng')} placeholder="78.4867" />
            </FormRow>
          </div>

          <FormRow label="SEO Description" hint="Shown on /in/:city landing page">
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="India's tech capital with instant on-demand services…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </FormRow>

          <FormRow label="PIN Codes" hint="Comma-separated 6-digit codes">
            <Input {...f('pinCodes')} placeholder="500081, 500032, 500034" />
          </FormRow>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={form.isActive}
              onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm font-semibold text-slate-700">Active (included in sitemap + SEO pages)</span>
          </label>

          {/* Areas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-700">Areas / Localities</p>
              <button
                onClick={addArea}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
              >
                <Plus size={12} /> Add Area
              </button>
            </div>
            {areas.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                No areas yet — click "Add Area" to add localities
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">Display Name</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-1">URL Slug</p>
                  <span />
                </div>
                {areas.map((area, i) => (
                  <AreaRow key={i} area={area}
                    onChange={(updated) => updateArea(i, updated)}
                    onRemove={() => removeArea(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition">
            Cancel
          </button>
          <SaveBtn loading={saving} onClick={handleSave} label={isEdit ? 'Save Changes' : 'Create City'} />
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */
export default function Cities() {
  const { data, isLoading } = useAdminCitiesQuery();
  const [createCity, { isLoading: creating }] = useAdminCreateCityMutation();
  const [updateCity, { isLoading: updating }] = useAdminUpdateCityMutation();
  const [deleteCity] = useAdminDeleteCityMutation();
  const [toggleActive] = useAdminToggleCityActiveMutation();

  const [modal, setModal] = useState(null); // null | { mode: 'create' | 'edit', city?: obj }
  const [expanded, setExpanded] = useState({});

  const cities = data?.cities || [];

  async function handleSave(payload) {
    try {
      if (modal.city) {
        await updateCity({ id: modal.city._id, ...payload }).unwrap();
        toast.success('City updated');
      } else {
        await createCity(payload).unwrap();
        toast.success('City created');
      }
      setModal(null);
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function handleDelete(city) {
    if (!window.confirm(`Delete "${city.name}"? This removes its SEO pages from the sitemap.`)) return;
    try {
      await deleteCity(city._id).unwrap();
      toast.success('City deleted');
    } catch {
      toast.error('Delete failed');
    }
  }

  async function handleToggle(city) {
    try {
      await toggleActive({ id: city._id, isActive: !city.isActive }).unwrap();
      toast.success(city.isActive ? `${city.name} deactivated` : `${city.name} activated`);
    } catch {
      toast.error('Toggle failed');
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="City & Area Management"
        subtitle="Cities and their areas drive all /in/:city SEO pages and the sitemap. Add a city here to go live in that market."
      >
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={15} /> Add City
        </button>
      </SectionHeader>

      {cities.length === 0 ? (
        <EmptyState
          icon={Globe}
          message="No cities configured yet"
          description="Add your first city to launch SEO pages for that market."
        />
      ) : (
        <div className="space-y-3">
          {cities.map(city => {
            const isExpanded = expanded[city._id];
            return (
              <Card key={city._id} className="overflow-hidden">
                {/* City header row */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [city._id]: !p[city._id] }))}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>

                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <MapPin size={16} className="text-blue-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900">{city.name}</p>
                      <span className="text-xs text-slate-400">{city.state}</span>
                      <code className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">/in/{city.slug}</code>
                      {city.population && (
                        <span className="text-xs text-slate-400">{city.population}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Navigation size={10} /> {city.lat}, {city.lng}
                      </span>
                      <span className="text-xs text-slate-400">{city.areas?.length || 0} areas</span>
                      {city.pinCodes?.length > 0 && (
                        <span className="text-xs text-slate-400">{city.pinCodes.length} PIN codes</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(city)}
                      className={`flex items-center gap-1.5 text-xs font-semibold ${city.isActive ? 'text-green-600' : 'text-slate-400'}`}
                      title={city.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {city.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      <span className="hidden sm:inline">{city.isActive ? 'Active' : 'Inactive'}</span>
                    </button>
                    <button
                      onClick={() => setModal({ mode: 'edit', city })}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(city)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded areas */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60">
                        {city.description && (
                          <p className="text-xs text-slate-500 mb-3 italic">{city.description}</p>
                        )}
                        {city.areas?.length > 0 ? (
                          <>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                              Areas ({city.areas.length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {city.areas.map(area => (
                                <span
                                  key={area.slug}
                                  className="inline-flex items-center gap-1 bg-white border border-slate-200 text-xs font-medium text-slate-700 px-2.5 py-1 rounded-full"
                                >
                                  {area.name}
                                  <code className="text-[9px] text-slate-400 font-mono">/{area.slug}</code>
                                </span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">No areas — click Edit to add localities.</p>
                        )}
                        {city.pinCodes?.length > 0 && (
                          <p className="text-xs text-slate-400 mt-2">
                            PIN codes: {city.pinCodes.join(', ')}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <CityFormModal
            initial={modal.city || null}
            onClose={() => setModal(null)}
            onSave={handleSave}
            saving={creating || updating}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
