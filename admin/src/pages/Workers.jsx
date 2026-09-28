import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { adminApiPath } from '@/config/admin';
import { API_BASE } from '@shared/services/apiBase';
import {
  useAdminWorkersQuery, useAdminBlockWorkerMutation,
  useAdminWorkerPenaltiesQuery, useAdminKycDocUrlsQuery,
  useAdminDeleteWorkerMutation,
  useAdminWorkerEarningsQuery, useAdminWorkerTimelineQuery,
  useAdminWorkerDeductionsQuery, useAdminWorkerIncentivesQuery,
} from '@shared/services/api';

/* Permanent doc hook — server-proxied, no URL expiry */
function useKycDoc(workerId, docType, token, enabled = true) {
  const [url, setUrl]       = useState(null);
  const [loading, setLoading] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    if (!workerId || !docType || !token || !enabled) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api${adminApiPath(`/workers/${workerId}/kyc/stream/${docType}`)}`, {
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
  }, [workerId, docType, token, enabled]);

  useEffect(() => () => { if (objRef.current) URL.revokeObjectURL(objRef.current); }, []);
  return { url, loading };
}
import {
  Search, ShieldOff, ShieldCheck, Briefcase, X, Eye,
  FileText, Camera, Trash2, AlertTriangle, MapPin,
  Phone, Star, Loader2, ChevronRight, User,
  CheckCircle2, XCircle, Clock, Wallet,
} from 'lucide-react';
import {
  SectionHeader, Pagination, StatusBadge, Card, Th, Td,
  EmptyState, PageLoader, fmtDate, fmt,
} from './_shared';
import toast from 'react-hot-toast';

/* Reverse geocoding (OpenStreetMap Nominatim — free, no key) */
const geoCache = {};
async function reverseGeocode(lat, lng) {
  const key = `${lat?.toFixed(4)},${lng?.toFixed(4)}`;
  if (geoCache[key]) return geoCache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ZappyAdmin/1.0' } }
    );
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [
      a.suburb ?? a.neighbourhood ?? a.road,
      a.city ?? a.town ?? a.village ?? a.county,
      a.state,
    ].filter(Boolean);
    const label = parts.length ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(',') ?? key;
    geoCache[key] = label;
    return label;
  } catch { return key; }
}

function useAddress(lat, lng) {
  const [addr, setAddr] = useState(null);
  useEffect(() => {
    if (lat == null || lng == null) return;
    reverseGeocode(lat, lng).then(setAddr);
  }, [lat, lng]);
  return addr;
}

/* KYC doc image viewer */
function KycDocViewer({ workerId, onClose }) {
  const { accessToken: token } = useSelector(selectAuth);
  const { data, isLoading: metaLoading } = useAdminKycDocUrlsQuery(workerId);
  const [lightbox, setLightbox] = useState(null);

  const { url: aadhaarUrl, loading: loadingA } = useKycDoc(workerId, 'aadhaar', token, !metaLoading && !!data?.docs?.hasAadhaar);
  const { url: licenseUrl, loading: loadingL  } = useKycDoc(workerId, 'license', token, !metaLoading && !!data?.docs?.hasLicense);
  const { url: selfieUrl,  loading: loadingS  } = useKycDoc(workerId, 'selfie',  token, !metaLoading && !!data?.docs?.hasSelfie);

  const isLoading = metaLoading || loadingA || loadingL || loadingS;
  const docs = { aadhaarUrl, licenseUrl, selfieUrl };
  const meta = data?.selfieMetadata;

  const selfieAddr = useAddress(meta?.lat, meta?.lng);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-bold text-slate-900">KYC Documents</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><X size={16} /></button>
        </div>

        {lightbox && (
          <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}><X size={22} /></button>
            <img src={lightbox.url} alt={lightbox.label} className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" onClick={e => e.stopPropagation()} />
          </div>
        )}

        <div className="p-6 space-y-5">
          {isLoading ? <PageLoader /> : (
            <>
              {/* update badge */}
              {data?.isUpdate && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-xs font-bold text-amber-700">This is a KYC update — previous approved docs are stored in history</span>
                </div>
              )}

              {/* 3 document images */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { urlKey: 'aadhaarUrl', label: 'Aadhaar Card',    Icon: FileText, loading: loadingA },
                  { urlKey: 'licenseUrl', label: 'Driving License', Icon: FileText, loading: loadingL },
                  { urlKey: 'selfieUrl',  label: 'Live Selfie',     Icon: Camera,   loading: loadingS },
                ].map(({ urlKey, label, Icon, loading: docLoading }) => (
                  <div key={urlKey} className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                    <div
                      className={`aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 ${docs[urlKey] ? 'cursor-pointer group' : ''}`}
                      onClick={() => docs[urlKey] && setLightbox({ url: docs[urlKey], label })}
                    >
                      {docLoading ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 size={18} className="animate-spin text-slate-300" />
                        </div>
                      ) : docs[urlKey] ? (
                        <div className="relative w-full h-full">
                          <img src={docs[urlKey]} alt={label} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition flex items-center justify-center">
                            <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                          <Icon size={20} className="text-slate-300" />
                          <span className="text-[10px] text-slate-400">Not submitted</span>
                        </div>
                      )}
                    </div>
                    {docs[urlKey] && (
                      <button onClick={() => setLightbox({ url: docs[urlKey], label })}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold w-full text-center">
                        View full size
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Selfie liveness metadata */}
              {meta && (
                <div className={`rounded-xl border p-4 space-y-3 ${meta.captureMethod === 'live_camera' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {meta.captureMethod === 'live_camera'
                      ? <CheckCircle2 size={14} className="text-green-600" />
                      : <XCircle size={14} className="text-red-500" />
                    }
                    <span className={`text-sm font-bold ${meta.captureMethod === 'live_camera' ? 'text-green-700' : 'text-red-600'}`}>
                      {meta.captureMethod === 'live_camera' ? 'Live camera capture verified' : '⚠ Static upload — not from live camera'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {meta.capturedAt && (
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-slate-400" />
                        <span className="text-slate-600">{new Date(meta.capturedAt).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {meta.lat != null && (
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="text-green-500 mt-0.5 shrink-0" />
                        <span className="text-slate-600 leading-tight">
                          {selfieAddr ?? `${meta.lat.toFixed(4)}, ${meta.lng.toFixed(4)}`}
                          {selfieAddr && <span className="block text-[10px] text-slate-400">{meta.lat.toFixed(4)}, {meta.lng.toFixed(4)}</span>}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!meta && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={14} className="text-red-500" />
                  <span className="text-xs font-bold text-red-600">No liveness metadata — selfie may be a static photo upload</span>
                </div>
              )}

              <p className="text-[11px] text-slate-400 text-center">📦 Documents stored permanently in secure storage — no expiry</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Earnings tab */
const REASON_LABEL = {
  cancellation_fee: 'Cancellation Fee',
  platform_commission: 'Commission',
  admin_adjustment_debit: 'Adjustment',
  referral_reward: 'Referral',
  admin_adjustment_credit: 'Bonus',
  shield_payout: 'Shield Fund',
};

function EarningsSummaryCard({ label, value, color = 'text-slate-900' }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className={`text-base font-extrabold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function WorkerEarningsTab({ workerId }) {
  const [period, setPeriod] = useState('monthly');
  const { data: earn, isLoading: earnLoading } = useAdminWorkerEarningsQuery({ id: workerId, period });
  const { data: timeline } = useAdminWorkerTimelineQuery(workerId);
  const { data: deductions } = useAdminWorkerDeductionsQuery(workerId);
  const { data: incentives } = useAdminWorkerIncentivesQuery(workerId);

  if (earnLoading) return <PageLoader />;

  const e = earn || {};
  const days = timeline?.timeline || [];
  const maxEarn = Math.max(...days.map((d) => d.earningsPaise), 1);

  const cash = e.cashOrdersPaise || 0;
  const digital = e.digitalOrdersPaise || 0;
  const splitTotal = cash + digital || 1;

  return (
    <div className="space-y-4">
      {/* period selector */}
      <div className="flex gap-1.5">
        {[['weekly', '7 days'], ['monthly', '30 days'], ['quarterly', '90 days']].map(([id, label]) => (
          <button key={id}
            onClick={() => setPeriod(id === 'quarterly' ? 'monthly' : id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              (period === id || (id === 'monthly' && period === 'monthly'))
                ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <EarningsSummaryCard label="Gross"      value={fmt(e.grossEarningsPaise || 0)} />
        <EarningsSummaryCard label="Net"        value={fmt(e.netEarningsPaise || 0)} color="text-indigo-700" />
        <EarningsSummaryCard label="Jobs"       value={e.totalJobsCompleted || 0} />
        <EarningsSummaryCard label="Tips"       value={fmt(e.tipsPaise || 0)} color="text-emerald-600" />
        <EarningsSummaryCard label="Penalties"  value={fmt(e.totalDeductionsPaise || 0)} color="text-red-600" />
        <EarningsSummaryCard label="Incentives" value={fmt(e.totalIncentivesPaise || 0)} color="text-green-600" />
      </div>

      {/* daily chart */}
      {days.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Last 30 Days</p>
          <div className="flex items-end gap-0.5 h-24 bg-slate-50 rounded-xl p-2">
            {days.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col justify-end group relative h-full">
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 -translate-y-full">
                  {d.date.slice(5)}: {fmt(d.earningsPaise)} · {d.ordersCompleted} jobs
                </div>
                <div className="w-full rounded-sm bg-indigo-500" style={{ height: `${Math.max((d.earningsPaise / maxEarn) * 100, 2)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* cash vs digital split */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Cash vs Digital</p>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-500">Cash</span><span className="font-semibold">{fmt(cash)}</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(cash / splitTotal) * 100}%` }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-500">Digital</span><span className="font-semibold">{fmt(digital)}</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${(digital / splitTotal) * 100}%` }} /></div>
          </div>
        </div>
      </div>

      {/* deductions */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Deductions</p>
        {!deductions?.items?.length ? <p className="text-xs text-slate-400">No deductions</p> : (
          <div className="space-y-1.5">
            {deductions.items.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-red-50/50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-700">{REASON_LABEL[d.reason] || d.reason}</p>
                  <p className="text-[10px] text-slate-400">{fmtDate(d.date)}{d.orderId ? ` · #${String(d.orderId).slice(-6)}` : ''}</p>
                </div>
                <span className="font-bold text-red-600">-{fmt(d.amountPaise)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* incentives */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Incentives</p>
        {!incentives?.items?.length ? <p className="text-xs text-slate-400">No incentives</p> : (
          <div className="space-y-1.5">
            {incentives.items.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-green-50/50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-700">{REASON_LABEL[d.reason] || d.reason}</p>
                  <p className="text-[10px] text-slate-400">{fmtDate(d.date)}</p>
                </div>
                <span className="font-bold text-green-600">+{fmt(d.amountPaise)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Worker detail side panel */
function WorkerDetailPanel({ worker, onClose, onRefetch }) {
  const [tab, setTab]           = useState('details');
  const [showDocs, setShowDocs] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const { data: penaltyData, isLoading: penLoading } = useAdminWorkerPenaltiesQuery(worker._id);
  const [blockWorker, { isLoading: blocking }]  = useAdminBlockWorkerMutation();
  const [deleteWorker, { isLoading: deleting }] = useAdminDeleteWorkerMutation();

  async function toggleBlock() {
    try {
      await blockWorker({ id: worker._id, blocked: !worker.isBlocked }).unwrap();
      toast.success(worker.isBlocked ? 'Worker unblocked' : 'Worker blocked');
      onRefetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function handleDelete() {
    if (!deleteReason.trim() || deleteReason.length < 5) {
      toast.error('Provide a reason (min 5 chars)');
      return;
    }
    if (!window.confirm(`Permanently remove ${worker.name}? Their data is kept for compliance but they cannot log in.`)) return;
    try {
      await deleteWorker({ id: worker._id, reason: deleteReason }).unwrap();
      toast.success(`${worker.name} removed from platform`);
      onClose();
      onRefetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  const kycColor = {
    approved:       'text-green-700 bg-green-100',
    pending_review: 'text-amber-700 bg-amber-100',
    rejected:       'text-red-700 bg-red-100',
    suspended:      'text-red-800 bg-red-200',
    not_submitted:  'text-slate-600 bg-slate-100',
  }[worker.kyc?.status ?? 'not_submitted'] ?? 'text-slate-600 bg-slate-100';

  return (
    <>
      {showDocs && <KycDocViewer workerId={worker._id} onClose={() => setShowDocs(false)} />}

      <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

          {/* header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-lg">
                {worker.name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="font-bold text-slate-900">{worker.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Phone size={10} className="text-slate-400" />
                  <span className="text-xs text-slate-500">{worker.phone}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition mt-0.5"><X size={16} /></button>
          </div>

          {/* tab bar */}
          <div className="flex border-b border-slate-100 shrink-0">
            {['details', 'earnings', 'penalties', 'actions'].map(t => (
              <button key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold capitalize transition ${tab === t ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="overflow-y-auto flex-1 p-5">

            {tab === 'details' && (
              <div className="space-y-4">
                {/* stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-extrabold text-slate-900">{worker.rating?.toFixed(1) ?? '—'}</p>
                    <p className="text-[11px] text-slate-400">Rating ★</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-extrabold text-slate-900">{worker.completedJobs ?? 0}</p>
                    <p className="text-[11px] text-slate-400">Jobs done</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-sm font-extrabold text-slate-900">{fmt(worker.wallet?.balance ?? 0)}</p>
                    <p className="text-[11px] text-slate-400">Wallet</p>
                  </div>
                </div>

                {/* KYC */}
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1">KYC Status</p>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${kycColor}`}>
                      {(worker.kyc?.status ?? 'not_submitted').replace(/_/g, ' ')}
                    </span>
                  </div>
                  {worker.kyc?.selfieUrl && (
                    <button
                      onClick={() => setShowDocs(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-2 rounded-xl transition"
                    >
                      <Eye size={13} /> View Docs
                    </button>
                  )}
                </div>

                {/* Rejection reason */}
                {worker.kyc?.rejectionReason && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="text-[11px] font-bold text-red-500 uppercase tracking-wide mb-1">Last rejection reason</p>
                    <p className="text-xs text-red-700">{worker.kyc.rejectionReason}</p>
                  </div>
                )}

                {/* Skills */}
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {worker.skills?.map(s => (
                      <span key={s} className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-lg">
                        {s.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div className="bg-slate-50 rounded-xl px-3 py-2">
                    <p className="font-bold text-slate-400 text-[10px] mb-0.5">Joined</p>
                    <p className="font-semibold text-slate-700">{fmtDate(worker.createdAt)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2">
                    <p className="font-bold text-slate-400 text-[10px] mb-0.5">Last seen</p>
                    <p className="font-semibold text-slate-700">{worker.lastSeenAt ? fmtDate(worker.lastSeenAt) : '—'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2">
                    <p className="font-bold text-slate-400 text-[10px] mb-0.5">Total earnings</p>
                    <p className="font-semibold text-slate-700">{fmt(worker.wallet?.totalEarnings ?? 0)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2">
                    <p className="font-bold text-slate-400 text-[10px] mb-0.5">KYC submissions</p>
                    <p className="font-semibold text-slate-700">{worker.kyc?.submissionHistory?.length ?? 0}x</p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'earnings' && <WorkerEarningsTab workerId={worker._id} />}

            {tab === 'penalties' && (
              <div className="space-y-3">
                {penLoading ? <PageLoader /> : penaltyData ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['Total Offers', penaltyData.penalties?.totalOffers ?? 0],
                        ['Rejected',     penaltyData.penalties?.totalRejects ?? 0],
                        ['Cancelled',    penaltyData.penalties?.totalCancels ?? 0],
                        ['No-Shows',     penaltyData.penalties?.totalNoShows ?? 0],
                      ].map(([k, v]) => (
                        <div key={k} className="bg-slate-50 rounded-xl p-3 text-center">
                          <p className="text-xl font-black text-slate-900">{v}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{k}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-orange-50 rounded-xl p-3 text-center">
                        <p className="text-lg font-black text-orange-700">
                          {((penaltyData.lifetimeRates?.rejectRate ?? 0) * 100).toFixed(0)}%
                        </p>
                        <p className="text-[11px] text-orange-500">Reject Rate</p>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <p className="text-lg font-black text-red-700">
                          {((penaltyData.lifetimeRates?.cancelRate ?? 0) * 100).toFixed(0)}%
                        </p>
                        <p className="text-[11px] text-red-500">Cancel Rate</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[11px] font-bold text-slate-400 mb-2">Recent window ({penaltyData.recentWindow?.size ?? 0} offers)</p>
                      <div className="flex flex-wrap gap-1">
                        {penaltyData.recentWindow?.outcomes?.map((o, i) => (
                          <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            o === 'accept' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>{o}</span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : <p className="text-sm text-slate-400 text-center py-8">No penalty data</p>}
              </div>
            )}

            {tab === 'actions' && (
              <div className="space-y-3">
                {/* View KYC docs */}
                <button
                  onClick={() => setShowDocs(true)}
                  disabled={!worker.kyc?.selfieUrl}
                  className="w-full flex items-center justify-between bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-3.5 transition"
                >
                  <div className="flex items-center gap-3">
                    <Eye size={16} className="text-indigo-600" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-indigo-700">View KYC Documents</p>
                      <p className="text-[11px] text-indigo-500">Aadhaar, license, selfie + metadata</p>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-indigo-400" />
                </button>

                {/* Block/Unblock */}
                <button
                  onClick={toggleBlock}
                  disabled={blocking}
                  className={`w-full flex items-center justify-between rounded-xl px-4 py-3.5 transition ${
                    worker.isBlocked
                      ? 'bg-green-50 hover:bg-green-100'
                      : 'bg-amber-50 hover:bg-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {worker.isBlocked
                      ? <ShieldCheck size={16} className="text-green-600" />
                      : <ShieldOff size={16} className="text-amber-600" />
                    }
                    <div className="text-left">
                      <p className={`text-sm font-bold ${worker.isBlocked ? 'text-green-700' : 'text-amber-700'}`}>
                        {worker.isBlocked ? 'Unblock Worker' : 'Block Worker'}
                      </p>
                      <p className={`text-[11px] ${worker.isBlocked ? 'text-green-500' : 'text-amber-500'}`}>
                        {worker.isBlocked ? 'Allow them to log in and take jobs' : 'Prevent login and job access'}
                      </p>
                    </div>
                  </div>
                  {blocking ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <ChevronRight size={14} className="text-slate-300" />}
                </button>

                {/* Delete */}
                <div className="border border-red-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowDelete(!showDelete)}
                    className="w-full flex items-center justify-between bg-red-50 hover:bg-red-100 px-4 py-3.5 transition"
                  >
                    <div className="flex items-center gap-3">
                      <Trash2 size={16} className="text-red-600" />
                      <div className="text-left">
                        <p className="text-sm font-bold text-red-700">Remove Worker</p>
                        <p className="text-[11px] text-red-500">Data kept for compliance. Cannot be undone.</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`text-red-300 transition-transform ${showDelete ? 'rotate-90' : ''}`} />
                  </button>

                  {showDelete && (
                    <div className="px-4 py-3 bg-red-50 border-t border-red-200 space-y-3">
                      <textarea
                        rows={2}
                        className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white"
                        placeholder="Reason for removal (required, min 5 chars)…"
                        value={deleteReason}
                        onChange={e => setDeleteReason(e.target.value)}
                      />
                      <button
                        onClick={handleDelete}
                        disabled={deleting || deleteReason.trim().length < 5}
                        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-lg transition"
                      >
                        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Confirm Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* Main Workers page */
const SKILLS = [
  'puncture', 'plumbing', 'electrical', 'helper', 'carpenter', 'ac_repair',
  'cleaning', 'painting', 'screen_replacement', 'battery_replacement',
  'bike_wash', 'car_wash', 'bike_service', 'car_service',
];

export default function Workers() {
  const [q, setQ]           = useState('');
  const [skill, setSkill]   = useState('');
  const [online, setOnline] = useState('');
  const [page, setPage]     = useState(1);
  const [selected, setSelected] = useState(null);

  const { data, isFetching, refetch } = useAdminWorkersQuery({
    q: q || undefined, skill: skill || undefined,
    online: online || undefined, page,
  });

  return (
    <div className="space-y-4">
      <SectionHeader title="Workers" subtitle={data?.total != null ? `${data.total} registered` : ''} />

      {/* filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Search name or phone…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={skill} onChange={(e) => { setSkill(e.target.value); setPage(1); }}>
          <option value="">All skills</option>
          {SKILLS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={online} onChange={(e) => { setOnline(e.target.value); setPage(1); }}>
          <option value="">All status</option>
          <option value="true">Online only</option>
          <option value="false">Offline only</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Name</Th><Th>Phone</Th><Th>Skills</Th><Th>Rating</Th>
                <Th>Jobs</Th><Th>KYC</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.workers?.map((w) => (
                <tr key={w._id} className="hover:bg-slate-50/60 transition-colors">
                  <Td>
                    <button
                      className="font-semibold text-indigo-700 hover:underline text-left"
                      onClick={() => setSelected(w)}
                    >
                      {w.name}
                    </button>
                  </Td>
                  <Td muted>{w.phone}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {w.skills?.slice(0, 2).map(s => (
                        <span key={s} className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                          {s.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {w.skills?.length > 2 && <span className="text-[10px] text-slate-400">+{w.skills.length - 2}</span>}
                    </div>
                  </Td>
                  <Td><span className="font-semibold">{w.rating?.toFixed(1) ?? '—'} ★</span></Td>
                  <Td muted>{w.completedJobs ?? 0}</Td>
                  <Td><StatusBadge status={w.kyc?.status || 'not_submitted'} /></Td>
                  <Td>
                    {w.isBlocked
                      ? <StatusBadge status="blocked" />
                      : w.isOnline
                      ? <StatusBadge status="online" />
                      : <StatusBadge status="offline" />}
                  </Td>
                  <Td>
                    <button
                      onClick={() => setSelected(w)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      <User size={12} /> View
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.workers?.length && !isFetching && <EmptyState message="No workers found" icon={Briefcase} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      </Card>

      {selected && (
        <WorkerDetailPanel
          worker={selected}
          onClose={() => setSelected(null)}
          onRefetch={refetch}
        />
      )}
    </div>
  );
}
