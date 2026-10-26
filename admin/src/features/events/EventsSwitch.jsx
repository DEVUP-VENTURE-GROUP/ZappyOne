import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAdminFeatureFlagsQuery, useAdminSetFeatureFlagMutation } from '@shared/services/api';

// One click shows or hides all of Events for customers (feature flag 'events'); bookings already made carry on.
export default function EventsSwitch() {
  const { data } = useAdminFeatureFlagsQuery();
  const [setFlag, { isLoading }] = useAdminSetFeatureFlagMutation();
  const [confirm, setConfirm] = useState(false);
  const flag = (data?.flags || []).find((f) => f.key === 'events');
  if (!flag) return null;
  const on = flag.enabled;

  async function flip() {
    try {
      await setFlag({ flag: 'events', enabled: !on }).unwrap();
      toast.success(on ? 'Events hidden from customers' : 'Events visible to customers');
      setConfirm(false);
    } catch (e) { toast.error(e?.data?.error || 'Could not change it'); }
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${on ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{on ? 'Events are visible to customers' : 'Events are hidden from customers'}</p>
        <p className="text-[12px] text-slate-500">{on ? 'Home section, banner, occasions and booking are on.' : 'Nothing about Events shows and no new booking is taken. Bookings already made carry on.'} Changes reach everyone within 15 seconds.</p>
      </div>
      {confirm ? (
        <span className="flex items-center gap-2">
          <span className="text-xs text-slate-600">{on ? 'Hide Events for every customer?' : 'Show Events to every customer?'}</span>
          <button type="button" onClick={flip} disabled={isLoading} className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white ${on ? 'bg-amber-600' : 'bg-emerald-600'}`}>
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : on ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="text-xs text-slate-500">Cancel</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${on ? 'bg-white text-amber-700 ring-1 ring-amber-200' : 'bg-emerald-600 text-white'}`}>
          {on ? 'Hide all Events' : 'Show Events'}
        </button>
      )}
    </div>
  );
}
