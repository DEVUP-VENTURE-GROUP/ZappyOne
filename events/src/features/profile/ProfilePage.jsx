import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Loader2, Camera } from 'lucide-react';
import { selectAuth } from '@shared/modules/auth/authSlice';
import { usePartnerMeQuery, useUpdatePartnerMeMutation, usePresignUploadMutation } from '@shared/services/api';
import { PageHeader, Spinner, Card, Field } from '../../components/ui';
import { uploadFile } from '../../lib/upload';
import PlacePicker from './PlacePicker';
import KycSection from './KycSection';

/** The business customers see, where it works, and its verification. */
export default function ProfilePage() {
  const { accessToken } = useSelector(selectAuth);
  const { data, isLoading } = usePartnerMeQuery();
  const [updateMe, { isLoading: saving }] = useUpdatePartnerMeMutation();
  const [presign] = usePresignUploadMutation();
  const partner = data?.partner;
  const [form, setForm] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!partner) return;
    setForm({
      businessName: partner.businessName || '', ownerName: partner.ownerName || '', bio: partner.bio || '',
      yearsExperience: partner.yearsExperience != null ? String(partner.yearsExperience) : '', cities: partner.cities || [],
      serviceRadiusKm: String(partner.serviceRadiusKm || 30),
    });
  }, [partner?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !form) return <Spinner />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function pickPhoto(file) {
    setUploading(true);
    try {
      const key = await uploadFile(presign, file, { folder: 'profile', maxMb: 5 });
      await updateMe({ profilePhotoKey: key }).unwrap();
      setPhoto(URL.createObjectURL(file));
      toast.success('Photo updated');
    } catch (e) { toast.error(e?.data?.error || e.message || 'Upload failed'); } finally { setUploading(false); }
  }

  async function save() {
    if (form.businessName.trim().length < 2) return toast.error('Add your business name');
    if (!form.cities.length) return toast.error('Choose at least one place you serve');
    try {
      await updateMe({
        businessName: form.businessName.trim(), ownerName: form.ownerName.trim(), bio: form.bio.trim(),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
        cities: form.cities, serviceRadiusKm: Number(form.serviceRadiusKm) || 30,
      }).unwrap();
      toast.success('Profile saved');
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Profile & KYC" subtitle="What customers see about your business." />

      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <label className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-line bg-sunken text-ink-500">
            {(photo || partner.profilePhotoUrl) ? <img src={photo || partner.profilePhotoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[26px] font-bold text-zappy-700">{form.businessName?.[0]?.toUpperCase() || 'P'}</span>}
            <span className="absolute inset-x-0 bottom-0 flex justify-center bg-ink-900/60 py-0.5 text-white">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) pickPhoto(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-ink-900">{form.businessName || 'Your business'}</p>
            <p className="text-[13px] text-ink-500">{partner.phone}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" required><input className="input w-full" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
          <Field label="Your name"><input className="input w-full" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
          <Field label="Years of experience"><input className="input w-full" inputMode="numeric" value={form.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
          <Field label="Travel up to (km)" hint="From your base, for venues within the places you serve.">
            <input className="input w-full" inputMode="numeric" value={form.serviceRadiusKm} onChange={(e) => set('serviceRadiusKm', e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
        </div>
        <Field label="About your business" hint="Your style, the events you do best.">
          <textarea className="input w-full" rows={3} maxLength={600} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink-700">Where you work <span className="text-red-600">*</span></p>
          <PlacePicker value={form.cities} onChange={(v) => set('cities', v)} />
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full sm:w-auto">
          {saving && <Loader2 size={16} className="animate-spin" />} Save profile
        </button>
      </Card>

      <KycSection partner={partner} token={accessToken} />
    </div>
  );
}
