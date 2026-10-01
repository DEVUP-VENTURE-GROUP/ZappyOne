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

export function useDisconnectOnLogout() {
  const { accessToken: token } = useSelector(selectAuth);
  useEffect(() => {
    if (!token) disconnectSocket();
  }, [token]);
}

/**
 * Keep every open screen in step with the jobs it shows — mounted once per app.
 *
 * Every job kind announces each change as `job.status` (to the job's room) and
 * `job.update` (to its provider), and new open work as `job.available`; this
 * turns those into cache refreshes, so a status, a new offer or a claimed
 * job appears the moment it happens rather than on the next poll. Polling stays
 * on the screens as the fallback for a dropped connection.
 *
 * `alerts` shows a toast for new work nearby — for provider apps, not customers.
 */
const JOB_TAGS = { pet: 'PetBookings', helping: 'HelpingTasks', repair: 'RepairBookings', event: 'EventBooking' };
const OPEN_TAGS = { pet: 'PetAvailable', helping: 'HelpingAvailable' };

export function useJobRealtime({ alerts = false } = {}) {
  const { accessToken: token } = useSelector(selectAuth);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket(token);
    // Lazy: the API module is large and this hook lives next to lighter ones.
    const refresh = (tags) => import('../services/api').then(({ api }) => dispatch(api.util.invalidateTags(tags)));

    const onJob = (p) => {
      const type = JOB_TAGS[p?.kind];
      if (type) refresh([type, { type, id: p.id }, ...(OPEN_TAGS[p.kind] ? [OPEN_TAGS[p.kind]] : [])]);
    };
    // Quote events are repair-only and carry no id; the repair lists are small.
    const onQuote = () => refresh(['RepairBookings']);
    const onAvailable = (p) => {
      if (OPEN_TAGS[p?.kind]) refresh([OPEN_TAGS[p.kind]]);
      if (alerts) {
        toast(`New job near you${p.area ? ` · ${p.area}` : ''}`, { icon: '🔔', duration: 6000 });
      }
    };

    socket.on('job.status', onJob);
    socket.on('job.update', onJob);
    socket.on('job.available', onAvailable);
    socket.on('repair.quote', onQuote);
    socket.on('repair.quote_decision', onQuote);
    return () => {
      socket.off('job.status', onJob);
      socket.off('job.update', onJob);
      socket.off('job.available', onAvailable);
      socket.off('repair.quote', onQuote);
      socket.off('repair.quote_decision', onQuote);
    };
  }, [token, alerts, dispatch]);
}
