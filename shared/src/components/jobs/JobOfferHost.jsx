import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import JobOfferAlert from './JobOfferAlert';
import { selectRole, selectAuth } from '../../modules/auth/authSlice';
import { getSocket } from '../../services/socket';
import {
  useRepairProviderJobsQuery, useTransitionRepairBookingMutation, useDeclineRepairBookingMutation,
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

const MODE_LABEL = {
  doorstep: 'At the customer', workshop: 'Bring to workshop', pickup_repair: 'Pickup & return', diagnosis_only: 'Inspection only',
  home_visit: 'Home visit', provider_location: 'At your place', pickup_and_return: 'Pickup & return',
  transport: 'Transport', boarding: 'Boarding', daycare: 'Daycare',
};
const OPEN_WINDOW_SEC = 90;
const when = (at) => (at ? new Date(at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const keyOf = (o) => `${o.kind}:${o.id}`;

/* Each source shaped into what the alert shows. */
const fromRepair = (b) => ({
  kind: 'repair', id: String(b.bookingId || b._id), mode: 'offered', askReason: true,
  heading: 'New repair job',
  title: b.device || [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Device repair',
  valueLabel: (b.isEstimate ?? b.priceSnapshot?.isEstimate) ? 'Estimate' : 'Job value',
  valuePaise: b.totalPaise ?? b.priceSnapshot?.totalPaise ?? 0,
  cash: b.paymentMethod === 'cash',
  howLabel: MODE_LABEL[b.serviceMode] || b.serviceMode,
  address: b.address ?? b.location?.address ?? '',
  landmark: b.landmark ?? b.location?.landmark ?? '',
  coordinates: b.coordinates ?? b.location?.coordinates ?? null,
  whenLabel: b.slotLabel || '',
  expiresAt: b.expiresAt || b.stageDeadlineAt,
  windowSec: b.windowSec,
});

const fromPetOffer = (b) => ({
  kind: 'pet', id: String(b.id || b._id), mode: 'offered', askReason: false,
  heading: 'A customer chose you',
  title: b.title || (b.pets || []).map((p) => p.snapshot?.name).filter(Boolean).join(', ') || 'Pet care',
  valueLabel: 'You earn',
  valuePaise: b.earningPaise ?? b.pricing?.providerAmountPaise ?? 0,
  howLabel: b.service || (b.categoryCode || '').replace(/_/g, ' '),
  address: b.area ?? b.serviceLocation?.address ?? '',
  coordinates: b.coordinates ?? b.serviceLocation?.coordinates ?? null,
  whenLabel: when(b.at || b.scheduledAt || b.checkInAt),
  expiresAt: b.expiresAt || b.offerExpiresAt,
  windowSec: b.windowSec,
});

const fromOpen = (p) => ({
  kind: p.kind, id: String(p.id), mode: 'open', askReason: false,
  heading: 'New job near you · first to accept',
  title: p.title || 'New job',
  valueLabel: 'You earn',
  valuePaise: p.earningPaise || 0,
  howLabel: p.service || p.kind,
  address: p.area || '',
  coordinates: p.coordinates || null,
  km: p.km ?? null,
  whenLabel: when(p.at),
  frontPaise: p.frontPaise || 0,
  expiresAt: new Date(Date.now() + OPEN_WINDOW_SEC * 1000).toISOString(),
  windowSec: OPEN_WINDOW_SEC,
  acceptLabel: 'Take this job',
});

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
  const [acceptPet] = useAcceptPetBookingMutation();
  const [declinePet] = useDeclinePetBookingMutation();
  const [acceptHelping] = useAcceptHelpingTaskMutation();

  const [live, setLive] = useState([]);           // offers heard over the socket
  const [handled, setHandled] = useState(() => new Set()); // answered, hidden or expired

  const push = useCallback((offer) => {
    setLive((q) => (q.some((o) => keyOf(o) === keyOf(offer)) ? q : [...q, offer]));
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
  const recovered = useMemo(() => {
    const now = Date.now();
    const alive = (at) => at && new Date(at).getTime() > now;
    return [
      ...(repairData?.bookings || []).filter((b) => b.status === 'PROVIDER_ASSIGNED' && alive(b.stageDeadlineAt)).map(fromRepair),
      ...(petData?.bookings || []).filter((b) => b.status === 'PROVIDER_ASSIGNED' && alive(b.offerExpiresAt)).map(fromPetOffer),
    ];
  }, [repairData, petData]);

  // Offered-to-you first: they're yours to lose. Then open jobs, oldest first.
  const offer = useMemo(() => {
    const seen = new Set();
    return [...live, ...recovered]
      .filter((o) => { const k = keyOf(o); if (seen.has(k) || handled.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => Number(b.mode === 'offered') - Number(a.mode === 'offered'))[0] || null;
  }, [live, recovered, handled]);

  const done = useCallback((o) => {
    setHandled((s) => new Set(s).add(keyOf(o)));
    setLive((q) => q.filter((x) => keyOf(x) !== keyOf(o)));
    refetchRepair?.();
    refetchPet?.();
  }, [refetchRepair, refetchPet]);

  if (!offer) return null;

  async function accept() {
    try {
      if (offer.kind === 'repair') {
        await acceptRepair({ id: offer.id, status: 'WORKER_ACCEPTED' }).unwrap();
        nav(`/worker/repair/${offer.id}`);
      } else if (offer.kind === 'pet') {
        await acceptPet(offer.id).unwrap();
        nav(`/worker/pet/${offer.id}`);
      } else if (offer.kind === 'helping') {
        await acceptHelping(offer.id).unwrap();
        nav(`/worker/helping/${offer.id}`);
      }
      toast.success('It’s yours');
    } catch (err) {
      const taken = err?.data?.code === 'ALREADY_CLAIMED';
      toast.error(taken ? 'Someone else took it first' : err?.data?.error || 'Could not accept this job');
    }
    done(offer);
  }

  async function decline(reason) {
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
      onClose={() => done(offer)}
    />
  );
}
