/**
 * API models mirroring the existing backend contracts.
 * ----------------------------------------------------------------------------
 * Every type here was derived by reading `server/src/modules/**` — the Mongoose
 * schemas and the controllers' `res.json(...)` shapes. Nothing is invented.
 *
 * Where the server marks a field optional or only populates it on certain
 * statuses, the type says so. That is deliberate: it forces call sites to
 * handle the "not assigned yet" / "not completed yet" cases instead of the
 * `any` casts these screens used before.
 * ----------------------------------------------------------------------------
 */

// ── Shared ───────────────────────────────────────────────────────────────────

/** `server/src/modules/order/order.model.js` → ORDER_STATUSES */
export type OrderStatus =
  | 'created'
  | 'searching'
  | 'assigned'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** Statuses where the order is still live and worth polling/subscribing to. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'created',
  'searching',
  'assigned',
  'on_the_way',
  'arrived',
  'in_progress',
] as const;

export type Role = 'user' | 'worker' | 'admin';

export type PaymentMethod = 'cash' | 'upi' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type BookingTier = 'standard' | 'priority' | 'express';
export type OrderPriority = 'normal' | 'emergency';
export type ServiceMode = 'doorstep' | 'pickup';
export type PartsTier = 'OEM' | 'Premium' | 'Compatible' | 'Budget';

/** GeoJSON Point as stored by Mongo — coordinates are [lng, lat], NOT [lat, lng]. */
export interface GeoPoint {
  type?: 'Point';
  coordinates: [number, number];
  address: string;
  landmark?: string;
  flatNumber?: string;
  notes?: string;
}

/** Plain lat/lng pair — the shape the API accepts on write. */
export interface LatLng {
  lat: number;
  lng: number;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

/** `service-catalog.model.js`. Prices are in PAISE — divide by 100 for rupees. */
export interface ServiceCatalogItem {
  _id: string;
  code: string;
  name: string;
  icon?: string;
  category: string;
  subcategory?: string;
  shortDescription?: string;
  description?: string;
  imageUrl?: string;
  coverImage?: string;
  galleryImages?: string[];
  estimatedDurationMinutes: number;
  servicePricePaise?: number;
  priceRangeMinPaise: number;
  priceRangeMaxPaise: number;
  inspectionFeePaise?: number;
  checklist?: { item: string; required: boolean }[];
  guidelines?: string[];
  requiredTools?: string[];
  requiredSkills?: string[];
  isFeatured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** `category.model.js` — drives per-category theming, icons and brand pickers. */
export interface CategoryTheme {
  accent: string;
  deep: string;
  tint: string;
  soft: string;
  glow: string;
}

export interface ServiceCategory {
  _id: string;
  key: string;
  customerLabel: string;
  workerLabel?: string;
  /** Lucide icon name — map to a component, fall back to a default. */
  icon?: string;
  theme?: CategoryTheme;
  brands?: string[];
  brandCategory?: string;
  matchCategories?: string[];
  codePrefixes?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

// ── Pricing / quotes ─────────────────────────────────────────────────────────

/** Pricing snapshot locked onto the order at creation. Rupees unless `*Paise`. */
export interface OrderPricing {
  baseFee?: number;
  distanceKm?: number;
  distanceFee?: number;
  etaMinutes?: number;
  timeFee?: number;
  platformFee?: number;
  surgeMultiplier?: number;
  tierMultiplier?: number;
  subtotal?: number;
  total?: number;
  totalPaise?: number;
  tipPaise?: number;
  boostedTotal?: number;
  subtotalBeforeDiscount?: number;
  discountPaise?: number;
  currency?: string;
}

/**
 * `GET /api/orders/quote` response, unwrapped from its `quote` envelope.
 *
 * The pricing engine returns a DIFFERENT set of keys per vertical — the fields
 * below are the union observed across all 13 live service categories, and none
 * of them is guaranteed except `total` and `currency`. `OrderPricing` above
 * describes only the legacy home-services shape, which is why this is separate.
 *
 * The index signature is intentional: a new vertical (or a new fee inside an
 * existing one) must not be a compile error, and `normalizeQuote` in
 * components/booking/quote.ts is written to surface unmapped fees rather than
 * drop them. Read it through `normalizeQuote`, not field by field.
 */
export interface ServiceQuote {
  total: number;
  currency?: string;
  subtotal?: number;
  vertical?: string;
  service?: string;

