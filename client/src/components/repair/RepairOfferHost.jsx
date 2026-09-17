import { useCallback, useEffect, useMemo, useState } from 'react';
import RepairOfferAlert from './RepairOfferAlert';
import { useRepairOfferSocket } from '../../hooks/useSocket';
import { useRepairProviderJobsQuery } from '../../services/api';

/**
 * Puts a ringing repair offer on screen — live, or waiting from before.
 *
 * Mounted by BOTH provider dashboards, so a shop owner and an independent
 * technician get the same alert. The server addresses the offer to whichever
 * room the account owns (`worker:<id>` or `shop:<id>`).
 *
 * The socket alone was not enough. It only fires while the provider happens to
 * have the app open and connected, so a shop that was closed, asleep, or simply
 * on another screen when the job arrived heard nothing — and opening the
 * dashboard afterwards showed a silent list, because nothing re-raised the
 * offer. A job they had ten minutes to accept could pass unseen.
 *
 * So the offer is also RECOVERED on mount: any job sitting at
 * PROVIDER_ASSIGNED with its accept deadline still in the future is a live
 * offer, and it rings the moment the screen opens. Opening the app IS the
 * notification, which is what a provider expects.
 */

/** A job assigned to us and still inside its acceptance window. */
function pendingOffer(bookings = []) {
  const now = Date.now();
  return bookings.find((b) => (
    b.status === 'PROVIDER_ASSIGNED'
    && b.stageDeadlineAt
    && new Date(b.stageDeadlineAt).getTime() > now
  )) || null;
}

/** Shape a stored booking like the socket payload the alert renders. */
function offerFromBooking(b) {
  if (!b) return null;
  return {
    bookingId: b._id,
    reference: b.reference,
    device: [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Device repair',
    totalPaise: b.priceSnapshot?.totalPaise ?? null,
    isEstimate: !!b.priceSnapshot?.isEstimate,
    serviceMode: b.serviceMode,
    paymentMethod: b.paymentMethod,
    address: b.location?.address || '',
    landmark: b.location?.landmark || '',
    coordinates: b.location?.coordinates || null,
    slotLabel: b.slotLabel || '',
    expiresAt: b.stageDeadlineAt,
  };
}

export default function RepairOfferHost({ myLocation }) {
  const [liveOffer, setLiveOffer] = useState(null);
  // Dismissed by hand — do not re-raise it on the next poll.
  const [muted, setMuted] = useState(() => new Set());

  /**
   * Polled rather than fetched once: a provider can leave this screen open all
   * day, and a job that arrives while the socket is briefly down would
   * otherwise never appear. A minute is well inside the ten-minute window.
   */
  const { data, refetch } = useRepairProviderJobsQuery({}, { pollingInterval: 60000 });

  const onOffer = useCallback((payload) => {
    setLiveOffer(payload);
    // Keep the jobs list honest behind the alert.
    refetch();
  }, [refetch]);

  const onClosed = useCallback((payload) => {
    // Taken by someone else, cancelled, or expired — take it off the screen
    // rather than leaving a provider tapping Accept on a dead job.
    setLiveOffer((current) => (
      current && current.bookingId === payload?.bookingId ? null : current
    ));
    refetch();
  }, [refetch]);

  useRepairOfferSocket(onOffer, onClosed);

  const recovered = useMemo(() => {
    const b = pendingOffer(data?.bookings || data?.jobs || []);
    if (!b || muted.has(String(b._id))) return null;
    return offerFromBooking(b);
  }, [data, muted]);

  // A live socket offer wins; otherwise show whatever is still waiting.
  const offer = liveOffer || recovered;

  // Stop ringing once it leaves the acceptance window, even with no socket.
  useEffect(() => {
    if (!offer?.expiresAt) return undefined;
    const ms = new Date(offer.expiresAt).getTime() - Date.now();
    if (ms <= 0) return undefined;
    const t = setTimeout(() => { setLiveOffer(null); refetch(); }, ms + 500);
    return () => clearTimeout(t);
  }, [offer, refetch]);

  if (!offer) return null;

  return (
    <RepairOfferAlert
      offer={offer}
      myLocation={myLocation}
      onClose={(reason) => {
        setLiveOffer(null);
        // Only a deliberate dismissal silences it; expiry and acceptance are
        // handled by the booking's own status changing.
        if (reason === 'dismissed' && offer.bookingId) {
          setMuted((prev) => new Set(prev).add(String(offer.bookingId)));
        }
        refetch();
      }}
    />
  );
}
