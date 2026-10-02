import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Loader2, Check, Image as ImageIcon } from 'lucide-react';
import { useShopMeQuery, useUpdateShopMeMutation, usePresignUploadMutation } from '@shared/services/api';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import toast from 'react-hot-toast';
import WeeklyHours, { incompleteDay } from '@shared/components/provider/WeeklyHours';

/*
 * The old hardcoded service menu lived here — thirty tick-boxes a shop could
 * select freely, which meant "services offered" was a claim rather than a fact.
 * A shop's services are now the ones it has been verified for
 * (/provider/onboarding), so this page shows them read-only and links there.
 */

export default function ShopProfilePage() {
  const nav = useNavigate();
  const { data, isLoading } = useShopMeQuery();
  const [updateShop, { isLoading: saving }] = useUpdateShopMeMutation();
  const [presign] = usePresignUploadMutation();

  const [form, setForm] = useState(null);
  const [pickingAddress, setPickingAddress] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  // Local object-URL preview so the just-uploaded photo renders instantly —
  // the S3 key we save isn't viewable directly (private bucket) until the
  // next GET resolves it to a signed URL.
  const [coverPreview, setCoverPreview] = useState(null);

  useEffect(() => {
    if (data?.shop && !form) {
      const s = data.shop;
      setForm({
        businessName: s.businessName || '',
        category: s.category || '',
        services: s.services || [],
        hours: s.hours || [],
        address: s.address?.text || '',
        landmark: s.address?.landmark || '',
        lat: s.address?.location?.coordinates?.[1] ?? '',
        lng: s.address?.location?.coordinates?.[0] ?? '',
        bio: s.bio || '',
        yearsActive: s.yearsActive ?? '',
        coverImageUrl: s.coverImageUrl || '',
      });
    }
  }, [data, form]);

  /**
   * The shop's address, from the map.
   *
   * The two controls this replaces could each produce HALF an address. "Use my
   * current location" set coordinates and no text; the search box set text only
   * if a suggestion was picked. handleSave sends the address only when text AND
   * latitude AND longitude are all present, so a shop that tapped "use my
   * current location" had the whole address block silently dropped from the
   * request — nothing saved, and nothing said.
   *
   * The map picker cannot produce half an address: it reverse-geocodes whatever
   * the pin is on, so confirming always yields both. It is also the same map the
   * customer and the service-area screen use, so an owner meets one map across
   * the product instead of three different ones.
   */
  function applyPickedAddress({ address, lat, lng }) {
    setForm((p) => ({ ...p, address, lat, lng }));
    setPickingAddress(false);
  }

  async function handleCoverUpload(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Image too large — max 5MB');
    try {
      setUploadingCover(true);
      const { data: signed } = await presign({ folder: 'shop', contentType: file.type || 'image/jpeg' });
      await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
      setForm((p) => ({ ...p, coverImageUrl: signed.key }));
      setCoverPreview(URL.createObjectURL(file));
      toast.success('Cover photo uploaded');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSave() {
    if (!form.businessName.trim()) return toast.error('Business name is required');

    // An open day with no times is a promise nobody can keep.
    const badDay = incompleteDay(form.hours);
    if (badDay) return toast.error(`Set opening and closing times for ${badDay}`);

    try {
      await updateShop({
        businessName: form.businessName.trim(),
        category: form.category.trim(),
        hours: form.hours,
        coverImageUrl: form.coverImageUrl || undefined,
        bio: form.bio || undefined,
        yearsActive: form.yearsActive === '' ? undefined : Number(form.yearsActive),
        ...(form.lat !== '' && form.lng !== '' && form.address && {
          address: {
            text: form.address,
            landmark: form.landmark || undefined,
            location: { coordinates: [Number(form.lng), Number(form.lat)] },
          },
        }),
      }).unwrap();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err?.data?.error || 'Failed to update profile');
    }
  }

  if (isLoading || !form) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (pickingAddress) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <LocationPicker
          serviceLabel="Your shop address"
          service="shop"
          onCancel={() => setPickingAddress(false)}
          onConfirm={applyPickedAddress}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-32">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => nav('/shop')} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">Shop Profile</h1>
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">

        {/* Cover photo */}
        <div className="card">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cover Photo</p>
          <label className={`relative block aspect-[16/9] rounded-xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 cursor-pointer ${uploadingCover ? 'opacity-60' : ''}`}>
            {coverPreview || (form.coverImageUrl && form.coverImageUrl.startsWith('http')) ? (
              <img src={coverPreview || form.coverImageUrl} alt="Shop cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-400">
                {uploadingCover ? <Loader2 size={20} className="animate-spin" /> : <ImageIcon size={22} strokeWidth={1.5} />}
                <span className="text-xs font-semibold">{uploadingCover ? 'Uploading…' : 'Upload a photo of your shop'}</span>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingCover} onChange={(e) => handleCoverUpload(e.target.files?.[0])} />
          </label>
        </div>

        {/* Basic info */}
        <div className="card space-y-3">
          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1.5">Business Name <span className="text-red-500">*</span></label>
            <input value={form.businessName} onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
              className="input text-sm w-full" placeholder="e.g. Sharma Mobile Repair" />
          </div>
          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1.5">Category</label>
            <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="input text-sm w-full" placeholder="e.g. Mobile & Laptop Repair" />
          </div>
          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1.5">About your shop</label>
            <textarea rows={3} value={form.bio} onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 resize-none"
              placeholder="Tell customers what makes your shop trustworthy…" />
          </div>
          <div>
            <label className="text-[12px] font-bold text-slate-700 block mb-1.5">Years in business</label>
            <input type="number" min="0" value={form.yearsActive} onChange={(e) => setForm((p) => ({ ...p, yearsActive: e.target.value }))}
              className="input text-sm w-full" placeholder="e.g. 5" />
          </div>
        </div>

        {/* Address */}
        <div className="card space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Shop Address</p>
          <p className="text-[11px] text-slate-400">
            Customers are matched against this pin, so put it on the shop door.
          </p>

          <button
            type="button"
            onClick={() => setPickingAddress(true)}
            className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition ${
              form.address ? 'border-slate-200 bg-white hover:border-indigo-200' : 'border-indigo-300 bg-indigo-50/60'
            }`}
          >
            <MapPin size={15} className={`mt-0.5 shrink-0 ${form.address ? 'text-emerald-600' : 'text-indigo-600'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold leading-snug text-[#0F172A]">
                {form.address || 'Set your shop address on the map'}
              </span>
              {form.lat !== '' && form.lng !== '' && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <Check size={11} /> Pinned
                </span>
              )}
            </span>
            <span className="shrink-0 text-[11px] font-bold text-indigo-600">
              {form.address ? 'Change' : 'Set'}
            </span>
          </button>

          <input value={form.landmark} onChange={(e) => setForm((p) => ({ ...p, landmark: e.target.value }))}
            className="input text-sm w-full" placeholder="Landmark (optional)" />
        </div>

        {/* Opening hours */}
        <div className="card">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Opening Hours</p>
          <p className="mt-0.5 mb-3 text-[11px] text-slate-400">
            Customers see these before booking. A day left closed takes no bookings.
          </p>
          <WeeklyHours hours={form.hours} onChange={(hours) => setForm((p) => ({ ...p, hours }))} />
        </div>

        {/* What you're verified for — read-only on purpose, see the note above. */}
        <div className="card">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Services You Offer</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            Set by verification, not by this form — customers rely on it meaning something.
          </p>
          <button
            type="button"
            onClick={() => nav('/provider/onboarding')}
            className="btn-secondary w-full mt-3 text-sm"
          >
            Manage services &amp; verification
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 z-30 bg-white border-t border-slate-100 safe-pb bottom-[var(--frame-bottom,0px)] left-[var(--frame-left,0px)]">
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-3 pb-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
