/**
 * The Socket.IO contract, as the server sends it today.
 * ----------------------------------------------------------------------------
 * Source of truth: server/src/sockets/index.js (rooms, location) and
 * server/src/modules/jobs/job-events.js (every job kind: repair, pet care,
 * helping, events). Field names are the emit sites' own — a renamed field here
 * silently reads `undefined`, so check the server before changing one.
 *
 * Rooms: a screen showing one job joins its room with `order:subscribe`
 * (the name is historical; it serves every job kind). Personal channels
 * (`job.update`, `job.offer`, `job.available`, `notification`) need no join.
 * ----------------------------------------------------------------------------
 */

/** Every kind of job the platform runs (server jobs/kinds.js). */
export type JobKind = 'repair' | 'pet' | 'helping' | 'event' | 'order';

/** `job.status` (job room) and `job.update` (personal channel). `MOVED`: support passed it to another provider. */
export interface JobStatusEvent {
  kind: JobKind;
  id: string;
  status: string;
  reference?: string;
  at: string;
}

/** Before acceptance a job shows the area and a rounded pin, never the house (server jobs/privacy). */
interface JobPreview {
  kind: JobKind;
  id: string;
  reference?: string;
  area?: string;
  /** [lng, lat], rounded. */
  coordinates?: [number, number] | null;
  customer?: { rating?: number | null; ratingCount?: number; flagged?: boolean } | null;
  [summary: string]: unknown;
}

/** `job.offer` — this provider is being offered the job; it rings until `expiresAt`. */
export interface JobOfferEvent extends JobPreview {
  status: string;
  at: string;
  expiresAt: string;
  windowSec: number;
}

/** `job.available` — an open job nearby that any eligible provider can take. */
export interface JobAvailableEvent extends JobPreview {
  line?: string;
  km?: number;
}

/** `job.assigned` / `job.pulled` — a shop gave this technician a job, or took it back. */
export interface JobAssignedEvent {
  kind: JobKind;
  id: string;
  status?: string;
  reference?: string;
}

/** `offer.boosted` / `offer.cancelled` — the customer raised the pay, or the offer ended. */
export interface OfferChangedEvent {
  kind?: JobKind;
  id?: string;
  orderId?: string;
  [field: string]: unknown;
}

/** `worker.location` — the provider's live position, in the job room. */
export interface WorkerLocationEvent {
  lat: number;
  lng: number;
  at: number;
  /** Heading in degrees, or null when the fix had no bearing. */
  hdg: number | null;
  /** Speed in m/s, or null. */
  spd: number | null;
}

/** `notification` — the in-app copy of a push. */
export interface NotificationEvent {
  _id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  deepLink?: string;
  createdAt: string;
}

/** `repair.offer` — a repair offered to this provider (repair/services/events.service announceOffer). */
export interface RepairOfferEvent {
  bookingId: string;
  reference?: string;
  device?: string;
  problemCodes: string[];
  repairCode: string | null;
  serviceMode?: string;
  totalPaise: number;
  /** Customer's boost: all of it is the provider's. */
  boostPaise: number;
  /** The provider's share of the surge. */
  surgePaise: number;
  isEstimate: boolean;
  paymentMethod?: string;
  address?: string;
  landmark?: string;
  /** [lng, lat] */
  coordinates?: [number, number] | null;
  scheduledAt?: string | null;
  slotLabel?: string;
  expiresAt: string;
  windowSec: number;
  customer?: { rating?: number | null; ratingCount?: number; flagged?: boolean } | null;
}

/** `repair.offer_closed` — take the offer off the screen. */
export interface RepairOfferClosedEvent {
  bookingId: string;
  reason: string;
}

/** `repair.quote` / `repair.quote_decision` — a quote sent or answered (repair job room). */
export interface RepairQuoteEvent {
  [field: string]: unknown;
}

/** `worker.presence` — the server took the provider offline (e.g. no location signal). */
export interface WorkerPresenceEvent {
  online: boolean;
  reason?: string;
  at: string;
}

/** `chat.message` — a message on a job's chat (jobs/job-chat). */
export interface ChatMessageEvent {
  kind: JobKind;
  jobId: string;
  id: string;
  text: string;
  from: string;
  at: string;
  /** True on the sender's own devices. */
  mine: boolean;
}

/** `eta.update` — how far the provider is, in the job room (worker/eta.service). */
export interface EtaUpdateEvent {
  distKm: number;
  etaMinutes: number;
  isArrivingSoon: boolean;
  source?: string;
  at: number;
}

/** `surge.alert` — a busy zone near a provider (server jobs/surge). */
export interface SurgeAlertEvent {
  [field: string]: unknown;
}

/** `kyc.rejected` — documents need another look. */
export interface KycRejectedEvent {
  reason?: string;
  [field: string]: unknown;
}

/** `session:replaced` — signed in on another device. */
export interface SessionReplacedEvent {
  reason: string;
}

/** `server:rooms_reset` — the server lost room membership; rejoin every room. */
export interface ServerRoomsResetEvent {
  reason: string;
  at: number;
}

/** Room-join acknowledgements. */
export interface RoomSubscribedEvent {
  orderId: string;
}
export interface RoomSubscribeDeniedEvent {
  orderId: string;
  reason: string;
}

export interface ServerToClientEvents {
  'job.status': (payload: JobStatusEvent) => void;
  'job.update': (payload: JobStatusEvent) => void;
  'job.offer': (payload: JobOfferEvent) => void;
  'job.available': (payload: JobAvailableEvent) => void;
  'job.assigned': (payload: JobAssignedEvent) => void;
  'job.pulled': (payload: JobAssignedEvent) => void;
  'offer.boosted': (payload: OfferChangedEvent) => void;
  'offer.cancelled': (payload: OfferChangedEvent) => void;
  'worker.location': (payload: WorkerLocationEvent) => void;
  notification: (payload: NotificationEvent) => void;
  'surge.alert': (payload: SurgeAlertEvent) => void;
  'repair.offer': (payload: RepairOfferEvent) => void;
  'repair.offer_closed': (payload: RepairOfferClosedEvent) => void;
  'repair.quote': (payload: RepairQuoteEvent) => void;
  'repair.quote_decision': (payload: RepairQuoteEvent) => void;
  'worker.presence': (payload: WorkerPresenceEvent) => void;
  'chat.message': (payload: ChatMessageEvent) => void;
  'eta.update': (payload: EtaUpdateEvent) => void;
  'kyc.rejected': (payload: KycRejectedEvent) => void;
  'session:replaced': (payload: SessionReplacedEvent) => void;
  'server:rooms_reset': (payload: ServerRoomsResetEvent) => void;
  'order:subscribed': (payload: RoomSubscribedEvent) => void;
  'order:subscribe_denied': (payload: RoomSubscribeDeniedEvent) => void;
}

export interface ClientToServerEvents {
  /** Join / leave one job's room (any kind). */
  'order:subscribe': (payload: { orderId: string }) => void;
  'order:unsubscribe': (payload: { orderId: string }) => void;
  /**
   * Providers only; the server ignores it from customers. `mock` reports the
   * device's own mock-location flag, so spoofed GPS can be caught.
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

/** Events scoped to a job room: after `server:rooms_reset`, rejoin every room you were in. */
export const JOB_ROOM_EVENTS: readonly ServerEventName[] = ['job.status', 'worker.location', 'eta.update', 'repair.quote', 'repair.quote_decision'] as const;
