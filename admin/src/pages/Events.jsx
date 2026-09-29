import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle, XCircle, Star, Eye, EyeOff, Zap, Users, Package, Settings2, BarChart2, TrendingUp, ChevronRight, Plus, X, ShieldCheck, ShieldOff, FileText, Phone, MapPin, ZoomIn, AlertTriangle, Building2 } from 'lucide-react';
import { useAdminEventThemesQuery, useAdminUpdateThemeStatusMutation, useAdminEventBookingsQuery, useAdminEventPartnersQuery, useAdminEventAnalyticsQuery, useAdminEventConfigQuery, useAdminUpdateEventConfigMutation, useAdminEventCategoriesQuery, useAdminUpsertEventCategoryMutation, useAdminCreateEventPartnerMutation, useAdminGetEventPartnerQuery, useAdminApproveEventPartnerKycMutation, useAdminRejectEventPartnerKycMutation, useAdminBlockEventPartnerMutation, useAdminCancelEventBookingMutation } from '@shared/services/api';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { API_BASE } from '@shared/services/apiBase';
import { adminApiPath } from '@/config/admin';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'themes',    label: 'Themes',    Icon: Star },
  { id: 'bookings',  label: 'Bookings',  Icon: Package },
  { id: 'partners',  label: 'Partners',  Icon: Users },
  { id: 'analytics', label: 'Analytics', Icon: BarChart2 },
  { id: 'config',    label: 'Config',    Icon: Settings2 },
];

const STATUS_COLORS = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50  text-green-700  border-green-200',
  featured: 'bg-purple-50 text-purple-700 border-purple-200',
  hidden:   'bg-slate-50  text-slate-500  border-slate-200',
  rejected: 'bg-red-50    text-red-700    border-red-200',
};

const BOOKING_STATUS_COLORS = {
  pending_payment: 'bg-yellow-50 text-yellow-700',
  confirmed:       'bg-green-50  text-green-700',
  partner_assigned:'bg-blue-50   text-blue-700',
  in_progress:     'bg-indigo-50 text-indigo-700',
  completed:       'bg-emerald-50 text-emerald-700',
  cancelled:       'bg-red-50    text-red-700',
  disputed:        'bg-orange-50 text-orange-700',
};

