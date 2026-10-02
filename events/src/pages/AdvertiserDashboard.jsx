import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone,
  Plus,
  Wallet,
  BarChart2,
  Settings,
  LogOut,
  X,
  Loader2,
  TrendingUp,
  Eye,
  MousePointerClick,
  IndianRupee,
  Play,
  Pause,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Zap,
  Target,
  RefreshCw,
  UploadCloud,
  Image as ImageIcon,
} from 'lucide-react';
import {
  useMyAdCampaignsQuery, useCreateMyCampaignMutation, useUpdateMyCampaignMutation,
  useMyAdWalletQuery, useCreateAdTopUpOrderMutation, useVerifyAdTopUpMutation,
  useGetEventCategoriesQuery, useLogoutMutation, usePresignUploadMutation,
} from '@shared/services/api';
import { openCheckout } from '@shared/services/cashfree';
import { logout, selectAuth } from '@shared/modules/auth/authSlice';
import toast from 'react-hot-toast';

/* Helpers */
const PLACEMENTS = [
  { id: 'home_banner',       label: '🏠 Home Banner',        desc: 'Top of homepage carousel — highest reach' },
  { id: 'category_listing',  label: '📋 Category Listing',   desc: 'Sponsored slot in event/service categories' },
  { id: 'search_ads',        label: '🔍 Search Results',      desc: 'Appear above organic search results' },
  { id: 'detail_cross_sell', label: '🔗 Detail Cross-sell',   desc: 'Shown on service detail page as add-on' },
  { id: 'booking_success',   label: '🎉 Booking Success',     desc: 'Highest-value: shown after booking (converts best)' },
  { id: 'order_tracking',    label: '📍 Order Tracking',      desc: 'While customer waits — contextual only' },
  { id: 'wallet_page',       label: '💰 Wallet Page',         desc: 'Cashback & rewards context ads' },
];

const BILLING_MODELS = [
  { id: 'cpc',    label: 'CPC — Cost Per Click',          desc: 'Pay only when user clicks' },
  { id: 'cpm',    label: 'CPM — Per 1000 Impressions',    desc: 'Pay for visibility / brand awareness' },
  { id: 'cpl',    label: 'CPL — Cost Per Lead',           desc: 'Pay when user expresses intent' },
  { id: 'fixed',  label: 'Fixed Campaign Budget',          desc: 'Fixed total spend, admin optimises delivery' },
];

const STATUS_COLORS = {
  draft:            'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  active:           'bg-emerald-100 text-emerald-700',
  paused:           'bg-orange-100 text-orange-600',
  exhausted:        'bg-red-100 text-red-600',
  completed:        'bg-blue-100 text-blue-700',
  rejected:         'bg-red-100 text-red-700',
};

const EMPTY_FORM = {
  title: '', type: 'sponsored_listing',
  placements: ['home_banner'],
  audience: 'users',
  content: { headline: '', body: '', imageUrl: '', ctaText: 'Book Now', ctaLink: '', badgeText: '', backgroundColor: '#7c3aed', textColor: '#ffffff' },
  targeting: { eventCategories: [], cities: '', keywords: '', userBehavior: 'all' },
  schedule: { startAt: new Date().toISOString().slice(0,10), endAt: new Date(Date.now() + 30*86400000).toISOString().slice(0,10), impressionsLimit: 0 },
  billing: { model: 'cpc', rate: '', budget: '', dailyCapPaise: '' },
};

function fmtRupees(paise) { return `₹${Math.round((paise||0)/100).toLocaleString('en-IN')}`; }
function ctr(impressions, clicks) { return impressions > 0 ? ((clicks/impressions)*100).toFixed(2) : '0.00'; }

/* Stat box */
function StatBox({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-card border border-slate-100 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1 relative overflow-hidden group">
      <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.04] group-hover:opacity-[0.12] transition-opacity blur-xl ${color.split(' ')[0]}`} />
      <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center mb-4 border shadow-sm ${color}`}>
        <Icon size={20} />
      </div>
      <p className="text-3xl font-black text-slate-900 tracking-tight">{value}</p>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[13px] text-slate-500 font-bold">{label}</p>
        {sub && <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">{sub}</span>}
      </div>
    </div>
  );
}

