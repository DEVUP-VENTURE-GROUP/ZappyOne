/**
 * Live job-offer subscription.
 * ----------------------------------------------------------------------------
 * ONE subscription for the whole worker app, feeding `offersSlice`. Mounted
 * from the worker tab layout so it stays alive across tab switches — an offer
 * has a short expiry, and missing one because the pro happened to be looking
 * at a different tab is a lost job.
 *
 * The socket contract is unchanged: same events, same client, same payloads.
 * This only routes them into shared state instead of a single component's
 * `useState`.
 *
 * Expiry is enforced locally on a 1s tick because the server does not send a
 * "your offer expired" event — `expiresAt` in the payload is the only signal,
 * and a card left on screen past it would invite a tap that can only fail.
 * ----------------------------------------------------------------------------
 */

import { useEffect } from 'react';
import { useSocket } from './useSocket';
import { useAppDispatch } from '../store/hooks';
import {
  offerBoosted,
  offerReceived,
  offerRemoved,
  offersPruned,
} from '../store/offersSlice';
import type { JobOffer } from '../types/api';
import type {
  JobAssignedEvent,
  OfferBoostedEvent,
  OfferCancelledEvent,
} from '../services/socket/events';

export function useJobOffers(): void {
  const dispatch = useAppDispatch();
  const socketClient = useSocket();

  useEffect(() => {
    const onOffer = (payload: JobOffer) => dispatch(offerReceived(payload));

    // Another pro won it — dispatch tells everyone else to drop the card.
    const onCancelled = (payload: OfferCancelledEvent) =>
      dispatch(offerRemoved(payload.orderId));

    // Assignment settled. Whether this worker won or not, the offer is over.
    const onAssigned = (payload: JobAssignedEvent) => {
      if (payload?.orderId) dispatch(offerRemoved(payload.orderId));
    };

    const onBoosted = (payload: OfferBoostedEvent) =>
      dispatch(offerBoosted({ orderId: payload.orderId, newTotal: payload.newTotal }));

    socketClient.on('new_job_request', onOffer);
    socketClient.on('offer.cancelled', onCancelled);
    socketClient.on('job.assigned', onAssigned);
    socketClient.on('offer.boosted', onBoosted);

    return () => {
      socketClient.off('new_job_request', onOffer);
      socketClient.off('offer.cancelled', onCancelled);
      socketClient.off('job.assigned', onAssigned);
      socketClient.off('offer.boosted', onBoosted);
    };
  }, [socketClient, dispatch]);

  // The server sends no expiry event; `expiresAt` is all we get.
  useEffect(() => {
    const id = setInterval(() => dispatch(offersPruned()), 1000);
    return () => clearInterval(id);
  }, [dispatch]);
}
