/**
 * API types shared by every ZappyOne app.
 * ----------------------------------------------------------------------------
 * Only what the apps use today: sign-in, profile, addresses, notifications,
 * support, disputes and content. Add a type here when a screen needs it, with
 * the field names the server actually sends.
 * ----------------------------------------------------------------------------
 */

export type Role = 'user' | 'worker' | 'shop' | 'event_partner' | 'admin';

export type PaymentMethod = 'cash' | 'upi' | 'card';

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  _id: string;
  name?: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  rating?: number;
  createdAt?: string;
}

export interface OtpRequestResponse {
  ok: true;
  isNewUser?: boolean;
  cooldownSec?: number;
  resendsLeft?: number;
  expiresInSec?: number;
  /** Dev convenience only — the server force-nulls this in production. */
  otp?: string;
}

export interface UserLoginResponse {
  accessToken: string;
  /** Present only because the client sends `X-Client-Type: mobile`. */
  refreshToken: string;
  user: UserProfile;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  role: Role;
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  deepLink?: string;
  readAt?: string | null;
  createdAt: string;
}

// ── User profile sub-resources ───────────────────────────────────────────────

/** `users/addresses` entry. Coordinates stored as separate lat/lng on the user. */
/**
 * A saved address as the app uses it — coordinates flattened to `lat`/`lng`.
 *
 * The wire format is NOT this. `GET /users/addresses` returns each entry with a
 * GeoJSON `location: { type: 'Point', coordinates: [lng, lat] }` and no flat
 * fields at all (`user.model.js` → `savedAddresses`), while `POST` accepts flat
 * `lat`/`lng`. The read side is normalised in `authApi.getAddresses` so screens
 * see one shape; writes keep sending flat coordinates, which is what the route
 * expects.
 *
 * Note the axis order: GeoJSON is [longitude, latitude], the reverse of how
 * every screen names them.
 */
export interface SavedAddress {
  _id: string;
  label?: string;
  tag?: 'home' | 'work' | 'other';
  address: string;
  lat: number;
  lng: number;
  landmark?: string;
  flatNumber?: string;
  notes?: string;
  isDefault?: boolean;
}

/**
 * A place the customer booked to recently.
 *
 * Unlike `savedAddresses`, these are stored with FLAT `lat`/`lng` on the server
 * (`user.model.js` → `recentLocations`), so no coordinate normalisation applies.
 * They are write-on-book: `POST /users/recent-location` de-duplicates by address
 * and keeps the newest 10; the read endpoint returns the newest 5 by `usedAt`.
 * There is no id — the address string is the key the server de-duplicates on.
 */
export interface RecentLocation {
  address: string;
  lat: number;
  lng: number;
  usedAt?: string;
}

/** Both lists from `GET /users/addresses`, which returns them together. */
export interface SavedLocations {
  addresses: SavedAddress[];
  recentLocations: RecentLocation[];
}

/** Raw `GET /users/addresses` entry, before normalisation. */
export interface SavedAddressWire {
  _id: string;
  label?: string;
  tag?: 'home' | 'work' | 'other';
  address: string;
  location?: { type?: string; coordinates?: number[] };
  landmark?: string;
  flatNumber?: string;
  notes?: string;
  isDefault?: boolean;
}

/** `users/payment-methods` entry — tokenized reference, never raw card data. */
export interface StoredPaymentMethod {
  _id: string;
  type: PaymentMethod;
  label?: string;
  last4?: string;
  upiId?: string;
  isDefault?: boolean;
}

// ── Content ──────────────────────────────────────────────────────────────────

/**
 * One question, as `GET /content/faqs` actually returns it.
 *
 * NOTE THE KEY: the server sends `id`, not `_id` — `content.service.js`
 * projects `{ id: String(f._id), question, answer }`. This type previously
 * declared `_id`, which is why the Support screen keyed its list on
 * `undefined`.
 */
export interface Faq {
  id: string;
  question: string;
  answer: string;
}

/**
 * `GET /content/faqs` returns FAQs GROUPED BY CATEGORY, not as a flat list:
 *
 *   { faqs: [ { category: 'Bookings', items: [ …Faq ] }, … ] }
 *
 * The screen used to map the group array as if each element were a question,
 * so every row rendered blank.
 */
export interface FaqGroup {
  category: string;
  items: Faq[];
}

/**
 * A policy page.
 *
 * `body` IS ONLY PRESENT ON THE DETAIL ENDPOINT. `GET /content/policies`
 * projects `slug title` alone, so a list entry can never render its text —
 * the body has to be fetched per slug from `GET /content/policy/:slug`.
 */
export interface PolicyDoc {
  slug: string;
  title: string;
  body?: string;
  updatedAt?: string;
}

/** A list entry: guaranteed to carry a slug and a title, never a body. */
export type PolicySummary = Pick<PolicyDoc, 'slug' | 'title'>;

// ── Worker ───────────────────────────────────────────────────────────────────

export type KycStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | 'suspended';

/**
 * `GET /workers/kyc/status`, unwrapped from its `{ kyc: … }` envelope.
 *
 * The controller returns the whole `kyc` sub-document, so everything the model
 * defines is on the wire. The fields below are the ones the app has a use for.
 *
 * THE `*Url` FIELDS ARE PRIVATE S3 KEYS, NOT URLS. They are not fetchable
 * without an authenticated round-trip through `/workers/kyc/stream/:docType`.
 * The app treats them ONLY as a boolean "this document is on file" signal —
 * it never renders them, puts them in a route, or logs them.
 */
