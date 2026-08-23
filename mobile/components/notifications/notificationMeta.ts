/**
 * Notification presentation + routing.
 * ----------------------------------------------------------------------------
 * ── TYPES ──────────────────────────────────────────────────────────────────
 * Every key in `TYPE_META` is taken from the `TYPES` enum in
 * `server/src/modules/notification/notification.model.js`, which the schema
 * enforces — a notification cannot exist with a type outside it. Nothing here
 * is invented, and an unmapped type falls back to a neutral bell rather than
 * being hidden, so a type added server-side still renders sensibly.
 *
 * ── ROUTING: THE PART THAT WAS BROKEN ──────────────────────────────────────
 * `deepLink` is written for the WEB client. Its most common value is
 * `/orders/:id`, and the mobile app has no such route — the equivalent screen
 * is `/tracking/order/:id`. The previous implementation did
 * `router.push(n.deepLink)` verbatim, so tapping an order notification, which
 * is the majority of them, navigated nowhere.
 *
 * `resolveRoute` translates the links the server actually produces (verified by
 * grepping every `deepLink:` in the server source) into mobile routes, and
 * returns null for the ones with no mobile equivalent — event bookings and the
 * partner console. A row with no route is still readable and still marks
 * itself read; it just doesn't pretend to lead somewhere. (Disputes USED to be
 * on that list; Phase 8 gave them a screen, so they now resolve.)
 * ----------------------------------------------------------------------------
 */

