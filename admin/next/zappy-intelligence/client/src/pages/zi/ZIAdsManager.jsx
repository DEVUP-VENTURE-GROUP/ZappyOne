import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Plus, Play, Pause, BarChart2, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList } from 'recharts';
import { ziAds } from './zi-api';

const STATUS_BADGE = {
  draft: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  active: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  paused: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};

const CITIES = ['hyderabad', 'bangalore', 'mumbai', 'delhi', 'pune', 'chennai'];
const CATEGORIES = ['phone_repair', 'ac_service', 'plumbing', 'electrical', 'cleaning', 'painting'];
const EMPTY_FORM = {
  advertiserName: '', advertiserType: 'partner', name: '', type: 'banner',
  'budget.totalPaise': 1000000, 'budget.dailyPaise': 50000, 'budget.model': 'cpc', 'budget.bidAmountPaise': 500,
  'creative.headline': '', 'creative.cta': 'Book Now', 'creative.deeplink': '', 'creative.body': '',
  targetCities: [], targetCategories: [],
  startDate: '', endDate: '',
};

function fmt(paise) { return `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`; }
function pct(n, d) { return d ? ((n / d) * 100).toFixed(2) + '%' : '0%'; }

export default function ZIAdsManager() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adRevenue, setAdRevenue] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsId, setAnalyticsId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([ziAds.list({ limit: 30 }), ziAds.getRevenue('mtd')]);
      setCampaigns(c.data || []);
      setAdRevenue(r.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAnalytics = async (id) => {
    setAnalyticsId(id);
    try {
      const r = await ziAds.getAnalytics(id);
      setAnalytics(r.data);
    } catch {}
  };

  const toggleStatus = async (camp) => {
    try {
      if (camp.status === 'active') {
        await ziAds.pause(camp._id);
      } else if (camp.status === 'draft' || camp.status === 'paused') {
        await ziAds.activate(camp._id);
      }
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const createCampaign = async () => {
    setCreating(true);
    try {
      const payload = {
        advertiserName: form.advertiserName,
        advertiserType: form.advertiserType,
        name: form.name,
        type: form.type,
        budget: {
          totalPaise: form['budget.totalPaise'],
          dailyPaise: form['budget.dailyPaise'],
          model: form['budget.model'],
          bidAmountPaise: form['budget.bidAmountPaise'],
          spentPaise: 0,
        },
        targeting: {
          cities: form.targetCities,
          categories: form.targetCategories,
          deviceTypes: ['android', 'ios'],
          userSegments: ['all'],
        },
        creative: {
          headline: form['creative.headline'],
          cta: form['creative.cta'],
          deeplink: form['creative.deeplink'],
          body: form['creative.body'],
        },
        startDate: form.startDate || new Date().toISOString(),
        endDate: form.endDate,
      };
      await ziAds.create(payload);
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      load();
    } catch (e) {
      alert(e.message);
    }
    setCreating(false);
  };

  const kpis = {
    active: campaigns.filter(c => c.status === 'active').length,
    impressions: campaigns.reduce((s, c) => s + (c.metrics?.impressions || 0), 0),
    clicks: campaigns.reduce((s, c) => s + (c.metrics?.clicks || 0), 0),
    revenue: adRevenue?.totalPaise || 0,
  };

  const funnelData = analytics ? [
    { name: 'Impressions', value: analytics.impressions || 0, fill: '#6366f1' },
    { name: 'Clicks', value: analytics.clicks || 0, fill: '#8b5cf6' },
    { name: 'Conversions', value: analytics.conversions || 0, fill: '#a78bfa' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ads Manager</h1>
          <p className="text-slate-400 text-sm mt-0.5">Internal advertising platform for partners and brands</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors">
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Campaigns', value: kpis.active, color: 'text-emerald-400' },
          { label: 'Impressions Today', value: kpis.impressions.toLocaleString(), color: 'text-white' },
          { label: 'Clicks Today', value: kpis.clicks.toLocaleString(), color: 'text-white' },
          { label: 'Ad Revenue MTD', value: fmt(kpis.revenue), color: 'text-indigo-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs">{label}</p>
            <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Campaign Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="grid grid-cols-6 gap-3 px-4 py-2.5 bg-slate-800/80 text-slate-500 text-xs font-semibold uppercase tracking-wider">
          <span className="col-span-2">Campaign</span>
          <span>Status</span>
          <span>Budget / Spent</span>
          <span>CTR</span>
          <span>Actions</span>
        </div>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="animate-pulse border-b border-slate-800 h-12" />)
          : campaigns.length === 0
          ? <div className="text-slate-500 text-center py-12">No campaigns yet. Create one above.</div>
          : campaigns.map((c) => {
              const spent = c.budget?.spentPaise || 0;
              const total = c.budget?.totalPaise || 1;
              const progress = Math.min(100, (spent / total) * 100);
              const ctr = c.metrics?.impressions ? pct(c.metrics.clicks, c.metrics.impressions) : '0%';
              return (
                <div key={c._id} className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-slate-700/50 text-sm items-center">
                  <div className="col-span-2">
                    <div className="text-white font-medium">{c.name}</div>
                    <div className="text-slate-400 text-xs">{c.advertiserName} · {c.type}</div>
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] || STATUS_BADGE.draft}`}>
                      {c.status?.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{fmt(spent)}</span>
                      <span>{fmt(total)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="text-slate-300 font-medium">{ctr}</div>
                  <div className="flex items-center gap-2">
                    {(c.status === 'active' || c.status === 'draft' || c.status === 'paused') && (
                      <button onClick={() => toggleStatus(c)} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
                        {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    )}
                    <button onClick={() => openAnalytics(c._id)} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
                      <BarChart2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Create Campaign Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-white font-bold">Create Campaign</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { key: 'name', label: 'Campaign Name', placeholder: 'e.g. Summer AC Service Promo' },
                  { key: 'advertiserName', label: 'Advertiser Name', placeholder: 'Partner or Brand name' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-slate-400 text-xs block mb-1.5">{label}</label>
                    <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1.5">Advertiser Type</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form.advertiserType} onChange={e => setForm(f => ({ ...f, advertiserType: e.target.value }))}>
                      <option value="partner">Partner</option>
                      <option value="business">Business</option>
                      <option value="brand">Brand</option>
                      <option value="internal">Internal</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1.5">Ad Type</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="banner">Banner</option>
                      <option value="sponsored_listing">Sponsored Listing</option>
                      <option value="push">Push Notification</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1.5">Total Budget (₹)</label>
                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form['budget.totalPaise'] / 100} onChange={e => setForm(f => ({ ...f, 'budget.totalPaise': e.target.value * 100 }))} />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1.5">Daily Budget (₹)</label>
                    <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form['budget.dailyPaise'] / 100} onChange={e => setForm(f => ({ ...f, 'budget.dailyPaise': e.target.value * 100 }))} />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-xs block mb-1.5">Headline</label>
                  <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. 20% off AC Service this Summer!" value={form['creative.headline']} onChange={e => setForm(f => ({ ...f, 'creative.headline': e.target.value }))} />
                </div>

                <div>
                  <label className="text-slate-400 text-xs block mb-1.5">Target Cities</label>
                  <div className="flex flex-wrap gap-2">
                    {CITIES.map(c => (
                      <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" className="accent-indigo-500"
                          checked={form.targetCities.includes(c)}
                          onChange={e => setForm(f => ({
                            ...f,
                            targetCities: e.target.checked ? [...f.targetCities, c] : f.targetCities.filter(x => x !== c)
                          }))} />
                        <span className="text-slate-300 text-xs capitalize">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1.5">Start Date</label>
                    <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1.5">End Date</label>
                    <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                </div>

                <button onClick={createCampaign} disabled={creating || !form.name || !form.advertiserName}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors">
                  {creating ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analytics Modal */}
      <AnimatePresence>
        {analyticsId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setAnalyticsId(null); setAnalytics(null); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">Campaign Analytics</h3>
                <button onClick={() => { setAnalyticsId(null); setAnalytics(null); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              {!analytics ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-24 bg-slate-800 rounded-xl" />
                  <div className="h-32 bg-slate-800 rounded-xl" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Impressions', value: (analytics.impressions || 0).toLocaleString() },
                      { label: 'Clicks', value: (analytics.clicks || 0).toLocaleString() },
                      { label: 'Conversions', value: (analytics.conversions || 0).toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
                        <div className="text-slate-400 text-xs">{label}</div>
                        <div className="text-white font-bold mt-1">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-xs">CTR</div>
                      <div className="text-indigo-400 font-bold mt-1">{pct(analytics.clicks, analytics.impressions)}</div>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-xs">CVR</div>
                      <div className="text-emerald-400 font-bold mt-1">{pct(analytics.conversions, analytics.clicks)}</div>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-xs">Revenue</div>
                      <div className="text-white font-bold mt-1">{fmt(analytics.revenuePaise)}</div>
                    </div>
                  </div>
                  {funnelData.length > 0 && (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={funnelData} layout="vertical">
                        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#e2e8f0' }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {funnelData.map((d, i) => <Bar key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
