import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { adminApiPath } from '@/config/admin';
import { API_BASE } from '@shared/services/apiBase';
import {
  Search, Store, ShieldOff, ShieldCheck, X, Eye, FileText, Camera,
  Phone, Star, Loader2, ChevronRight, User, MapPin, Users,
} from 'lucide-react';
import {
  useAdminShopsQuery, useAdminApproveShopKycMutation, useAdminRejectShopKycMutation,
  useAdminBlockShopMutation, useAdminShopKycDocUrlsQuery,
} from '@shared/services/api';
import {
  SectionHeader, Pagination, StatusBadge, Card, Th, Td,
  EmptyState, PageLoader, fmtDate,
} from '../../ui/kit';
import toast from 'react-hot-toast';

/* Permanent doc hook — server-proxied, no URL expiry */
function useKycDoc(shopId, docType, token, enabled = true) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    if (!shopId || !docType || !token || !enabled) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api${adminApiPath(`/shops/${shopId}/kyc/stream/${docType}`)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => {
        if (cancelled) return;
        if (objRef.current) URL.revokeObjectURL(objRef.current);
        const u = URL.createObjectURL(blob);
        objRef.current = u;
        setUrl(u);
      })
      .catch(() => setUrl(null))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shopId, docType, token, enabled]);

  useEffect(() => () => { if (objRef.current) URL.revokeObjectURL(objRef.current); }, []);
  return { url, loading };
}

