import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Plus } from 'lucide-react';
import { useAdminGetCatalogServicesQuery, useAdminGetVerticalsQuery, useAdminUpdateVerticalMutation, useAdminCreateCatalogServiceMutation } from '../../services/api';
import toast from 'react-hot-toast';

const NEW_SVC_CATEGORIES = ['mobile', 'laptop', 'car', 'bike', 'home', 'helper', 'pet', 'event', 'beauty', 'ac', 'construction', 'other'];
const BLANK_SVC = { code: '', name: '', category: 'home', priceRangeMinRs: '', priceRangeMaxRs: '', estimatedDurationMinutes: 30 };
import { TABS, CAT_MAP } from './components/services/_service-shared';
import ServicePricingCard from './components/services/ServicePricingCard';
import { HomeCategoryPanel, MobileCategoryPanel, LaptopCategoryPanel, CarCategoryPanel, BikeCategoryPanel, ConstructionCategoryPanel } from './components/services/CategoryPanels';

export default function Services() {
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam  = searchParams.get('cat');
  const activeTab = TABS.some(t => t.key === catParam) ? catParam : 'car';
  
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSvc, setNewSvc] = useState(BLANK_SVC);

  const { data: catalogData,  isLoading: catalogLoading, refetch: refetchCatalog } = useAdminGetCatalogServicesQuery();
  const { data: verticalData, isLoading: verticalLoading, refetch } = useAdminGetVerticalsQuery();
  const [doUpdate] = useAdminUpdateVerticalMutation();
  const [createService, { isLoading: creating }] = useAdminCreateCatalogServiceMutation();

  async function handleCreate() {
    if (!newSvc.code || !newSvc.name || !newSvc.category) return toast.error('Code, name and category are required');
    if (newSvc.priceRangeMinRs === '' || newSvc.priceRangeMaxRs === '') return toast.error('Min and max price are required');
    try {
      await createService({
        ...newSvc,
        code: newSvc.code.trim().toLowerCase().replace(/\s+/g, '_'),
        priceRangeMinRs: Number(newSvc.priceRangeMinRs),
        priceRangeMaxRs: Number(newSvc.priceRangeMaxRs),
        estimatedDurationMinutes: Number(newSvc.estimatedDurationMinutes) || 30,
      }).unwrap();
      toast.success(`${newSvc.name} created`);
      setShowCreate(false);
      setNewSvc(BLANK_SVC);
      refetchCatalog();
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to create service');
    }
  }

  const handleTabChange = (key) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('cat', key);
      return next;
    }, { replace: true });
    setSearch('');
  };

  const allServices   = catalogData?.services  || [];
  const configs       = verticalData?.configs   || {};
  const currentTab    = TABS.find(t => t.key === activeTab);
  const tabServices   = allServices.filter(s => CAT_MAP[activeTab]?.includes(s.category));
  const filteredServices = search.trim()
    ? tabServices.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()))
    : tabServices;
  const isLoading = catalogLoading || verticalLoading;

  async function handleVerticalSave(vertical, patch) {
    setSaving(true);
    try { await doUpdate({ vertical, ...patch }).unwrap(); toast.success(`${vertical} pricing saved`); refetch(); }
    catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Service Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Add, edit, recategorize, enable/disable or delete services. Changes reflect across the customer, worker and partner apps.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shrink-0">
          <Plus size={15} /> New Service
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, Icon, color, bg, border }) => (
          <motion.button key={key} onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${activeTab === key ? `${bg} ${color} ${border} shadow-sm` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            whileTap={{ scale: 0.96 }}>
            <Icon size={15} />{label}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="space-y-4">

          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/20 transition-all">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search in ${currentTab?.label}…`} className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500"><X size={14} /></button>}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
          ) : (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
                {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} — click to edit pricing
              </p>
              {filteredServices.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {search ? `No services matching "${search}"` : 'No services in this category yet'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredServices.map(svc => (
                    <ServicePricingCard key={svc._id} svc={svc}
                      accent={currentTab?.accent} gradFrom={currentTab?.gradFrom}
                      gradTo={currentTab?.gradTo} tabColor={currentTab?.color}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {!isLoading && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Category-level pricing formula</p>
              {['electrical', 'plumbing', 'carpentry', 'cleaning', 'appliance', 'helper', 'pet', 'home'].includes(activeTab) && <HomeCategoryPanel />}
              {activeTab === 'mobile'       && <MobileCategoryPanel config={configs.mobile}       onSave={handleVerticalSave} saving={saving} />}
              {activeTab === 'laptop'       && <LaptopCategoryPanel config={configs.laptop}       onSave={handleVerticalSave} saving={saving} />}
              {activeTab === 'car'          && <CarCategoryPanel config={configs.vehicle}      onSave={handleVerticalSave} saving={saving} />}
              {activeTab === 'bike'         && <BikeCategoryPanel config={configs.bike}         onSave={handleVerticalSave} saving={saving} />}
              {activeTab === 'construction' && <ConstructionCategoryPanel config={configs.construction} onSave={handleVerticalSave} saving={saving} />}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Create-service modal (#5) */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">New Service</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Display Name</label>
                  <input value={newSvc.name} onChange={e => setNewSvc(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Geyser Repair"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Code</label>
                  <input value={newSvc.code} onChange={e => setNewSvc(s => ({ ...s, code: e.target.value }))} placeholder="geyser_repair"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Category</label>
                  <select value={newSvc.category} onChange={e => setNewSvc(s => ({ ...s, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 bg-white capitalize">
                    {NEW_SVC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Min Price (₹)</label>
                  <input type="number" value={newSvc.priceRangeMinRs} onChange={e => setNewSvc(s => ({ ...s, priceRangeMinRs: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Max Price (₹)</label>
                  <input type="number" value={newSvc.priceRangeMaxRs} onChange={e => setNewSvc(s => ({ ...s, priceRangeMaxRs: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Duration (min)</label>
                  <input type="number" value={newSvc.estimatedDurationMinutes} onChange={e => setNewSvc(s => ({ ...s, estimatedDurationMinutes: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100">Cancel</button>
                <button onClick={handleCreate} disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 text-white text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create Service
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