/* Campaign form modal */
function CampaignModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const { data: catData } = useGetEventCategoriesQuery();
  const [presignUpload] = usePresignUploadMutation();

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2MB');
    
    setUploadingImage(true);
    try {
      const { url } = await presignUpload({
        fileName: file.name,
        fileType: file.type,
        folder: 'ads'
      }).unwrap();
      
      await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      const finalUrl = url.split('?')[0];
      set('content.imageUrl', finalUrl);
      toast.success('Image uploaded!');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  function set(path, value) {
    setForm(prev => {
      const parts = path.split('.');
      if (parts.length === 1) return { ...prev, [path]: value };
      return { ...prev, [parts[0]]: { ...prev[parts[0]], [parts[1]]: value } };
    });
  }

  function togglePlacement(id) {
    set('placements', form.placements.includes(id) ? form.placements.filter(p => p !== id) : [...form.placements, id]);
  }

  async function handleSave() {
    if (!form.title || !form.content.headline) return toast.error('Title and headline required');
    if (!form.placements.length) return toast.error('Select at least one placement');
    if (!form.billing.rate || !form.billing.budget) return toast.error('Set bid rate and total budget');

    setSaving(true);
    try {
      await onSave({
        ...form,
        targeting: {
          ...form.targeting,
          cities:   form.targeting.cities.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
          keywords: form.targeting.keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        },
        schedule: {
          startAt: new Date(form.schedule.startAt),
          endAt:   new Date(form.schedule.endAt),
          impressionsLimit: Number(form.schedule.impressionsLimit) || 0,
        },
        billing: {
          model:         form.billing.model,
          rate:          Math.round(Number(form.billing.rate) * 100),
          budget:        Math.round(Number(form.billing.budget) * 100),
          dailyCapPaise: Math.round(Number(form.billing.dailyCapPaise || 0) * 100),
        },
      });
      onClose();
    } catch (e) { toast.error(e?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4 pt-8"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-white rounded-card shadow-2xl w-full max-w-2xl mb-8">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-black text-slate-900">{initial ? 'Edit Campaign' : 'Create Campaign'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Campaigns go to admin review before going live</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
            <X size={15} className="text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* Basics */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Campaign Details</p>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Campaign name (internal)"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-zappy-400 outline-none font-medium" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Ad Type</label>
                <select value={form.type} onChange={e => set('type', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white focus:border-zappy-400">
                  {[['sponsored_listing','Sponsored Listing'],['banner','Banner'],['video','Video'],['featured_theme','Featured Theme'],['cross_sell','Cross-Sell'],['lead_gen','Lead Generation']].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Audience</label>
                <select value={form.audience} onChange={e => set('audience', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white focus:border-zappy-400">
                  <option value="users">Users</option>
                  <option value="workers">Workers</option>
                  <option value="both">Everyone</option>
                </select>
              </div>
            </div>
          </div>

          {/* Placements */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Ad Placements</p>
            <div className="grid grid-cols-1 gap-2">
              {PLACEMENTS.map(p => (
                <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.placements.includes(p.id) ? 'border-zappy-400 bg-zappy-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={form.placements.includes(p.id)} onChange={() => togglePlacement(p.id)} className="hidden" />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${form.placements.includes(p.id) ? 'border-zappy-500 bg-zappy-500' : 'border-slate-300'}`}>
                    {form.placements.includes(p.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">{p.label}</p>
                    <p className="text-[11px] text-slate-400">{p.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Creative */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Ad Creative</p>
            {[
              { k: 'content.headline', label: 'Headline *', placeholder: 'Get 20% off Birthday Decoration!' },
              { k: 'content.body',     label: 'Description', placeholder: 'Limited slots available this month' },
              { k: 'content.ctaText',  label: 'CTA Button',  placeholder: 'Book Now' },
              { k: 'content.ctaLink',  label: 'CTA Link',    placeholder: '/events or https://...' },
              { k: 'content.badgeText',label: 'Badge Text',  placeholder: 'HOT DEAL (optional)' },
            ].map(({ k, label, placeholder }) => (
              <div key={k}>
                <label className="text-xs font-bold text-slate-600 block mb-1">{label}</label>
                <input value={k.split('.').reduce((o, p) => o?.[p], form) || ''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
            ))}

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Ad Image (Optional)</label>
              <label className={`block border-2 border-dashed rounded-2xl p-4 transition-all ${form.content.imageUrl ? 'border-zappy-400 bg-zappy-50/50' : 'border-slate-200 hover:border-zappy-300 hover:bg-slate-50 cursor-pointer'}`}>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-zappy-100 flex items-center justify-center shrink-0">
                    {uploadingImage ? <Loader2 size={20} className="text-zappy-500 animate-spin" /> : 
                     form.content.imageUrl ? <ImageIcon size={20} className="text-zappy-600" /> :
                     <UploadCloud size={20} className="text-zappy-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 truncate">{form.content.imageUrl ? 'Image Uploaded' : 'Upload Image'}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{form.content.imageUrl ? form.content.imageUrl : 'PNG, JPG up to 2MB'}</p>
                  </div>
                  {form.content.imageUrl && !uploadingImage && (
                    <button type="button" onClick={(e) => { e.preventDefault(); set('content.imageUrl', ''); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">
                      Remove
                    </button>
                  )}
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Background Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.content.backgroundColor} onChange={e => set('content.backgroundColor', e.target.value)} className="w-10 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input value={form.content.backgroundColor} onChange={e => set('content.backgroundColor', e.target.value)} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Text Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.content.textColor} onChange={e => set('content.textColor', e.target.value)} className="w-10 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input value={form.content.textColor} onChange={e => set('content.textColor', e.target.value)} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="rounded-xl overflow-hidden h-20 flex items-center px-4" style={{ background: form.content.backgroundColor }}>
              <div>
                {form.content.badgeText && <span className="text-[9px] font-black bg-white/20 text-white px-1.5 py-0.5 rounded-full">{form.content.badgeText}</span>}
                <p className="font-black text-sm mt-0.5" style={{ color: form.content.textColor }}>{form.content.headline || 'Your headline here'}</p>
                <p className="text-[11px] opacity-80 mt-0.5" style={{ color: form.content.textColor }}>{form.content.body}</p>
                <span className="text-[10px] font-bold mt-1 block" style={{ color: form.content.textColor }}>{form.content.ctaText} →</span>
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Targeting</p>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Event Categories (select to target)</label>
              <div className="flex flex-wrap gap-1.5">
                {(catData?.categories || []).map(c => {
                  const on = form.targeting.eventCategories.includes(c._id);
                  return (
                    <button key={c._id} type="button" onClick={() => set('targeting.eventCategories', on ? form.targeting.eventCategories.filter(x => x !== c._id) : [...form.targeting.eventCategories, c._id])}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${on ? 'bg-zappy-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {c.emoji} {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Empty = shown in all categories</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Target Cities (comma separated)</label>
                <input value={form.targeting.cities} onChange={e => set('targeting.cities', e.target.value)} placeholder="bangalore, mumbai"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Search Keywords</label>
                <input value={form.targeting.keywords} onChange={e => set('targeting.keywords', e.target.value)} placeholder="birthday, wedding"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Start Date</label>
                <input type="date" value={form.schedule.startAt} onChange={e => set('schedule.startAt', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">End Date</label>
                <input type="date" value={form.schedule.endAt} onChange={e => set('schedule.endAt', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Budget & Bidding</p>
            <div className="grid grid-cols-1 gap-2">
              {BILLING_MODELS.map(m => (
                <label key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.billing.model === m.id ? 'border-zappy-400 bg-zappy-50' : 'border-slate-200'}`}>
                  <input type="radio" name="billingModel" value={m.id} checked={form.billing.model === m.id} onChange={() => set('billing.model', m.id)} className="hidden" />
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${form.billing.model === m.id ? 'border-zappy-500 bg-zappy-500' : 'border-slate-300'}`} />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{m.label}</p>
                    <p className="text-[11px] text-slate-400">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  {form.billing.model === 'cpm' ? 'Bid (₹ per 1K views)' : form.billing.model === 'cpc' ? 'Bid (₹ per click)' : form.billing.model === 'cpl' ? 'Bid (₹ per lead)' : 'Fixed Budget (₹)'}
                </label>
                <input type="number" min="0" step="0.5" value={form.billing.rate} onChange={e => set('billing.rate', e.target.value)} placeholder="e.g. 2.50"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Total Budget (₹)</label>
                <input type="number" min="0" value={form.billing.budget} onChange={e => set('billing.budget', e.target.value)} placeholder="e.g. 5000"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Daily Cap (₹)</label>
                <input type="number" min="0" value={form.billing.dailyCapPaise} onChange={e => set('billing.dailyCapPaise', e.target.value)} placeholder="0 = no cap"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-zappy-400 outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 bg-zappy-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 shadow-sm shadow-zappy-200">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {saving ? 'Submitting…' : 'Submit for Review'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Wallet top-up modal */
const QUICK_TOPUP = [50000, 100000, 200000, 500000]; // paise

function TopUpModal({ onClose, onSuccess }) {
  const [createOrder] = useCreateAdTopUpOrderMutation();
  const [verifyTopUp] = useVerifyAdTopUpMutation();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleTopUp(amountPaise) {
    try {
      setBusy(true);
      const orderInfo = await createOrder({ amountPaise }).unwrap();
      const checkoutResp = await openCheckout({
        paymentSessionId: orderInfo.paymentSessionId,
        cfOrderId:        orderInfo.cfOrderId,
        cashfreeEnv:      orderInfo.cashfreeEnv || import.meta.env.VITE_CASHFREE_ENV || 'sandbox',
        amountPaise:      orderInfo.amountPaise,
        purpose:          'Ad Wallet Top-up',
      });
      await verifyTopUp({ cfOrderId: checkoutResp.cfOrderId, cfPaymentId: checkoutResp.cfPaymentId }).unwrap();
      toast.success(`₹${amountPaise / 100} added to ad wallet!`);
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg = err?.message || err?.data?.error || 'Top-up failed';
      if (!msg.includes('cancelled')) toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleCustom() {
    const amt = parseInt(custom, 10);
    if (!amt || amt < 100) { toast.error('Minimum top-up is ₹100'); return; }
    handleTopUp(amt * 100);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-card p-7 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-slate-900 text-lg">Add Ad Credits</h3>
            <p className="text-xs text-slate-400 mt-0.5">Credits are used to run your campaigns</p>
          </div>
          {!busy && <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>}
        </div>

        {/* Quick amounts */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {QUICK_TOPUP.map(p => (
            <button key={p} disabled={busy} onClick={() => handleTopUp(p)}
              className="py-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 font-black text-sm transition-colors disabled:opacity-50">
              ₹{p / 100}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
            <input
              type="number" min="100" placeholder="Custom amount"
              value={custom} onChange={e => setCustom(e.target.value)}
              disabled={busy}
              className="w-full pl-7 pr-3 py-3 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
            />
          </div>
          <button onClick={handleCustom} disabled={busy || !custom}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-40 flex items-center gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Pay'}
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-3">Secured by Cashfree · UPI, Cards, Net Banking</p>
      </motion.div>
    </motion.div>
  );
}

/* Campaign row */
function CampaignRow({ ad, onEdit }) {
  const [updateCampaign] = useUpdateMyCampaignMutation();

  async function togglePause() {
    const next = ad.status === 'active' ? 'paused' : 'active';
    try { await updateCampaign({ id: ad._id, status: next }).unwrap(); toast.success(next === 'active' ? 'Resumed' : 'Paused'); }
    catch (e) { toast.error(e?.data?.error || 'Failed'); }
  }

  const statusColor = STATUS_COLORS[ad.status] || STATUS_COLORS.draft;
  const impressions = ad.stats?.impressions || 0;
  const clicks      = ad.stats?.clicks || 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 text-sm truncate">{ad.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{ad.content?.headline}</p>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black ${statusColor}`}>
          {ad.status?.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Views',  value: impressions.toLocaleString('en-IN') },
          { label: 'Clicks', value: clicks.toLocaleString('en-IN') },
          { label: 'CTR',    value: `${ctr(impressions, clicks)}%` },
          { label: 'Spent',  value: fmtRupees(ad.stats?.spend) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-50 rounded-xl py-2">
            <p className="text-sm font-black text-slate-900">{value}</p>
            <p className="text-[9px] text-slate-400 font-medium uppercase">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
        {(ad.placements || []).slice(0, 3).map(p => (
          <span key={p} className="px-2 py-0.5 bg-zappy-50 text-zappy-600 rounded-lg font-semibold">{p.replace('_', ' ')}</span>
        ))}
        {(ad.placements || []).length > 3 && <span className="text-slate-400">+{ad.placements.length - 3}</span>}
      </div>

      <div className="flex gap-2">
        {['draft', 'rejected'].includes(ad.status) && (
          <button onClick={() => onEdit(ad)} className="flex-1 py-2 bg-zappy-50 text-zappy-700 rounded-xl text-xs font-bold hover:bg-zappy-100 transition-colors flex items-center justify-center gap-1">
            <Megaphone size={11} />Edit & Submit
          </button>
        )}
        {['active', 'paused'].includes(ad.status) && (
          <button onClick={togglePause} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-1">
            {ad.status === 'active' ? <><Pause size={11} />Pause</> : <><Play size={11} />Resume</>}
          </button>
        )}
        {ad.status === 'pending_approval' && (
          <div className="flex-1 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1">
            <Clock size={11} />Under Review
          </div>
        )}
      </div>

      {ad.adminNote && (
        <div className="text-[11px] text-red-600 bg-red-50 rounded-xl px-3 py-2">
          Admin note: {ad.adminNote}
        </div>
      )}
    </div>
  );
}

/* Main Dashboard */
const TABS = [
  { id: 'campaigns', label: 'Campaigns',  Icon: Megaphone  },
  { id: 'wallet',    label: 'Wallet',     Icon: Wallet     },
  { id: 'help',      label: 'How it works', Icon: Zap    },
];

export default function AdvertiserDashboard() {
  const dispatch    = useDispatch();
  const nav         = useNavigate();
  const { profile } = useSelector(selectAuth);
  const [doLogout]  = useLogoutMutation();
  const [activeTab, setActiveTab] = useState('campaigns');
  const [showForm,  setShowForm]  = useState(false);
  const [editAd,    setEditAd]    = useState(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [page, setPage]           = useState(1);

  const { data, isLoading, refetch } = useMyAdCampaignsQuery({ page });
  const { data: walletData, refetch: refetchWallet } = useMyAdWalletQuery();
  const [createCampaign] = useCreateMyCampaignMutation();
  const [updateCampaign] = useUpdateMyCampaignMutation();

  const campaigns     = data?.ads || [];
  const wallet        = walletData?.wallet;
  const totalImp      = campaigns.reduce((s, a) => s + (a.stats?.impressions || 0), 0);
  const totalClicks   = campaigns.reduce((s, a) => s + (a.stats?.clicks || 0), 0);
  const totalSpent    = campaigns.reduce((s, a) => s + (a.stats?.spend || 0), 0);
  const activeCnt     = campaigns.filter(a => a.status === 'active').length;

  async function handleLogout() { try { await doLogout().unwrap(); } catch {} dispatch(logout()); }

  async function handleSave(form) {
    if (editAd) await updateCampaign({ id: editAd._id, ...form }).unwrap();
    else        await createCampaign({ ...form, _advertiserName: profile?.name || '' }).unwrap();
    toast.success(editAd ? 'Campaign updated — pending review' : 'Campaign submitted for review! 🎉');
    refetch();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-6 z-30 px-8 mb-8 pointer-events-none">
        <div className="bg-white border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,1)_inset] rounded-card px-6 py-4 flex items-center justify-between pointer-events-auto transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-4">
            <button onClick={() => nav('/partner')} className="w-11 h-11 bg-slate-50 hover:bg-slate-100 flex items-center justify-center rounded-[14px] border border-slate-200 transition-colors mr-1 outline-none">
              <ArrowLeft size={18} className="text-slate-600" />
            </button>
            <div className="relative group cursor-pointer">
              <div className="absolute inset-0 bg-zappy-500 blur-lg opacity-40 group-hover:opacity-60 transition-opacity rounded-xl" />
              <div className="relative w-12 h-12 bg-zappy-gradient rounded-[16px] flex items-center justify-center shadow-lg ring-2 ring-white/50">
                <Megaphone size={22} className="text-white drop-shadow-md" />
              </div>
            </div>
            <div>
              <p className="font-black text-navy-900 text-2xl tracking-tight leading-none">Zappy Ads</p>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">Advertiser Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="mailto:vendors@zappyone.com" className="hidden md:flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-zappy-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              vendors@zappyone.com
            </a>
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-[14px] px-4 py-2.5 shadow-sm shadow-emerald-100">
              <Wallet size={16} className="text-emerald-600" />
              <span className="text-sm font-black text-emerald-700">{fmtRupees(wallet?.creditsPaise)}</span>
            </div>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowTopUp(true)} className="flex items-center gap-1.5 px-4 py-2.5 bg-zappy-gradient text-white rounded-[14px] text-sm font-bold shadow-md shadow-zappy-200 transition-all hover:opacity-90 ring-2 ring-white">
              <Plus size={14} />Add Credits
            </motion.button>
            <div className="w-px h-8 bg-slate-200 mx-1" />
            <button onClick={handleLogout} className="w-11 h-11 flex items-center justify-center bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-[14px] border border-slate-100 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBox label="Active Campaigns" value={activeCnt}                                   icon={Megaphone}         color="bg-zappy-50 border-zappy-200 text-zappy-600" />
          <StatBox label="Total Impressions" value={totalImp.toLocaleString('en-IN')}            icon={Eye}               color="bg-cyan-50 border-cyan-200 text-cyan-600" />
          <StatBox label="Total Clicks"      value={totalClicks.toLocaleString('en-IN')}         icon={MousePointerClick} color="bg-amber-50 border-amber-200 text-amber-600" sub={`CTR ${ctr(totalImp, totalClicks)}%`} />
          <StatBox label="Total Spent"       value={fmtRupees(totalSpent)}                       icon={IndianRupee}       color="bg-emerald-50 border-emerald-200 text-emerald-600" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-slate-100/80 p-1.5 rounded-card border border-slate-200/50">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all relative outline-none ${activeTab === id ? 'text-zappy-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'}`}>
              {activeTab === id && (
                <motion.div layoutId="adstabs" className="absolute inset-0 bg-white rounded-2xl shadow-sm border border-slate-200/60" />
              )}
              <span className="relative z-10 flex items-center gap-2"><Icon size={14} className={activeTab === id ? 'text-zappy-500' : ''} />{label}</span>
            </button>
          ))}
        </div>

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">{data?.total || 0} campaign{data?.total !== 1 ? 's' : ''}</p>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setEditAd(null); setShowForm(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-zappy-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-zappy-200">
                <Plus size={13} />New Campaign
              </motion.button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-zappy-400" /></div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-zappy-400/10 blur-[80px] rounded-full pointer-events-none" />
                <div className="relative">
                  <div className="w-24 h-24 bg-zappy-gradient rounded-card flex items-center justify-center mx-auto mb-6 shadow-xl shadow-zappy-200 rotate-3 transition-transform hover:rotate-6">
                    <Megaphone size={40} className="text-white drop-shadow-md -rotate-3" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Supercharge your growth</h2>
                  <p className="text-sm text-slate-500 mt-2 mb-8 max-w-sm mx-auto">Create highly targeted ad campaigns to reach thousands of high-intent customers right when they are looking to book.</p>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} onClick={() => setShowForm(true)} className="px-8 py-4 bg-zappy-gradient text-white rounded-2xl text-sm font-black shadow-lg shadow-zappy-200 flex items-center justify-center gap-2 mx-auto ring-2 ring-white">
                    <Plus size={16} /> Create First Campaign
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(ad => (
                  <CampaignRow key={ad._id} ad={ad} onEdit={a => { setEditAd(a); setShowForm(true); }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wallet Tab */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <div className=" bg-zappy-600 rounded-card p-6 text-white">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Available Balance</p>
              <p className="text-4xl font-black mt-1">{fmtRupees(wallet?.creditsPaise)}</p>
              <div className="flex gap-4 mt-4 text-xs">
                <div><p className="text-white/60">Total Added</p><p className="font-black">{fmtRupees(wallet?.lifetimeTopUpPaise)}</p></div>
                <div><p className="text-white/60">Total Spent</p><p className="font-black">{fmtRupees(wallet?.lifetimeSpentPaise)}</p></div>
              </div>
              <button onClick={() => setShowTopUp(true)} className="mt-4 flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors text-white font-bold text-sm px-4 py-2 rounded-xl">
                <Plus size={14} />Add Credits
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Transaction History</p>
              {(wallet?.ledger || []).slice().reverse().slice(0, 20).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {(wallet?.ledger || []).slice().reverse().slice(0, 20).map((tx, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <div>
                        <p className="text-xs font-semibold text-slate-700 capitalize">{tx.type}</p>
                        <p className="text-[10px] text-slate-400">{tx.note} · {new Date(tx.at).toLocaleDateString('en-IN')}</p>
                      </div>
                      <span className={`text-sm font-black ${tx.amountPaise > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {tx.amountPaise > 0 ? '+' : ''}{fmtRupees(Math.abs(tx.amountPaise))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* How it works tab */}
        {activeTab === 'help' && (
          <div className="space-y-3">
            {[
              { step: '1', title: 'Create a Campaign', desc: 'Choose placements, write your ad creative, set targeting and budget.', icon: Megaphone },
              { step: '2', title: 'Admin Review (24h)', desc: 'Our team reviews for quality and appropriateness before going live.', icon: CheckCircle },
              { step: '3', title: 'Add Credits', desc: 'Top up your ad wallet. Credits are only spent when users interact with your ad.', icon: Wallet },
              { step: '4', title: 'Go Live', desc: 'Once approved and wallet has credits, your ad serves to relevant users automatically.', icon: Zap },
              { step: '5', title: 'Track & Optimise', desc: 'Monitor impressions, clicks, CTR and spend. Pause or adjust anytime.', icon: BarChart2 },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="flex gap-4 bg-white rounded-2xl border border-slate-100 p-4">
                <div className="w-10 h-10 bg-zappy-100 rounded-xl flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-zappy-600" />
                </div>
                <div>
                  <p className="text-[10px] text-zappy-500 font-black uppercase tracking-wider">Step {step}</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-black text-amber-800 mb-1">💡 Pricing Guide</p>
              <div className="space-y-1 text-xs text-amber-700">
                <p>• CPC: ₹0.50–₹5 per click depending on category</p>
                <p>• CPM: ₹2–₹10 per 1000 impressions</p>
                <p>• Booking success placement has 3× higher conversion rate</p>
                <p>• Unused credits are refundable — no risk</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showForm && (
          <CampaignModal initial={editAd} onClose={() => { setShowForm(false); setEditAd(null); }} onSave={handleSave} />
        )}
        {showTopUp && (
          <TopUpModal onClose={() => setShowTopUp(false)} onSuccess={() => { refetchWallet(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
