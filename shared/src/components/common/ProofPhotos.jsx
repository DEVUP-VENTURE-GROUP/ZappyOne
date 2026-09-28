import { useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, CheckCircle, Loader2 } from 'lucide-react';
import { usePresignUploadMutation } from '../../services/api';
import toast from 'react-hot-toast';

/**
 * Photographs of the finished work, taken before a job can be closed.
 *
 * This is WorkerJobPage's panel, lifted out whole rather than reinvented — the
 * repair flow needs exactly the same evidence for a device it has just opened,
 * and a second implementation would mean two sets of upload rules to keep true.
 *
 * The rule that matters is at the bottom: a photo whose upload FAILED must not
 * count. Each entry holds one of three states — uploading, stored, failed —
 * because treating a failed upload as done means a job closed with evidence
 * that exists only on a phone in someone's pocket, and a dispute a week later
 * with nothing to show. `readyKeys` returns only what is genuinely in storage.
 *
 * `onChange` is a useState setter: this component updates functionally so two
 * photos uploading at once cannot overwrite each other's result.
 */
export default function ProofPhotos({
  photos,
  onChange,
  folder = 'order-proof',
  max = 3,
  title,
  hint,
  requiredNote = 'Minimum 1 photo required before marking complete',
}) {
  const inputRef = useRef(null);
  const [presign] = usePresignUploadMutation();

  const ready = readyKeys(photos).length;

  const capture = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const id = Date.now();
    const preview = URL.createObjectURL(file);
    onChange((prev) => {
      if (prev.length >= max) {
        toast.error(`Maximum ${max} photos allowed`);
        return prev;
      }
      return [...prev, { id, preview, key: null, uploading: true }];
    });

    try {
      const { uploadUrl, key } = await presign({
        folder,
        contentType: file.type || 'image/jpeg',
      }).unwrap();

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });

      onChange((prev) => prev.map((p) => (p.id === id ? { ...p, key, uploading: false } : p)));
    } catch {
      /* Upload to S3 failed — mark with error so completion stays blocked.
         Most often this is a network or permissions block on the upload host,
         not a bad photo, so don't send them round in circles retaking it. */
      onChange((prev) => prev.map((p) => (
        p.id === id ? { ...p, key: null, uploading: false, error: true } : p
      )));
      toast.error('Could not upload the photo. Check your connection and try again — if it keeps failing, contact support.');
    }
  }, [onChange, presign, folder, max]);

  function remove(id) {
    onChange((prev) => prev.filter((p) => p.id !== id));
  }

  const done = ready > 0;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      style={{
        background: done
          ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
          : 'linear-gradient(135deg, #faf5ff, #f3e8ff)',
        border: done
          ? '1px solid rgba(34,197,94,0.25)'
          : '1px solid rgba(139,92,246,0.2)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <motion.div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
            done ? 'bg-green-100' : 'bg-violet-100'
          }`}
          animate={!done ? {
            boxShadow: ['0 0 0 0px rgba(139,92,246,0.3)', '0 0 0 8px rgba(139,92,246,0)', '0 0 0 0px rgba(139,92,246,0)'],
          } : {}}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          {done
            ? <CheckCircle size={20} strokeWidth={2} className="text-green-600" />
            : <Camera size={20} strokeWidth={1.75} className="text-violet-600" />}
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-extrabold ${done ? 'text-green-800' : 'text-violet-900'}`}>
            {done ? 'Proof photos ready' : (title || 'Add proof-of-work photos')}
          </p>
          <p className={`text-[11px] font-medium mt-0.5 ${done ? 'text-green-600' : 'text-violet-500'}`}>
            {done
              ? `${ready} photo${ready > 1 ? 's' : ''} uploaded — you can add ${max - photos.length} more`
              : (hint || requiredNote)}
          </p>
        </div>
        {/* Counter pill */}
        <div className={`px-2.5 py-1 rounded-full text-xs font-extrabold shrink-0 ${
          done ? 'bg-green-500 text-white' : 'bg-violet-200 text-violet-700'
        }`}>
          {ready}/{max}
        </div>
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square">
              <img src={photo.preview} alt="Proof"
                className={`w-full h-full object-cover rounded-2xl ${
                  photo.error ? 'ring-2 ring-red-400' : photo.uploading ? 'ring-2 ring-violet-300' : 'ring-2 ring-green-400'
                }`}
                style={{ boxShadow: photo.error ? '0 4px 12px rgba(239,68,68,0.25)' : '0 4px 12px rgba(0,0,0,0.12)' }}
              />
              {photo.uploading ? (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex flex-col items-center justify-center gap-1">
                  <Loader2 size={18} className="text-white animate-spin" />
                  <p className="text-[9px] text-white font-bold">Uploading…</p>
                </div>
              ) : (
                <>
                  {/* A failed upload is marked, not hidden — it must never be
                      mistaken for evidence that exists. */}
                  <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow ${
                    photo.error ? 'bg-red-500' : 'bg-green-500'
                  }`}>
                    {photo.error
                      ? <X size={10} strokeWidth={3} className="text-white" />
                      : <CheckCircle size={11} strokeWidth={3} className="text-white" />}
                  </div>
                  <button onClick={() => remove(photo.id)}
                    className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <X size={9} strokeWidth={3} className="text-white" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add photo button */}
      {photos.length < max && (
        <div className="px-4 pb-4">
          <input ref={inputRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={capture} />
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full py-3 rounded-xl bg-white text-violet-700 font-bold text-sm ring-1 ring-violet-200 flex items-center justify-center gap-2"
          >
            <Camera size={17} strokeWidth={2} />
            <span>{photos.length === 0 ? 'Take Proof Photo' : 'Add Another Photo'}</span>
            {photos.length === 0 && (
              <span className="ml-1 text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full">Required</span>
            )}
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Only photos genuinely in storage. Never send a preview URL as evidence. */
export function readyKeys(photos = []) {
  return photos.filter((p) => p.key && !p.uploading && !p.error).map((p) => p.key);
}

/** Is anything still in flight or broken? Blocks completion while true. */
export function photosSettled(photos = []) {
  return !photos.some((p) => p.uploading) && !photos.some((p) => p.error);
}
