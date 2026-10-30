import { useCheckInThen } from '../../provider/useCheckIn';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import JobOfferAlert from './JobOfferAlert';
import { keyOf, fromRepair, fromPetOffer, fromOpen, recoveredOffers, pickOffer, withOffer, takeError } from './jobOffers';
import { selectRole, selectAuth } from '../../modules/auth/authSlice';
import { getSocket } from '../../services/socket';
import {
  useRepairProviderJobsQuery, useTransitionRepairBookingMutation, useDeclineRepairBookingMutation, useClaimRepairBookingMutation,
  useAssignedPetBookingsQuery, useAcceptPetBookingMutation, useDeclinePetBookingMutation,
  useAcceptHelpingTaskMutation, useGetWorkerMeQuery,
} from '../../services/api';

/**
 * Rings for any job, on any screen — mounted once per provider app.
 *
 * Three ways work arrives, one alert for all of them:
 *   - offered to you   a repair the engine matched to you, or a pet booking a
 *                      customer chose you for: minutes to answer, Pass asks why
 *   - open near you    a pet or helping job any verified provider nearby can
 *                      take: first to accept gets it
 *
 * Live offers come over the socket. Offers already waiting are RECOVERED from
 * the job lists when the app opens, so a provider who was away still hears
 * them — opening the app is the notification, as they expect.
 */

export default function JobOfferHost({ kinds = ['repair', 'pet', 'helping'], myLocation: given = null }) {
  const nav = useNavigate();
  const role = useSelector(selectRole);
  const { accessToken: token } = useSelector(selectAuth);
  const has = (k) => kinds.includes(k);

  const { data: me } = useGetWorkerMeQuery(undefined, { skip: role !== 'worker' || !!given });
  const myLocation = given || me?.worker?.currentLocation?.coordinates || null;
  const isShopTechnician = !!me?.worker?.shopId;

  const { data: repairData, refetch: refetchRepair } = useRepairProviderJobsQuery({}, { pollingInterval: 60000, skip: !has('repair') });
  const { data: petData, refetch: refetchPet } = useAssignedPetBookingsQuery(undefined, { pollingInterval: 60000, skip: !has('pet') });
  const [acceptRepair] = useTransitionRepairBookingMutation();
  const [declineRepair] = useDeclineRepairBookingMutation();
  const [claimRepair] = useClaimRepairBookingMutation();
  const [acceptPet] = useAcceptPetBookingMutation();
  const checkedIn = useCheckInThen();
  const [declinePet] = useDeclinePetBookingMutation();
  const [acceptHelping] = useAcceptHelpingTaskMutation();

  const [live, setLive] = useState([]);           // offers heard over the socket
  const [handled, setHandled] = useState(() => new Set()); // answered, hidden or expired

  const push = useCallback((offer) => {
    // The same job at a higher amount replaces the older alert.
    setLive((q) => withOffer(q, offer));
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket(token);
    const onRepairOffer = (p) => has('repair') && push(fromRepair(p));
    const onJobOffer = (p) => has(p?.kind) && p.kind === 'pet' && push(fromPetOffer(p));
    const onOpen = (p) => has(p?.kind) && push(fromOpen(p));
    // Taken by someone else, cancelled or expired: off the screen at once.
    const onClosed = (p) => setLive((q) => q.filter((o) => o.id !== String(p?.bookingId || p?.id)));
    socket.on('repair.offer', onRepairOffer);
    socket.on('repair.offer_closed', onClosed);
    socket.on('job.offer', onJobOffer);
    socket.on('job.available', onOpen);
    return () => {
      socket.off('repair.offer', onRepairOffer);
      socket.off('repair.offer_closed', onClosed);
      socket.off('job.offer', onJobOffer);
      socket.off('job.available', onOpen);
    };
  }, [token, push, kinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offers still inside their window, from before this screen opened.
  const recovered = useMemo(() => recoveredOffers(repairData, petData), [repairData, petData]);

  // Offered-to-you first: they're yours to lose. Then open jobs, oldest first.
  const offer = useMemo(() => pickOffer(live, recovered, handled), [live, recovered, handled]);

  // A ring that ran out is only off screen; the next ring round may show it again.
  const done = useCallback((o, why) => {
    if (why !== 'expired') setHandled((s) => new Set(s).add(keyOf(o)));
    setLive((q) => q.filter((x) => !(x.kind === o.kind && x.id === o.id)));
    refetchRepair?.();
    refetchPet?.();
  }, [refetchRepair, refetchPet]);

  if (!offer) return null;

  async function accept() {
    try {
      await checkedIn(async () => {
      if (offer.kind === 'repair' && offer.broadcast) {
        await claimRepair(offer.id).unwrap();
        nav(`/worker/repair/${offer.id}`);
      } else if (offer.kind === 'repair') {
        await acceptRepair({ id: offer.id, status: 'WORKER_ACCEPTED' }).unwrap();
        nav(`/worker/repair/${offer.id}`);
      } else if (offer.kind === 'pet') {
        await acceptPet(offer.id).unwrap();
        nav(`/worker/pet/${offer.id}`);
      } else if (offer.kind === 'helping') {
        await acceptHelping(offer.id).unwrap();
        nav(`/worker/helping/${offer.id}`);
      }
      });
      toast.success('It’s yours');
    } catch (err) {
      toast.error(takeError(err));
    }
    done(offer);
  }

  async function decline(reason) {
    try {
      if (offer.kind === 'repair' && !offer.broadcast) {
        await declineRepair({ id: offer.id, reason }).unwrap();
        toast(isShopTechnician ? 'Sent back to your shop owner' : 'Passed. We’ll find someone else.');
      } else if (offer.kind === 'pet' && offer.mode === 'offered') {
        await declinePet({ id: offer.id, reason: reason || 'Declined by provider' }).unwrap();
        toast('Passed. We’ll find someone else.');
      }
      // An open or broadcast job needs no answer: passing just hides it for you.
    } catch (err) {
      // A shop technician's pass must reach the owner; anyone else's is courtesy.
      if (isShopTechnician && offer.kind === 'repair') { toast.error(err?.data?.error || 'Could not pass the job back'); return; }
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
      onClose={(why) => done(offer, why)}
    />
  );
}
