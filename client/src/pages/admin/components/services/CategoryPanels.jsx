/**
 * Category-level pricing accordion panels — one per vertical.
 * HomeCategoryPanel, MobileCategoryPanel, ConstructionCategoryPanel, VehicleCategoryPanel.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Save, Loader2, Plus, X, Edit2, CheckCircle, Battery, DollarSign, Moon, Trash2 } from 'lucide-react';
import {
  useGetPricingConfigQuery, useAdminUpdatePricingMutation, useAdminTogglesMutation,
  useAdminAddSparePartMutation, useAdminUpdateSparePartMutation, useAdminRemoveSparePartMutation,
} from '../../../../services/api';
import toast from 'react-hot-toast';
import { NumInput, FieldRow, InfoBox, rupees, paise } from './_service-shared';

/* ── Shared accordion wrapper ── */
function Accordion({ title, Icon, accentClass, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
        <span className="flex items-center gap-2"><Icon size={15} className={accentClass} /> {title}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={15} className="text-slate-400" /></motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Home category ── */
export function HomeCategoryPanel() {
  const { data, isLoading } = useGetPricingConfigQuery();
  const [updatePricing,  { isLoading: savingFares }]   = useAdminUpdatePricingMutation();
  const [setToggles,     { isLoading: savingToggles }] = useAdminTogglesMutation();
  const [fares,    setFares]    = useState({ baseFee: 35, perKmFee: 12, perMinFee: 2, platformFee: 15, minFare: 60, surgeMaxMultiplier: 2.5 });
  const [controls, setControls] = useState({ surgeEnabled: true, surgeMaxCap: 2.5, commissionRate: 0.30 });

  useEffect(() => {
    const p = data?.pricing;
    if (!p) return;
    setFares({ baseFee: (p.baseFeePaise ?? 3500) / 100, perKmFee: (p.perKmFeePaise ?? 1200) / 100, perMinFee: (p.perMinFeePaise ?? 200) / 100, platformFee: (p.platformFeePaise ?? 1500) / 100, minFare: (p.minFarePaise ?? 6000) / 100, surgeMaxMultiplier: p.surgeMaxCap ?? 2.5 });
    setControls({ surgeEnabled: p.surgeEnabled ?? true, surgeMaxCap: p.surgeMaxCap ?? 2.5, commissionRate: p.commissionRate ?? 0.30 });
  }, [data]);

  async function saveFares() {
    try { await updatePricing({ baseFeePaise: Math.round(fares.baseFee * 100), perKmFeePaise: Math.round(fares.perKmFee * 100), perMinFeePaise: Math.round(fares.perMinFee * 100), platformFeePaise: Math.round(fares.platformFee * 100), minFarePaise: Math.round(fares.minFare * 100), surgeMaxCap: fares.surgeMaxMultiplier }).unwrap(); toast.success('Fare formula saved'); }
    catch { toast.error('Save failed'); }
  }
  async function saveControls() {
    try { await setToggles(controls).unwrap(); toast.success('Controls saved'); }
    catch { toast.error('Save failed'); }
  }

  return (
    <Accordion title="Category Pricing Formula & Controls" Icon={DollarSign} accentClass="text-violet-600">
      {isLoading ? <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-slate-300" /></div> : (
        <>
          <InfoBox variant="violet">
            <p><strong>Formula:</strong> (Base + Distance × PerKm + ETA × PerMin + Platform) × Surge × Service Multiplier</p>
            <p>Service multipliers: Electrical 1.2× · Carpenter 1.3× · AC Repair 1.5× · Painting 1.4× · Helper 0.9×</p>
          </InfoBox>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'baseFee', label: 'Base Fee (₹)', step: '1' }, { key: 'perKmFee', label: 'Per KM (₹)', step: '0.5' },
              { key: 'perMinFee', label: 'Per Min (₹)', step: '0.5' }, { key: 'platformFee', label: 'Platform Fee (₹)', step: '1' },
              { key: 'minFare', label: 'Min Fare (₹)', step: '5' }, { key: 'surgeMaxMultiplier', label: 'Surge Cap ×', step: '0.1', min: '1', max: '10' },
            ].map(({ key, label, step, min = '0', max }) => (
              <FieldRow key={key} label={label}><NumInput value={fares[key] ?? ''} step={step} min={min} max={max} prefix="₹" onChange={e => setFares(f => ({ ...f, [key]: Number(e.target.value) }))} /></FieldRow>
            ))}
          </div>
          <motion.button onClick={saveFares} disabled={savingFares} className="px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
            {savingFares ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Formula
          </motion.button>
          <div className="border-t border-slate-100 pt-4 grid grid-cols-3 gap-4">
            <FieldRow label="Surge Pricing">
              <button onClick={() => setControls(p => ({ ...p, surgeEnabled: !p.surgeEnabled }))} className={`mt-1 relative inline-flex w-10 h-5 rounded-full transition-colors ${controls.surgeEnabled ? 'bg-violet-600' : 'bg-slate-200'}`}>
                <span className="inline-block w-4 h-4 rounded-full bg-white shadow transition-transform mt-0.5" style={{ transform: controls.surgeEnabled ? 'translateX(22px)' : 'translateX(2px)' }} />
              </button>
            </FieldRow>
            <FieldRow label="Surge Cap"><NumInput value={controls.surgeMaxCap} min="1" max="5" step="0.1" onChange={e => setControls(p => ({ ...p, surgeMaxCap: Number(e.target.value) }))} /></FieldRow>
            <FieldRow label="Commission Rate">
              <div className="flex items-center gap-2">
                <NumInput value={controls.commissionRate} min="0" max="0.5" step="0.01" onChange={e => setControls(p => ({ ...p, commissionRate: Number(e.target.value) }))} />
                <span className="text-sm font-black text-slate-700 w-10 shrink-0">{(controls.commissionRate * 100).toFixed(0)}%</span>
              </div>
            </FieldRow>
          </div>
          <motion.button onClick={saveControls} disabled={savingToggles} className="px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
            {savingToggles ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Controls
          </motion.button>
        </>
      )}
    </Accordion>
  );
}

