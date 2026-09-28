import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Loader2, Check, Image as ImageIcon } from 'lucide-react';
import { useShopMeQuery, useUpdateShopMeMutation, usePresignUploadMutation } from '@shared/services/api';
import LocationPicker from '@shared/modules/booking/LocationPicker';
import toast from 'react-hot-toast';

/*
 * Days of the week, indexed to match Date#getDay() and the shop's `hours` rows.
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/*
 * The old hardcoded service menu lived here — thirty tick-boxes a shop could
 * select freely, which meant "services offered" was a claim rather than a fact.
 * A shop's services are now the ones it has been verified for
 * (/provider/onboarding), so this page shows them read-only and links there.
 */

/**
 * A time, in hours, minutes and AM/PM.
 *
 * Replaces `<input type="time">`, whose 12-hour-versus-24-hour rendering is
 * decided by the BROWSER's locale, not by us. On a machine set to a 24-hour
 * locale there is no AM/PM segment at all, so a shop owner who thinks in
 * "9 to 9" had no way to express it and no way to tell 9am from 9pm.
 *
 * Three explicit controls always show the meridiem, on every machine. The value
 * crossing the wire is unchanged — "HH:MM" in 24-hour time, which is what the
 * server's schema validates and what `isOpenAt` compares against — so this is
 * purely how the number is entered, not how it is stored.
 */
const MINUTE_STEPS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function to12Hour(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return { hour: '', minute: '', meridiem: 'AM' };
  const [h, m] = value.split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: String(hour12), minute: String(m).padStart(2, '0'), meridiem };
}

function to24Hour({ hour, minute, meridiem }) {
  if (!hour) return '';
  let h = Number(hour) % 12;
  if (meridiem === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${minute || '00'}`;
}

/**
 * The day a shop has actually just described, read back to them.
 *
 * A picker shows what you chose; it does not show what you MEANT. "8:00 AM to
 * 12:00 PM · 4 hours" makes a mistyped meridiem obvious at a glance, where two
 * dropdowns reading "12" and "PM" look perfectly reasonable.
 */
function dayLength(opensAt, closesAt) {
  const mins = (t) => {
    if (!/^\d{2}:\d{2}$/.test(t || '')) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const from = mins(opensAt);
  const to = mins(closesAt);
  if (from == null || to == null) return null;

  // A closing time at or before the opening time runs past midnight.
  const span = to > from ? to - from : (24 * 60 - from) + to;
  const h = Math.floor(span / 60);
  const m = span % 60;
  return {
    label: [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min',
    overnight: to <= from,
    // Under three hours is legal but unusual, and is what a meridiem slip
    // actually looks like — so it is worth a gentle second glance.
    short: span > 0 && span < 180,
  };
}

function TimeField({ value, disabled, onChange, label }) {
  const parts = to12Hour(value);
  const cls = 'rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40';

  // Picking an hour on an empty field should not leave it half-set.
  const patch = (next) => onChange(to24Hour({ ...parts, ...next, minute: next.minute ?? parts.minute ?? '00' }));

  return (
    <span className="flex items-center gap-1" aria-label={label}>
      <select
        value={parts.hour}
        disabled={disabled}
        onChange={(e) => patch({ hour: e.target.value })}
        className={cls}
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-xs font-bold text-slate-300">:</span>
      <select
        value={parts.minute || '00'}
        disabled={disabled || !parts.hour}
        onChange={(e) => patch({ minute: e.target.value })}
        className={cls}
      >
        {MINUTE_STEPS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        value={parts.meridiem}
        disabled={disabled || !parts.hour}
        onChange={(e) => patch({ meridiem: e.target.value })}
        className={cls}
      >
        {/*
          * Twelve is the one hour where AM/PM genuinely confuses people, and it
          * confused a real shop owner: they set "8 AM to 12 PM" meaning midnight
          * and unknowingly published a four-hour day, then could not understand
          * why customers saw them closed all afternoon.
          */}
        <option value="AM">{parts.hour === '12' ? 'AM (midnight)' : 'AM'}</option>
        <option value="PM">{parts.hour === '12' ? 'PM (noon)' : 'PM'}</option>
      </select>
    </span>
  );
}

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

  /** Update one weekday, creating its row the first time it is touched. */
  function setHour(day, patch) {
    setForm((p) => {
      const rows = [...p.hours];
      const at = rows.findIndex((h) => h.day === day);
      const base = at >= 0 ? rows[at] : { day, opensAt: '', closesAt: '', isClosed: false };
      const nextRow = { ...base, ...patch };
      if (at >= 0) rows[at] = nextRow; else rows.push(nextRow);
      return { ...p, hours: rows };
    });
  }

  /** Most shops keep one weekday schedule — set it once rather than six times. */
  function applyWeekdayHours() {
    const template = form.hours.find((h) => !h.isClosed && h.opensAt && h.closesAt);
    if (!template) return toast.error('Set one day first, then apply it to the rest');
    setForm((p) => ({
      ...p,
      hours: [1, 2, 3, 4, 5, 6].map((day) => ({
        day, opensAt: template.opensAt, closesAt: template.closesAt, isClosed: false,
      })).concat(p.hours.filter((h) => h.day === 0)),
    }));
    toast.success('Applied Monday to Saturday');
  }

  async function handleSave() {
    if (!form.businessName.trim()) return toast.error('Business name is required');

    // An open day with no times is a promise nobody can keep.
    const badDay = form.hours.find((h) => !h.isClosed && (!h.opensAt || !h.closesAt));
    if (badDay) return toast.error(`Set opening and closing times for ${DAYS[badDay.day]}`);

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
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Opening Hours</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Customers see these before booking. A day left closed takes no bookings.
              </p>
            </div>
            <button
              type="button"
              onClick={applyWeekdayHours}
              className="shrink-0 text-[11px] font-bold text-indigo-600"
            >
              Apply Mon–Sat
            </button>
          </div>

          <div className="mt-3 space-y-1.5">
            {DAYS.map((label, day) => {
              const row = form.hours.find((h) => h.day === day) || { day, opensAt: '', closesAt: '', isClosed: true };
              return (
                /* Day and toggle lead; the times wrap beneath on a narrow screen. */
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <span className="w-9 shrink-0 text-xs font-bold text-slate-600">{label}</span>
                  <button
                    type="button"
                    onClick={() => setHour(day, { isClosed: !row.isClosed })}
                    className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                      row.isClosed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {row.isClosed ? 'Closed' : 'Open'}
                  </button>

                  {row.isClosed ? (
                    <span className="text-[11.5px] text-slate-400">Not open this day</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <TimeField
                        label={`${label} opens at`}
                        value={row.opensAt}
                        onChange={(v) => setHour(day, { opensAt: v })}
                      />
                      <span className="px-0.5 text-xs text-slate-400">to</span>
                      <TimeField
                        label={`${label} closes at`}
                        value={row.closesAt}
                        onChange={(v) => setHour(day, { closesAt: v })}
                      />
                      {(() => {
                        const len = dayLength(row.opensAt, row.closesAt);
                        if (!len) return null;
                        return (
                          <span className={`text-[11px] font-semibold ${
                            len.short ? 'text-amber-600' : 'text-slate-400'
                          }`}>
                            {len.overnight ? 'overnight · ' : ''}{len.label}
                            {len.short ? ' — is that right?' : ''}
                          </span>
                        );
                      })()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
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

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-pb">
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-3 pb-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