function KycDocViewer({ shopId, onClose }) {
  const { accessToken: token } = useSelector(selectAuth);
  const { data, isLoading: metaLoading } = useAdminShopKycDocUrlsQuery(shopId);
  const [lightbox, setLightbox] = useState(null);

  const { url: ownerIdUrl, loading: l1 } = useKycDoc(shopId, 'ownerId', token, !metaLoading && !!data?.docs?.hasOwnerId);
  const { url: shopPhotoUrl, loading: l2 } = useKycDoc(shopId, 'shopPhoto', token, !metaLoading && !!data?.docs?.hasShopPhoto);
  const { url: selfieUrl, loading: l3 } = useKycDoc(shopId, 'selfie', token, !metaLoading && !!data?.docs?.hasSelfie);
  const { url: bizRegUrl, loading: l4 } = useKycDoc(shopId, 'businessRegistration', token, !metaLoading && !!data?.docs?.hasBusinessRegistration);
  const { url: gstUrl, loading: l5 } = useKycDoc(shopId, 'gstCertificate', token, !metaLoading && !!data?.docs?.hasGstCertificate);

  const isLoading = metaLoading || l1 || l2 || l3;
  const docs = [
    { key: 'ownerId', label: "Owner's ID", url: ownerIdUrl, loading: l1, Icon: FileText },
    { key: 'shopPhoto', label: 'Shop Photo', url: shopPhotoUrl, loading: l2, Icon: Store },
    { key: 'selfie', label: 'Owner Selfie', url: selfieUrl, loading: l3, Icon: Camera },
  ];
  const optionalDocs = [
    { key: 'businessRegistration', label: 'Business Registration', url: bizRegUrl, loading: l4, Icon: FileText },
    { key: 'gstCertificate', label: 'GST Certificate', url: gstUrl, loading: l5, Icon: FileText },
  ].filter((d) => d.url || d.loading);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-bold text-slate-900">Shop KYC Documents</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><X size={16} /></button>
        </div>

        {lightbox && (
          <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}><X size={22} /></button>
            <img src={lightbox.url} alt={lightbox.label} className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
          </div>
        )}

        <div className="p-6 space-y-5">
          {isLoading ? <PageLoader /> : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {docs.map(({ key, label, url, loading, Icon }) => (
                  <div key={key} className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                    <div className={`aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 ${url ? 'cursor-pointer group' : ''}`}
                      onClick={() => url && setLightbox({ url, label })}>
                      {loading ? (
                        <div className="w-full h-full flex items-center justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
                      ) : url ? (
                        <div className="relative w-full h-full">
                          <img src={url} alt={label} className="w-full h-full object-cover" />
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
                  </div>
                ))}
              </div>

              {optionalDocs.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {optionalDocs.map(({ key, label, url, loading, Icon }) => (
                    <div key={key} className="space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                      <div className={`aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 ${url ? 'cursor-pointer group' : ''}`}
                        onClick={() => url && setLightbox({ url, label })}>
                        {loading ? (
                          <div className="w-full h-full flex items-center justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
                        ) : url ? (
                          <img src={url} alt={label} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Icon size={18} className="text-slate-300" /></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(data?.gstNumber || data?.panNumber) && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {data.gstNumber && <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-slate-400 font-bold text-[10px]">GST NUMBER</p><p className="text-slate-700 font-semibold mt-0.5">{data.gstNumber}</p></div>}
                  {data.panNumber && <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-slate-400 font-bold text-[10px]">PAN NUMBER</p><p className="text-slate-700 font-semibold mt-0.5">{data.panNumber}</p></div>}
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

function ShopDetailPanel({ shop, onClose, onRefetch, reviewMode }) {
  const [, setParams] = useSearchParams();
  const [showDocs, setShowDocs] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [approveKyc, { isLoading: approving }] = useAdminApproveShopKycMutation();
  const [rejectKyc, { isLoading: rejecting }] = useAdminRejectShopKycMutation();
  const [blockShop, { isLoading: blocking }] = useAdminBlockShopMutation();

  async function handleApprove() {
    try {
      await approveKyc(shop._id).unwrap();
      toast.success('Shop verified');
      onRefetch();
      onClose();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function handleReject() {
    if (rejectReason.trim().length < 5) return toast.error('Provide a reason (min 5 chars)');
    try {
      await rejectKyc({ id: shop._id, reason: rejectReason }).unwrap();
      toast.success('Shop KYC rejected');
      onRefetch();
      onClose();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function toggleBlock() {
    try {
      await blockShop({ id: shop._id, blocked: !shop.isBlocked }).unwrap();
      toast.success(shop.isBlocked ? 'Shop unblocked' : 'Shop blocked');
      onRefetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  const kycStatus = shop.kyc?.status || 'not_submitted';

  return (
    <>
      {showDocs && <KycDocViewer shopId={shop._id} onClose={() => setShowDocs(false)} />}
      <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-lg">
                {shop.businessName?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="font-bold text-slate-900">{shop.businessName}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-slate-500"><User size={10} /> {shop.ownerName}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-500"><Phone size={10} /> {shop.phone}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition mt-0.5"><X size={16} /></button>
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-slate-900">{shop.rating?.toFixed(1) ?? '—'}</p>
                <p className="text-[11px] text-slate-400">Rating ★</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-slate-900">{shop.completedJobs ?? 0}</p>
                <p className="text-[11px] text-slate-400">Jobs done</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-slate-900">{shop.services?.length ?? 0}</p>
                <p className="text-[11px] text-slate-400">Services</p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">KYC Status</p>
                <StatusBadge status={kycStatus} />
              </div>
              <button onClick={() => setShowDocs(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-2 rounded-xl transition">
                <Eye size={13} /> View Docs
              </button>
            </div>

            {shop.kyc?.reviewNote && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-[11px] font-bold text-red-500 uppercase tracking-wide mb-1">Last review note</p>
                <p className="text-xs text-red-700">{shop.kyc.reviewNote}</p>
              </div>
            )}

            {shop.address?.text && (
              <div className="flex items-start gap-2 bg-slate-50 rounded-xl px-4 py-3">
                <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">{shop.address.text}</p>
              </div>
            )}

            {shop.services?.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Services</p>
                <div className="flex flex-wrap gap-1.5">
                  {shop.services.map((s) => (
                    <span key={s} className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-lg">{s.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="font-bold text-slate-400 text-[10px] mb-0.5">Registered</p>
                <p className="font-semibold text-slate-700">{fmtDate(shop.createdAt)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="font-bold text-slate-400 text-[10px] mb-0.5">Category</p>
                <p className="font-semibold text-slate-700">{shop.category || '—'}</p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {/* Approving happens only in Verification, so there is one place to decide. */}
              {kycStatus === 'pending_review' && !reviewMode && (
                <button onClick={() => setParams({ tab: 'verification', v: 'shops' })}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm py-2.5 rounded-xl transition">
                  <ShieldCheck size={14} /> Review in Verification
                </button>
              )}
              {kycStatus === 'pending_review' && reviewMode && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleApprove} disabled={approving}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition">
                    {approving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Approve
                  </button>
                  <button onClick={() => setShowReject(!showReject)}
                    className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm py-2.5 rounded-xl transition">
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
              {showReject && (
                <div className="space-y-2">
                  <textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (required, min 5 chars)…"
                    className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white" />
                  <button onClick={handleReject} disabled={rejecting || rejectReason.trim().length < 5}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-lg transition">
                    {rejecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Confirm Reject
                  </button>
                </div>
              )}

              <button onClick={toggleBlock} disabled={blocking}
                className={`w-full flex items-center justify-between rounded-xl px-4 py-3.5 transition ${shop.isBlocked ? 'bg-green-50 hover:bg-green-100' : 'bg-amber-50 hover:bg-amber-100'}`}>
                <div className="flex items-center gap-3">
                  {shop.isBlocked ? <ShieldCheck size={16} className="text-green-600" /> : <ShieldOff size={16} className="text-amber-600" />}
                  <div className="text-left">
                    <p className={`text-sm font-bold ${shop.isBlocked ? 'text-green-700' : 'text-amber-700'}`}>{shop.isBlocked ? 'Unblock Shop' : 'Block Shop'}</p>
                    <p className={`text-[11px] ${shop.isBlocked ? 'text-green-500' : 'text-amber-500'}`}>{shop.isBlocked ? 'Allow login and bookings' : 'Prevent login and new bookings'}</p>
                  </div>
                </div>
                {blocking ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <ChevronRight size={14} className="text-slate-300" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** reviewMode: rendered inside Verification — opens on pending shops and allows the decision. */
export default function Shops({ reviewMode = false }) {
  const [q, setQ] = useState('');
  const [kycStatus, setKycStatus] = useState(reviewMode ? 'pending_review' : '');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const { data, isFetching, refetch } = useAdminShopsQuery({ q: q || undefined, kycStatus: kycStatus || undefined, page });

  return (
    <div className="space-y-4">
      {!reviewMode && <SectionHeader title="Shops" subtitle={data?.total != null ? `${data.total} registered` : ''} />}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Search business, owner or phone…"
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={kycStatus} onChange={(e) => { setKycStatus(e.target.value); setPage(1); }}>
          <option value="">All KYC status</option>
          <option value="not_submitted">Not submitted</option>
          <option value="pending_review">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Business</Th><Th>Owner</Th><Th>Phone</Th><Th>Services</Th>
                <Th>KYC</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.shops?.map((s) => (
                <tr key={s._id} className="hover:bg-slate-50/60 transition-colors">
                  <Td>
                    <button className="font-semibold text-indigo-700 hover:underline text-left" onClick={() => setSelected(s)}>
                      {s.businessName}
                    </button>
                  </Td>
                  <Td muted>{s.ownerName}</Td>
                  <Td muted>{s.phone}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.services?.slice(0, 2).map((sk) => (
                        <span key={sk} className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5 rounded">{sk.replace(/_/g, ' ')}</span>
                      ))}
                      {(s.services?.length || 0) > 2 && <span className="text-[10px] text-slate-400">+{s.services.length - 2}</span>}
                    </div>
                  </Td>
                  <Td><StatusBadge status={s.kyc?.status || 'not_submitted'} /></Td>
                  <Td>
                    {s.isBlocked
                      ? <StatusBadge status="blocked" />
                      : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Active</span>}
                  </Td>
                  <Td>
                    <button onClick={() => setSelected(s)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition">
                      <Store size={12} /> View
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.shops?.length && !isFetching && <EmptyState message="No shops found" icon={Store} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        </div>
      </Card>

      {selected && <ShopDetailPanel shop={selected} reviewMode={reviewMode} onClose={() => setSelected(null)} onRefetch={refetch} />}
    </div>
  );
}
