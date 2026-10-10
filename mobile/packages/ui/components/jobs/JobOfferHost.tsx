/**
 * Rings for any job, on any screen — mounted once by the provider apps (the
 * websites' JobOfferHost). Live offers come over the socket; offers already
 * waiting are recovered from the job lists when the app opens, so a provider
 * who was away still hears them. Shaping and choosing are the shared
 * jobOffers logic, so the app and the web show the same offer.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  useRepairProviderJobsQuery,
  useTransitionRepairBookingMutation,
  useDeclineRepairBookingMutation,
  useAssignedPetBookingsQuery,
  useAcceptPetBookingMutation,
  useDeclinePetBookingMutation,
  useAcceptHelpingTaskMutation,
  useGetWorkerMeQuery,
} from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { keyOf, fromRepair, fromPetOffer, fromOpen, recoveredOffers, pickOffer, withOffer } from '@zappy/core/shared/jobOffers';
import { useAppSelector } from '@zappy/core/store/hooks';
import type { ApiErr } from '../../lib/feedback';
import { toast } from '../Toast';
import { JobOfferAlert, type Offer } from './JobOfferAlert';

export function JobOfferHost({ kinds = ['repair', 'pet', 'helping'] }: { kinds?: string[] }) {
  const router = useRouter();
  const role = useAppSelector((s) => s.auth.role);
  const has = (k?: string) => !!k && kinds.includes(k);

  const { data: me } = useGetWorkerMeQuery(undefined, { skip: role !== 'worker' });
  const myLocation = me?.worker?.currentLocation?.coordinates || null;
  const isShopTechnician = !!me?.worker?.shopId;

  const { data: repairData, refetch: refetchRepair } = useRepairProviderJobsQuery({}, { pollingInterval: 60000, skip: !has('repair') });
  const { data: petData, refetch: refetchPet } = useAssignedPetBookingsQuery(undefined, { pollingInterval: 60000, skip: !has('pet') });
  const [acceptRepair] = useTransitionRepairBookingMutation();
  const [declineRepair] = useDeclineRepairBookingMutation();
  const [acceptPet] = useAcceptPetBookingMutation();
  const [declinePet] = useDeclinePetBookingMutation();
  const [acceptHelping] = useAcceptHelpingTaskMutation();

  const [live, setLive] = useState<Offer[]>([]);
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const push = useCallback((offer: Offer) => setLive((q) => withOffer(q, offer)), []);

  useSocketEvent('repair.offer', (p) => { if (has('repair')) push(fromRepair(p)); });
  useSocketEvent('job.offer', (p) => { if (has(p?.kind) && p.kind === 'pet') push(fromPetOffer(p)); });
  useSocketEvent('job.available', (p) => { if (has(p?.kind)) push(fromOpen(p)); });
  // Taken by someone else, cancelled or expired: off the screen at once.
  useSocketEvent('repair.offer_closed', (p) => setLive((q) => q.filter((o) => o.id !== String(p?.bookingId))));

  const recovered = useMemo(() => recoveredOffers(repairData, petData), [repairData, petData]);
  const offer: Offer | null = useMemo(() => pickOffer(live, recovered, handled), [live, recovered, handled]);

  const done = useCallback((o: Offer) => {
    setHandled((s) => new Set(s).add(keyOf(o)));
    setLive((q) => q.filter((x) => !(x.kind === o.kind && x.id === o.id)));
    refetchRepair?.();
    refetchPet?.();
  }, [refetchRepair, refetchPet]);

  if (!offer) return null;

  async function accept() {
    if (!offer) return;
    try {
      if (offer.kind === 'repair') {
        await acceptRepair({ id: offer.id, status: 'WORKER_ACCEPTED' }).unwrap();
        router.push(`/worker/repair/${offer.id}` as never);
      } else if (offer.kind === 'pet') {
        await acceptPet(offer.id).unwrap();
        router.push(`/worker/pet/${offer.id}` as never);
      } else if (offer.kind === 'helping') {
        await acceptHelping(offer.id).unwrap();
        router.push(`/worker/helping/${offer.id}` as never);
      }
      toast.success('It’s yours');
    } catch (err) {
      const e = err as ApiErr;
      toast.error(e?.data?.code === 'ALREADY_CLAIMED' ? 'Someone else took it first' : e?.data?.error || 'Could not accept this job');
    }
    done(offer);
  }

  async function decline(reason: string) {
    if (!offer) return;
    try {
      if (offer.kind === 'repair') {
        await declineRepair({ id: offer.id, reason }).unwrap();
        toast(isShopTechnician ? 'Sent back to your shop owner' : 'Passed. We’ll find someone else.');
      } else if (offer.kind === 'pet' && offer.mode === 'offered') {
        await declinePet({ id: offer.id, reason: reason || 'Declined by provider' }).unwrap();
        toast('Passed. We’ll find someone else.');
      }
      // An open job needs no answer: passing just hides it for you.
    } catch (err) {
      // A shop technician's pass must reach the owner; anyone else's is courtesy.
      if (isShopTechnician && offer.kind === 'repair') { toast.error((err as ApiErr)?.data?.error || 'Could not pass the job back'); return; }
    }
    done(offer);
  }

  return (
    <JobOfferAlert
      key={keyOf(offer)}
      offer={offer}
      myLocation={myLocation}
      onAccept={accept}
      onDecline={decline}
      declineTitle={isShopTechnician ? 'Why are you passing this back to your shop?' : undefined}
      onClose={() => done(offer)}
    />
  );
}
