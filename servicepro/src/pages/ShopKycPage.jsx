import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Upload, CheckCircle2, Clock, XCircle, ShieldCheck,
  IdCard, Store, Camera, FileText, Loader2,
} from 'lucide-react';
import { useShopKycStatusQuery, useSubmitShopKycMutation, usePresignUploadMutation } from '@shared/services/api';
import toast from 'react-hot-toast';

const DOCS = [
  { key: 'ownerIdUrl', label: "Owner's ID Proof", sublabel: 'Aadhaar / PAN / Voter ID — clear photo', Icon: IdCard, required: true },
  { key: 'shopPhotoUrl', label: 'Shop Photo', sublabel: 'Photo of your shop front / signboard', Icon: Store, required: true },
  { key: 'selfieUrl', label: 'Owner Selfie', sublabel: 'A clear selfie of the shop owner', Icon: Camera, required: true },
  { key: 'businessRegistrationUrl', label: 'Business Registration (optional)', sublabel: 'Shop & establishment license, if you have one', Icon: FileText, required: false },
  { key: 'gstCertificateUrl', label: 'GST Certificate (optional)', sublabel: 'If your shop is GST-registered', Icon: FileText, required: false },
];

const STATUS_META = {
  pending_review: {
    title: 'Under Review', body: "Your shop documents are being verified. We'll notify you within 24 hours.", Icon: Clock,
    card: 'bg-amber-50 ring-1 ring-amber-200', icon: 'text-amber-600', title_: 'text-amber-800', body_: 'text-amber-600',
  },
  approved: {
    title: 'Shop Verified ✓', body: 'Your shop is verified. Complete your profile to appear in Nearby Shops.', Icon: ShieldCheck,
    card: 'bg-emerald-50 ring-1 ring-emerald-200', icon: 'text-emerald-600', title_: 'text-emerald-800', body_: 'text-emerald-600',
  },
  suspended: {
    title: 'Verification Suspended', body: 'Contact support for help with your shop verification.', Icon: XCircle,
    card: 'bg-red-50 ring-1 ring-red-200', icon: 'text-red-600', title_: 'text-red-800', body_: 'text-red-600',
  },
};

export default function ShopKycPage() {
  const nav = useNavigate();
  const { data, refetch, isLoading } = useShopKycStatusQuery();
  const [presign] = usePresignUploadMutation();
  const [submitKyc, { isLoading: submitting }] = useSubmitShopKycMutation();

  const [urls, setUrls] = useState({});
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [uploading, setUploading] = useState(null);

  const status = data?.kyc?.status || 'not_submitted';
  const rejectionReason = data?.kyc?.reviewNote;

  async function handleUpload(docKey, file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('File too large — max 5MB');
    try {
      setUploading(docKey);
      const { data: signed } = await presign({ folder: 'kyc', contentType: file.type || 'image/jpeg' });
      const res = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
      if (!res.ok) throw new Error('upload failed');
      setUrls((prev) => ({ ...prev, [docKey]: signed.key }));
      toast.success('Document uploaded');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    if (!urls.ownerIdUrl || !urls.shopPhotoUrl || !urls.selfieUrl) {
      return toast.error('Owner ID, shop photo, and selfie are all required');
    }
    try {
      await submitKyc({ ...urls, gstNumber: gstNumber || undefined, panNumber: panNumber || undefined }).unwrap();
      toast.success('Documents submitted for review');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Submission failed');
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (status === 'pending_review' || status === 'approved' || status === 'suspended') {
    const meta = STATUS_META[status];
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <header className="page-header"><div className="page-header-inner">
          <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
          <h1 className="h-card">Shop Verification</h1>
        </div></header>
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4">
          <div className={`card ${meta.card} flex items-center gap-3`}>
            <meta.Icon size={18} className={`${meta.icon} shrink-0`} />
            <div>
              <p className={`font-bold text-sm ${meta.title_}`}>{meta.title}</p>
              <p className={`text-xs mt-0.5 ${meta.body_}`}>{meta.body}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-32">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">Shop Verification</h1>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">

        {status === 'rejected' && rejectionReason && (
          <div className="card bg-red-50 ring-1 ring-red-200">
            <div className="flex items-start gap-3">
              <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Previous submission rejected</p>
                <p className="text-sm text-red-600 mt-1 leading-relaxed">{rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        <div className="card bg-indigo-50 ring-indigo-100">
          <div className="flex items-start gap-3">
            <ShieldCheck size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-indigo-700 leading-relaxed">
              Verifying your shop builds customer trust and unlocks the Nearby Shops listing. Reviewed within 24 hours.
            </p>
          </div>
        </div>

        {DOCS.map(({ key, label, sublabel, Icon, required }) => {
          const uploaded = !!urls[key];
          const isUploading = uploading === key;
          return (
            <div key={key} className={`card ${uploaded ? 'ring-success-200 bg-success-50/30' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${uploaded ? 'bg-success-100' : 'bg-slate-100'}`}>
                  <Icon size={18} strokeWidth={1.75} className={uploaded ? 'text-success-600' : 'text-slate-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm text-[#0F172A]">{label}</p>
                    {required && <span className="text-red-500 text-xs font-bold">*</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>
                  {uploaded && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <CheckCircle2 size={12} strokeWidth={2.5} className="text-success-600" />
                      <span className="text-xs font-semibold text-success-700">Uploaded</span>
                    </div>
                  )}
                </div>
                <label className={`btn-secondary cursor-pointer text-xs py-2 px-3 ${isUploading ? 'opacity-50' : ''}`}>
                  {isUploading ? (
                    <span className="flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Uploading</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><Upload size={11} strokeWidth={2.5} />{uploaded ? 'Replace' : 'Upload'}</span>
                  )}
                  <input type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={(e) => handleUpload(key, e.target.files?.[0])} />
                </label>
              </div>
            </div>
          );
        })}

        <div className="card space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Business Details (optional)</p>
          <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="GST Number" className="input text-sm w-full" />
          <input value={panNumber} onChange={(e) => setPanNumber(e.target.value)} placeholder="PAN Number" className="input text-sm w-full" />
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-pb">
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-3 pb-2">
          <button onClick={submit} disabled={submitting || !urls.ownerIdUrl || !urls.shopPhotoUrl || !urls.selfieUrl} className="btn-primary w-full">
            {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : <><ShieldCheck size={15} strokeWidth={2.5} /> Submit for Verification</>}
          </button>
        </div>
      </div>
    </div>
  );
}
