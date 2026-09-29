import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Pause, Play, X, Repeat } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMyPetRecurringQuery, usePausePetRecurringMutation, useResumePetRecurringMutation,
  useCancelPetRecurringMutation,
} from '@shared/services/api';

/** Recurring care (§32) — pause, resume, cancel a standing schedule. */
export default function PetRecurringPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useMyPetRecurringQuery();
  const [pause] = usePausePetRecurringMutation();
  const [resume] = useResumePetRecurringMutation();
  const [cancelSchedule] = useCancelPetRecurringMutation();

  const schedules = data?.schedules || [];

  async function act(fn, id, label) {
    try {
      await fn(id).unwrap();
      toast.success(label);
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not update');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">Recurring Care</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5">
        {isLoading && <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>}
        {!isLoading && !schedules.length && (
          <div className="text-center py-12 text-slate-400">
            <Repeat size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No recurring schedule yet. Set one up from a booking's confirmation screen.</p>
          </div>
        )}

        {schedules.map((s) => (
          <div key={s._id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-[#0F172A] capitalize">{s.categoryCode.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-500 capitalize">{s.frequency.replace('_', ' ')} at {s.timeOfDay}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-1 ${
                s.status === 'active' ? 'bg-emerald-100 text-emerald-700'
                  : s.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}>{s.status}</span>
            </div>
            <p className="text-xs text-slate-400">{s.occurrencesCreated} scheduled · {s.occurrencesCompleted} completed</p>

            {s.status !== 'cancelled' && s.status !== 'completed' && (
              <div className="flex gap-2 pt-1">
                {s.status === 'active' ? (
                  <button type="button" onClick={() => act(pause, s._id, 'Paused')}
                    className="flex-1 rounded-xl border-2 border-slate-200 font-bold py-2 text-xs flex items-center justify-center gap-1.5">
                    <Pause size={12} /> Pause
                  </button>
                ) : (
                  <button type="button" onClick={() => act(resume, s._id, 'Resumed')}
                    className="flex-1 rounded-xl border-2 border-emerald-200 text-emerald-700 font-bold py-2 text-xs flex items-center justify-center gap-1.5">
                    <Play size={12} /> Resume
                  </button>
                )}
                <button type="button" onClick={() => act(cancelSchedule, s._id, 'Cancelled')}
                  className="flex-1 rounded-xl border-2 border-red-200 text-red-600 font-bold py-2 text-xs flex items-center justify-center gap-1.5">
                  <X size={12} /> Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
