import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Camera, Film, Loader2, Plus, X } from 'lucide-react';
import {
  usePartnerThemesQuery, useCreateEventThemeMutation, useUpdateEventThemeMutation,
  useGetEventCategoriesQuery, usePresignUploadMutation, usePartnerMeQuery, usePartnerEarningsQuery,
} from '@shared/services/api';
import { Spinner, Card, Field } from '../../components/ui';
import { uploadFile } from '../../lib/upload';
import PlacePicker from '../profile/PlacePicker';
import { EDITABLE, EMPTY_PACKAGE as EMPTY, packageForm, packageProblems, packageBody } from '@shared/events/partnerBookings';

/**
 * Create or edit a package. Media are uploaded files only: a cover photo,
 * up to 12 more photos and one short video. The price is the all-in price the
 * customer pays; the partner sees what they keep before saving.
 */
export default function PackageEditorPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const nav = useNavigate();
  const { data: themes, isLoading } = usePartnerThemesQuery(undefined, { skip: !isEdit });
  const { data: cats } = useGetEventCategoriesQuery();
  const { data: me } = usePartnerMeQuery();
  const { data: earnings } = usePartnerEarningsQuery();
  const [create, { isLoading: creating }] = useCreateEventThemeMutation();
  const [update, { isLoading: updating }] = useUpdateEventThemeMutation();
  const [presign] = usePresignUploadMutation();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const theme = isEdit ? themes?.themes?.find((t) => t._id === id) : null;
  useEffect(() => {
    if (!theme) return;
    setForm(packageForm(theme));
  }, [theme?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new partner's areas are the sensible default for a new package.
  useEffect(() => {
    if (!isEdit && me?.partner?.cities?.length && !form.cities.length) set('cities', me.partner.cities);
  }, [me?.partner?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isEdit && isLoading) return <Spinner />;
  if (isEdit && !theme) return <p className="py-16 text-center text-ink-500">Package not found.</p>;
  if (theme && !EDITABLE.includes(theme.status)) {
    return <p className="py-16 text-center text-ink-500">This package is live. Contact support to change it.</p>;
  }

  async function upload(file, kind) {
    const isVideo = kind === 'video';
    if (isVideo && !/^video\//.test(file.type)) return toast.error('Choose a video file (MP4, MOV or WebM)');
    if (!isVideo && !/^image\//.test(file.type)) return toast.error('Choose a photo');
    setBusy(kind);
    try {
      const key = await uploadFile(presign, file, { folder: 'event-photos', maxMb: isVideo ? 50 : 10 });
      const item = { key, url: URL.createObjectURL(file) };
      if (kind === 'cover') set('cover', item);
      else if (kind === 'video') set('video', item);
      else setForm((f) => ({ ...f, gallery: [...f.gallery, item].slice(0, 12) }));
    } catch (e) { toast.error(e?.data?.error || e.message || 'Upload failed'); } finally { setBusy(''); }
  }

  const price = Number(form.price) || 0;
  // The live rate; each booking freezes the rate it is made at.
  const pct = earnings?.commissionPct ?? 10;
  const problems = packageProblems(form);

  async function save() {
    if (problems.length) return toast.error(`Add ${problems[0]}`);
    const body = packageBody(form);
    try {
      if (isEdit) await update({ id, ...body }).unwrap(); else await create(body).unwrap();
      toast.success(isEdit ? 'Saved. It goes live after review.' : 'Package sent for review. We usually respond within a day.');
      nav('/partner/packages');
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <Link to="/partner/packages" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-700"><ArrowLeft size={16} /> Packages</Link>
      <h1 className="text-[22px] font-bold text-ink-900">{isEdit ? 'Edit package' : 'New package'}</h1>

      <Card className="space-y-4 p-4">
        <p className="text-[15px] font-bold text-ink-900">Photos and video</p>
        <MediaTile label="Cover photo" required item={form.cover} busy={busy === 'cover'} accept="image/*" onFile={(f) => upload(f, 'cover')} onClear={() => set('cover', null)} wide />
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink-700">More photos <span className="font-normal text-ink-400">({form.gallery.length}/12)</span></p>
          <div className="flex flex-wrap gap-2">
            {form.gallery.map((g, i) => (
              <span key={g.key} className="relative">
                <img src={g.url} alt="" className="h-20 w-20 rounded-btn border border-line object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => set('gallery', form.gallery.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-white"><X size={12} /></button>
              </span>
            ))}
            {form.gallery.length < 12 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-btn border border-dashed border-line-strong text-[11px] text-ink-500 hover:bg-canvas">
                {busy === 'gallery' ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Add
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0], 'gallery'); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
        <MediaTile label="Short video (optional, up to 50MB)" item={form.video} busy={busy === 'video'} accept="video/mp4,video/webm,video/quicktime" video onFile={(f) => upload(f, 'video')} onClear={() => set('video', null)} />
      </Card>

      <Card className="space-y-4 p-4">
        <Field label="Title" required>
          <input className="input w-full" maxLength={100} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Pastel birthday backdrop with balloon arch" />
        </Field>
        <Field label="Category" required>
          <select className="input w-full" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Choose…</option>
            {(cats?.categories || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Description" hint="Colours, mood, the space it suits.">
          <textarea className="input w-full" rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <Field label="Price the customer pays (₹)" required hint={price ? `You keep about ₹${Math.round(price * (100 - pct) / 100).toLocaleString('en-IN')}.` : 'All-in: setup, materials and travel within the places you serve.'}>
          <input className="input w-full" inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} placeholder="4999" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Setup time (hours)">
            <input className="input w-full" inputMode="decimal" value={form.setupHours} onChange={(e) => set('setupHours', e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field label="Up to guests">
            <input className="input w-full" inputMode="numeric" value={form.guestsMax} onChange={(e) => set('guestsMax', e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <ListInput label="What's included" required value={form.included} onChange={(v) => set('included', v)} placeholder="e.g. 60 balloons, backdrop, name banner" />
        <ListInput label="Not included" value={form.excluded} onChange={(v) => set('excluded', v)} placeholder="e.g. Cake, photographer" />
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-[15px] font-bold text-ink-900">Where you offer it <span className="text-red-600">*</span></p>
        <PlacePicker value={form.cities} onChange={(v) => set('cities', v)} />
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] z-20 border-t border-line bg-white p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <button type="button" onClick={save} disabled={creating || updating || !!busy} className="btn-primary mx-auto w-full max-w-5xl">
          {(creating || updating) && <Loader2 size={16} className="animate-spin" />}
          {isEdit ? 'Save and send for review' : 'Send for review'}
        </button>
      </div>
    </div>
  );
}

function MediaTile({ label, required, item, busy, accept, onFile, onClear, video = false, wide = false }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink-700">{label}{required && <span className="text-red-600"> *</span>}</p>
      {item ? (
        <div className={`relative overflow-hidden rounded-btn border border-line bg-sunken ${wide ? 'aspect-[16/9]' : 'aspect-video max-w-sm'}`}>
          {video ? <video src={item.url} controls className="h-full w-full object-cover" /> : <img src={item.url} alt="" className="h-full w-full object-cover" />}
          <button type="button" onClick={onClear} aria-label="Remove" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink-900/80 text-white"><X size={15} /></button>
        </div>
      ) : (
        <label className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-btn border border-dashed border-line-strong bg-white text-[13px] text-ink-500 hover:bg-canvas ${wide ? 'aspect-[16/9]' : 'aspect-video max-w-sm'}`}>
          {busy ? <Loader2 size={22} className="animate-spin text-zappy-600" /> : video ? <Film size={22} /> : <Camera size={22} />}
          {busy ? 'Uploading…' : video ? 'Upload a video' : 'Upload a photo'}
          <input type="file" accept={accept} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

function ListInput({ label, required, value, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts].slice(0, 30));
    setDraft('');
  };
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-ink-700">{label}{required && <span className="text-red-600"> *</span>}</p>
      <div className="flex gap-2">
        <input className="input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="btn-outline px-4">Add</button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v, i) => (
            <span key={`${v}-${i}`} className="chip bg-sunken text-ink-700">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