function Pill({ children, className }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${className}`}>{children}</span>;
}

/* Themes Tab */
function ThemesTab() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = useAdminEventThemesQuery({ status: statusFilter || undefined, page });
  const [updateStatus] = useAdminUpdateThemeStatusMutation();
  const [editPriceId, setEditPriceId] = useState(null);
  const [editPriceVal, setEditPriceVal] = useState('');

  async function handle(id, patch) {
    try { await updateStatus({ id, ...patch }).unwrap(); toast.success('Updated'); refetch(); }
    catch { toast.error('Failed'); }
  }

  async function savePrice(id) {
    const rs = Math.round(Number(editPriceVal));
    if (!rs || rs <= 0) { toast.error('Enter a valid price'); return; }
    try {
      await updateStatus({ id, startingPricePaise: rs * 100 }).unwrap();
      toast.success(`Price updated to ₹${rs}`);
      setEditPriceId(null);
      refetch();
    } catch { toast.error('Failed to update price'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['', 'pending', 'approved', 'featured', 'hidden', 'rejected'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div> : (
        <div className="space-y-2">
          {(data?.themes || []).map(theme => (
            <div key={theme._id} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 items-start">
              {theme.coverImage && (
                <img src={theme.coverImage} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-900">{theme.title}</span>
                  <Pill className={STATUS_COLORS[theme.status]}>{theme.status}</Pill>
                  {theme.isTrending && <Pill className="bg-orange-50 text-orange-700 border-orange-200">🔥 Trending</Pill>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-500">{theme.categoryId?.name} · {theme.partnerId?.businessName}</p>
                  {editPriceId === theme._id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">₹</span>
                      <input
                        type="number" min="1" autoFocus
                        value={editPriceVal}
                        onChange={e => setEditPriceVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') savePrice(theme._id); if (e.key === 'Escape') setEditPriceId(null); }}
                        className="w-24 border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button onClick={() => savePrice(theme._id)} className="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded font-medium">Save</button>
                      <button onClick={() => setEditPriceId(null)} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded font-medium">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditPriceId(theme._id); setEditPriceVal(String(Math.round((theme.startingPricePaise || 0) / 100))); }}
                      className="text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100"
                    >
                      ₹{Math.round((theme.startingPricePaise || 0) / 100)} ✏️
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{theme.bookingCount} bookings · ⭐ {theme.rating?.toFixed(1) || '–'} ({theme.reviewCount})</p>
                {theme.adminNote && <p className="text-xs text-amber-600 mt-1 italic">Note: {theme.adminNote}</p>}
              </div>
              <div className="flex gap-1.5 flex-wrap shrink-0">
                {theme.status !== 'approved'  && <button onClick={() => handle(theme._id, { status: 'approved'  })} className="px-2 py-1 text-xs bg-green-50  text-green-700  rounded-lg border border-green-200  hover:bg-green-100 font-medium flex items-center gap-1"><CheckCircle size={12} />Approve</button>}
                {theme.status !== 'featured'  && <button onClick={() => handle(theme._id, { status: 'featured'  })} className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded-lg border border-purple-200 hover:bg-purple-100 font-medium flex items-center gap-1"><Zap size={12} />Feature</button>}
                {theme.status !== 'hidden'    && <button onClick={() => handle(theme._id, { status: 'hidden'    })} className="px-2 py-1 text-xs bg-slate-50  text-slate-600  rounded-lg border border-slate-200  hover:bg-slate-100 font-medium flex items-center gap-1"><EyeOff size={12} />Hide</button>}
                {theme.status !== 'rejected'  && <button onClick={() => handle(theme._id, { status: 'rejected'  })} className="px-2 py-1 text-xs bg-red-50    text-red-700    rounded-lg border border-red-200    hover:bg-red-100   font-medium flex items-center gap-1"><XCircle size={12} />Reject</button>}
                <button onClick={() => handle(theme._id, { isTrending: !theme.isTrending })} className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded-lg border border-orange-200 hover:bg-orange-100 font-medium">
                  {theme.isTrending ? '🔥 Untrend' : '🔥 Trend'}
                </button>
              </div>
            </div>
          ))}
          {!data?.themes?.length && <div className="text-center py-12 text-slate-400 text-sm">No themes found</div>}
        </div>
      )}

      {data?.pages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium ${p === page ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Bookings Tab */
function BookingsTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = useAdminEventBookingsQuery({ status: statusFilter || undefined, page });
  const [cancelBooking] = useAdminCancelEventBookingMutation();

  async function handleCancel(id) {
    const reason = window.prompt('Reason for cancellation:');
    if (reason === null) return;
    try { await cancelBooking({ id, reason: reason || 'Cancelled by admin' }).unwrap(); toast.success('Booking cancelled'); refetch(); }
    catch (e) { toast.error(e?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'disputed'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {s.replace(/_/g, ' ') || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="pb-2 font-medium pr-4">Booking</th>
              <th className="pb-2 font-medium pr-4">User</th>
              <th className="pb-2 font-medium pr-4">Partner</th>
              <th className="pb-2 font-medium pr-4">Event Date</th>
              <th className="pb-2 font-medium pr-4">Amount</th>
              <th className="pb-2 font-medium">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.bookings || []).map(b => (
                <tr key={b._id} className="hover:bg-slate-50">
                  <td className="py-3 pr-4"><span className="font-mono text-xs text-slate-500">{String(b._id).slice(-6)}</span><br /><span className="text-xs text-slate-600">{b.themeId?.title}</span></td>
                  <td className="py-3 pr-4 text-xs">{b.userId?.name}<br /><span className="text-slate-400">{b.userId?.phone}</span></td>
                  <td className="py-3 pr-4 text-xs">{b.partnerId?.businessName}</td>
                  <td className="py-3 pr-4 text-xs">{b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-IN') : '—'}<br /><span className="text-slate-400">{b.eventTimeSlot}</span></td>
                  <td className="py-3 pr-4 text-xs font-semibold">₹{Math.round((b.pricing?.totalPaise || 0) / 100)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BOOKING_STATUS_COLORS[b.status] || ''}`}>{b.status?.replace(/_/g, ' ')}</span>
                      {!['completed', 'cancelled'].includes(b.status) && (
                        <button onClick={() => handleCancel(b._id)} className="text-[10px] text-red-500 hover:text-red-700 font-semibold">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.bookings?.length && <div className="text-center py-12 text-slate-400 text-sm">No bookings found</div>}
        </div>
      )}
    </div>
  );
}

