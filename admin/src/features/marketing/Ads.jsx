import { useState } from 'react';
import {
  useAdminListAdsQuery, useAdminCreateAdMutation,
  useAdminUpdateAdMutation, useAdminDeleteAdMutation,
  useAdminApproveAdMutation, useAdminRejectAdMutation,
  useAdminAdWalletsQuery,
} from '@shared/services/api';
import {
  SectionHeader, Card, FormRow, Input, Select, SaveBtn, PageLoader, EmptyState,
  StatCard, Pagination,
} from '../../ui/kit';
import { Megaphone, Plus, Pencil, Trash2, Eye, MousePointerClick, DollarSign, Pause, Play, CheckCircle, XCircle, Wallet, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const TYPE_OPTIONS = [
  { value: 'banner',            label: 'Banner'            },
  { value: 'popup',             label: 'Popup'             },
  { value: 'offer_card',        label: 'Offer Card'        },
  { value: 'sponsored_service', label: 'Sponsored Service' },
  { value: 'home_card',         label: 'Home Card'         },
  { value: 'notification',      label: 'Notification'      },
];

const AUDIENCE_OPTIONS = [
  { value: 'users',   label: 'Users only'  },
  { value: 'workers', label: 'Workers only'},
  { value: 'both',    label: 'Everyone'    },
];

const BILLING_OPTIONS = [
  { value: 'fixed', label: 'Fixed Campaign' },
  { value: 'cpm',   label: 'CPM (per 1000 views)' },
  { value: 'cpc',   label: 'CPC (per click)' },
];

const STATUS_OPTIONS = [
  { value: 'draft',            label: 'Draft'            },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'active',           label: 'Active'           },
  { value: 'paused',           label: 'Paused'           },
  { value: 'completed',        label: 'Completed'        },
  { value: 'rejected',         label: 'Rejected'         },
  { value: 'exhausted',        label: 'Exhausted'        },
];

const BEHAVIOR_OPTIONS = [
  { value: 'all',           label: 'All users'           },
  { value: 'new_users',     label: 'New users only'      },
  { value: 'inactive_7d',   label: 'Inactive 7+ days'    },
  { value: 'high_spenders', label: 'High spenders'       },
];

const SERVICES = ['electrical','plumbing','ac_repair','carpenter','helper','puncture','cleaning','painting'];

const EMPTY_FORM = {
  title: '', type: 'banner', audience: 'users', status: 'draft',
  content: { headline: '', body: '', imageUrl: '', ctaText: 'Learn More', ctaLink: '', badgeText: '', backgroundColor: '#2563EB', textColor: '#FFFFFF' },
  targeting: { serviceCategories: [], userBehavior: 'all' },
  schedule: { startAt: '', endAt: '', impressionsLimit: 0 },
  billing: { model: 'fixed', rate: 0, budget: 0 },
};

function today() { return new Date().toISOString().slice(0,10); }
function nextMonth() { const d = new Date(); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10); }

