import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Navigation, PawPrint, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import ProofPhotos, { readyKeys } from '../../components/common/ProofPhotos';
import CollectPaymentCard from '../../components/common/CollectPaymentCard';
import TripSharingBanner from '../../components/worker/TripSharingBanner';
import { usePublishTripLocation, tripOf } from '../../hooks/useLiveTrip';
import {
  useGetPetBookingQuery, useAdvancePetBookingStatusMutation, useAddPetBookingProofMutation, useCollectPetCashMutation,
} from '../../services/api';

/**
 * Worker execution (§10, §38, §39).
 *
 * Required proof is enforced server-side (per-variant `requiredProofKinds`) —
 * this screen just makes capturing it the obvious next step, and shows the
 * pet's safety brief (bite risk, temperament) up front, every time, the way
 * `handlingBriefFor()` promises (§8).
 */
const NEXT = {
  PROVIDER_ACCEPTED: [['PROVIDER_EN_ROUTE', "I'm on my way"], ['SERVICE_STARTED', 'Start now (already there)']],
  PROVIDER_EN_ROUTE: [['PROVIDER_ARRIVED', "I've arrived"]],
  PROVIDER_ARRIVED: [['SERVICE_STARTED', 'Start the service']],
};

export default function WorkerPetJobPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useGetPetBookingQuery(id, { pollingInterval: 10000 });
  const [advance] = useAdvancePetBookingStatusMutation();
  const [addProof] = useAddPetBookingProofMutation();
  const [collectCash, { isLoading: collecting }] = useCollectPetCashMutation();
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [completing, setCompleting] = useState(false);
  // Shared while travelling to the owner (or driving the pet, for transport); off otherwise.
  const trip = tripOf('pet', data?.booking);
  const sharing = usePublishTripLocation(id, Boolean(trip));

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>;
  if (!data?.booking) return <div className="text-center py-24 text-slate-400">Booking not found</div>;

  const { booking } = data;
  const brief = booking.pets[0]?.snapshot?.handlingBrief || booking.pets[0]?.snapshot || {};
  const hasRisk = ['medium', 'high'].includes(brief.biteRisk) || ['medium', 'high'].includes(brief.aggressionLevel);

  async function move(status) {
    try {
      await advance({ id: booking._id, status }).unwrap();
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not update');
    }
  }

  async function complete() {
    setCompleting(true);
    try {
      for (const key of readyKeys(beforePhotos)) await addProof({ id: booking._id, kind: 'before', key }).unwrap();
      for (const key of readyKeys(afterPhotos)) await addProof({ id: booking._id, kind: 'after', key }).unwrap();
      const res = await advance({ id: booking._id, status: 'SERVICE_COMPLETED' }).unwrap();
      if (res.booking?.status === 'PAYMENT_PENDING') {
        // Stay here: the payment card below is the last step.
        toast.success('Service completed. Now take the payment.');
        refetch();
      } else {
        toast.success('Completed and settled');
        nav('/worker/pet');
      }
    } catch (err) {
      if (err?.data?.code === 'PROOF_REQUIRED') toast.error(`A ${err.data.kind?.replace('_', ' ')} photo is required first`);
      else toast.error(err?.data?.error || 'Could not complete');
    } finally {
      setCompleting(false);
    }
  }

  const nextMoves = NEXT[booking.status] || [];

  async function recordCash() {
    try {
      await collectCash(booking._id).unwrap();
      toast.success('Payment recorded');
      nav('/worker/pet');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not record the payment');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">{booking.reference}</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-10">
        {trip && <TripSharingBanner sharing={sharing} {...trip} />}
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
          <p className="font-bold text-[#0F172A] flex items-center gap-1.5"><PawPrint size={14} /> {brief.name} · {brief.species} · {brief.size?.replace('_', ' ')}</p>
          {brief.breed && <p className="text-xs text-slate-500 mt-0.5">{brief.breed}</p>}
        </div>

        {hasRisk && (
          <div className="flex items-start gap-2 rounded-2xl border-2 border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>This pet is flagged {brief.biteRisk === 'high' || brief.aggressionLevel === 'high' ? 'high' : 'medium'} risk for handling. {brief.specialHandling || 'Take extra care and go slowly.'}</span>
          </div>
        )}

        {booking.serviceLocation?.address && (
          <a href={`https://maps.google.com/?q=${booking.serviceLocation.coordinates?.[1]},${booking.serviceLocation.coordinates?.[0]}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm">
            <Navigation size={16} className="text-zappy-500 shrink-0" />
            <span className="truncate">{booking.serviceLocation.address}</span>
          </a>
        )}

        {nextMoves.map(([status, label]) => (
          <button key={status} type="button" onClick={() => move(status)}
            className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-3.5">{label}</button>
        ))}

        {booking.status === 'SERVICE_STARTED' && (
          <>
            <ProofPhotos photos={beforePhotos} onChange={setBeforePhotos} folder="pet/before" max={2} title="Before photo" />
            <ProofPhotos photos={afterPhotos} onChange={setAfterPhotos} folder="pet/after" max={2} title="After photo" />
            <button type="button" onClick={complete} disabled={completing}
              className="w-full rounded-2xl bg-emerald-600 text-white font-bold py-3.5 disabled:opacity-50">
              {completing ? 'Completing…' : 'Complete service'}
            </button>
          </>
        )}

        {['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'].includes(booking.status) && (
          <CollectPaymentCard
            amountPaise={booking.pricing?.totalPaise}
            paymentMethod={booking.paymentMethod}
            paid={booking.paymentStatus === 'paid'}
            collecting={collecting}
            onCollect={recordCash}
          />
        )}
      </div>
    </div>
  );
}
