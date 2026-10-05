import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Camera, Loader2, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePresignUploadMutation, useSetAccountPhotoMutation } from '../../services/api';
import { updateProfile } from '../../modules/auth/authSlice';

const FOLDER = { shop: 'shop', event_partner: 'event-photos' };
const MAX_MB = 8;

/**
 * The account's photo with a camera button to change it. One component for
 * every app, saving to the same place, so the photo on the dashboard, in
 * settings and on the setup screen is always the same one.
 *
 *   url    the current photo (account status `photoUrl`)
 *   role   the account type, for where the upload goes
 *   size   circle size in px
 *   label  what the photo is ("Your photo", "Shop photo")
 */
export default function ProfilePhoto({ url, role = 'user', size = 88, label = 'Your photo', onSaved }) {
  const dispatch = useDispatch();
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [presign] = usePresignUploadMutation();
  const [save, { isLoading: saving }] = useSetAccountPhotoMutation();
  const [uploading, setUploading] = useState(false);
  const busy = uploading || saving;

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choose a photo (JPG or PNG).'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`That photo is over ${MAX_MB}MB. Choose a smaller one.`); return; }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const signed = await presign({ folder: FOLDER[role] || 'profile', contentType: file.type, filename: file.name }).unwrap();
      const put = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('upload');
      const st = await save(signed.key).unwrap();
      dispatch(updateProfile({ avatar: st.photoUrl }));
      toast.success('Photo saved');
      onSaved?.(st);
    } catch (err) {
      setPreview(null);
      toast.error(err?.data?.error || 'The photo did not upload. Check your connection and try again.');
    } finally { setUploading(false); }
  }

  const shown = preview || url;
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={shown ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
        className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-zappy-600 focus-visible:ring-offset-2"
        style={{ width: size, height: size }}>
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-line bg-sunken">
          {shown ? <img src={shown} alt={label} className="h-full w-full object-cover" /> : <UserRound size={size * 0.42} className="text-ink-400" />}
        </span>
        <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-zappy-600 text-white">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
      <span className="text-[13px] font-semibold text-zappy-600">{shown ? 'Change photo' : 'Add a photo'}</span>
    </div>
  );
}
