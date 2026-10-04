import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, Camera, Upload, Loader2, CheckCircle2, Clock, AlertCircle, IdCard, FileText, BadgeCheck } from 'lucide-react';
import { useUpdatePartnerMeMutation, usePresignUploadMutation } from '@shared/services/api';
import { API_BASE } from '@shared/services/apiBase';
import LiveSelfieCapture from '@shared/components/kyc/LiveSelfieCapture';
import { Card } from '../../components/ui';
import { uploadFile } from '../../lib/upload';

/**
 * Business verification. Four documents are required (Aadhaar both sides, PAN,
 * a live selfie taken in the browser); GST and registration are optional.
 * Submitting all four puts the partner in review; an admin approves or sends
 * it back with a note. Documents are private: previews stream through the API.
 */
const FIELDS = [
  { key: 'aadharFront', label: 'Aadhaar card, front', required: true },
  { key: 'aadharBack', label: 'Aadhaar card, back', required: true },
  { key: 'panCard', label: 'PAN card', required: true },
  { key: 'liveSelfie', label: 'Live selfie', required: true, camera: true, hint: 'Taken now with your camera' },
  { key: 'gstCertificate', label: 'GST certificate', hint: 'Optional' },
  { key: 'businessRegistration', label: 'Business registration', hint: 'Optional: shop act, MSME or similar' },
];

const STATE = {
  approved: { label: 'Verified', tone: 'bg-green-50 text-green-700', Icon: BadgeCheck, text: 'You can publish packages and take bookings.' },
  pending: { label: 'In review', tone: 'bg-amber-50 text-amber-800', Icon: Clock, text: 'We usually respond within 24 hours.' },
  rejected: { label: 'Needs changes', tone: 'bg-red-50 text-red-700', Icon: AlertCircle },
  not_submitted: { label: 'Not submitted', tone: 'bg-sunken text-ink-700', Icon: ShieldCheck, text: 'Upload the four required documents to get verified.' },
};

function DocRow({ field, storedKey, pendingKey, disabled, token, onUploaded }) {
  const [presign] = usePresignUploadMutation();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [camera, setCamera] = useState(false);

  // Preview of an already-submitted document, streamed (never a public link).
  useEffect(() => {
    if (!storedKey || !token || pendingKey) return undefined;
    let cancelled = false;
    let url = null;
    fetch(`${API_BASE}/api/events/partner/kyc/stream/field/${field.key}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => { if (!cancelled && blob) { url = URL.createObjectURL(blob); setPreview(url); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [storedKey, pendingKey, field.key, token]);

  async function take(file) {
    setBusy(true);
    try {
      const key = await uploadFile(presign, file, { folder: 'kyc-docs', maxMb: 10 });
      setPreview(URL.createObjectURL(file));
      onUploaded(field.key, key);
    } catch (e) { toast.error(e?.data?.error || e.message || 'Upload failed'); } finally { setBusy(false); }
  }

  const done = !!(storedKey || pendingKey);
  return (
    <div className="flex items-center gap-3 py-3">
      {camera && (
        <LiveSelfieCapture onCancel={() => setCamera(false)}
          onCapture={(blob) => { setCamera(false); take(new File([blob], 'selfie.jpg', { type: 'image/jpeg' })); }} />
      )}
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-btn border border-line bg-sunken text-ink-500">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : field.camera ? <Camera size={18} /> : field.required ? <IdCard size={18} /> : <FileText size={18} />}
        {done && <CheckCircle2 size={16} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white text-green-600" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink-900">{field.label}{field.required && <span className="text-red-600"> *</span>}</span>
        <span className="block text-[12px] text-ink-500">{pendingKey ? 'Ready to submit' : storedKey ? 'Uploaded' : field.hint || 'Clear photo, all corners visible'}</span>
      </span>
      {!disabled && (field.camera ? (
        <button type="button" onClick={() => setCamera(true)} disabled={busy} className="btn-outline min-h-[38px] px-3 text-[13px]">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {done ? 'Retake' : 'Take selfie'}
        </button>
      ) : (
        <label className="btn-outline min-h-[38px] cursor-pointer px-3 text-[13px]">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {done ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) take(e.target.files[0]); e.target.value = ''; }} />
        </label>
      ))}
    </div>
  );
}

export default function KycSection({ partner, token }) {
  const [updateMe, { isLoading: saving }] = useUpdatePartnerMeMutation();
  const [pending, setPending] = useState({});
  const [pan, setPan] = useState(partner?.kyc?.panNumber || '');
  const [gst, setGst] = useState(partner?.kyc?.gstNumber || '');
  const kyc = partner?.kyc || {};
  const status = kyc.status || 'not_submitted';
  const st = STATE[status] || STATE.not_submitted;
  const locked = status === 'approved' || status === 'pending';

  const required = FIELDS.filter((f) => f.required);
  const doneRequired = required.filter((f) => kyc[f.key] || pending[f.key]).length;
  const ready = doneRequired === required.length;
  const panOk = !pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

  async function submit() {
    if (!ready) return toast.error('Upload all four required documents first');
    if (!panOk) return toast.error('PAN looks wrong. It is 5 letters, 4 digits, 1 letter.');
    try {
      await updateMe({ ...pending, panNumber: pan || undefined, gstNumber: gst || undefined }).unwrap();
      setPending({});
      toast.success('Submitted for review');
    } catch (e) { toast.error(e?.data?.error || 'Could not submit'); }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 text-[15px] font-bold text-ink-900"><ShieldCheck size={18} className="text-zappy-600" /> Verification</p>
        <span className={`chip ${st.tone}`}><st.Icon size={12} /> {st.label}</span>
      </div>
      <div className="p-4">
        <p className="text-[14px] text-ink-500">
          {status === 'rejected' ? `Sent back: ${kyc.reviewNote || 'please re-upload clear documents.'}` : st.text}
        </p>
        {!locked && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[12px] text-ink-500">
              <span>Required documents</span><span className="font-semibold tabular-nums text-ink-900">{doneRequired}/{required.length}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className={`h-full rounded-full ${ready ? 'bg-green-600' : 'bg-zappy-600'}`} style={{ width: `${(doneRequired / required.length) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="mt-2 divide-y divide-line">
          {FIELDS.map((f) => (
            <DocRow key={f.key} field={f} storedKey={kyc[f.key]} pendingKey={pending[f.key]} disabled={locked} token={token}
              onUploaded={(k, key) => setPending((p) => ({ ...p, [k]: key }))} />
          ))}
        </div>
        {!locked && (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">PAN number</span>
                <input className="input w-full font-mono uppercase" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
                {!panOk && <span className="mt-1 block text-[12px] text-red-700">5 letters, 4 digits, 1 letter</span>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">GST number <span className="font-normal text-ink-400">(optional)</span></span>
                <input className="input w-full font-mono uppercase" maxLength={15} value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} placeholder="36ABCDE1234F1Z5" />
              </label>
            </div>
            <button type="button" onClick={submit} disabled={saving || !ready} className="btn-primary mt-4 w-full">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {ready ? 'Submit for review' : `Upload ${required.length - doneRequired} more required`}
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