/* KYC Doc streamer hook */
function usePartnerKycDoc(partnerId, idx, token, enabled = true) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const objRef = useRef(null);
  useEffect(() => {
    if (!partnerId || idx == null || !token || !enabled) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api${adminApiPath(`/events/partners/${partnerId}/kyc/stream/${idx}`)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => {
        if (cancelled) return;
        if (objRef.current) URL.revokeObjectURL(objRef.current);
        const u = URL.createObjectURL(blob);
        objRef.current = u;
        setUrl(u);
      })
      .catch(() => setUrl(null))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [partnerId, idx, token, enabled]);
  useEffect(() => () => { if (objRef.current) URL.revokeObjectURL(objRef.current); }, []);
  return { url, loading };
}

/* Admin KYC doc row (streams a named S3 doc) */
function AdminKycDocRow({ label, mandatory, s3Key, partnerId, docKey, token, onLightbox }) {
  const [url, setUrl]         = useState(null);
  const [loading, setLoading] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    if (!s3Key || !token) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api${adminApiPath(`/events/partners/${partnerId}/kyc/field/${docKey}`)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => {
        if (cancelled) return;
        if (objRef.current) URL.revokeObjectURL(objRef.current);
        const u = URL.createObjectURL(blob); objRef.current = u; setUrl(u);
      })
      .catch(() => setUrl(null))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [s3Key, partnerId, docKey, token]);
  useEffect(() => () => { if (objRef.current) URL.revokeObjectURL(objRef.current); }, []);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
      <div className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 flex items-center justify-center cursor-pointer
        ${url ? 'border-green-300 bg-green-50' : s3Key ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
        onClick={() => url && onLightbox(url)}>
        {loading ? <Loader2 size={14} className="animate-spin text-slate-300" />
          : url ? <img src={url} alt={label} className="w-full h-full object-cover" />
          : <FileText size={16} className={s3Key ? 'text-amber-400' : 'text-slate-300'} />}
      </div>
      <div className="flex-1">
        <p className="text-xs font-bold text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {s3Key ? (url ? '✅ Uploaded' : '⏳ Loading…') : mandatory ? '❌ Not uploaded' : '— Optional'}
        </p>
      </div>
      {url && <ZoomIn size={14} className="text-slate-400 cursor-pointer hover:text-slate-600" onClick={() => onLightbox(url)} />}
    </div>
  );
}

