import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Calendar } from 'lucide-react';
import { useMyPetBookingsQuery } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';

const OPEN_STATUSES = ['REQUESTED', 'BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'PET_HANDOVER', 'SERVICE_STARTED'];

export default function PetBookingsListPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const view = params.get('status') === 'history' ? 'history' : 'upcoming';
  const { data, isLoading } = useMyPetBookingsQuery();

  const bookings = (data?.bookings || []).filter((b) => (
    view === 'upcoming' ? OPEN_STATUSES.includes(b.status) : !OPEN_STATUSES.includes(b.status)
  ));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">{view === 'upcoming' ? 'Upcoming' : 'History'}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5">
        {isLoading && <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>}
        {!isLoading && !bookings.length && (
          <div className="text-center py-12 text-slate-400">
            <Calendar size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Nothing here yet.</p>
          </div>
        )}
        {bookings.map((b) => (
          <button key={b._id} type="button" onClick={() => nav(`/pet/bookings/${b._id}`)}
            className="w-full flex items-center justify-between rounded-2xl border-2 border-slate-200 bg-white p-4 text-left">
            <div className="min-w-0">
              <p className="font-bold text-[#0F172A] capitalize truncate">{b.categoryCode.replace(/_/g, ' ')}</p>
              <p className="text-xs text-slate-400">{b.pets?.[0]?.snapshot?.name}{b.pets?.length > 1 ? ` +${b.pets.length - 1}` : ''} · {b.status.replace(/_/g, ' ')}</p>
            </div>
            <span className="font-bold text-[#0F172A] shrink-0 ml-2">{formatPaise(b.pricing?.totalPaise)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