  // Legacy home services (electrical, carpentry, appliance, plumbing)
  baseFee?: number;
  distanceKm?: number;
  distanceFee?: number;
  etaMinutes?: number;
  timeFee?: number;
  platformFee?: number;
  surgeMultiplier?: number;
  isUserPremium?: boolean;

  // Vehicle
  baseVisitFee?: number;
  emergencySurcharge?: number;
  nightSurcharge?: number;

  // Electronics (mobile / laptop / smart_device)
  inspectionFee?: number;
  visitFee?: number;
  diagnostic?: number;
  /** `mobile` spells it -or-, `laptop`/`smart_device` spell it -our-. Both live. */
  laborFee?: number;
  labourFee?: number;
  sparePartFee?: number;
  urgentSurcharge?: number;
  warrantyDays?: number;
  partsTier?: string;
  pricingSource?: string;

  // Family assist / pet
  serviceFee?: number;

  // Event crew
  crewSize?: number;
  estimatedHours?: number;
  perHourPerMember?: number;
  ceilingApplied?: boolean;

  /** Server-authored caveat, e.g. "Parts cost quoted separately after diagnosis". */
  note?: string;
  /** Present on some verticals; mirrors the rupee fields in paise. */
  paise?: Record<string, number>;

  [key: string]: unknown;
}

/** Query params accepted by `GET /api/orders/quote`. */
export interface QuoteRequest {
  service: string;
  pickupLat: number;
  pickupLng: number;
  dropLat?: number;
  dropLng?: number;
  deviceBrand?: string;
  deviceModel?: string;
  deviceSeries?: string;
  partsTier?: PartsTier;
  vehicleType?: string;
  pricingModel?: 'standard' | 'hourly' | 'project';
  estimatedHours?: number;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  paidAt?: string;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  at: string;
  meta?: Record<string, unknown>;
}

/**
 * The order as returned by `GET /api/orders/:id` and `GET /api/orders/mine`.
 * Fields after `statusHistory` are decorated by the controller, not schema
 * fields — see `order.controller.js:getOne`.
 */
export interface Order {
  _id: string;
  userId: string;
  workerId?: string | null;
  service: string;
  subCategory?: string;
  description?: string;
  images?: string[];
  status: OrderStatus;
  statusHistory?: OrderStatusHistoryEntry[];
  pickupLocation: GeoPoint;
  dropLocation?: Partial<GeoPoint>;
  pricing?: OrderPricing;
  payment?: OrderPayment;
  priority?: OrderPriority;
  tier?: BookingTier;
  serviceMode?: ServiceMode;
  scheduledAt?: string | null;
  promoCode?: string | null;
  completionPhotos?: string[];
  userRating?: number;
  userReview?: string;
  ratingSubmittedAt?: string;
  createdAt: string;
  updatedAt: string;

  /** Start-service OTP. Visible to the owner and the assigned worker only. */
  otp?: string;

  // Controller-decorated fields (present on GET /orders/:id)
  userName?: string | null;
  workerName?: string | null;
  workerJobs?: number;
  workerRating?: number | null;
  /** Worker's last known position — seeds the map before the first socket tick. */
  workerCurrentLocation?: LatLng;

