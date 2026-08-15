/**
 * Canonical Socket.io event contract (C5).
 * ----------------------------------------------------------------------------
 * EVERY name below was read out of the server source. Do not add an event here
 * unless you can point at the `emit(...)` / `publish(...)` that produces it.
 *
 * Emit sites:
 *   - `server/src/sockets/index.js`            — direct emits + pub/sub bridge
 *   - `server/src/modules/order/order.service.js`
 *   - `server/src/modules/worker/eta.service.js`
 *   - `server/src/modules/chat/chat.service.js`
 *   - `server/src/jobs/dispatch.worker.js`
 *   - `server/src/jobs/stale-order.worker.js`
 *
 * Events published on the Redis `order:event` channel are re-emitted by the
 * bridge into room `order:<id>` under `data.event`, so the client listens for
 * the inner event name (e.g. `order.status`), never `order:event` itself.
 *
 * Two events the previous implementation listened for — `worker.assigned` and
 * `order.status` used as an assignment signal — do not exist in that form.
 * Assignment arrives as an `order.status` payload with `status: 'assigned'`.
 * ----------------------------------------------------------------------------
 */

import type { ChatMessage, OrderStatus, JobOffer } from '../../types/api';

// ── Server → client payloads ─────────────────────────────────────────────────

/** `order.status` — order.service.js. The single source of lifecycle changes. */
export interface OrderStatusEvent {
  status: OrderStatus;
  at: string;
}

/** `worker.location` — sockets/index.js. Throttled server-side to 1/sec/order. */
export interface WorkerLocationEvent {
  lat: number;
  lng: number;
  at: number;
  /** Heading in degrees, or null when the fix had no bearing. */
  hdg: number | null;
  /** Speed in m/s, or null. */
  spd: number | null;
}

/** `order.eta` — eta.service.js. Only emitted while status is `on_the_way`. */
export interface OrderEtaEvent {
  etaMinutes?: number;
  distanceMetres?: number;
  arrivingSoon?: boolean;
  [key: string]: unknown;
}

/** `order.dispatch_update` — dispatch.worker.js. Search-radius progress. */
export interface OrderDispatchUpdateEvent {
  message: string;
  radiusKm?: number;
  radiusLabel?: string;
  step?: number;
  totalSteps?: number;
  elapsedSec?: number;
}

/** `order.cancelled` — order.service.js / stale-order.worker.js. */
export interface OrderCancelledEvent {
  reason?: string;
  by?: string;
  [key: string]: unknown;
}

/** `notification` — notification.service.js via `notification:<kind>:<id>`. */
export interface NotificationEvent {
  _id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  deepLink?: string;
  createdAt: string;
}

/** `session:replaced` — sockets/index.js multi-device eviction (C6). */
export interface SessionReplacedEvent {
  reason: string;
}

/** `server:rooms_reset` — sockets/index.js on Redis reconnect (C6). */
export interface ServerRoomsResetEvent {
  reason: string;
  at: number;
}

/** `order:subscribed` / `order:subscribe_denied` — room-join acknowledgements. */
export interface OrderSubscribedEvent {
  orderId: string;
}
export interface OrderSubscribeDeniedEvent {
  orderId: string;
  reason: string;
}

/** `order.location_updated` — customer moved the pickup pin mid-order. */
export interface OrderLocationUpdatedEvent {
  lat?: number;
  lng?: number;
  address?: string;
  [key: string]: unknown;
}

// ── Worker-facing events ─────────────────────────────────────────────────────
// Bridged from Redis pub/sub by sockets/index.js's channel → event map. Every
// name here was read out of that bridge, not guessed — see the big switch in
// `subscriber.on('message', ...)`.

/** `new_job_request` — worker:offer channel. Broadcast model: first accept wins. */
export type JobOfferEvent = JobOffer;

/** `offer.cancelled` — another worker took it first; dismiss the offer popup. */
export interface OfferCancelledEvent {
  orderId: string;
}

/** `job.assigned` — force-assigned by admin/system, no accept step needed. */
export interface JobAssignedEvent {
  workerId: string;
  orderId: string;
  service: string;
  pickupAddress: string;
  price: number;
}

/** `offer.boosted` — customer/admin raised the price on an offer being viewed. */
export interface OfferBoostedEvent {
  orderId: string;
  amountPaise: number;
  rupees: number;
  newTotal: number;
}

/** `kyc.rejected` — admin rejected KYC; force the worker's UI offline. */
export interface KycRejectedEvent {
  status: string;
  reason?: string;
}

/** `job.pulled` — the stale-order watchdog pulled this job from the worker. */
export interface JobPulledEvent {
  orderId: string;
}

/**
 * Server → client event map. Used to type `socketClient.on(...)` so a typo in
 * an event name is a compile error rather than a listener that never fires.
 */
export interface ServerToClientEvents {
  // Order room — customer-facing
  'order.status': (payload: OrderStatusEvent) => void;
  'order.eta': (payload: OrderEtaEvent) => void;
  'order.dispatch_update': (payload: OrderDispatchUpdateEvent) => void;
  'order.cancelled': (payload: OrderCancelledEvent) => void;
  'order.worker_cancelled': (payload: OrderCancelledEvent) => void;
  'order.location_updated': (payload: OrderLocationUpdatedEvent) => void;
  'worker.location': (payload: WorkerLocationEvent) => void;
  'chat.message': (payload: ChatMessage) => void;

  // Room lifecycle
  'order:subscribed': (payload: OrderSubscribedEvent) => void;
  'order:subscribe_denied': (payload: OrderSubscribeDeniedEvent) => void;

  // Personal room
  notification: (payload: NotificationEvent) => void;

  // Session / infrastructure
  'session:replaced': (payload: SessionReplacedEvent) => void;
  'server:rooms_reset': (payload: ServerRoomsResetEvent) => void;

  // Worker personal room (`worker:<id>`, joined automatically on connect
  // for a worker-role socket — see sockets/index.js's room-join on connect)
  new_job_request: (payload: JobOfferEvent) => void;
  'offer.cancelled': (payload: OfferCancelledEvent) => void;
  'job.assigned': (payload: JobAssignedEvent) => void;
  'offer.boosted': (payload: OfferBoostedEvent) => void;
  'kyc.rejected': (payload: KycRejectedEvent) => void;
  'job.pulled': (payload: JobPulledEvent) => void;
}

/** Client → server events the customer app is allowed to emit. */
export interface ClientToServerEvents {
  'order:subscribe': (payload: { orderId: string }) => void;
  'order:unsubscribe': (payload: { orderId: string }) => void;
  /**
   * Worker-only. The server drops this for any non-worker role, so the customer
   * app never emits it — declared here for completeness of the contract.
   */
  'worker:location': (payload: {
    lat: number;
    lng: number;
    orderId?: string;
    hdg?: number;
    spd?: number;
    acc?: number;
    mock?: boolean;
  }) => void;
}

export type ServerEventName = keyof ServerToClientEvents;

/**
 * Events scoped to an `order:<id>` room. After `server:rooms_reset` the client
 * must re-subscribe to every order room it cares about — the Redis adapter
 * loses membership when it restarts.
 */
export const ORDER_ROOM_EVENTS: readonly ServerEventName[] = [
  'order.status',
  'order.eta',
  'order.dispatch_update',
  'order.cancelled',
  'order.worker_cancelled',
  'order.location_updated',
  'worker.location',
  'chat.message',
] as const;