import {
  AlertTriangle,
  Ban,
  BellRing,
  BadgeCheck,
  CalendarClock,
  CircleCheck,
  CircleX,
  Clock,
  Gift,
  Handshake,
  MapPin,
  MessageSquare,
  Navigation,
  PartyPopper,
  Percent,
  ShieldAlert,
  Star,
  Truck,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';

/** Colour families, resolved against the theme by the consumer. */
export type NotificationTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface NotificationMeta {
  icon: LucideIcon;
  tone: NotificationTone;
}

/**
 * type → icon + tone. Keys mirror `notification.model.js` → TYPES exactly.
 * Worker- and partner-only types are included because the enum is shared; a
 * customer will simply never receive them.
 */
const TYPE_META: Record<string, NotificationMeta> = {
  // ── Order lifecycle ───────────────────────────────────────────────────────
  order_placed: { icon: CircleCheck, tone: 'info' },
  worker_assigned: { icon: Handshake, tone: 'info' },
  worker_on_the_way: { icon: Navigation, tone: 'info' },
  worker_arriving_soon: { icon: MapPin, tone: 'warning' },
  worker_arrived: { icon: MapPin, tone: 'success' },
  order_completed: { icon: CircleCheck, tone: 'success' },
  order_cancelled: { icon: CircleX, tone: 'danger' },
  order_failed: { icon: TriangleAlert, tone: 'danger' },
  order_delayed: { icon: Clock, tone: 'warning' },
  order_reassigned: { icon: Handshake, tone: 'warning' },
  rating_request: { icon: Star, tone: 'warning' },
  trip_started: { icon: Truck, tone: 'info' },
  refund_processed: { icon: Wallet, tone: 'success' },

  // ── Worker job events ─────────────────────────────────────────────────────
  job_assigned: { icon: Handshake, tone: 'info' },
  job_reminder: { icon: CalendarClock, tone: 'warning' },
  job_removed: { icon: Ban, tone: 'danger' },
  late_arrival_penalty: { icon: TriangleAlert, tone: 'danger' },

  // ── Worker earnings & wallet ──────────────────────────────────────────────
  worker_earning: { icon: Wallet, tone: 'success' },
  penalty_applied: { icon: TriangleAlert, tone: 'danger' },
  milestone_reached: { icon: PartyPopper, tone: 'success' },
  rating_received: { icon: Star, tone: 'warning' },
  wallet_credited: { icon: Wallet, tone: 'success' },

  // ── Cancellation Shield Fund ──────────────────────────────────────────────
  cancellation_warning: { icon: ShieldAlert, tone: 'warning' },
  cancellation_fee_charged: { icon: Wallet, tone: 'danger' },
  cancellation_fee_pending: { icon: Clock, tone: 'warning' },
  shield_payout: { icon: Wallet, tone: 'success' },

  // ── Worker safety ─────────────────────────────────────────────────────────
  worker_wellness: { icon: BellRing, tone: 'info' },
  worker_sos: { icon: ShieldAlert, tone: 'danger' },

  // ── Trust / reporting ─────────────────────────────────────────────────────
  report_received: { icon: AlertTriangle, tone: 'warning' },
  account_warning: { icon: ShieldAlert, tone: 'danger' },

  // ── Subscriptions & cashback ──────────────────────────────────────────────
  subscription_activated: { icon: BadgeCheck, tone: 'success' },
  subscription_expiring: { icon: Clock, tone: 'warning' },
  cashback_received: { icon: Gift, tone: 'success' },
  referral_reward: { icon: Gift, tone: 'success' },

  // ── KYC ───────────────────────────────────────────────────────────────────
  kyc_approved: { icon: BadgeCheck, tone: 'success' },
  kyc_rejected: { icon: CircleX, tone: 'danger' },
  kyc_suspended: { icon: Ban, tone: 'danger' },
  kyc_clarification: { icon: AlertTriangle, tone: 'warning' },

  // ── Disputes + support ────────────────────────────────────────────────────
  dispute_response: { icon: MessageSquare, tone: 'info' },
  chat_message: { icon: MessageSquare, tone: 'info' },

  // ── Event commerce ────────────────────────────────────────────────────────
  event_booking_confirmed: { icon: PartyPopper, tone: 'success' },
  event_booking_cancelled: { icon: CircleX, tone: 'danger' },
  event_booking_reminder: { icon: CalendarClock, tone: 'warning' },
  event_completed: { icon: CircleCheck, tone: 'success' },
  event_booking_new: { icon: PartyPopper, tone: 'info' },
  event_partner_kyc_approved: { icon: BadgeCheck, tone: 'success' },
  event_partner_kyc_rejected: { icon: CircleX, tone: 'danger' },
  event_booking_declined_partner: { icon: Ban, tone: 'danger' },

  // ── Platform-wide ─────────────────────────────────────────────────────────
  promotional: { icon: Percent, tone: 'warning' },
  service_due: { icon: CalendarClock, tone: 'info' },
  system_alert: { icon: BellRing, tone: 'neutral' },
};

export function metaForType(type: string): NotificationMeta {
  return TYPE_META[type] ?? { icon: BellRing, tone: 'neutral' };
}

/**
 * Translate a server `deepLink` into a route this app actually has.
 * Returns null when there is no mobile equivalent — the caller must not
 * navigate rather than pushing a route that would 404.
 */
export function resolveRoute(deepLink?: string | null): string | null {
  if (!deepLink) return null;
  // Strip any query/hash; the server never adds one, but a route push would
  // carry it through verbatim if it did.
  const path = deepLink.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

  // Order detail — the common case, and the one that was broken.
  const orderDetail = path.match(/^\/orders\/([^/]+)$/);
  if (orderDetail) return `/tracking/order/${orderDetail[1]}`;

  // Worker job detail. The mobile worker app has no per-job route yet, so
  // these land on the offers list rather than nowhere.
  if (/^\/worker\/jobs?\/[^/]+$/.test(path)) return '/worker/(tabs)/offers';

  const bookService = path.match(/^\/book\/([^/]+)$/);
  if (bookService) return `/book/${bookService[1]}`;

  // Dispute detail. `dispute.service.js` emits `deepLink: /disputes/:id` when
  // one is opened or resolved; this used to fall through to null because there
  // was no mobile screen behind it. There is now.
  const disputeDetail = path.match(/^\/disputes\/([^/]+)$/);
  if (disputeDetail) return `/disputes/${disputeDetail[1]}`;

  // Support ticket detail. No server notification currently carries this link
  // — the ticket routes emit none — but the screen exists, so an in-app row
  // pointing here resolves rather than dead-ending.
  const ticketDetail = path.match(/^\/support\/([^/]+)$/);
  if (ticketDetail && ticketDetail[1] !== 'mine') return `/support/${ticketDetail[1]}`;

  switch (path) {
    case '/':
      return '/(tabs)/home';
    case '/orders':
      return '/(tabs)/bookings';
    case '/profile':
      return '/(tabs)/profile';
    case '/wallet':
      return '/wallet';
    case '/worker':
      return '/worker/(tabs)/dashboard';
    case '/worker/kyc':
      return '/worker/kyc';
    default:
      // Event bookings, the partner console, worker wellness and shield
      // payouts have no mobile screen. Say so by returning null.
      return null;
  }
}

/** "just now", "12m", "3h", "Yesterday", then a date. */
export function formatRelative(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(new Date(then).getFullYear() === new Date().getFullYear()
      ? {}
      : { year: '2-digit' }),
  });
}