  // Shop routing (Nearby Shops / Pick & Go) — see server order.model.js
  preferredShopId?: string | null;
  fulfillmentMode?: 'on_site' | 'pickup_at_shop';
  shopHandoff?: {
    shopId: string | null;
    requestedBy: 'customer' | 'worker' | null;
    reason?: string;
    requestedAt?: string;
    status: 'none' | 'pending_confirmation' | 'confirmed' | 'declined';
    respondedAt?: string;
  };
}

/** `POST /api/orders` body — mirrors `createOrderSchema` in order.routes.js. */
export interface CreateOrderRequest {
  service: string;
  pickupLocation: LatLng & {
    address: string;
    landmark?: string;
    flatNumber?: string;
    notes?: string;
  };
  dropLocation?: LatLng & { address: string };
  subCategory?: string;
  description?: string;
  images?: string[];
  scheduledAt?: string | null;
  paymentMethod?: PaymentMethod;
  priority?: OrderPriority;
  deviceBrand?: string;
  deviceModel?: string;
  deviceSeries?: string;
  partsTier?: PartsTier;
  serviceMode?: ServiceMode;
  vehicleType?: 'bike' | 'scooter' | 'car';
  teamSize?: number;
  diagnosisAnswers?: Record<string, unknown>;
  diagnosisUrgency?: 'normal' | 'high' | 'urgent';
  promoCode?: string | null;
  /** Surge protection — server rejects if a fresh quote differs by >20%. */
  quotedTotalRupees?: number;
  tier?: BookingTier;
  tipAmount?: number;
  preferredWorkerId?: string | null;
  /** Shop routing — set only when booked via "Nearby Shops". */
  preferredShopId?: string | null;
  fulfillmentMode?: 'on_site' | 'pickup_at_shop';
}

/**
 * `GET /api/orders/:id/cancel-preview`.
 *
 * Verified against the live response and `cancellation.service.js`. The
 * previous client type declared `refundPaise`, which the server never sends,
 * and omitted `canCancel` — the field that decides whether the button should
 * exist at all.
 *
 * NOTE a real inconsistency in the backend: `canCancel` is false for `arrived`,
 * but `cancelByUser` still accepts `arrived`. The preview is the stricter of
 * the two, so gating the UI on it can only ever hide a cancel the server would
 * have allowed — never offer one it would reject.
 */
export interface CancelPreview {
  /** Cancellation fee in paise. 0 before a worker commits. */
  feePaise: number;
  /** Same figure in rupees, server-rounded. */
  feeRupees: number;
  isFree: boolean;
  /** Why this fee applies, e.g. `no_worker_assigned`, `within_grace_period`. */
  reason?: string;
  /** Seconds left in the free-cancel window; null before assignment. */
  secsLeft?: number | null;
  workerCompensationPaise?: number;
  /** Server-authored explanation. Display this rather than composing one. */
  message?: string;
  canCancel: boolean;
}

/** `GET /api/orders/mine` response envelope. */
export interface PaginatedOrders {
  orders: Order[];
  total: number;
  totalPages: number;
  page: number;
}

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

// ── Chat ─────────────────────────────────────────────────────────────────────

/** `chat-message.model.js`, as emitted by `chat.service.js`. */
export interface ChatMessage {
  _id: string;
  from: { kind: 'user' | 'worker'; id: string };
  text: string;
  cannedCode?: string;
  createdAt: string;
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

// ── Payments (Cashfree) ──────────────────────────────────────────────────────

export type PaymentPurpose = 'subscription' | 'wallet_topup' | 'order_payment';

/** `POST /api/payments/create-order` body. */
export interface CreatePaymentOrderRequest {
  purpose: PaymentPurpose;
  planCode?: string;
  amountPaise?: number;
  orderId?: string;
  /** Mobile only — where Cashfree's hosted checkout redirects after payment. */
  returnUrl?: string;
}

/** `POST /api/payments/verify` body — Cashfree identifiers, not Razorpay. */
export interface VerifyPaymentRequest {
  cfOrderId: string;
  cfPaymentId: string;
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

// ── Wallet ───────────────────────────────────────────────────────────────────

/**
 * `GET /wallet`, unwrapped from its `{ wallet: … }` envelope.
 * `dues` is only present when the account carries an outstanding amount
 * (`wallet.controller.js` merges it in conditionally).
 */
export interface Wallet {
  balancePaise: number;
  currency?: string;
  isFrozen?: boolean;
  dues?: { amountPaise?: number; reason?: string } | null;
}

export interface WalletTransaction {
  _id: string;
  type: 'credit' | 'debit';
  amountPaise: number;
  reason?: string;
  description?: string;
  balanceAfterPaise?: number;
  createdAt: string;
}

/**
 * `GET /wallet/transactions`. The array is under `items`, NOT `transactions` —
 * verified against the live response. The client previously read
 * `r.transactions`, so the history list was permanently empty.
 */
export interface PaginatedWalletTransactions {
  items: WalletTransaction[];
  total?: number;
  page?: number;
  limit?: number;
}

// ── Rewards ──────────────────────────────────────────────────────────────────

export interface ScratchCard {
  _id: string;
  status: 'locked' | 'unlocked' | 'scratched';
  rewardType?: 'points' | 'cashback' | 'discount';
  rewardValue?: number;
  scratchedAt?: string | null;
}

/**
 * `GET /rewards`. Field names verified against the live response — the previous
 * declaration had `tier` and `lifetimePoints`, neither of which the server
 * sends, and omitted the redemption rules the screen needs to explain itself.
 */
export interface RewardsSummary {
  /** False when the rewards programme is switched off server-side. */
  enabled?: boolean;
  points: number;
  /** What `points` is worth today, already computed by the server. */
  redeemableRupees?: number;
  /** Redemption floor; below this the redeem action is refused. */
  minRedeemPoints?: number;
  redeemPaisePerPoint?: number;
  lifetimeEarned?: number;
  lifetimeRedeemed?: number;
  scratchCards?: ScratchCard[];
  history?: { _id: string; points: number; reason?: string; createdAt: string }[];
}

/**
 * `GET /gamification`, unwrapped from its `{ gamification: … }` envelope.
 * The previous inline type claimed a `nextMilestone` the server never sends.
 */
export interface Gamification {
  level: number;
  label: string;
  xp: number;
  nextLevelXp: number;
  nextLevelLabel?: string;
  /** 0–1 toward the next level. */
  progress: number;
  streak: number;
  totalOrders: number;
  badges: string[];
}

// ── Plans / subscription ─────────────────────────────────────────────────────

export interface Plan {
  _id: string;
  code: string;
  name: string;
  pricePaise: number;
  durationDays?: number;
  benefits?: string[];
  tagline?: string;
}

export interface Subscription {
  _id?: string;
  planCode?: string;
  status?: 'active' | 'expired' | 'cancelled' | 'none';
  startedAt?: string;
  expiresAt?: string | null;
  autoRenew?: boolean;
}

// ── Payments (Cashfree order-create response) ────────────────────────────────

export interface PaymentOrderResponse {
  paymentIntentId: string;
  cfOrderId: string;
  paymentSessionId: string;
  amountPaise: number;
  currency: string;
  /** 'sandbox' | 'production' — picks the hosted-checkout host on mobile. */
  cashfreeEnv: 'sandbox' | 'production';
}

// ── Search / discovery ───────────────────────────────────────────────────────

export interface SearchResult {
  code: string;
  name: string;
  category?: string;
  icon?: string;
  priceFromPaise?: number;
  reason?: string;
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

/** `POST /workers/kyc/submit` body — `*Url` fields are actually S3 keys from the presign flow. */
export interface SubmitKycRequest {
  aadhaarUrl: string;
  licenseUrl: string;
  selfieUrl: string;
  selfieMetadata?: {
    capturedAt?: string;
    captureMethod?: 'live_camera' | 'upload';
    lat?: number | null;
    lng?: number | null;
    geoStatus?: string;
    /** Which client produced the submission. The route caps this at 300 chars. */
    userAgent?: string;
  };
}

/** `GET /workers/earnings` response. */
/**
 * One completed job from `GET /workers/job-earnings`.
 *
 * EVERY MONETARY FIELD IS IN PAISE, including `gross`, which the controller
 * derives as `pricing.total * 100`. Divide by 100 for rupees — mixing these
 * with `WorkerEarnings.earningsRupees` without converting would be a 100×
 * error on a pro's income.
 */
export interface WorkerJobEarning {
  _id: string;
  /** Short human reference, e.g. `A1B2C3D4`. */
  orderId: string;
  service: string;
  serviceLabel: string;
  completedAt?: string;
  /** What the customer paid. */
  gross: number;
  /** Zappy's cut. */
  platformFee: number;
  /** What the worker keeps: worker share + bonus + tip. */
  net: number;
  bonus: number;
  tip: number;
  surgeMultiplier: number;
  /** Commission as a whole percent, server-computed. */
  commissionPct: number;
}

/** `GET /workers/job-earnings`. Paginated, 25 per page. */
export interface WorkerJobEarnings {
  jobs: WorkerJobEarning[];
  total: number;
  page: number;
  totalPages: number;
  /** Totals across the whole period, not just this page. All paise. */
  summary: {
    totalNet: number;
    totalTips: number;
    count: number;
    surgeCount: number;
  };
}

/**
 * `GET /workers/bank-accounts` — where earnings are sent.
 * Account numbers arrive already masked by the server (`XXXX1234`); the raw
 * number is never exposed to the client.
 */
export interface WorkerPayoutDestinations {
  banks: {
    _id?: string;
    label?: string;
    accountName?: string;
    /** Masked, e.g. `XXXX4321`. */
    accountNumber: string;
    bankName?: string;
    ifsc?: string;
    isDefault?: boolean;
  }[];
  upiIds: { _id?: string; upiId: string; upiLabel?: string; isDefault?: boolean }[];
}

export interface WorkerEarnings {
  range: string;
  jobs: number;
  earningsPaise: number;
  earningsRupees: number;
  commissionPaidPaise: number;
  avgEarningPerJobRupees: number;
  cashJobs: number;
  onlineJobs: number;
  dailyBreakdown: { date: string; jobs: number; earningsPaise: number }[];
}

/**
 * `new_job_request` socket payload (dispatch.worker.js's orderPayload) — a
 * DIFFERENT, lighter shape than `Order`. Broadcast to possibly several
 * workers at once; whoever accepts first wins (`POST /orders/:id/accept`).
 */
export interface JobOffer {
  _id: string;
  service: string;
  pickupAddress: string;
  pickupCoords: [number, number];
  price: number;
  basePrice: number;
  boostAmountPaise?: number;
  urgencyBonusPaise?: number;
  distanceKm?: string | null;
  etaMinutes?: number | null;
  expiresAt: string;
  tier: BookingTier;
  tierMultiplier?: number;
  description?: string | null;
  images?: string[];
  diagnosisUrgency?: string;
  requiredTools?: string[];
  vehicleType?: string | null;
  deviceBrand?: string | null;
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
  normalized?: import('../services/api/apiError').NormalizedApiError;
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

// ── Shops (Nearby Shops / Pick & Go — server/src/modules/shop) ──────────────
export interface Shop {
  _id: string;
  businessName: string;
  ownerName?: string;
  phone?: string;
  category?: string;
  services?: string[];
  address?: {
    text?: string;
    landmark?: string;
    location?: { coordinates: [number, number] };
  };
  coverImageUrl?: string;
  galleryImages?: string[];
  bio?: string;
  yearsActive?: number;
  rating?: number;
  reviewCount?: number;
  completedJobs?: number;
  isActive?: boolean;
  isBlocked?: boolean;
  kyc?: { status: 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | 'suspended' };
}

/* ─── Live catalog ─────────────────────────────────────────────────────────
 *
 * `GET /provider/onboarding/catalog` — PUBLIC, no auth. This is what a
 * customer can book TODAY, and it is the list the website's services page is
 * built from (`client/src/components/home/LiveServices.jsx`).
 *
 * Every field below is transcribed from the server's own response mapping in
 * `server/src/modules/onboarding/onboarding.controller.js` (`liveCatalog`).
 * Nothing here is widened to `any` and nothing is invented.
 *
 * ── WHY THIS LIST CAN COME BACK EMPTY ─────────────────────────────────────
 * A service line is only included when it is `status: 'live'` AND some
 * provider holds an APPROVED `ProviderEnrolment` for that exact line code.
 * "Live" alone is an admin opinion; the enrolment is proof somebody can
 * actually do the work. A domain with no live services is dropped entirely,
 * and a heading with no symptoms under it is dropped too.
 *
 * So `{ domains: [] }` is a legitimate, expected response in an environment
 * with no approved enrolments — it means "nothing is bookable yet", not "the
 * request failed". Screens must render an empty state for it rather than
 * treating it as an error.
 * ------------------------------------------------------------------------ */

/** Severity as stored on the problem catalog (`problem.model.js`). */
export type ProblemSeverity = 'low' | 'normal' | 'high' | 'critical';

/** One symptom a customer can pick. */
export interface LiveCatalogProblem {
  code: string;
  name: string;
  severity: ProblemSeverity;
  /** Some symptoms can never be honestly priced up front. */
  requiresDiagnosis: boolean;
}

/** A heading within a service — "Display", "Battery & Power". */
export interface LiveCatalogCategory {
  code: string;
  name: string;
  /** Lucide icon name; the client maps it to a component with a fallback. */
  icon: string;
  /** Admin artwork. Empty string (not null) when unset. */
  imageUrl: string;
  /** Never empty — the server drops headings with no problems. */
  problems: LiveCatalogProblem[];
}

/** A bookable service line. */
export interface LiveCatalogService {
  code: string;
  name: string;
  description: string;
  tagline: string;
  icon: string;
  imageUrl: string;
  /** Artwork key, falling back to the repair vertical. May be ''. */
  artKey: string;
  /** The customer-facing route this service opens. */
  path: string;
  isPopular: boolean;
  /** Shortlist of popular symptoms — server caps this at 8. */
  highlights: { code: string; name: string }[];
  coverage: LiveCatalogCategory[];
}

/** A top-level grouping — "Electronics", "Pet Care". */
export interface LiveCatalogDomain {
  code: string;
  name: string;
  description: string;
  icon: string;
  imageUrl: string;
  /** Never empty — the server drops domains with nothing live in them. */
  services: LiveCatalogService[];
}

export interface LiveCatalogResponse {
  domains: LiveCatalogDomain[];
}