/* Partner Detail Drawer */
function PartnerDrawer({ partnerId, onClose, onRefresh }) {
  const { accessToken: token } = useSelector(selectAuth);
  const { data, isLoading, refetch } = useAdminGetEventPartnerQuery(partnerId);
  const [approveKyc]  = useAdminApproveEventPartnerKycMutation();
  const [rejectKyc]   = useAdminRejectEventPartnerKycMutation();
  const [blockPartner]= useAdminBlockEventPartnerMutation();
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const partner = data?.partner;
  const docCount = partner?.kyc?.documents?.length || 0;

  // Load up to 5 docs
  const doc0 = usePartnerKycDoc(partnerId, 0, token, docCount > 0);
  const doc1 = usePartnerKycDoc(partnerId, 1, token, docCount > 1);
  const doc2 = usePartnerKycDoc(partnerId, 2, token, docCount > 2);
  const doc3 = usePartnerKycDoc(partnerId, 3, token, docCount > 3);
  const doc4 = usePartnerKycDoc(partnerId, 4, token, docCount > 4);
  const docs = [doc0, doc1, doc2, doc3, doc4].slice(0, docCount);

  async function handleApprove() {
    try { await approveKyc({ id: partnerId }).unwrap(); toast.success('KYC Approved'); refetch(); onRefresh(); }
    catch { toast.error('Failed'); }
  }
  async function handleReject() {
    if (!rejectNote.trim()) return toast.error('Enter rejection reason');
    try { await rejectKyc({ id: partnerId, reason: rejectNote }).unwrap(); toast.success('KYC Rejected'); setShowReject(false); refetch(); onRefresh(); }
    catch { toast.error('Failed'); }
  }
  async function handleBlock(block) {
    try { await blockPartner({ id: partnerId, block }).unwrap(); toast.success(block ? 'Partner blocked' : 'Partner unblocked'); refetch(); onRefresh(); }
    catch { toast.error('Failed'); }
  }

  const KYC_COLOR = { approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700', not_submitted: 'bg-slate-100 text-slate-500' };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Lightbox */}
        {lightbox && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white"><X size={22} onClick={() => setLightbox(null)} /></button>
            <img src={lightbox} alt="KYC Doc" className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" onClick={e => e.stopPropagation()} />
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="font-bold text-slate-900">Partner Details</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"><X size={16} /></button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
        ) : partner ? (
          <div className="p-5 space-y-5">
            {/* Identity card */}
            <div className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-fuchsia-400 rounded-xl flex items-center justify-center text-white font-black text-lg">
                    {partner.businessName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{partner.businessName}</p>
                    <p className="text-xs text-slate-500">{partner.ownerName}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${KYC_COLOR[partner.kyc?.status] || KYC_COLOR.not_submitted}`}>
                  KYC: {partner.kyc?.status?.replace('_', ' ')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                <div className="flex items-center gap-1.5"><Phone size={11} />{partner.phone}</div>
                {partner.email && <div className="flex items-center gap-1.5"><Building2 size={11} />{partner.email}</div>}
                <div className="flex items-center gap-1.5"><MapPin size={11} />{partner.cities?.join(', ') || '—'}</div>
                <div className="flex items-center gap-1.5"><Star size={11} className="text-amber-400" />⭐ {partner.rating?.toFixed(1) || '–'} · {partner.completedEvents} events</div>
                <div>Themes: {partner.themeCount || 0}</div>
                <div>Joined: {new Date(partner.createdAt).toLocaleDateString('en-IN')}</div>
              </div>
              {partner.bio && <p className="text-xs text-slate-500 mt-2 italic">"{partner.bio}"</p>}
              {partner.kyc?.reviewNote && (
                <div className="mt-2 flex items-start gap-1.5 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">{partner.kyc.reviewNote}</p>
                </div>
              )}
            </div>

            {/* KYC Documents — structured */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">KYC Documents</p>
              {/* Structured fields */}
              {[
                { key: 'aadharFront',          label: '🪪 Aadhar Front',           mandatory: true  },
                { key: 'aadharBack',           label: '🪪 Aadhar Back',            mandatory: true  },
                { key: 'panCard',              label: '🗂️ PAN Card',               mandatory: true  },
                { key: 'liveSelfie',           label: '🤳 Live Selfie',            mandatory: true  },
                { key: 'gstCertificate',       label: '📋 GST Certificate',        mandatory: false },
                { key: 'businessRegistration', label: '📄 Business Registration',  mandatory: false },
              ].map(({ key, label, mandatory }) => {
                const s3Key = partner.kyc?.[key];
                return (
                  <AdminKycDocRow key={key} label={label} mandatory={mandatory}
                    s3Key={s3Key} partnerId={partnerId} docKey={key} token={token}
                    onLightbox={setLightbox} />
                );
              })}
              {/* Legacy docs if any */}
              {docCount > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 mb-2">Additional Documents ({docCount})</p>
                  <div className="grid grid-cols-3 gap-3">
                    {docs.map((doc, i) => (
                      <div key={i} className={`aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 ${doc.url ? 'cursor-pointer group' : ''}`}
                        onClick={() => doc.url && setLightbox(doc.url)}>
                        {doc.loading ? <div className="w-full h-full flex items-center justify-center"><Loader2 size={14} className="animate-spin text-slate-300" /></div>
                          : doc.url ? <div className="relative w-full h-full"><img src={doc.url} alt="" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center"><ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition" /></div></div>
                          : <div className="w-full h-full flex items-center justify-center"><FileText size={16} className="text-slate-300" /></div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* PAN / GST numbers */}
              {(partner.kyc?.panNumber || partner.kyc?.gstNumber) && (
                <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1">
                  {partner.kyc?.panNumber  && <p><span className="font-bold text-slate-500">PAN:</span> {partner.kyc.panNumber}</p>}
                  {partner.kyc?.gstNumber  && <p><span className="font-bold text-slate-500">GST:</span> {partner.kyc.gstNumber}</p>}
                </div>
              )}
            </div>

            {/* KYC Actions */}
            {partner.kyc?.status !== 'approved' && (
              <div className="space-y-3">
                <button onClick={handleApprove}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  <ShieldCheck size={16} />Approve KYC
                </button>

                {!showReject ? (
                  <button onClick={() => setShowReject(true)}
                    className="w-full py-3 bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <XCircle size={16} />Reject KYC
                  </button>
                ) : (
                  <div className="border border-red-200 rounded-xl p-3 space-y-2">
                    <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason for rejection (sent to partner)…"
                      rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={handleReject} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700">Confirm Reject</button>
                      <button onClick={() => setShowReject(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Block / Unblock */}
            <div className="border-t border-slate-100 pt-4">
              {partner.isBlocked ? (
                <button onClick={() => handleBlock(false)}
                  className="w-full py-2.5 border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                  <ShieldCheck size={14} />Unblock Partner
                </button>
              ) : (
                <button onClick={() => handleBlock(true)}
                  className="w-full py-2.5 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                  <ShieldOff size={14} />Block Partner
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">Partner not found</div>
        )}
      </motion.div>
    </div>
  );
}

/* Partners Tab */
function PartnersTab() {
  const { data, isLoading, refetch } = useAdminEventPartnersQuery();
  const [createPartner] = useAdminCreateEventPartnerMutation();
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ businessName: '', ownerName: '', phone: '', cities: '' });

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await createPartner({ ...form, cities: form.cities.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }).unwrap();
      toast.success('Partner created'); setShowForm(false); setForm({ businessName: '', ownerName: '', phone: '', cities: '' }); refetch();
    } catch (err) { toast.error(err?.data?.error || 'Failed to create partner'); }
  }

  const KYC_PILL = {
    approved:      'bg-green-50 text-green-700 border-green-200',
    rejected:      'bg-red-50 text-red-700 border-red-200',
    pending:       'bg-yellow-50 text-yellow-700 border-yellow-200',
    not_submitted: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{data?.total || 0} partners</p>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><Plus size={14} />Add Partner</button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form onSubmit={handleCreate} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm text-indigo-900">New Event Partner</h3>
              <button type="button" onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['businessName', 'Business Name'], ['ownerName', 'Owner Name'], ['phone', 'Phone'], ['cities', 'Cities (comma-separated)']].map(([k, label]) => (
                <div key={k}>
                  <label className="text-xs text-slate-600 font-medium block mb-1">{label}</label>
                  <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} required={k !== 'cities'}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 outline-none" />
                </div>
              ))}
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Partner</button>
          </motion.form>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-2">
          {(data?.partners || []).map(p => (
            <div key={p._id} onClick={() => setSelectedId(p._id)}
              className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-fuchsia-400 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {p.businessName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900">{p.businessName}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${KYC_PILL[p.kyc?.status] || KYC_PILL.not_submitted}`}>
                        KYC: {p.kyc?.status?.replace('_', ' ')}
                      </span>
                      {p.isBlocked && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">Blocked</span>}
                      {p.kyc?.status === 'not_submitted' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Pending Review</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{p.ownerName} · {p.phone}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.cities?.join(', ')} · {p.completedEvents} events · ⭐ {p.rating?.toFixed(1) || '–'}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </div>
            </div>
          ))}
          {!data?.partners?.length && (
            <div className="text-center py-12 text-slate-400 text-sm">
              <Users size={28} className="mx-auto mb-2 text-slate-200" />
              No partners yet — partners will appear here after self-registration
            </div>
          )}
        </div>
      )}

      {/* Partner detail drawer */}
      <AnimatePresence>
        {selectedId && (
          <PartnerDrawer partnerId={selectedId} onClose={() => setSelectedId(null)} onRefresh={refetch} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* Analytics Tab */
function AnalyticsTab() {
  const { data, isLoading } = useAdminEventAnalyticsQuery();
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>;
  const s = data || {};

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Bookings',   value: s.totalBookings || 0,                                                            color: 'text-indigo-600' },
          { label: 'Confirmed',        value: s.confirmedBookings || 0,                                                        color: 'text-blue-600'  },
          { label: 'Conversion',       value: `${s.conversionRate || 0}%`,                                                     color: 'text-green-600' },
          { label: 'Revenue',          value: `₹${Math.round((s.totalRevenuePaise || 0) / 100).toLocaleString('en-IN')}`,     color: 'text-emerald-600'},
          { label: 'Live Themes',      value: s.totalThemes || 0,                                                              color: 'text-purple-600'},
          { label: 'Active Partners',  value: s.totalPartners || 0,                                                            color: 'text-violet-600'},
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-xl font-black mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Weekly trend */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Bookings — Last 7 Days</p>
        {s.weeklyTrend?.length ? (
          <div className="flex items-end gap-2 h-20">
            {(() => {
              const max = Math.max(...s.weeklyTrend.map(d => d.count), 1);
              return s.weeklyTrend.map(d => (
                <div key={d._id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-slate-500 font-bold">{d.count}</span>
                  <div className="w-full bg-indigo-500 rounded-sm" style={{ height: `${Math.max(4, (d.count / max) * 56)}px` }} />
                  <span className="text-[8px] text-slate-400">{d._id?.slice(5)}</span>
                </div>
              ));
            })()}
          </div>
        ) : <p className="text-sm text-slate-400">No bookings in the last 7 days</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top themes */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Top Themes</p>
          <div className="space-y-2">
            {(s.topThemes || []).map((t, i) => (
              <div key={t._id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-300 w-4 text-xs font-mono shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate text-xs">{t.title}</p>
                  <p className="text-[10px] text-slate-400">{t.categoryId?.emoji} {t.categoryId?.name}</p>
                </div>
                <span className="text-xs font-bold text-indigo-600 shrink-0">{t.bookingCount}</span>
              </div>
            ))}
            {!s.topThemes?.length && <p className="text-sm text-slate-400">No data yet</p>}
          </div>
        </div>

        {/* Category + City breakdown */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">By Category</p>
            <div className="space-y-1.5">
              {(s.categoryBreakdown || []).map(c => (
                <div key={c._id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{c.emoji} {c._id}</span>
                  <span className="font-bold text-slate-900">{c.count}</span>
                </div>
              ))}
              {!s.categoryBreakdown?.length && <p className="text-xs text-slate-400">No data yet</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Top Cities</p>
            <div className="space-y-1.5">
              {(s.topCities || []).map(c => (
                <div key={c._id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 capitalize">{c._id || 'Unknown'}</span>
                  <span className="font-bold text-slate-900">{c.count}</span>
                </div>
              ))}
              {!s.topCities?.length && <p className="text-xs text-slate-400">No data yet</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Partner performance */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Partner Performance</p>
        {s.partnerPerformance?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Partner</th>
                <th className="pb-2 font-medium text-center">Events</th>
                <th className="pb-2 font-medium text-center">Rating</th>
                <th className="pb-2 font-medium text-right">Earnings</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {s.partnerPerformance.map(p => (
                  <tr key={p._id}>
                    <td className="py-2 font-medium text-slate-800">{p.businessName}</td>
                    <td className="py-2 text-center text-slate-600">{p.completedEvents}</td>
                    <td className="py-2 text-center text-amber-500">⭐ {p.rating?.toFixed(1) || '–'}</td>
                    <td className="py-2 text-right text-green-600 font-semibold">₹{Math.round((p.totalEarningsPaise || 0) / 100).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-400">No partner data yet</p>}
      </div>
    </div>
  );
}

/* Config Tab */
function ConfigTab() {
  const { data: cfg, isLoading } = useAdminEventConfigQuery();
  const [updateConfig] = useAdminUpdateEventConfigMutation();
  const [form, setForm] = useState(null);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>;
  // Auto-correct 0 or missing maxAdvanceBookingDays so it never breaks bookings
  const rawValues = form || cfg || {};
  const values = {
    ...rawValues,
    maxAdvanceBookingDays: rawValues.maxAdvanceBookingDays > 0 ? rawValues.maxAdvanceBookingDays : 365,
    minAdvanceBookingHours: rawValues.minAdvanceBookingHours > 0 ? rawValues.minAdvanceBookingHours : 2,
  };

  async function handleSave(e) {
    e.preventDefault();
    try { await updateConfig(values).unwrap(); toast.success('Config saved'); setForm(null); }
    catch { toast.error('Failed to save'); }
  }

  const field = (key, label, type = 'number') => (
    <div key={key}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={values[key] ?? ''} onChange={e => setForm(p => ({ ...(p || values), [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 outline-none" />
    </div>
  );

  return (
    <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 max-w-lg">
      <h3 className="font-bold text-sm text-slate-900">Event Commerce Configuration</h3>
      <div className="grid grid-cols-2 gap-4">
        {field('advancePaymentPct',     'Advance Payment %')}
        {field('platformCommissionPct', 'Platform Commission %')}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Travel Fee / km (₹)</label>
          <input type="number" min="0" step="1"
            value={Math.round((values.travelFeePerKmPaise || 0) / 100)}
            onChange={e => setForm(p => ({ ...(p || values), travelFeePerKmPaise: Math.round(Number(e.target.value) * 100) }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Min Advance Booking (hrs)</label>
          <input type="number" min="1" max="72" value={values.minAdvanceBookingHours ?? ''} onChange={e => setForm(p => ({ ...(p || values), minAdvanceBookingHours: Number(e.target.value) }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Max Advance Booking (days)</label>
          <input type="number" min="1" max="730" value={values.maxAdvanceBookingDays ?? ''} onChange={e => setForm(p => ({ ...(p || values), maxAdvanceBookingDays: Number(e.target.value) }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 outline-none" />
          {(values.maxAdvanceBookingDays === 0 || values.maxAdvanceBookingDays < 1) && (
            <p className="text-xs text-red-500 mt-1">Must be ≥ 1 — setting 0 blocks all bookings</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">Cancellation Policy</p>
        <div className="space-y-1.5">
          {(values.cancellationPolicy || []).map((tier, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-slate-500 w-20 text-xs">≥ {tier.daysBeforeEvent}d out</span>
              <input type="number" value={tier.refundPct} min={0} max={100}
                onChange={e => {
                  const updated = [...values.cancellationPolicy];
                  updated[i] = { ...updated[i], refundPct: Number(e.target.value) };
                  setForm(p => ({ ...(p || values), cancellationPolicy: updated }));
                }}
                className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:border-indigo-400 outline-none" />
              <span className="text-slate-500 text-xs">% refund</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        {['bookingEnabled', 'sameDayBookingEnabled', 'videoEnabled'].map(key => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!values[key]} onChange={e => setForm(p => ({ ...(p || values), [key]: e.target.checked }))}
              className="w-4 h-4 rounded" />
            <span className="text-slate-700 text-xs">{key.replace(/([A-Z])/g, ' $1')}</span>
          </label>
        ))}
      </div>

      <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Save Configuration</button>
    </form>
  );
}

/* Main */
export default function Events() {
  const [activeTab, setActiveTab] = useState('themes');

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Event Commerce</h2>
        <p className="text-sm text-slate-500 mt-0.5">Manage themes, partners, bookings and configuration</p>
      </div>

      <div className="flex gap-2 border-b border-slate-100 pb-0.5">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all ${activeTab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          {activeTab === 'themes'    && <ThemesTab />}
          {activeTab === 'bookings'  && <BookingsTab />}
          {activeTab === 'partners'  && <PartnersTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'config'    && <ConfigTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