export interface WorkerKyc {
  status: KycStatus;
  aadhaarUrl?: string;
  licenseUrl?: string;
  selfieUrl?: string;
  clarification?: { active: boolean; message?: string } | null;
  changeRequest?: { status: 'pending' | 'approved' | 'denied' | null; message?: string; denialReason?: string } | null;

  /** Admin's free-text reason, set when a submission is rejected. */
  rejectionReason?: string | null;
  /** Lifetime rejections. The server suspends KYC at 5. */
  rejectionCount?: number;
  /** ISO. Start of the 24h resubmission cooldown the server enforces. */
  lastRejectedAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  /** True when this submission replaces already-approved documents. */
  isUpdate?: boolean;
}

/** `worker.model.js`, as returned by `GET /workers/me`. */
/**
 * `GET /workers/me`, unwrapped from its `{ worker: … }` envelope.
 *
 * The fields after `currentLocation` are all returned by the live endpoint and
 * were simply missing from this type — `currentOrderId` in particular is the
 * server's own pointer at the job in progress, which is more reliable than
 * scanning the orders list for an active status.
 */
export interface WorkerProfile {
  _id: string;
  phone: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  skills: string[];
  rating: number;
  totalJobs: number;
  completedJobs: number;
  kyc: WorkerKyc;
  isOnline: boolean;
  isAvailable: boolean;
  isBlocked?: boolean;
  currentLocation?: { coordinates: [number, number] };

  /** ISO timestamp of when this online session began; null when offline. */
  onlineSince?: string | null;
  /** The job currently held, straight from the server. */
  currentOrderId?: string | null;
  /** Rupees. `balance` is withdrawable, `totalEarnings` is lifetime. */
  wallet?: { balance: number; totalEarnings: number };
  skillPrimary?: string | null;
  /** Offer/reject counters the server keeps for acceptance-rate enforcement. */
  penalties?: {
    totalOffers?: number;
    totalRejects?: number;
    [key: string]: unknown;
  };
}

// ── Error envelope ───────────────────────────────────────────────────────────

/**
 * The server's structured error shape. `code` is the machine-readable
 * discriminator ENTERPRISE-ADDITIONS.md §8 describes — switch on it, not on
 * the human-readable `error` string.
 */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: string[];
}

export interface ApiError {
  status?: number;
  /**
   * The server's body, when there was one. A transport failure leaves this
   * undefined rather than smuggling axios's own message in as a string — that
   * is what used to surface "Network Error" to users.
   */
  data?: ApiErrorBody | string;
  /** Classification added by `services/api/apiError.ts`. */
  normalized?: import('../api/apiError').NormalizedApiError;
}

// ── Support tickets ─────────────────────────────────────────────────────────
// Mirrors server/src/modules/engagement/support-ticket.model.js. A ticket is
// general help ("I can't log in", "KYC is stuck") and may reference an order
// without requiring one — which is what separates it from a Dispute.

export const SUPPORT_CATEGORIES = [
  'payment', 'account', 'order', 'kyc', 'app_bug', 'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export type SupportStatus =
  | 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';

/** One entry in a ticket or dispute thread. `from` says which side wrote it. */
export interface ThreadMessage {
  from: 'user' | 'worker' | 'admin';
  fromId?: string;
  text: string;
  at: string;
}

export interface SupportTicket {
  _id: string;
  category: SupportCategory;
  subject: string;
  description: string;
  attachments?: string[];
  orderId?: string;
  status: SupportStatus;
  priority: SupportPriority;
  messages?: ThreadMessage[];
  firstResponseAt?: string;
  resolvedAt?: string;
  slaDeadline?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTicketRequest {
  category: SupportCategory;
  subject: string;
  description: string;
  orderId?: string;
  priority?: SupportPriority;
}

// ── Disputes ────────────────────────────────────────────────────────────────
// Mirrors server/src/modules/dispute/dispute.model.js. Order-specific, with a
// financial resolution attached — refunds, worker penalties.

export const DISPUTE_CATEGORIES = [
  'service_not_done', 'poor_quality', 'overcharged', 'no_show',
  'wrong_address', 'damage', 'rude_behavior', 'safety_concern', 'other',
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

/**
 * NOTE the value is `under_review`, not `in_review`. The website's
 * DisputesPage.jsx keys its badge map on `in_review`, so a dispute in this
 * state falls through to its "Open" fallback there. The server enum is the
 * authority and is what mobile uses.
 */
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';

export type DisputeResolutionType =
  | 'refund_full' | 'refund_partial' | 'no_action'
  | 'worker_penalty' | 'worker_warning' | 'split_decision';

export interface DisputeResolution {
  type?: DisputeResolutionType;
  refundAmountPaise?: number;
  penaltyAmountPaise?: number;
  adminNotes?: string;
  resolvedAt?: string;
}

export interface Dispute {
  _id: string;
  orderId?: string;
  category: DisputeCategory;
  description: string;
  evidenceUrls?: string[];
  status: DisputeStatus;
  resolution?: DisputeResolution;
  messages?: ThreadMessage[];
  slaDeadline?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface OpenDisputeRequest {
  /**
   * Optional in the route's Joi schema, but `dispute.service.open()` does an
   * unconditional `Order.findById(orderId)` and 404s when it misses — so in
   * practice it is required. Mobile only ever raises a dispute from an order,
   * so it is always supplied.
   */
  orderId: string;
  category: DisputeCategory;
  description: string;
  evidenceUrls?: string[];
}
