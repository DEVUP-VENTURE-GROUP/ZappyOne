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
}

/** `POST /api/payments/verify` body — Cashfree identifiers, not Razorpay. */
export interface VerifyPaymentRequest {
  cfOrderId: string;
  cfPaymentId: string;
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
  data?: ApiErrorBody | string;
}
