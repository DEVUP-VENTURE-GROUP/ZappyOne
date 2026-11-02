import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { usePresignUploadMutation } from '../../services/api';
import { prepareImage } from '../../utils/prepareImage';

// Square photo tiles with a "+" to add more from gallery or camera; `value` is stored keys, `previews` maps key to a signed URL, `onChange` is a useState setter so parallel uploads never overwrite each other.
export default function PhotoTiles({ value = [], onChange, previews = {}, max = 6, folder = 'menu', size = 'h-20 w-20', label = 'Add photo' }) {
  const input = useRef(null);
  const [presign] = usePresignUploadMutation();
  const [local, setLocal] = useState({});
  const [busy, setBusy] = useState(0);

  async function add(e) {
    const files = [...(e.target.files || [])].slice(0, max - value.length);
    e.target.value = '';
    for (const picked of files) {
      setBusy((n) => n + 1);
      try {
        const file = await prepareImage(picked);
        if (!file) continue;
        if (file.size > 8 * 1024 * 1024) { toast.error('That photo is over 8MB. Pick a smaller one.'); continue; }
        const { uploadUrl, key } = await presign({ folder, contentType: file.type || 'image/jpeg' }).unwrap();
        const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } });
        if (!put.ok) throw new Error('upload');
        setLocal((m) => ({ ...m, [key]: URL.createObjectURL(file) }));
        onChange((cur) => [...(Array.isArray(cur) ? cur : value), key].slice(0, max));
      } catch {
        toast.error('That photo did not upload. Try again.');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((key) => (
        <div key={key} className={`relative ${size} overflow-hidden rounded-btn bg-sunken`}>
          {(local[key] || previews[key]) && <img src={local[key] || previews[key]} alt="" className="h-full w-full object-cover" />}
          <button type="button" onClick={() => onChange((cur) => (Array.isArray(cur) ? cur : value).filter((k) => k !== key))} aria-label="Remove photo"
            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-900/70 text-white"><X size={13} /></button>
        </div>
      ))}
      {busy > 0 && <div className={`grid ${size} place-items-center rounded-btn bg-sunken`}><Loader2 size={18} className="animate-spin text-ink-400" /></div>}
      {value.length + busy < max && (
        <button type="button" onClick={() => input.current?.click()}
          className={`grid ${size} place-items-center rounded-btn border border-dashed border-line-strong bg-white text-ink-500 transition hover:border-zappy-400 hover:text-zappy-700`}>
          <span className="flex flex-col items-center gap-1 text-[11px] font-semibold"><ImagePlus size={18} />{label}</span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple={max > 1} className="hidden" onChange={add} />
    </div>
  );
}
