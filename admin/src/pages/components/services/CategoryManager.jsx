import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, Save, X, ChevronDown, Layers } from 'lucide-react';
import {
  useAdminGetCategoriesQuery,
  useAdminCreateCategoryMutation,
  useAdminUpdateCategoryMutation,
  useAdminDeleteCategoryMutation,
} from '@shared/services/api';
import toast from 'react-hot-toast';

// The 8 brand themes (same palette the catalog uses). Admin picks one; the full
// colour object is sent so the new category's tab is on-brand, not generic blue.
const THEME_PRESETS = {
  blue:   { accent: '#2563EB', deep: '#1E3A8A', tint: '#EFF6FF', soft: '#DBEAFE', glow: 'rgba(37,99,235,0.20)' },
  teal:   { accent: '#0E9488', deep: '#134E4A', tint: '#F0FDFA', soft: '#CCFBF1', glow: 'rgba(14,148,136,0.20)' },
  violet: { accent: '#6D4DF6', deep: '#3B1E8F', tint: '#F5F3FF', soft: '#EDE9FE', glow: 'rgba(109,77,246,0.20)' },
  amber:  { accent: '#D97706', deep: '#7C2D12', tint: '#FFFBEB', soft: '#FEF3C7', glow: 'rgba(217,119,6,0.20)' },
  green:  { accent: '#16A34A', deep: '#14532D', tint: '#F0FDF4', soft: '#DCFCE7', glow: 'rgba(22,163,74,0.20)' },
  rose:   { accent: '#E11D48', deep: '#881337', tint: '#FFF1F2', soft: '#FFE4E6', glow: 'rgba(225,29,72,0.20)' },
  cyan:   { accent: '#0891B2', deep: '#164E63', tint: '#ECFEFF', soft: '#CFFAFE', glow: 'rgba(8,145,178,0.20)' },
  slate:  { accent: '#334155', deep: '#0F172A', tint: '#F8FAFC', soft: '#E2E8F0', glow: 'rgba(51,65,85,0.20)' },
};
const themeNameFor = (theme) =>
  Object.keys(THEME_PRESETS).find((k) => THEME_PRESETS[k].accent === theme?.accent) || 'blue';

const BLANK = { key: '', customerLabel: '', themeName: 'blue', icon: '', brands: '' };

function Row({ cat }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerLabel: cat.customerLabel,
    themeName: themeNameFor(cat.theme),
    icon: cat.icon || '',
    brands: (cat.brands || []).join(', '),
    sortOrder: cat.sortOrder ?? 0,
    isActive: cat.isActive !== false,
  });
  const [update, { isLoading: saving }] = useAdminUpdateCategoryMutation();
  const [remove, { isLoading: deleting }] = useAdminDeleteCategoryMutation();

  async function save() {
    try {
      await update({
        key: cat.key,
        customerLabel: form.customerLabel,
        icon: form.icon,
        theme: THEME_PRESETS[form.themeName],
        brands: form.brands.split(',').map((b) => b.trim()).filter(Boolean),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      }).unwrap();
      toast.success(`${form.customerLabel} saved`);
      setOpen(false);
    } catch (err) { toast.error(err?.data?.error || 'Save failed'); }
  }
  async function del() {
    if (!window.confirm(`Delete category "${cat.customerLabel}"? Services in it must be moved first.`)) return;
    try { await remove(cat.key).unwrap(); toast.success('Category deleted'); }
    catch (err) { toast.error(err?.data?.error || 'Delete failed'); }
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50 text-left">
        <span className="w-6 h-6 rounded-lg shrink-0" style={{ background: THEME_PRESETS[form.themeName].accent }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{form.customerLabel} <span className="text-slate-400 font-mono text-xs">/{cat.key}</span></p>
        </div>
        {!form.isActive && <span className="text-[9px] font-bold bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">Off</span>}
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase col-span-2">Label
                  <input value={form.customerLabel} onChange={(e) => setForm((f) => ({ ...f, customerLabel: e.target.value }))}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-normal normal-case" /></label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Theme
                  <select value={form.themeName} onChange={(e) => setForm((f) => ({ ...f, themeName: e.target.value }))}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white outline-none capitalize font-normal">
                    {Object.keys(THEME_PRESETS).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Icon
                  <input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="e.g. Sparkles"
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-normal normal-case" /></label>
                <label className="text-[10px] font-bold text-slate-500 uppercase col-span-2">Brands (comma-separated, for device categories)
                  <input value={form.brands} onChange={(e) => setForm((f) => ({ ...f, brands: e.target.value }))} placeholder="Apple, Samsung, …"
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-normal normal-case" /></label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Sort order
                  <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-normal" /></label>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className="text-xs font-bold text-slate-600">{form.isActive ? '🟢 Active' : '⚪ Inactive'}</button>
                <div className="flex items-center gap-2">
                  <button onClick={del} disabled={deleting} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                    {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete</button>
                  <button onClick={save} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CategoryManager() {
  const { data, isLoading } = useAdminGetCategoriesQuery();
  const [create, { isLoading: creating }] = useAdminCreateCategoryMutation();
  const [showNew, setShowNew] = useState(false);
  const [nc, setNc] = useState(BLANK);
  const categories = data?.categories || [];

  async function handleCreate() {
    const key = nc.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!key || !nc.customerLabel.trim()) return toast.error('Key and label are required');
    try {
      await create({
        key,
        customerLabel: nc.customerLabel.trim(),
        icon: nc.icon.trim(),
        theme: THEME_PRESETS[nc.themeName],
        brands: nc.brands.split(',').map((b) => b.trim()).filter(Boolean),
      }).unwrap();
      toast.success(`Category "${nc.customerLabel}" created`);
      setShowNew(false); setNc(BLANK);
    } catch (err) { toast.error(err?.data?.error || 'Failed to create category'); }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-indigo-500" />
          <h3 className="font-bold text-slate-900 text-sm">Categories</h3>
          <span className="text-xs text-slate-400">— the tabs services are grouped under, across customer + worker apps</span>
        </div>
        <button onClick={() => setShowNew((s) => !s)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus size={13} /> New Category
        </button>
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 grid grid-cols-2 gap-2">
              <input value={nc.key} onChange={(e) => setNc((v) => ({ ...v, key: e.target.value }))} placeholder="key (e.g. laundry)"
                className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
              <input value={nc.customerLabel} onChange={(e) => setNc((v) => ({ ...v, customerLabel: e.target.value }))} placeholder="Label (e.g. Laundry)"
                className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
              <select value={nc.themeName} onChange={(e) => setNc((v) => ({ ...v, themeName: e.target.value }))}
                className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white outline-none capitalize">
                {Object.keys(THEME_PRESETS).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={nc.icon} onChange={(e) => setNc((v) => ({ ...v, icon: e.target.value }))} placeholder="Icon (e.g. Shirt)"
                className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
              <input value={nc.brands} onChange={(e) => setNc((v) => ({ ...v, brands: e.target.value }))} placeholder="Brands (optional, comma-separated)"
                className="col-span-2 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
              <div className="col-span-2 flex justify-end gap-2">
                <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg flex items-center gap-1"><X size={12} /> Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 flex items-center gap-1">
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create
                </button>
              </div>
              <p className="col-span-2 text-[11px] text-slate-500">After creating, open a service and set its <strong>Category</strong> to this key — it will appear under this tab everywhere. Custom illustrations for a brand-new category are a follow-up; it uses a generic set until then.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-1.5">
          {categories.map((c) => <Row key={c.key} cat={c} />)}
        </div>
      )}
    </div>
  );
}
