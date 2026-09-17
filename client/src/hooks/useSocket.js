import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectAuth } from '../modules/auth/authSlice';
import { getSocket, disconnectSocket } from '../services/socket';
import {
  setStatus, setWorkerLocation, setWorkerInfo, clearActiveOrder, setEta,
  setDispatchMessage, setWorkersNotified, setDispatchBoost,
} from '../modules/order/orderSlice';
import toast from 'react-hot-toast';

const STATUS_MSG = {
  searching:   'Finding a nearby worker…',
  assigned:    'Worker assigned to your order',
  on_the_way:  'Worker is on the way',
  arrived:     'Worker has arrived',
  in_progress: 'Service in progress',
  completed:   'Service completed successfully',
};

/**
 * Returns live socket connection state: 'connected' | 'reconnecting' | 'offline'
 * Attach to any page that needs to show a degraded-connection banner.
 */
export function useSocketStatus() {
  const { accessToken: token } = useSelector(selectAuth);
  const [status, setSocketStatus] = useState('connected');

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    setSocketStatus(socket.connected ? 'connected' : 'reconnecting');

    const onConnect    = () => setSocketStatus('connected');
    const onDisconnect = () => setSocketStatus('reconnecting');
    const onConnError  = () => setSocketStatus('offline');
    const onReconnectFail = () => setSocketStatus('offline');

    socket.on('connect',          onConnect);
    socket.on('disconnect',       onDisconnect);
    socket.on('connect_error',    onConnError);
    socket.on('reconnect_failed', onReconnectFail);

    return () => {
      socket.off('connect',          onConnect);
      socket.off('disconnect',       onDisconnect);
      socket.off('connect_error',    onConnError);
      socket.off('reconnect_failed', onReconnectFail);
    };
  }, [token]);

  return status;
}

/**
 * Subscribes to an order's live updates via socket.
 *
 * Resilience guarantees:
 *   - Re-subscribes on every socket reconnect (network switch, server restart,
 *     browser tab restore). Fixes #56/#57/#58/#60.
 *   - Re-subscribes when server broadcasts `server:rooms_reset` (Redis restart). Fixes #59.
 *   - REST polling in OrderTrackingPage (pollingInterval:10000) acts as the
 *     fallback data source while socket is degraded.
 */
