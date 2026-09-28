import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, PawPrint } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAvailablePetBookingsQuery, useAcceptPetBookingMutation, useAssignedPetBookingsQuery } from '../../services/api';
import ActiveJobs from '../../components/worker/ActiveJobs';

const STATUS_LABEL = {
  PROVIDER_ASSIGNED: 'Assigned', PROVIDER_ACCEPTED: 'Accepted', PROVIDER_EN_ROUTE: 'On the way',
  PROVIDER_ARRIVED: 'Arrived', PET_HANDOVER: 'Handed over', SERVICE_STARTED: 'In progress',
  SERVICE_PAUSED: 'Paused', SERVICE_COMPLETED: 'Done', CUSTOMER_CONFIRMATION: 'Done', PAYMENT_PENDING: 'Collect payment',
};
import { formatPaise } from '../../utils/money';

/** Worker job queue (§10 pattern) — earnings shown before accepting. */
export default function WorkerPetJobsPage() {
  const nav = useNavigate();
  const { data, isLoading, refetch } = useAvailablePetBookingsQuery(undefined, { pollingInterval: 20000 });
  const [accept, { isLoading: accepting }] = useAcceptPetBookingMutation();
  const { data: mine } = useAssignedPetBookingsQuery(undefined, { pollingInterval: 20000 });
  const myJobs = (mine?.bookings || []).map((b) => ({
    id: b._id,
    to: `/worker/pet/${b._id}`,
    title: b.pets.map((p) => p.snapshot?.name).filter(Boolean).join(', ') || b.reference,
    subtitle: b.categoryCode.replace(/_/g, ' '),
    status: STATUS_LABEL[b.status] || b.status,
    attention: b.status === 'PAYMENT_PENDING',
  }));

  async function take(id) {
    try {
      await accept(id).unwrap();
      toast.success('Accepted');
      nav(`/worker/pet/${id}`);
    } catch (err) {
      if (err?.data?.code === 'ALREADY_CLAIMED') { toast.error('Someone else took this'); refetch(); }
      else toast.error(err?.data?.error || 'Could not accept');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">Available Pet Jobs</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5">
        <ActiveJobs items={myJobs} />
        {isLoading && <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>}
        {!isLoading && !(data?.bookings || []).length && <p className="text-center text-sm text-slate-400 py-16">Nothing available right now.</p>}

        {(data?.bookings || []).map((b) => (
          <div key={b._id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-2.5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500 capitalize">{b.categoryCode.replace(/_/g, ' ')}</p>
                <p className="font-bold text-[#0F172A] mt-0.5 flex items-center gap-1.5"><PawPrint size={13} /> {b.pets.map((p) => p.snapshot?.name).join(', ')}</p>
                {b.serviceLocation?.address && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {b.serviceLocation.address}</p>
                )}
              </div>
              <p className="text-lg font-black text-emerald-600 shrink-0 ml-2">{formatPaise(b.pricing?.providerAmountPaise)}</p>
            </div>
            <button type="button" onClick={() => take(b._id)} disabled={accepting}
              className="w-full rounded-xl bg-[#0F172A] text-white font-bold py-2.5 disabled:opacity-50">Accept</button>
          </div>
        ))}
      </div>
    </div>
  );
}
