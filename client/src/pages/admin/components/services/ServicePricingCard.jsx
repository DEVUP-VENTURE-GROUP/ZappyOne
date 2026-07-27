import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Save, Loader2, Info, ToggleLeft, ToggleRight, Tag, Image as ImageIcon, Plus, Layers, ShieldCheck, UploadCloud, Trash2 } from 'lucide-react';
import {
  useAdminUpdateCatalogServiceMutation,
  useAdminDeleteCatalogServiceMutation,
  useAdminServiceActiveOrderCountQuery,
  useAdminGetModelsQuery,
  useAdminGetVariantsQuery,
  useAdminCreateVariantMutation,
  usePresignUploadMutation,
} from '../../../../services/api';
import toast from 'react-hot-toast';
import { SvcIcon, NumInput, FieldRow, rupees, paise } from './_service-shared';

// Categories an admin can assign a service to. Keep in sync with the tabs on the
// customer/worker side; changing this reassigns where the service is listed (#5/#18).
const CATEGORY_OPTIONS = [
  'mobile', 'laptop', 'car', 'bike', 'home', 'helper', 'pet', 'event',
  'beauty', 'ac', 'construction', 'other',
];

export default function ServicePricingCard({ svc, accent, gradFrom, gradTo, tabColor }) {
  const [open, setOpen] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name:             svc.name,
    category:         svc.category || 'other',
    shortDescription: svc.shortDescription || '',
    description:      svc.description || '',
    imageUrl:         svc.imageUrl || '',
    minRs:            rupees(svc.priceRangeMinPaise),
    maxRs:            rupees(svc.priceRangeMaxPaise),
    inspectionFeeRs:  rupees(svc.inspectionFeePaise || 15000),
    durationMin:      svc.estimatedDurationMinutes,
    isActive:         svc.isActive,
    isFeatured:       svc.isFeatured || false,
  });

  // Variant Manager State
  const [selectedBrand, setSelectedBrand] = useState(svc.category === 'laptop' ? 'apple-mac' : 'apple');
  const [selectedModel, setSelectedModel] = useState('');
  const [qualityTier, setQualityTier]     = useState('Compatible');
  const [partPriceRs, setPartPriceRs]     = useState(1500);
  const [laborPriceRs, setLaborPriceRs]   = useState(400);
  const [warrantyDays, setWarrantyDays]   = useState(30);

  const [updateSvc, { isLoading: saving }]             = useAdminUpdateCatalogServiceMutation();
  const [deleteSvc, { isLoading: deleting }]          = useAdminDeleteCatalogServiceMutation();
  const [createVariant, { isLoading: savingVariant }] = useAdminCreateVariantMutation();
  const [presignUpload]                                = usePresignUploadMutation();

  const { data: modelsData }   = useAdminGetModelsQuery(selectedBrand, { skip: !open });
  const { data: variantsData, refetch: refetchVariants } = useAdminGetVariantsQuery({ serviceCode: svc.code }, { skip: !open });

  const [checkActiveOrders, setCheckActiveOrders] = useState(false);
  const { data: activeOrderData } = useAdminServiceActiveOrderCountQuery(svc.code, { skip: !checkActiveOrders });
  const activeOrderCount = activeOrderData?.activeOrderCount ?? 0;

  useEffect(() => {
    setForm({
      name:             svc.name,
      category:         svc.category || 'other',
      shortDescription: svc.shortDescription || '',
      description:      svc.description || '',
      imageUrl:         svc.imageUrl || '',
      minRs:            rupees(svc.priceRangeMinPaise),
      maxRs:            rupees(svc.priceRangeMaxPaise),
      inspectionFeeRs:  rupees(svc.inspectionFeePaise || 15000),
      durationMin:      svc.estimatedDurationMinutes,
      isActive:         svc.isActive,
      isFeatured:       svc.isFeatured || false,
    });
  }, [svc]);

  const models = modelsData?.models || [];
  const variants = variantsData?.variants || [];

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      // 1. Get presigned upload URL or fallback local upload
      const res = await presignUpload({ contentType: file.type || 'image/jpeg', folder: 'service-images' }).unwrap();
      if (res?.uploadUrl) {
        await fetch(res.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
        const finalUrl = res.publicUrl || res.key || res.uploadUrl.split('?')[0];
        setForm(p => ({ ...p, imageUrl: finalUrl }));
        toast.success('Image uploaded successfully!');
      } else {
        // Local ObjectURL preview fallback
        const localUrl = URL.createObjectURL(file);
        setForm(p => ({ ...p, imageUrl: localUrl }));
        toast.success('Image loaded!');
      }
    } catch (err) {
      // Graceful fallback to client ObjectURL
      const localUrl = URL.createObjectURL(file);
      setForm(p => ({ ...p, imageUrl: localUrl }));
      toast.success('Image loaded locally!');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave() {
    try {
      await updateSvc({
        code: svc.code,
        name: form.name,
        category: form.category,
        shortDescription: form.shortDescription,
        description: form.description,
        imageUrl: form.imageUrl,
        priceRangeMinRs: form.minRs,
        priceRangeMaxRs: form.maxRs,
        inspectionFeeRs: form.inspectionFeeRs,
        estimatedDurationMinutes: form.durationMin,
        isActive: form.isActive,
        isFeatured: form.isFeatured,
      }).unwrap();
      toast.success(`${svc.name} saved`);
      setOpen(false);
    } catch { toast.error('Save failed'); }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${svc.name}" permanently? This cannot be undone. (In-flight orders will block deletion — disable instead.)`)) return;
    try {
      await deleteSvc(svc.code).unwrap();
      toast.success(`${svc.name} deleted`);
      setOpen(false);
    } catch (err) {
      toast.error(err?.data?.error || 'Delete failed');
    }
  }

  async function handleAddVariant(e) {
    e.preventDefault();
    if (!selectedModel) return toast.error('Select a model');
    try {
      await createVariant({
        serviceCode: svc.code,
        brandCode: selectedBrand,
        modelCode: selectedModel,
        qualityTier,
        partPriceRs,
        laborPriceRs,
        warrantyDays,
      }).unwrap();
      toast.success('Model pricing variant added!');
      refetchVariants();
    } catch { toast.error('Failed to save model variant'); }
  }

  const f = v => e => setForm(p => ({ ...p, [v]: e.target.value }));

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${open ? 'ring-2 ring-offset-0' : 'ring-0'}`}
      style={{ borderColor: open ? accent + '40' : '#e2e8f0', '--tw-ring-color': accent + '40' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${open ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'}`}
      >
        {form.imageUrl ? (
          <img src={form.imageUrl} alt={svc.name} className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-100" />
        ) : (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${gradFrom} ${gradTo}`}>
            <SvcIcon code={svc.code} className="text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800 truncate">{svc.name}</p>
            {!svc.isActive && <span className="text-[9px] font-bold bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full ring-1 ring-red-100">Inactive</span>}
            {svc.isFeatured && <span className="text-[9px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full ring-1 ring-amber-200">Featured</span>}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            ₹{rupees(svc.priceRangeMinPaise)} – ₹{rupees(svc.priceRangeMaxPaise)}
            <span className="mx-1.5 text-slate-200">·</span>~{svc.estimatedDurationMinutes}m
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tabColor} bg-opacity-10`}>Edit</span>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={14} className="text-slate-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-white space-y-4">
              
              {/* Media & Display Name */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FieldRow label="Display Name">
                  <input value={form.name} onChange={f('name')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </FieldRow>
                <FieldRow label="Category" hint="Where this service is listed across the apps">
                  <select value={form.category} onChange={f('category')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 bg-white capitalize">
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Service Image" hint="Upload service photo or banner">
                  <div className="flex items-center gap-2 mt-0.5">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex-1 py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-2 transition"
                    >
                      {uploadingImage ? <Loader2 size={14} className="animate-spin text-indigo-600" /> : <UploadCloud size={14} className="text-indigo-600" />}
                      <span>{form.imageUrl ? 'Change Uploaded Image' : 'Upload Image'}</span>
                    </button>

                    {form.imageUrl && (
                      <div className="relative shrink-0 group">
                        <img src={form.imageUrl} alt="preview" className="w-9 h-9 rounded-xl object-cover border border-slate-200" />
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, imageUrl: '' }))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600 transition"
                          title="Remove Image"
                        >
                          <ImageIcon size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </FieldRow>
                <FieldRow label="Duration (min)" hint="Estimated job time">
                  <NumInput value={form.durationMin} min="5" max="480" step="5" onChange={f('durationMin')} prefix="⏱" />
                </FieldRow>
              </div>

              {/* Descriptions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldRow label="Short Summary" hint="Shown in services grid">
                  <input value={form.shortDescription} onChange={f('shortDescription')} placeholder="Brief 1-line summary..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </FieldRow>
                <FieldRow label="Full Description" hint="Shown on service detail modal">
                  <input value={form.description} onChange={f('description')} placeholder="Detailed service info..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400" />
                </FieldRow>
              </div>

              {/* Pricing Floor & Inspection */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 block">
                  <Tag size={10} /> Base Price Ranges & Inspection Fee
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <FieldRow label="Min Floor (₹)" hint="Hard minimum quote floor">
                    <NumInput value={form.minRs} min="0" step="10" prefix="₹" onChange={f('minRs')} />
                  </FieldRow>
                  <FieldRow label="Max Range (₹)" hint="Upper estimated price display">
                    <NumInput value={form.maxRs} min="0" step="10" prefix="₹" onChange={f('maxRs')} />
                  </FieldRow>
                  <FieldRow label="Inspection Fee (₹)" hint="Base visit/diagnosis fee">
                    <NumInput value={form.inspectionFeeRs} min="0" step="10" prefix="₹" onChange={f('inspectionFeeRs')} />
                  </FieldRow>
                </div>
              </div>

              {/* Expanded Model Variants Matrix Section (Mobile, Laptop, Car & Bike Categories) */}
              {['mobile', 'laptop', 'car', 'bike', 'vehicle'].includes(svc.category) && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowVariants(v => !v)}
                    className="flex items-center justify-between w-full py-2 text-xs font-bold text-slate-700 hover:text-indigo-600 transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers size={13} className="text-indigo-500" />
                      {svc.category === 'laptop' ? 'Laptop' : svc.category === 'car' ? 'Car' : svc.category === 'bike' ? 'Bike' : 'Phone'} Model Quality & Pricing Matrix ({variants.length} custom tiers)
                    </span>
                    <ChevronDown size={14} className={`transform transition-transform ${showVariants ? 'rotate-180' : ''}`} />
                  </button>

                {showVariants && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <Plus size={13} /> Add Model Variant Pricing
                    </div>
                    <form onSubmit={handleAddVariant} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Brand</label>
                        <select value={selectedBrand} onChange={e => { setSelectedBrand(e.target.value); setSelectedModel(''); }}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none">
                          {svc.category === 'laptop' ? (
                            <>
                              <option value="apple-mac">Apple Mac</option>
                              <option value="dell">Dell</option>
                              <option value="hp">HP</option>
                              <option value="lenovo">Lenovo</option>
                              <option value="asus">Asus</option>
                              <option value="acer">Acer</option>
                            </>
                          ) : svc.category === 'car' || svc.category === 'vehicle' ? (
                            <>
                              <option value="maruti">Maruti Suzuki</option>
                              <option value="hyundai">Hyundai</option>
                              <option value="tata">Tata Motors</option>
                              <option value="mahindra">Mahindra</option>
                              <option value="honda-car">Honda Cars</option>
                              <option value="toyota">Toyota</option>
                            </>
                          ) : svc.category === 'bike' ? (
                            <>
                              <option value="royalenfield">Royal Enfield</option>
                              <option value="tvs">TVS Bikes</option>
                              <option value="bajaj">Bajaj Auto</option>
                              <option value="ktm">KTM Racing</option>
                            </>
                          ) : (
                            <>
                              <option value="apple">Apple</option>
                              <option value="samsung">Samsung</option>
                              <option value="oneplus">OnePlus</option>
                              <option value="xiaomi">Xiaomi</option>
                              <option value="vivo">Vivo</option>
                              <option value="oppo">Oppo</option>
                              <option value="realme">Realme</option>
                              <option value="google">Google</option>
                              <option value="nothing">Nothing</option>
                              <option value="motorola">Motorola</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Model</label>
                        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none">
                          <option value="">Select Model...</option>
                          {models.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Quality Tier</label>
                        <select value={qualityTier} onChange={e => setQualityTier(e.target.value)}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none">
                          <option value="OEM">OEM Original</option>
                          <option value="Premium">Premium Grade</option>
                          <option value="Compatible">Compatible</option>
                          <option value="Budget">Budget</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Part Cost (₹)</label>
                        <input type="number" value={partPriceRs} onChange={e => setPartPriceRs(Number(e.target.value))}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Labor Fee (₹)</label>
                        <input type="number" value={laborPriceRs} onChange={e => setLaborPriceRs(Number(e.target.value))}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Warranty (Days)</label>
                        <input type="number" value={warrantyDays} onChange={e => setWarrantyDays(Number(e.target.value))}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none" />
                      </div>
                      <div className="col-span-2 flex items-end">
                        <button type="submit" disabled={savingVariant}
                          className="w-full py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-1">
                          {savingVariant ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save Model Pricing
                        </button>
                      </div>
                    </form>

                    {/* Existing Variants Table */}
                    {variants.length > 0 && (
                      <div className="mt-2 max-h-36 overflow-y-auto divide-y divide-slate-200 text-xs bg-white rounded-lg border border-slate-200">
                        {variants.map(v => (
                          <div key={v._id} className="p-2 flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{v.modelCode} ({v.qualityTier})</span>
                            <span className="text-slate-500">Part: ₹{rupees(v.partPricePaise)} + Labor: ₹{rupees(v.laborPricePaise)} = <strong className="text-indigo-600">₹{rupees(v.totalPricePaise)}</strong> ({v.warrantyDays}d)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Status Toggles & Submit */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                {!form.isActive && checkActiveOrders && activeOrderCount > 0 && (
                  <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2 ring-1 ring-amber-200">
                    <Info size={13} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">
                      <strong>{activeOrderCount} active order{activeOrderCount !== 1 ? 's' : ''}</strong> using this service.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => { const next = !form.isActive; setForm(p => ({ ...p, isActive: next })); if (!next) setCheckActiveOrders(true); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-700"
                    >
                      {form.isActive ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} className="text-slate-300" />}
                      {form.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, isFeatured: !p.isFeatured }))}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-700"
                    >
                      {form.isFeatured ? <ToggleRight size={18} className="text-amber-500" /> : <ToggleLeft size={18} className="text-slate-300" />}
                      {form.isFeatured ? 'Featured Banner' : 'Standard'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                      title="Delete this service"
                    >
                      {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                    </button>
                    <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition">Cancel</button>
                    <motion.button
                      type="button"
                      onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-bold rounded-xl disabled:opacity-50"
                      style={{ background: `linear-gradient(135deg, ${accent}ee, ${accent})` }}
                      whileTap={{ scale: 0.96 }}
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Changes
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