export function useOrderSocket(orderId, callbacks = {}) {
  const dispatch = useDispatch();
  const { accessToken: token } = useSelector(selectAuth);

  useEffect(() => {
    if (!orderId || !token) return;
    const socket = getSocket(token);

    // subscribe is called:
    //   1. immediately if already connected
    //   2. on every (re)connect — fixes #56, #57, #58, #60
    //   3. on server:rooms_reset signal — fixes #59 (Redis restart)
    const subscribe = () => socket.emit('order:subscribe', { orderId });
    if (socket.connected) subscribe();
    socket.on('connect',            subscribe);
    socket.on('server:rooms_reset', subscribe);

    const onStatus = (p) => {
      dispatch(setStatus({ status: p.status, at: p.at }));
      const msg = STATUS_MSG[p.status];
      if (msg) {
        p.status === 'completed'
          ? toast.success(msg)
          : toast(msg, { icon: null });
      }
    };

    const onAssigned = (p) => {
      dispatch(setStatus({ status: 'assigned' }));
      dispatch(setWorkerInfo({ workerId: p.workerId }));
      toast.success('Worker assigned to your order');
    };

    const onLocation = (p) => dispatch(setWorkerLocation(p));

    const onEta = (p) => {
      if (p?.etaMinutes != null) dispatch(setEta({ minutes: p.etaMinutes }));
    };

    const onFailed = (p) => {
      toast.error(p?.reason ? `No workers found: ${p.reason}` : 'No workers available right now');
      dispatch(clearActiveOrder());
    };

    const onCancelled = () => {
      toast('Order cancelled', { id: 'order-cancel', icon: '❌' });
      dispatch(clearActiveOrder());
    };

    const onChat = (msg) => callbacks.onChatMessage?.(msg);

    const onDispatchUpdate = (p) => {
      if (p?.message) dispatch(setDispatchMessage({
        message:    p.message,
        radiusKm:   p.radiusKm,
        radiusLabel: p.radiusLabel,
        step:        p.step,
        totalSteps:  p.totalSteps,
        elapsedSec:  p.elapsedSec,
      }));
    };

    const onWorkersNotified = (p) => {
      dispatch(setWorkersNotified({ count: p?.count ?? 0, radiusKm: p?.radiusKm }));
    };

    const onBoost = (p) => {
      if (p?.amountPaise != null) dispatch(setDispatchBoost({ amountPaise: p.amountPaise }));
    };

    socket.on('order.status',            onStatus);
    socket.on('order.assigned',          onAssigned);
    socket.on('worker.location',         onLocation);
    socket.on('eta.update',              onEta);
    socket.on('order.failed',            onFailed);
    socket.on('order.cancelled',         onCancelled);
    socket.on('chat.message',            onChat);
    socket.on('order.dispatch_update',   onDispatchUpdate);
    socket.on('order.workers_notified',  onWorkersNotified);
    socket.on('offer.boosted',           onBoost);

    return () => {
      socket.emit('order:unsubscribe', { orderId });
      socket.off('connect',            subscribe);
      socket.off('server:rooms_reset', subscribe);
      socket.off('order.status',            onStatus);
      socket.off('order.assigned',          onAssigned);
      socket.off('worker.location',         onLocation);
      socket.off('eta.update',              onEta);
      socket.off('order.failed',            onFailed);
      socket.off('order.cancelled',         onCancelled);
      socket.off('chat.message',            onChat);
      socket.off('order.dispatch_update',   onDispatchUpdate);
      socket.off('order.workers_notified',  onWorkersNotified);
      socket.off('offer.boosted',           onBoost);
    };
  }, [orderId, token, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Worker side — listens for incoming job requests (broadcast model).
 *
 * Resilience: server auto-joins worker:<id> room on every new connection
 * (see sockets/index.js), so offers resume automatically after reconnect
 * without any client-side room rejoin. We only need to re-register event
 * listeners — which useEffect does on remount / token change.
 */
/**
 * Repair work arriving in real time.
 *
 * Separate from the order-offer socket because the two are different products
 * with different payloads — sharing one handler would mean every repair change
 * re-rendering the order popup and vice versa. The server addresses these to
 * the provider's own room (worker:<id> / shop:<id>), so a shop owner and an
 * independent technician both receive them without extra wiring.
 */
export function useRepairOfferSocket(onOffer, onClosed, onUpdate) {
  const { accessToken: token } = useSelector(selectAuth);

  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket(token);

    const offerHandler = (payload) => onOffer?.(payload);
    const closedHandler = (payload) => onClosed?.(payload);
    const updateHandler = (payload) => onUpdate?.(payload);

    socket.on('repair.offer', offerHandler);
    socket.on('repair.offer_closed', closedHandler);
    socket.on('repair.update', updateHandler);

    return () => {
      socket.off('repair.offer', offerHandler);
      socket.off('repair.offer_closed', closedHandler);
      socket.off('repair.update', updateHandler);
    };
  }, [token, onOffer, onClosed, onUpdate]);
}

export function useWorkerOfferSocket(onOffer, onCancelled, onForceAssigned, onBoost, onJobPulled) {
  const { accessToken: token } = useSelector(selectAuth);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);

    const offerHandler         = (offer) => onOffer(offer);
    const cancelledHandler     = (p)     => onCancelled?.(p);
    const forceAssignedHandler = (data)  => onForceAssigned?.(data);
    const boostHandler         = (data)  => onBoost?.(data);
    // Fired on worker's personal room when a job they held is reassigned/cancelled by admin or stale-watchdog
    const jobPulledHandler     = (p)     => onJobPulled?.(p);

    socket.on('new_job_request', offerHandler);
    socket.on('offer.cancelled', cancelledHandler);
    socket.on('job.assigned',    forceAssignedHandler);
    socket.on('offer.boosted',   boostHandler);
    socket.on('order.cancelled', jobPulledHandler);

    return () => {
      socket.off('new_job_request', offerHandler);
      socket.off('offer.cancelled', cancelledHandler);
      socket.off('job.assigned',    forceAssignedHandler);
      socket.off('offer.boosted',   boostHandler);
      socket.off('order.cancelled', jobPulledHandler);
    };
  }, [token, onOffer, onCancelled, onForceAssigned, onBoost, onJobPulled]);
}

export function useDisconnectOnLogout() {
  const { accessToken: token } = useSelector(selectAuth);
  useEffect(() => {
    if (!token) disconnectSocket();
  }, [token]);
}
