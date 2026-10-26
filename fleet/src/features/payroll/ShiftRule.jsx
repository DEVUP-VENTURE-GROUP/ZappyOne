import toast from 'react-hot-toast';
import { useAdminWorkforceSettingsQuery, useAdminSaveWorkforceSettingsMutation } from '@shared/services/api';

// Whether staff need a booked, checked-in shift to be offered jobs (workforce shiftRequired); off, being online is enough.
export default function ShiftRule() {
  const { data } = useAdminWorkforceSettingsQuery();
  const [save, { isLoading }] = useAdminSaveWorkforceSettingsMutation();
  const s = data?.settings;
  if (!s) return null;
  const on = !!s.shiftRequired;
  const flip = () => save({ shiftRequired: !on }).unwrap()
    .then(() => toast.success(on ? 'Shifts are optional: online staff get jobs' : 'Staff now need a checked-in shift to get jobs'))
    .catch((e) => toast.error(e?.data?.error || 'Could not save'));
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{on ? 'Shifts required' : 'Shifts optional'}</span>
        <span className="block text-[12px] text-slate-500">{on ? 'Staff get jobs only while checked in on a shift.' : 'Any staff member who is online gets jobs, shift or not. Good while testing.'}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} onClick={flip} disabled={isLoading}
        className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-blue-600' : 'bg-slate-300'} disabled:opacity-50`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </section>
  );
}
