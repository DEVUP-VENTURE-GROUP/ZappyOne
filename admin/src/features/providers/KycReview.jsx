import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Clock, Shield,
  Camera, FileText, MapPin, Smartphone, AlertTriangle,
  Eye, RefreshCw, MessageSquare, ZoomIn, X, ChevronLeft,
  ChevronRight, BadgeCheck, Lock,
} from 'lucide-react';
import {
  useAdminKycPendingQuery,
  useAdminKycApproveMutation,
  useAdminKycRejectMutation,
  useAdminRunKycVerifyMutation,
  useAdminKycDocUrlsQuery,
  useAdminKycClarifyMutation,
  useAdminKycChangeRequestsQuery,
  useAdminRespondChangeRequestMutation,
} from '@shared/services/api';
import { useSelector } from 'react-redux';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { adminApiPath } from '@/config/admin';
import { API_BASE } from '@shared/services/apiBase';
import toast from 'react-hot-toast';

/* Image lightbox */
function Lightbox({ url, label, onClose }) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <span className="text-white/60 text-sm font-medium">{label}</span>
        <button onClick={onClose} className="text-white/70 hover:text-white transition">
          <X size={22} />
        </button>
      </div>
      <img
        src={url}
        alt={label}
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* Doc image card */
function DocCard({ label, url, icon: Icon, badge, badgeColor, isLoading, onView }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon size={11} className="text-slate-400" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
        </div>
        {badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
        )}
      </div>

      <div
        className={`relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group ${!url ? 'cursor-default' : ''}`}
        onClick={() => url && onView()}
      >
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-300" />
          </div>
        ) : url ? (
          <>
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
              <ZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 transition" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <Icon size={22} className="text-slate-300" />
            <span className="text-[10px] text-slate-400 font-medium">Not submitted</span>
          </div>
        )}
      </div>

      {url && (
        <button
          onClick={onView}
          className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-zappy-600 hover:text-zappy-800 transition"
        >
          <Eye size={11} /> View full size
        </button>
      )}
    </div>
  );
}

/**
 * useKycDoc — fetches a KYC document via the authenticated server proxy.
 * No presigned URL, no expiry. The object URL lives as long as the browser session.
 * docType: 'aadhaar' | 'license' | 'selfie' | 'snap_aadhaar' | 'snap_license' | 'snap_selfie'
 */
function useKycDoc(workerId, docType, token, enabled = true) {
  const [url, setUrl]     = useState(null);
  const [loading, setLoading] = useState(false);
  const objRef = useRef(null);

  useEffect(() => {
    if (!workerId || !docType || !token || !enabled) return;
    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE}/api${adminApiPath(`/workers/${workerId}/kyc/stream/${docType}`)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        if (objRef.current) URL.revokeObjectURL(objRef.current);
        const objUrl = URL.createObjectURL(blob);
        objRef.current = objUrl;
        setUrl(objUrl);
      })
      .catch(() => setUrl(null))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
    };
  }, [workerId, docType, token, enabled]);

  // Clean up on unmount
  useEffect(() => () => { if (objRef.current) URL.revokeObjectURL(objRef.current); }, []);

  return { url, loading };
}

/* Reverse geocode hook */
const _geoCache = {};
async function reverseGeocode(lat, lng) {
  const k = `${lat?.toFixed(4)},${lng?.toFixed(4)}`;
  if (_geoCache[k]) return _geoCache[k];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ZappyAdmin/1.0' } }
    );
    const data = await res.json();
    const a = data.address ?? {};
    const label = [a.suburb ?? a.road, a.city ?? a.town ?? a.village, a.state]
      .filter(Boolean).join(', ') || k;
    _geoCache[k] = label;
    return label;
  } catch { return k; }
}

function useAddress(lat, lng) {
  const [addr, setAddr] = useState(null);
  useEffect(() => {
    if (lat == null || lng == null) return;
    reverseGeocode(lat, lng).then(setAddr);
  }, [lat, lng]);
  return addr;
}