export default function Ads() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [activeView, setActiveView] = useState('campaigns'); // 'campaigns' | 'wallets'
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM, schedule: { startAt: today(), endAt: nextMonth(), impressionsLimit: 0 } });

  const { data, isLoading, isFetching, refetch } = useAdminListAdsQuery({ status: statusFilter || undefined, page });
  const { data: walletsData } = useAdminAdWalletsQuery({}, { skip: activeView !== 'wallets' });
  const [createAd, { isLoading: creating }] = useAdminCreateAdMutation();
  const [updateAd, { isLoading: updating }] = useAdminUpdateAdMutation();
  const [deleteAd] = useAdminDeleteAdMutation();
  const [approveAd] = useAdminApproveAdMutation();
  const [rejectAd]  = useAdminRejectAdMutation();

  const pendingCount = (data?.ads || []).filter(a => a.status === 'pending_approval').length;

  const ads = data?.ads || [];
  const totalPages = data?.totalPages || 1;

  // Aggregate stats
  const totalImpressions = ads.reduce((s, a) => s + (a.stats?.impressions || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (a.stats?.clicks || 0), 0);
  const totalSpend = ads.reduce((s, a) => s + (a.stats?.spend || 0), 0);
  const activeCount = ads.filter(a => a.status === 'active').length;

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, schedule: { startAt: today(), endAt: nextMonth(), impressionsLimit: 0 } });
    setShowForm(true);
  }

  function openEdit(ad) {
    setEditId(ad._id);
    setForm({
      title:    ad.title,
      type:     ad.type,
      audience: ad.audience,
      status:   ad.status,
      content:  { ...EMPTY_FORM.content, ...ad.content },
      targeting: { serviceCategories: ad.targeting?.serviceCategories || [], userBehavior: ad.targeting?.userBehavior || 'all' },
      schedule: {
        startAt:          ad.schedule?.startAt ? ad.schedule.startAt.slice(0, 10) : today(),
        endAt:            ad.schedule?.endAt   ? ad.schedule.endAt.slice(0, 10)   : nextMonth(),
        impressionsLimit: ad.schedule?.impressionsLimit || 0,
      },
      billing: { model: ad.billing?.model || 'fixed', rate: (ad.billing?.rate || 0) / 100, budget: (ad.billing?.budget || 0) / 100 },
    });
    setShowForm(true);
  }

  function setContent(k, v) { setForm(p => ({ ...p, content: { ...p.content, [k]: v } })); }
  function setBilling(k, v) { setForm(p => ({ ...p, billing: { ...p.billing, [k]: v } })); }
  function setSchedule(k, v) { setForm(p => ({ ...p, schedule: { ...p.schedule, [k]: v } })); }

  function toggleService(s) {
    setForm(p => {
      const cats = p.targeting.serviceCategories;
      const next = cats.includes(s) ? cats.filter(c => c !== s) : [...cats, s];
      return { ...p, targeting: { ...p.targeting, serviceCategories: next } };
    });
  }

  async function handleSave() {
    if (!form.title || !form.content.headline) { toast.error('Title and headline are required'); return; }
    const payload = {
      ...form,
      schedule: {
        startAt:          new Date(form.schedule.startAt),
        endAt:            new Date(form.schedule.endAt),
        impressionsLimit: Number(form.schedule.impressionsLimit) || 0,
      },
      billing: {
        model:  form.billing.model,
        rate:   Math.round((Number(form.billing.rate) || 0) * 100),
        budget: Math.round((Number(form.billing.budget) || 0) * 100),
      },
    };
    try {
      if (editId) {
        await updateAd({ id: editId, ...payload }).unwrap();
        toast.success('Campaign updated');
      } else {
        await createAd(payload).unwrap();
        toast.success('Campaign created');
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this campaign?')) return;
    try { await deleteAd(id).unwrap(); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
  }

  async function toggleStatus(ad) {
    const next = ad.status === 'active' ? 'paused' : 'active';
    try { await updateAd({ id: ad._id, status: next }).unwrap(); toast.success(next === 'active' ? 'Activated' : 'Paused'); }
    catch { toast.error('Update failed'); }
  }

  async function handleApprove(id) {
    try { await approveAd(id).unwrap(); toast.success('Campaign approved & live'); refetch(); }
    catch { toast.error('Approval failed'); }
  }

  async function handleReject() {
    if (!rejectNote.trim()) return toast.error('Enter rejection reason');
    try { await rejectAd({ id: rejectId, note: rejectNote }).unwrap(); toast.success('Campaign rejected'); setRejectId(null); setRejectNote(''); refetch(); }
    catch { toast.error('Failed'); }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <SectionHeader title="Ad Campaigns" subtitle="Create, approve and manage promotional campaigns.">
        <div className="flex gap-2">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[['campaigns','Campaigns'],['wallets','Wallets']].map(([v,l]) => (
              <button key={v} onClick={() => setActiveView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <Plus size={15} /> New Campaign
          </button>
        </div>
      </SectionHeader>

      {/* Pending approval alert */}
      {pendingCount > 0 && activeView === 'campaigns' && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-600" />
            <p className="text-sm font-bold text-amber-800">{pendingCount} campaign{pendingCount !== 1 ? 's' : ''} awaiting approval</p>
          </div>
          <button onClick={() => setStatusFilter('pending_approval')} className="text-xs text-amber-700 font-bold hover:underline">Review →</button>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <p className="font-bold text-slate-900">Reject Campaign</p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="Rejection reason (sent to advertiser)…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex gap-2">
              <button onClick={handleReject} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700">Confirm Reject</button>
              <button onClick={() => { setRejectId(null); setRejectNote(''); }} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Wallets view */}
      {activeView === 'wallets' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr className="text-left">
                  {['Advertiser', 'Balance', 'Total Added', 'Total Spent', 'Transactions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(walletsData?.wallets || []).map(w => (
                  <tr key={w._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 text-sm">{w.advertiserName || String(w.advertiserId).slice(-6)}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{w.advertiserKind}</p>
                    </td>
                    <td className="px-4 py-3 font-black text-emerald-600">₹{Math.round((w.creditsPaise||0)/100).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-slate-600">₹{Math.round((w.lifetimeTopUpPaise||0)/100).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-red-500">₹{Math.round((w.lifetimeSpentPaise||0)/100).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-slate-400">{(w.ledger||[]).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(walletsData?.wallets?.length) && <div className="text-center py-8 text-slate-400 text-sm">No advertiser wallets yet</div>}
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Campaigns" value={activeCount} Icon={Megaphone} color="text-blue-600" bg="bg-blue-50" />
        <StatCard label="Total Impressions" value={totalImpressions.toLocaleString('en-IN')} Icon={Eye} color="text-green-600" bg="bg-green-50" />
        <StatCard label="Total Clicks" value={totalClicks.toLocaleString('en-IN')} Icon={MousePointerClick} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Total Spend" value={`₹${Math.round(totalSpend / 100).toLocaleString('en-IN')}`} Icon={DollarSign} color="text-purple-600" bg="bg-purple-50" />
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'active', 'paused', 'draft', 'completed'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {ads.length === 0 ? (
        <EmptyState message="No campaigns found" icon={Megaphone} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr className="text-left">
                  {['Campaign', 'Type', 'Audience', 'Schedule', 'Billing', 'Impressions', 'Clicks', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ads.map(ad => {
                  const ctr = ad.stats?.impressions ? ((ad.stats.clicks / ad.stats.impressions) * 100).toFixed(2) : '0.00';
                  return (
                    <tr key={ad._id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 text-sm">{ad.title}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[160px]">{ad.content?.headline}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 capitalize">{ad.type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 capitalize">{ad.audience}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <div>{new Date(ad.schedule?.startAt).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</div>
                        <div>→ {new Date(ad.schedule?.endAt).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">
                        <div className="font-semibold text-slate-700">{ad.billing?.model?.toUpperCase()}</div>
                        <div>₹{Math.round((ad.billing?.rate || 0) / 100)}/{ad.billing?.model === 'cpm' ? '1K' : 'click'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-700">{(ad.stats?.impressions || 0).toLocaleString('en-IN')}</p>
                        {ad.schedule?.impressionsLimit > 0 && (
                          <p className="text-slate-400">/ {ad.schedule.impressionsLimit.toLocaleString('en-IN')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-700">{(ad.stats?.clicks || 0).toLocaleString('en-IN')}</p>
                        <p className="text-slate-400">CTR {ctr}%</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ad.status === 'active'    ? 'bg-green-100 text-green-700' :
                          ad.status === 'paused'    ? 'bg-amber-100 text-amber-700' :
                          ad.status === 'draft'     ? 'bg-slate-100 text-slate-600' :
                          'bg-red-100 text-red-600'
                        }`}>{ad.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ad.status === 'pending_approval' && (
                            <>
                              <button onClick={() => handleApprove(ad._id)} title="Approve" className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600">
                                <CheckCircle size={13} />
                              </button>
                              <button onClick={() => { setRejectId(ad._id); setRejectNote(''); }} title="Reject" className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                                <XCircle size={13} />
                              </button>
                            </>
                          )}
                          {['active','paused'].includes(ad.status) && (
                            <button onClick={() => toggleStatus(ad)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title={ad.status === 'active' ? 'Pause' : 'Activate'}>
                              {ad.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                            </button>
                          )}
                          <button onClick={() => openEdit(ad)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(ad._id)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <div className="p-4 border-t border-slate-100"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
        </Card>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4 pb-8 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{editId ? 'Edit Campaign' : 'Create Campaign'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl font-light">✕</button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Basics */}
              <div className="grid sm:grid-cols-3 gap-4">
                <FormRow label="Internal Title" className="col-span-2">
                  <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Summer Sale Campaign" />
                </FormRow>
                <FormRow label="Status">
                  <Select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </FormRow>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormRow label="Ad Type">
                  <Select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </FormRow>
                <FormRow label="Audience">
                  <Select value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}>
                    {AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </FormRow>
              </div>

              {/* Content */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Ad Content</p>
                <div className="space-y-3">
                  <FormRow label="Headline *">
                    <Input value={form.content.headline} onChange={e => setContent('headline', e.target.value)} placeholder="Get 20% off AC Repair today!" />
                  </FormRow>
                  <FormRow label="Body text">
                    <Input value={form.content.body} onChange={e => setContent('body', e.target.value)} placeholder="Limited time offer for all customers" />
                  </FormRow>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <FormRow label="CTA Text">
                      <Input value={form.content.ctaText} onChange={e => setContent('ctaText', e.target.value)} placeholder="Book Now" />
                    </FormRow>
                    <FormRow label="CTA Link / Deep link">
                      <Input value={form.content.ctaLink} onChange={e => setContent('ctaLink', e.target.value)} placeholder="/book/ac_repair" />
                    </FormRow>
                    <FormRow label="Badge Text">
                      <Input value={form.content.badgeText} onChange={e => setContent('badgeText', e.target.value)} placeholder="HOT DEAL" />
                    </FormRow>
                    <FormRow label="Image URL">
                      <Input value={form.content.imageUrl} onChange={e => setContent('imageUrl', e.target.value)} placeholder="https://..." />
                    </FormRow>
                    <FormRow label="Background Color">
                      <div className="flex items-center gap-2">
                        <input type="color" value={form.content.backgroundColor} onChange={e => setContent('backgroundColor', e.target.value)} className="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5" />
                        <Input value={form.content.backgroundColor} onChange={e => setContent('backgroundColor', e.target.value)} className="flex-1" />
                      </div>
                    </FormRow>
                    <FormRow label="Text Color">
                      <div className="flex items-center gap-2">
                        <input type="color" value={form.content.textColor} onChange={e => setContent('textColor', e.target.value)} className="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5" />
                        <Input value={form.content.textColor} onChange={e => setContent('textColor', e.target.value)} className="flex-1" />
                      </div>
                    </FormRow>
                  </div>
                </div>
              </div>

              {/* Targeting */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Targeting</p>
                <FormRow label="User Behavior">
                  <Select value={form.targeting.userBehavior} onChange={e => setForm(p => ({ ...p, targeting: { ...p.targeting, userBehavior: e.target.value } }))}>
                    {BEHAVIOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </FormRow>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Service Categories (empty = all)</p>
                  <div className="flex flex-wrap gap-2">
                    {SERVICES.map(s => (
                      <button key={s} type="button"
                        onClick={() => toggleService(s)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition ${form.targeting.serviceCategories.includes(s) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Schedule</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <FormRow label="Start Date">
                    <Input type="date" value={form.schedule.startAt} onChange={e => setSchedule('startAt', e.target.value)} />
                  </FormRow>
                  <FormRow label="End Date">
                    <Input type="date" value={form.schedule.endAt} onChange={e => setSchedule('endAt', e.target.value)} />
                  </FormRow>
                  <FormRow label="Impressions Limit" hint="0 = unlimited">
                    <Input type="number" value={form.schedule.impressionsLimit} onChange={e => setSchedule('impressionsLimit', Number(e.target.value))} min="0" step="1000" />
                  </FormRow>
                </div>
              </div>

              {/* Billing */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Billing</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <FormRow label="Billing Model">
                    <Select value={form.billing.model} onChange={e => setBilling('model', e.target.value)}>
                      {BILLING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </FormRow>
                  <FormRow label={form.billing.model === 'cpm' ? 'Rate (₹ per 1K views)' : form.billing.model === 'cpc' ? 'Rate (₹ per click)' : 'Fixed Price (₹)'} hint="0 = free">
                    <Input type="number" value={form.billing.rate} onChange={e => setBilling('rate', e.target.value)} min="0" step="1" />
                  </FormRow>
                  <FormRow label="Total Budget (₹)" hint="0 = unlimited">
                    <Input type="number" value={form.billing.budget} onChange={e => setBilling('budget', e.target.value)} min="0" step="100" />
                  </FormRow>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
              <SaveBtn loading={creating || updating} onClick={handleSave} label={editId ? 'Update Campaign' : 'Create Campaign'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