/* ── Mobile category (with spare parts table) ── */
export function MobileCategoryPanel({ config, onSave, saving }) {
  const [form, setForm] = useState({ inspectionFeePaise: config?.inspectionFeePaise ?? 15000, urgentSurchargePaise: config?.urgentSurchargePaise ?? 10000, warrantyDays: config?.warrantyDays ?? 30 });
  const [addPart, setAddPart] = useState(false);
  const [newPart, setNewPart] = useState({ brand: 'Apple', service: 'screen_replacement', model: 'all', costRs: '' });
  const [editPart, setEditPart] = useState(null);
  const [doAdd]    = useAdminAddSparePartMutation();
  const [doRemove] = useAdminRemoveSparePartMutation();
  const [doUpdate] = useAdminUpdateSparePartMutation();
  const BRANDS = ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Vivo', 'Oppo', 'Others'];
  const MOBILE_SVC = { screen_replacement: 'Screen Replacement', battery_replacement: 'Battery Replacement', charging_issue: 'Charging Issue', speaker_mic_issue: 'Speaker/Mic', software_issue: 'Software Issue', water_damage_check: 'Water Damage' };
  const spareParts = config?.spareParts || [];

  useEffect(() => {
    if (config) setForm({ inspectionFeePaise: config.inspectionFeePaise ?? 15000, urgentSurchargePaise: config.urgentSurchargePaise ?? 10000, warrantyDays: config.warrantyDays ?? 30 });
  }, [config]);

  async function addPartHandler() {
    try { await doAdd({ ...newPart, costPaise: paise(newPart.costRs || 0) }).unwrap(); toast.success('Spare part added'); setAddPart(false); setNewPart({ brand: 'Apple', service: 'screen_replacement', model: 'all', costRs: '' }); }
    catch { toast.error('Failed'); }
  }

  return (
    <Accordion title="Category Fees & Spare Parts" Icon={DollarSign} accentClass="text-indigo-600">
      <div className="grid grid-cols-3 gap-4">
        <FieldRow label="Inspection Fee (₹)"><NumInput value={rupees(form.inspectionFeePaise)} step="10" prefix="₹" onChange={e => setForm(f => ({ ...f, inspectionFeePaise: paise(e.target.value) }))} /></FieldRow>
        <FieldRow label="Urgent Surcharge (₹)"><NumInput value={rupees(form.urgentSurchargePaise)} step="10" prefix="₹" onChange={e => setForm(f => ({ ...f, urgentSurchargePaise: paise(e.target.value) }))} /></FieldRow>
        <FieldRow label="Default Warranty (Days)"><NumInput value={form.warrantyDays} min="0" step="1" onChange={e => setForm(f => ({ ...f, warrantyDays: Number(e.target.value) }))} /></FieldRow>
      </div>
      <motion.button onClick={() => onSave('mobile', form)} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Mobile Fees
      </motion.button>
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Battery size={12} /> Spare Part Pricing ({spareParts.length} entries)</p>
          {!addPart && <button onClick={() => setAddPart(true)} className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Plus size={11} /> Add</button>}
        </div>
        {addPart && (
          <div className="bg-indigo-50 rounded-xl p-3 mb-3 space-y-2 ring-1 ring-indigo-100">
            <div className="grid grid-cols-2 gap-2">
              <FieldRow label="Brand"><select value={newPart.brand} onChange={e => setNewPart(p => ({ ...p, brand: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white">{BRANDS.map(b => <option key={b}>{b}</option>)}</select></FieldRow>
              <FieldRow label="Service"><select value={newPart.service} onChange={e => setNewPart(p => ({ ...p, service: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white">{Object.entries(MOBILE_SVC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FieldRow>
              <FieldRow label="Model (or 'all')"><input value={newPart.model} onChange={e => setNewPart(p => ({ ...p, model: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none" /></FieldRow>
              <FieldRow label="Part Cost (₹)"><input type="number" value={newPart.costRs} onChange={e => setNewPart(p => ({ ...p, costRs: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none" /></FieldRow>
            </div>
            <div className="flex gap-2">
              <button onClick={addPartHandler} className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg flex items-center gap-1"><Save size={10} /> Add</button>
              <button onClick={() => setAddPart(false)} className="px-3 py-1 bg-slate-100 text-xs font-bold rounded-lg"><X size={10} /></button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[9px] font-bold text-slate-400 uppercase border-b border-slate-100"><th className="text-left py-1.5 pr-2">Brand</th><th className="text-left py-1.5 pr-2">Service</th><th className="text-left py-1.5 pr-2">Model</th><th className="text-right py-1.5 pr-2">₹</th><th className="text-center py-1.5 pr-2">Active</th><th className="text-right py-1.5" /></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {spareParts.map(sp => (
                <tr key={sp._id} className="hover:bg-slate-50">
                  {editPart === sp._id ? (
                    <td colSpan={6} className="py-1.5">
                      <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-2 py-1.5 flex-wrap">
                        <span className="text-xs text-slate-600">{sp.brand} · {MOBILE_SVC[sp.service] || sp.service} · {sp.model}</span>
                        <input type="number" defaultValue={rupees(sp.costPaise)} id={`ep-${sp._id}`} className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg" />
                        <button onClick={() => doUpdate({ sparePartId: sp._id, costPaise: paise(document.getElementById(`ep-${sp._id}`).value) }).unwrap().then(() => { toast.success('Updated'); setEditPart(null); }).catch(() => toast.error('Failed'))} className="px-2 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg"><Save size={10} /></button>
                        <button onClick={() => setEditPart(null)} className="px-2 py-1 bg-slate-100 text-xs rounded-lg"><X size={10} /></button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 font-medium">{sp.brand}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{MOBILE_SVC[sp.service] || sp.service}</td>
                      <td className="py-1.5 pr-2 text-slate-400 italic">{sp.model}</td>
                      <td className="py-1.5 pr-2 text-right font-bold">₹{rupees(sp.costPaise)}</td>
                      <td className="py-1.5 pr-2 text-center">{sp.isActive ? <CheckCircle size={11} className="text-green-500 mx-auto" /> : <X size={11} className="text-red-400 mx-auto" />}</td>
                      <td className="py-1.5 text-right space-x-1">
                        <button onClick={() => setEditPart(sp._id)} className="p-1 text-slate-400 hover:text-indigo-600"><Edit2 size={10} /></button>
                        <button onClick={() => window.confirm('Remove?') && doRemove(sp._id).unwrap().then(() => toast.success('Removed')).catch(() => toast.error('Failed'))} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={10} /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {spareParts.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-400 italic text-xs">No spare part pricing yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Accordion>
  );
}

/* ── Construction category ── */
export function ConstructionCategoryPanel({ config, onSave, saving }) {
  const [form, setForm] = useState({ visitFeePaise: config?.visitFeePaise ?? 10000, perHourFeePaise: config?.perHourFeePaise ?? 40000, materialMarkupPct: config?.materialMarkupPct ?? 15, urgentSurchargePct: config?.urgentSurchargePct ?? 20 });
  useEffect(() => { if (config) setForm({ visitFeePaise: config.visitFeePaise ?? 10000, perHourFeePaise: config.perHourFeePaise ?? 40000, materialMarkupPct: config.materialMarkupPct ?? 15, urgentSurchargePct: config.urgentSurchargePct ?? 20 }); }, [config]);

  return (
    <Accordion title="Category Pricing Configuration" Icon={DollarSign} accentClass="text-stone-600">
      <InfoBox variant="stone"><p><strong>Standard:</strong> Visit fee + flat labor · <strong>Hourly:</strong> Visit fee + hours × rate · <strong>Project:</strong> Visit fee only</p></InfoBox>
      <div className="grid grid-cols-2 gap-4">
        {[{ key: 'visitFeePaise', label: 'Site Visit Fee (₹)', isPaise: true }, { key: 'perHourFeePaise', label: 'Hourly Rate (₹/hr)', isPaise: true }, { key: 'materialMarkupPct', label: 'Material Markup (%)', isPaise: false }, { key: 'urgentSurchargePct', label: 'Urgent Surcharge (%)', isPaise: false }].map(({ key, label, isPaise }) => (
          <FieldRow key={key} label={label}><NumInput prefix={isPaise ? '₹' : '%'} value={isPaise ? rupees(form[key]) : form[key]} onChange={e => setForm(f => ({ ...f, [key]: isPaise ? paise(e.target.value) : Number(e.target.value) }))} /></FieldRow>
        ))}
      </div>
      <motion.button onClick={() => onSave('construction', form)} disabled={saving} className="px-4 py-2 bg-stone-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Configuration
      </motion.button>
    </Accordion>
  );
}

/* ── Car category ── */
export function CarCategoryPanel({ config, onSave, saving }) {
  const [form, setForm] = useState({ baseVisitFeePaise: config?.baseVisitFeePaise ?? 5000, perKmFeePaise: config?.perKmFeePaise ?? 1500, emergencySurchargePaise: config?.emergencySurchargePaise ?? 10000, nightSurchargePaise: config?.nightSurchargePaise ?? 8000, nightStartHour: config?.nightStartHour ?? 22, nightEndHour: config?.nightEndHour ?? 6 });
  useEffect(() => { if (config) setForm({ baseVisitFeePaise: config.baseVisitFeePaise ?? 5000, perKmFeePaise: config.perKmFeePaise ?? 1500, emergencySurchargePaise: config.emergencySurchargePaise ?? 10000, nightSurchargePaise: config.nightSurchargePaise ?? 8000, nightStartHour: config.nightStartHour ?? 22, nightEndHour: config.nightEndHour ?? 6 }); }, [config]);

  return (
    <Accordion title="Car Service Pricing Configuration" Icon={DollarSign} accentClass="text-blue-600">
      <InfoBox variant="blue">
        <p><strong>Formula:</strong> Base visit fee + (Distance km × per km fee) + [Emergency surcharge] + [Night surcharge]</p>
      </InfoBox>
      <div className="grid grid-cols-2 gap-4">
        {[{ key: 'baseVisitFeePaise', label: 'Base Visit Fee (₹)', isPaise: true }, { key: 'perKmFeePaise', label: 'Per KM Fee (₹)', isPaise: true }, { key: 'emergencySurchargePaise', label: 'Emergency Surcharge (₹)', isPaise: true }, { key: 'nightSurchargePaise', label: 'Night Surcharge (₹)', isPaise: true }].map(({ key, label }) => (
          <FieldRow key={key} label={label}><NumInput prefix="₹" value={rupees(form[key])} onChange={e => setForm(f => ({ ...f, [key]: paise(e.target.value) }))} /></FieldRow>
        ))}
      </div>
      <motion.button onClick={() => onSave('vehicle', form)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Car Service Fees
      </motion.button>
    </Accordion>
  );
}

/* ── Bike category ── */
export function BikeCategoryPanel({ config, onSave, saving }) {
  const [form, setForm] = useState({ inspectionFeePaise: config?.inspectionFeePaise ?? 15000, urgentSurchargePaise: config?.urgentSurchargePaise ?? 10000, warrantyDays: config?.warrantyDays ?? 30 });
  useEffect(() => { if (config) setForm({ inspectionFeePaise: config.inspectionFeePaise ?? 15000, urgentSurchargePaise: config.urgentSurchargePaise ?? 10000, warrantyDays: config.warrantyDays ?? 30 }); }, [config]);

  return (
    <Accordion title="Bike Repair Category Fees" Icon={DollarSign} accentClass="text-emerald-600">
      <div className="grid grid-cols-3 gap-4">
        <FieldRow label="Inspection Fee (₹)"><NumInput value={rupees(form.inspectionFeePaise)} step="10" prefix="₹" onChange={e => setForm(f => ({ ...f, inspectionFeePaise: paise(e.target.value) }))} /></FieldRow>
        <FieldRow label="Urgent Surcharge (₹)"><NumInput value={rupees(form.urgentSurchargePaise)} step="10" prefix="₹" onChange={e => setForm(f => ({ ...f, urgentSurchargePaise: paise(e.target.value) }))} /></FieldRow>
        <FieldRow label="Default Warranty (Days)"><NumInput value={form.warrantyDays} min="0" step="1" onChange={e => setForm(f => ({ ...f, warrantyDays: Number(e.target.value) }))} /></FieldRow>
      </div>
      <motion.button onClick={() => onSave('bike', form)} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Bike Fees
      </motion.button>
    </Accordion>
  );
}

export function VehicleCategoryPanel(props) {
  return <CarCategoryPanel {...props} />;
}

/* ── Laptop category panel ── */
export function LaptopCategoryPanel({ config, onSave, saving }) {
  const [form, setForm] = useState({ inspectionFeePaise: config?.inspectionFeePaise ?? 20000, urgentSurchargePaise: config?.urgentSurchargePaise ?? 15000, warrantyDays: config?.warrantyDays ?? 60 });
  useEffect(() => {
    if (config) setForm({ inspectionFeePaise: config.inspectionFeePaise ?? 20000, urgentSurchargePaise: config.urgentSurchargePaise ?? 15000, warrantyDays: config.warrantyDays ?? 60 });
  }, [config]);

  return (
    <Accordion title="Laptop Repair Category Fees" Icon={DollarSign} accentClass="text-cyan-600">
      <div className="grid grid-cols-3 gap-4">
        <FieldRow label="Inspection Fee (₹)"><NumInput value={rupees(form.inspectionFeePaise)} step="10" prefix="₹" onChange={e => setForm(f => ({ ...f, inspectionFeePaise: paise(e.target.value) }))} /></FieldRow>
        <FieldRow label="Urgent Surcharge (₹)"><NumInput value={rupees(form.urgentSurchargePaise)} step="10" prefix="₹" onChange={e => setForm(f => ({ ...f, urgentSurchargePaise: paise(e.target.value) }))} /></FieldRow>
        <FieldRow label="Default Warranty (Days)"><NumInput value={form.warrantyDays} min="0" step="1" onChange={e => setForm(f => ({ ...f, warrantyDays: Number(e.target.value) }))} /></FieldRow>
      </div>
      <motion.button onClick={() => onSave('laptop', form)} disabled={saving} className="px-4 py-2 bg-cyan-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50" whileTap={{ scale: 0.96 }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Laptop Fees
      </motion.button>
    </Accordion>
  );
}