/* Selfie metadata strip */
function SelfieMetaBadges({ meta }) {
  const addr = useAddress(meta?.lat, meta?.lng);

  if (!meta) {
    return (
      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        <AlertTriangle size={12} className="text-red-500 shrink-0" />
        <span className="text-[11px] font-bold text-red-600">No liveness metadata — may be a static upload</span>
      </div>
    );
  }

  const isLive = meta.captureMethod === 'live_camera';
  const hasGeo = meta.lat != null && meta.lng != null;

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${isLive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-1.5">
        {isLive
          ? <CheckCircle2 size={13} className="text-green-600" />
          : <AlertTriangle size={13} className="text-red-500" />
        }
        <span className={`text-[11px] font-bold ${isLive ? 'text-green-700' : 'text-red-600'}`}>
          {isLive ? 'Live camera capture ✓' : '⚠ Static upload — not live camera'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {meta.capturedAt && (
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-slate-400" />
            <span className="text-[10px] text-slate-600 font-medium">
              {new Date(meta.capturedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <MapPin size={10} className={`mt-0.5 shrink-0 ${hasGeo ? 'text-green-500' : 'text-red-400'}`} />
          {hasGeo ? (
            <div>
              <span className="text-[10px] text-slate-700 font-semibold leading-tight block">
                {addr ?? `${meta.lat.toFixed(4)}, ${meta.lng.toFixed(4)}`}
              </span>
              {addr && (
                <span className="text-[9px] text-slate-400">{meta.lat.toFixed(4)}, {meta.lng.toFixed(4)}</span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-red-500 font-medium">GPS not captured</span>
          )}
        </div>
        {meta.userAgent && (
          <div className="flex items-center gap-1.5 col-span-2">
            <Smartphone size={10} className="text-slate-400" />
            <span className="text-[10px] text-slate-500 truncate">{meta.userAgent.slice(0, 60)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* Worker KYC detail panel */
function KycDetailPanel({ worker, onDone }) {
  const [lightbox, setLightbox]   = useState(null);
  const [showReject, setShowReject] = useState(false);
  const [showClarify, setShowClarify] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [clarifyMsg, setClarifyMsg]     = useState('');
  const [viewingSnap, setViewingSnap]   = useState(false);

  const { accessToken: token } = useSelector(selectAuth);
  const { data: docData, isLoading: metaLoading } = useAdminKycDocUrlsQuery(worker._id);
  const [approve, { isLoading: approving }] = useAdminKycApproveMutation();
  const [reject,  { isLoading: rejecting }] = useAdminKycRejectMutation();
  const [runVerify, { isLoading: verifying }] = useAdminRunKycVerifyMutation();
  const [verifyResult, setVerifyResult] = useState(null);

  async function onRunVerify() {
    try {
      const res = await runVerify({ id: worker._id }).unwrap();
      setVerifyResult(res.results || {});
      toast.success('API verification complete');
    } catch (err) { toast.error(err.data?.error || 'Verification unavailable'); }
  }
  const [clarify, { isLoading: clarifying }] = useAdminKycClarifyMutation();

  const isUpdate = docData?.isUpdate ?? worker.kyc?.isUpdate ?? false;
  const meta     = viewingSnap ? null : (docData?.selfieMetadata ?? null);

  // Load permanent doc blobs via server proxy — no URL expiry, auth-gated
  const prefix = viewingSnap ? 'snap_' : '';
  const { url: aadhaarUrl, loading: loadingA } = useKycDoc(worker._id, `${prefix}aadhaar`, token, !metaLoading && (viewingSnap ? docData?.hasApprovedSnapshot : docData?.docs?.hasAadhaar));
  const { url: licenseUrl, loading: loadingL  } = useKycDoc(worker._id, `${prefix}license`, token, !metaLoading && (viewingSnap ? docData?.hasApprovedSnapshot : docData?.docs?.hasLicense));
  const { url: selfieUrl,  loading: loadingS  } = useKycDoc(worker._id, `${prefix}selfie`,  token, !metaLoading && (viewingSnap ? docData?.hasApprovedSnapshot : docData?.docs?.hasSelfie));

  const docs = { aadhaarUrl, licenseUrl, selfieUrl };
  const docsLoading = metaLoading || loadingA || loadingL || loadingS;

  async function onApprove() {
    try {
      await approve(worker._id).unwrap();
      toast.success(`${worker.name} approved`);
      onDone();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function onReject() {
    if (!rejectReason.trim() || rejectReason.length < 5) {
      toast.error('Provide a rejection reason (min 5 chars)');
      return;
    }
    try {
      await reject({ id: worker._id, reason: rejectReason }).unwrap();
      toast.success(isUpdate ? `Update rejected — ${worker.name} reverted to previous approved docs` : `${worker.name} rejected`);
      setShowReject(false);
      onDone();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  async function onClarify() {
    if (!clarifyMsg.trim() || clarifyMsg.length < 5) {
      toast.error('Enter a clarification message (min 5 chars)');
      return;
    }
    try {
      await clarify({ id: worker._id, message: clarifyMsg }).unwrap();
      toast.success('Clarification request sent to worker');
      setShowClarify(false);
      setClarifyMsg('');
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      {lightbox && (
        <Lightbox url={lightbox.url} label={lightbox.label} onClose={() => setLightbox(null)} />
      )}

      {/* header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-900">{worker.name}</p>
            {isUpdate && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                KYC UPDATE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{worker.phone}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {worker.skills?.map((s) => (
              <span key={s} className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                {s.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">
            <Clock size={10} className="inline mr-1" />
            {new Date(worker.kyc?.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
          </p>
          {(worker.kyc?.submissionHistory?.length ?? 0) > 1 && (
            <p className="text-[10px] text-amber-600 font-semibold mt-1">
              {worker.kyc.submissionHistory.length} submissions total
            </p>
          )}
        </div>
      </div>

      {/* update comparison toggle */}
      {isUpdate && docData?.approvedSnapshot && (
        <div className="px-5 pt-3">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewingSnap(false)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition ${!viewingSnap ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              New submission
            </button>
            <button
              onClick={() => setViewingSnap(true)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition ${viewingSnap ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              <Lock size={10} className="inline mr-1" />
              Previously approved
            </button>
          </div>
        </div>
      )}

      {/* docs */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <DocCard
            label="Aadhaar"
            url={docs.aadhaarUrl}
            icon={FileText}
            isLoading={docsLoading}
            onView={() => setLightbox({ url: docs.aadhaarUrl, label: 'Aadhaar Card' })}
          />
          <DocCard
            label="License"
            url={docs.licenseUrl}
            icon={FileText}
            isLoading={docsLoading}
            onView={() => setLightbox({ url: docs.licenseUrl, label: 'Driving License' })}
          />
          <DocCard
            label="Selfie"
            url={docs.selfieUrl}
            icon={Camera}
            badge={meta?.captureMethod === 'live_camera' ? 'LIVE' : meta ? 'UPLOAD' : null}
            badgeColor={meta?.captureMethod === 'live_camera' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}
            isLoading={docsLoading}
            onView={() => setLightbox({ url: docs.selfieUrl, label: 'Live Selfie' })}
          />
        </div>

        {/* selfie metadata */}
        {!viewingSnap && <SelfieMetaBadges meta={meta} />}

        {/* previously approved notice */}
        {viewingSnap && (
          <div className="flex items-center gap-2 bg-zappy-50 border border-zappy-100 rounded-xl px-3 py-2">
            <Lock size={12} className="text-zappy-500 shrink-0" />
            <p className="text-[11px] text-zappy-700 font-semibold">
              These are the previously approved documents. Rejecting the update will revert to these.
            </p>
          </div>
        )}

        {/* storage note */}
        {!docsLoading && (
          <p className="text-[10px] text-slate-400 text-center">
            Documents stored permanently · fresh links generated on each view
          </p>
        )}
      </div>

      {/* 3rd-party API verification (assists review) */}
      {!showReject && !showClarify && (
        <div className="px-5 pb-3">
          <button onClick={onRunVerify} disabled={verifying}
            className="w-full flex items-center justify-center gap-1.5 bg-zappy-50 border border-zappy-200 text-zappy-700 font-semibold text-xs py-2.5 rounded-xl hover:bg-zappy-100 transition disabled:opacity-50">
            {verifying ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} Run API verification (bank)
          </button>
          {verifyResult && (
            <div className="mt-2 space-y-1">
              {['bank', 'pan'].filter((k) => verifyResult[k]).map((k) => {
                const r = verifyResult[k];
                const ok = r.verified === true;
                return (
                  <div key={k} className={`flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg ${ok ? 'bg-green-50 text-green-700' : r.skipped ? 'bg-slate-50 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                    <span className="font-bold uppercase">{k}</span>
                    <span>{r.skipped ? 'skipped' : ok ? `verified${r.nameMatchScore != null ? ` · name ${Math.round(r.nameMatchScore * 100)}%` : ''}` : (r.error || 'not verified')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* action buttons */}
      {!showReject && !showClarify && (
        <div className="px-5 pb-5 grid grid-cols-3 gap-2">
          <button
            onClick={() => setShowClarify(true)}
            className="flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 font-semibold text-xs py-2.5 rounded-xl hover:bg-amber-100 transition"
          >
            <MessageSquare size={13} /> Ask Worker
          </button>
          <button
            onClick={() => setShowReject(true)}
            className="flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 text-red-700 font-semibold text-xs py-2.5 rounded-xl hover:bg-red-100 transition"
          >
            <XCircle size={13} /> Reject
          </button>
          <button
            onClick={onApprove}
            disabled={approving || docsLoading || !docs.aadhaarUrl || !docs.selfieUrl}
            className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl transition"
          >
            {approving ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />}
            Approve
          </button>
        </div>
      )}

      {/* Reject form */}
      {showReject && (
        <div className="px-5 pb-5 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-bold text-red-700 mb-1">
              {isUpdate ? 'Reject update — worker reverts to previously approved docs' : 'Reject KYC'}
            </p>
            <textarea
              rows={3}
              autoFocus
              className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400 resize-none"
              placeholder="e.g. Aadhaar image is blurry — please re-upload with all 4 corners visible…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowReject(false); setRejectReason(''); }}
              className="flex-1 text-xs font-semibold py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button onClick={onReject} disabled={rejecting}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50">
              {rejecting ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* Clarification form */}
      {showClarify && (
        <div className="px-5 pb-5 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-700 mb-1">Send a clarification request (status stays pending)</p>
            <textarea
              rows={3}
              autoFocus
              className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              placeholder="e.g. Your selfie is unclear. Please retake in good lighting facing straight at the camera."
              value={clarifyMsg}
              onChange={(e) => setClarifyMsg(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowClarify(false); setClarifyMsg(''); }}
              className="flex-1 text-xs font-semibold py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button onClick={onClarify} disabled={clarifying}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50">
              {clarifying ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              Send Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Change Requests panel */
function ChangeRequestsPanel() {
  const { data, refetch } = useAdminKycChangeRequestsQuery();
  const [respond, { isLoading: responding }] = useAdminRespondChangeRequestMutation();
  const [selected, setSelected] = useState(null);
  const [denial, setDenial]     = useState('');

  async function handleRespond(id, decision) {
    try {
      await respond({ id, decision, denialReason: denial || undefined }).unwrap();
      toast.success(decision === 'approved' ? 'Change approved — worker can now resubmit' : 'Change request denied');
      setSelected(null);
      setDenial('');
      refetch();
    } catch (err) { toast.error(err.data?.error || 'Failed'); }
  }

  const workers = data?.workers ?? [];
  if (!workers.length) return (
    <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
      <CheckCircle2 size={20} className="text-green-400 mx-auto mb-2" />
      <p className="text-sm text-slate-400">No pending document change requests</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {workers.map(w => (
        <div key={w._id} className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-slate-900">{w.name}</p>
              <p className="text-xs text-slate-500">{w.phone}</p>
            </div>
            <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Change Request</span>
          </div>
          <div className="bg-amber-50 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-amber-700 mb-1">Worker's reason:</p>
            <p className="text-sm text-slate-700">"{w.kyc?.changeRequest?.message}"</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Requested: {new Date(w.kyc?.changeRequest?.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
            </p>
          </div>

          {selected === w._id ? (
            <div className="space-y-2">
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
                placeholder="Denial reason (if denying)…"
                value={denial}
                onChange={e => setDenial(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => { setSelected(null); setDenial(''); }} className="flex-1 text-xs font-semibold py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={() => handleRespond(w._id, 'denied')} disabled={responding}
                  className="flex-1 text-xs font-bold py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition">
                  Deny
                </button>
                <button onClick={() => handleRespond(w._id, 'approved')} disabled={responding}
                  className="flex-1 text-xs font-bold py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition">
                  {responding ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Approve'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setSelected(w._id)} className="w-full text-xs font-bold py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition">
              Review Request
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* Root */
export default function AdminKycReview() {
  const { data, refetch, isLoading } = useAdminKycPendingQuery();
  const { data: crData }             = useAdminKycChangeRequestsQuery();
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'changes'

  const workers = data?.workers ?? [];
  const idx     = selected ? workers.findIndex((w) => w._id === selected._id) : -1;

  function selectAt(i) {
    if (i >= 0 && i < workers.length) setSelected(workers[i]);
    else setSelected(null);
  }

  const crCount = crData?.total ?? 0;

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={24} className="text-zappy-600 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">KYC Review</h2>
          <p className="text-xs text-slate-400 mt-0.5">Documents stored permanently · proxied through secure server</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refetch} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition">
            <RefreshCw size={14} />
          </button>
          <span className="bg-zappy-100 text-zappy-700 font-bold text-xs px-3 py-1.5 rounded-full">
            {data?.total ?? 0} pending
          </span>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-2">
        {[
          { id: 'pending', label: 'New Submissions', count: data?.total ?? 0 },
          { id: 'changes', label: 'Change Requests',  count: crCount },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {t.label}
            {t.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${activeTab === t.id ? 'bg-white text-slate-900' : 'bg-amber-100 text-amber-700'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'changes' && <ChangeRequestsPanel />}
      {activeTab !== 'changes' && <></> /* grid below handles pending */}

      {workers.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
            <Shield size={22} className="text-green-600" />
          </div>
          <p className="font-semibold text-slate-900">All caught up!</p>
          <p className="text-sm text-slate-400 mt-1">No pending KYC submissions</p>
        </div>
      )}

      <div className={`grid gap-4 ${selected ? 'md:grid-cols-[300px,1fr]' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
        {/* Worker list */}
        <div className="space-y-2">
          {workers.map((w) => (
            <button
              key={w._id}
              onClick={() => setSelected(selected?._id === w._id ? null : w)}
              className={`w-full text-left bg-white border rounded-xl px-4 py-3 transition ${
                selected?._id === w._id
                  ? 'border-zappy-400 ring-2 ring-zappy-100'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm text-slate-900">{w.name}</p>
                    {w.kyc?.isUpdate && (
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">UPDATE</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{w.phone}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {new Date(w.kyc?.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <div className="flex gap-1 mt-2 flex-wrap">
                {w.skills?.slice(0, 3).map((s) => (
                  <span key={s} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">
                    {s.replace(/_/g, ' ')}
                  </span>
                ))}
                {(w.kyc?.submissionHistory?.length ?? 0) > 1 && (
                  <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">
                    {w.kyc.submissionHistory.length}x submitted
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="space-y-3">
            {/* prev/next nav */}
            <div className="flex items-center justify-between">
              <button
                disabled={idx <= 0}
                onClick={() => selectAt(idx - 1)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-30 transition"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="text-xs text-slate-400 font-medium">{idx + 1} / {workers.length}</span>
              <button
                disabled={idx >= workers.length - 1}
                onClick={() => selectAt(idx + 1)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-30 transition"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>

            <KycDetailPanel
              worker={selected}
              onDone={() => { setSelected(null); refetch(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
