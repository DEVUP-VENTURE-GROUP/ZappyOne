import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MapPin } from 'lucide-react';
import { useEditJobPlaceMutation } from '@shared/services/api';
import LocationPicker from '@shared/modules/booking/LocationPicker';

// Edit on booking details: fix the address words, add door directions, or nudge the pin (server caps the move; jobs/place-edit).
export default function EditPlaceSheet({ job, place, onClose, onSaved }) {
  const [address, setAddress] = useState(job.place?.address || '');
  const [directions, setDirections] = useState('');
  const [pin, setPin] = useState(null);
  const [picking, setPicking] = useState(false);
  const [save, { isLoading }] = useEditJobPlaceMutation();
  const directionsOn = job.kind === 'repair';

  async function submit() {
    try {
      const r = await save({ id: job.id, address, ...(directionsOn && directions ? { directions } : {}), ...(pin ? { lat: pin.lat, lng: pin.lng } : {}) }).unwrap();
      toast.success(r.message);
      onSaved?.();
      onClose();
    } catch (err) { toast.error(err?.data?.error || 'Could not save that. Try again.'); }
  }

  if (picking) {
    return (
      <div className="fixed inset-0 z-[150] bg-white">
        <LocationPicker serviceLabel={job.service} onCancel={() => setPicking(false)}
          onConfirm={(l) => { setPin({ lat: l.lat, lng: l.lng }); if (l.address) setAddress(l.address); setPicking(false); }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-2xl rounded-t-[24px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="text-[18px] font-extrabold text-ink-900">Edit address</p>
        <p className="mt-1 text-[13px] text-ink-500">You can move the pin up to {place?.maxMoveM || 500} m. For a different address, cancel and book again.</p>
        <label className="mt-4 block text-[12.5px] font-semibold text-ink-700" htmlFor="ep-address">Address</label>
        <textarea id="ep-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={300}
          className="mt-1 w-full rounded-btn border border-line px-3 py-2.5 text-[14px] text-ink-900 outline-none focus:border-zappy-600" />
        {directionsOn && (
          <>
            <label className="mt-3 block text-[12.5px] font-semibold text-ink-700" htmlFor="ep-dir">Door directions (optional)</label>
            <input id="ep-dir" value={directions} onChange={(e) => setDirections(e.target.value)} maxLength={200} placeholder="Gate 2, third floor, blue door"
              className="mt-1 h-11 w-full rounded-btn border border-line px-3 text-[14px] text-ink-900 outline-none focus:border-zappy-600" />
          </>
        )}
        <button type="button" onClick={() => setPicking(true)} className="mt-3 flex items-center gap-2 text-[14px] font-bold text-zappy-700">
          <MapPin size={16} /> {pin ? 'Pin moved. Move again' : 'Move the pin'}
        </button>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1">Keep as is</button>
          <button type="button" onClick={submit} disabled={isLoading || !address.trim()} className="btn-primary flex-1 disabled:opacity-50">
            {isLoading && <Loader2 size={16} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
