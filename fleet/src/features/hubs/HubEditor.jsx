import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import { useAdminCreateHubMutation, useAdminUpdateHubMutation } from '@shared/services/api';
import { Card, FormRow, Input, SaveBtn } from '@admin/ui/kit';
import HubMap from './HubMap';

const BLANK_SHIFT = { code: '', label: '', start: '09:00', end: '18:00', need: 2 };

/** Create or edit a hub (dark store): where it is, how close check-in must be, how far it serves, its shifts. */
export default function HubEditor({ hub, others = [], onDone }) {
  const [form, setForm] = useState(() => ({
    name: hub?.name || '', city: hub?.city || 'Hyderabad', address: hub?.meetingPoint?.address || '',
    lat: hub?.meetingPoint?.location?.coordinates?.[1] ?? null, lng: hub?.meetingPoint?.location?.coordinates?.[0] ?? null,
    radiusM: hub?.radiusM ?? 200, serviceKm: hub?.serviceKm ?? 8, isActive: hub?.isActive ?? true,
    area: hub?.area?.coordinates?.[0]?.slice(0, -1) || [],
    shifts: hub?.shifts?.length ? hub.shifts : [{ code: 'morning', label: 'Morning', start: '08:00', end: '14:00', need: 3 }, { code: 'evening', label: 'Evening', start: '14:00', end: '21:00', need: 3 }],
  }));
  const [create, { isLoading: creating }] = useAdminCreateHubMutation();
  const [update, { isLoading: updating }] = useAdminUpdateHubMutation();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setShift = (i, k, v) => setForm((f) => ({ ...f, shifts: f.shifts.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const valid = form.name.trim() && form.city.trim() && form.lat != null && (form.area.length === 0 || form.area.length >= 3) && form.shifts.every((s) => s.code && s.label && /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end));

  async function save() {
    const area = form.area.length >= 3 ? form.area : (hub?.area ? null : undefined);
    const body = { ...form, area, radiusM: Number(form.radiusM), serviceKm: Number(form.serviceKm), shifts: form.shifts.map((s) => ({ ...s, code: s.code.trim().toLowerCase().replace(/\s+/g, '-'), need: Number(s.need) })) };
    try {
      if (hub?._id) await update({ id: hub._id, ...body }).unwrap(); else await create(body).unwrap();
      toast.success('Hub saved'); onDone();
    } catch (e) { toast.error(e?.data?.error || 'Could not save the hub'); }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Hub name"><Input value={form.name} onChange={set('name')} placeholder="Madhapur" maxLength={60} /></FormRow>
        <FormRow label="City"><Input value={form.city} onChange={set('city')} maxLength={40} /></FormRow>
      </div>
      <FormRow label="Meeting point and service area" hint="Click the map where staff meet; they check in there with a selfie. Then draw the area this hub serves, or leave it to the radius below.">
        <div className="space-y-2">
          <HubMap lat={form.lat} lng={form.lng} radiusM={Number(form.radiusM)} serviceKm={Number(form.serviceKm)} area={form.area} others={others}
            onPick={({ lat, lng }) => setForm((f) => ({ ...f, lat, lng }))} onArea={(area) => setForm((f) => ({ ...f, area }))} />
          <Input value={form.address} onChange={set('address')} maxLength={300} placeholder="Landmark or address staff will recognise" />
        </div>
      </FormRow>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Check-in radius (metres)" hint="How close to the meeting point check-in must be."><Input type="number" min={50} max={2000} value={form.radiusM} onChange={set('radiusM')} /></FormRow>
        <FormRow label="Serves up to (km)" hint={form.area.length >= 3 ? 'Not used while an area is drawn.' : 'Orders within this distance of the meeting point go to this hub’s staff.'}><Input type="number" min={1} max={50} value={form.serviceKm} onChange={set('serviceKm')} /></FormRow>
      </div>
      <FormRow label="Shifts" hint="Staff book these; the number is how many people each shift needs.">
        <div className="space-y-2">
          {form.shifts.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_88px_88px_72px_auto] items-center gap-2">
              <Input value={s.label} onChange={(e) => { setShift(i, 'label', e.target.value); if (!hub?._id) setShift(i, 'code', e.target.value); }} placeholder="Morning" maxLength={40} aria-label="Shift name" />
              <Input type="time" value={s.start} onChange={(e) => setShift(i, 'start', e.target.value)} aria-label="Starts" />
              <Input type="time" value={s.end} onChange={(e) => setShift(i, 'end', e.target.value)} aria-label="Ends" />
              <Input type="number" min={0} max={200} value={s.need} onChange={(e) => setShift(i, 'need', e.target.value)} aria-label="People needed" />
              <button type="button" onClick={() => setForm((f) => ({ ...f, shifts: f.shifts.filter((_, j) => j !== i) }))} aria-label="Remove shift" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
            </div>
          ))}
          {form.shifts.length < 8 && (
            <button type="button" onClick={() => setForm((f) => ({ ...f, shifts: [...f.shifts, { ...BLANK_SHIFT }] }))} className="flex items-center gap-1.5 text-sm font-semibold text-blue-700"><Plus size={14} /> Add a shift</button>
          )}
        </div>
      </FormRow>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="h-4 w-4" /> Open</label>
      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <SaveBtn loading={creating || updating} onClick={valid ? save : undefined}>{hub?._id ? 'Save hub' : 'Create hub'}</SaveBtn>
        <button type="button" onClick={onDone} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
      </div>
    </Card>
  );
}
