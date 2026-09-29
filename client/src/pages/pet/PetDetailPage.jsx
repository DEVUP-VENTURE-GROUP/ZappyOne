import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, PawPrint, Calendar, IndianRupee } from 'lucide-react';
import { useMyPetHistoryQuery } from '@shared/services/api';
import { formatPaise } from '@shared/utils/money';

/**
 * A pet's permanent record (§40) — one place a pet's whole service life is
 * visible, drawn from `PetPassport.serviceHistory`, which every completed
 * booking writes into regardless of which category it came from.
 */
export default function PetDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useMyPetHistoryQuery(id);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
  if (!data?.pet) return <div className="text-center py-24 text-slate-400">Pet not found</div>;

  const { pet, history } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">{pet.name}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 flex items-center gap-4">
          <span className="shrink-0 w-16 h-16 rounded-2xl bg-zappy-50 overflow-hidden grid place-items-center">
            {pet.photoKey ? <img src={pet.photoKey} alt="" className="w-full h-full object-cover" /> : <PawPrint size={26} className="text-zappy-400" />}
          </span>
          <div>
            <p className="font-black text-[#0F172A] text-lg">{pet.name}</p>
            <p className="text-sm text-slate-500 capitalize">
              {pet.species}{pet.breed ? ` · ${pet.breed}` : ''} · {pet.size?.replace('_', ' ')}
            </p>
            {pet.weight && <p className="text-xs text-slate-400">{pet.weight} kg</p>}
          </div>
        </div>

        {(pet.allergies?.length > 0 || pet.specialNeeds) && (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm">
            {pet.allergies?.length > 0 && <p><strong>Allergies:</strong> {pet.allergies.join(', ')}</p>}
            {pet.specialNeeds && <p className="mt-1"><strong>Special needs:</strong> {pet.specialNeeds}</p>}
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
            <Calendar size={13} /> Service History
          </p>
          {!history?.length && <p className="text-sm text-slate-400 py-6 text-center">No completed services yet.</p>}
          <div className="space-y-2">
            {(history || []).map((h) => (
              <div key={h._id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#0F172A] text-sm">{h.service}</p>
                  <p className="text-xs text-slate-400">{new Date(h.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  {h.notes && <p className="text-xs text-slate-500 mt-1">{h.notes}</p>}
                </div>
                {h.amountPaise != null && (
                  <span className="flex items-center gap-0.5 text-sm font-bold text-[#0F172A] shrink-0">
                    <IndianRupee size={12} />{formatPaise(h.amountPaise).replace('₹', '')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
