/**
 * Payment Service — Cashfree PG
 * ----------------------------------------------------------------------------
 * Flow:
 *   1. createOrderForPurpose() — backend creates Cashfree order, returns
 *      payment_session_id to frontend
 *   2. Frontend opens Cashfree Drop with payment_session_id
 *   3. On success Cashfree calls our webhook (source of truth)
 *   4. handleWebhook() applies side-effects exactly once
 *   5. Frontend may also call /verify after checkout for instant UX confirmation
 *
 * Idempotency layers:
 *   - PaymentIntent.cfOrderId is unique
 *   - PaymentIntent.appliedAt set in a single findOneAndUpdate guard
 *   - Wallet.apply uses idempotencyKey at Transaction level
 * ----------------------------------------------------------------------------
 */

const crypto = require('crypto');
const PaymentIntent = require('./payment-intent.model');
const Order = require('../order/order.model');
const Transaction = require('./transaction.model');
const cashfree = require('./cashfree.client');
const walletService = require('../wallet/wallet.service');
const subscriptionService = require('../subscription/subscription.service');
const payables = require('./payables');
const logger = require('../../utils/logger');

/** Resolve customer details for Cashfree — phone is required by their API. */
async function resolveCustomer(owner) {
  try {
    const Model = owner.kind === 'user'
      ? require('../user/user.model')
      : require('../worker/worker.model');
    const doc = await Model.findById(owner.id).select('name phone email').lean();
    return {
      id:    String(owner.id),
      phone: doc?.phone || '9999999999',
      email: doc?.email || 'noreply@zappy.in',
      name:  doc?.name  || undefined,
    };
  } catch {
    return { id: String(owner.id), phone: '9999999999', email: 'noreply@zappy.in' };
  }
}

/**
 * Create a Cashfree order for one of three purposes.
 * Returns { paymentIntent, cfOrder } — frontend uses cfOrder.payment_session_id.
 */
async function createOrderForPurpose({ owner, purpose, planCode, amountPaise, orderId, returnUrl, bookingSource = null, bookingId = null }) {
  // Backup path: with no live gateway, say so plainly; the customer pays in cash instead.
  if (!payables.gatewayReady()) {
    throw Object.assign(new Error('Online payment is not available right now — please pay in cash after the service.'), {
      status: 503, code: 'GATEWAY_UNAVAILABLE',
    });
  }
  // Older repair clients sent the booking id as orderId.
  if (purpose === 'repair_payment' && !bookingId) bookingId = orderId;
  let resolvedAmount = amountPaise;
  let planId = null;
  let subscriptionId = null;
  let cfOrderIdPrefix = '';

  if (purpose === 'subscription') {
    if (!planCode) throw Object.assign(new Error('planCode required'), { status: 400, code: 'PLAN_CODE_REQUIRED' });
    const { subscription, plan } = await subscriptionService.startPurchase({ owner, planCode });
    resolvedAmount = plan.priceInPaise;
    planId = plan._id;
    subscriptionId = subscription._id;
    cfOrderIdPrefix = 'sub';
  } else if (purpose === 'wallet_topup') {
    if (!Number.isInteger(amountPaise) || amountPaise < 1000) {
      throw Object.assign(new Error('Wallet top-up minimum is ₹10'), { status: 400, code: 'TOPUP_MIN' });
    }
    cfOrderIdPrefix = 'wlt';
  } else if (purpose === 'order_payment') {
    if (!orderId) throw Object.assign(new Error('orderId required'), { status: 400, code: 'ORDER_ID_REQUIRED' });
    const order = await Order.findById(orderId).lean();
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (String(order.userId) !== String(owner.id)) throw Object.assign(new Error('Not your order'), { status: 403 });
    if (order.payment?.status === 'paid') throw Object.assign(new Error('Order already paid'), { status: 409, code: 'ORDER_ALREADY_PAID' });
    resolvedAmount = order.pricing.total * 100;
    cfOrderIdPrefix = 'ord';
  } else if (purpose === 'repair_payment' || purpose === 'booking_payment') {
    // repair_payment is the older name for a repair booking_payment.
    bookingSource = purpose === 'repair_payment' ? 'repair' : bookingSource;
    if (!bookingId) throw Object.assign(new Error('bookingId required'), { status: 400, code: 'BOOKING_ID_REQUIRED' });
    ({ amountPaise: resolvedAmount } = await payables.resolvePayable({ source: bookingSource, bookingId, userId: owner.id }));
    cfOrderIdPrefix = { repair: 'rpr', pet: 'pet', helping: 'hlp' }[bookingSource];
  } else {
    throw Object.assign(new Error('Unknown purpose'), { status: 400, code: 'BAD_PURPOSE' });
  }

  // Unique, URL-safe order ID we control — lets us look it up in our DB without
  // needing to store Cashfree's numeric cf_order_id alongside it.
  const cfOrderId = `zpy_${cfOrderIdPrefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const customer = await resolveCustomer(owner);
  const cfOrder = await cashfree.createOrder({
    orderId: cfOrderId,
    amountPaise: resolvedAmount,
    customer,
    returnUrl,
    tags: {
      purpose,
      ownerKind: owner.kind,
      ownerId: String(owner.id),
      ...(planCode ? { planCode } : {}),
      ...(orderId  ? { orderId: String(orderId) } : {}),
      ...(bookingId ? { bookingSource, bookingId: String(bookingId) } : {}),
    },
  });

  const isBooking = purpose === 'repair_payment' || purpose === 'booking_payment';
  const intent = await PaymentIntent.create({
    cfOrderId,
    owner,
    purpose: isBooking ? 'booking_payment' : purpose,
    planId,
    subscriptionId,
    orderId: isBooking ? null : orderId,
    bookingSource: isBooking ? bookingSource : null,
    bookingId: isBooking ? bookingId : null,
    amountPaise: resolvedAmount,
    currency: 'INR',
    status: 'created',
  });

  return { paymentIntent: intent, cfOrder };
}

/**
 * Handle a Cashfree webhook.
 * Cashfree event types: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK,
 *   PAYMENT_USER_DROPPED_WEBHOOK, REFUND_STATUS_WEBHOOK
 */
async function handleWebhook(payload) {
  const eventType = payload?.type;
  if (!eventType) return { ok: false, reason: 'missing_type' };

  const order   = payload.data?.order;
  const payment = payload.data?.payment;

  switch (eventType) {
    case 'PAYMENT_SUCCESS_WEBHOOK': {
      if (!order?.order_id || !payment?.cf_payment_id) return { ok: false, reason: 'missing_ids' };
      return capturePayment({
        cfOrderId:   order.order_id,
        cfPaymentId: String(payment.cf_payment_id),
        amountPaise: Math.round(payment.payment_amount * 100),
        eventName:   eventType,
        rawPayload:  payload,
      });
    }
    case 'PAYMENT_FAILED_WEBHOOK':
    case 'PAYMENT_USER_DROPPED_WEBHOOK': {
      if (order?.order_id) {
        await PaymentIntent.updateOne(
          { cfOrderId: order.order_id, status: { $in: ['created', 'authorized'] } },
          {
            $set: { status: 'failed', failureReason: payment?.payment_message || eventType },
            $push: { events: { event: eventType, payload } },
          }
        );
      }
      return { ok: true, action: 'marked_failed' };
    }
    case 'REFUND_STATUS_WEBHOOK': {
      const refund = payload.data?.refund;
      if (refund?.cf_payment_id && refund.refund_status === 'SUCCESS') {
        const intent = await PaymentIntent.findOneAndUpdate(
          { cfPaymentId: String(refund.cf_payment_id) },
          { $set: { status: 'refunded', 'refund.status': 'processed' }, $push: { events: { event: eventType, payload } } },
          { new: true },
        );
        // Reflect it on the booking so the customer sees "refunded", not "cancelled".
        if (intent?.bookingSource && intent.bookingId) {
          const booking = await payables.PAYABLES[intent.bookingSource].load(intent.bookingId);
          if (booking) {
            booking.paymentStatus = intent.refund.amountPaise < intent.amountPaise
              ? (intent.bookingSource === 'repair' ? 'partial_refund' : 'partially_refunded')
              : 'refunded';
            await booking.save();
          }
        }
      }
      return { ok: true, action: 'refund_status_recorded' };
    }
    default:
      logger.info({ eventType }, 'Cashfree webhook event ignored');
      return { ok: true, action: 'ignored' };
  }
}

/**
 * Apply side-effects of a successful payment exactly once.
 * Atomicity: findOneAndUpdate with `appliedAt: { $exists: false }` — only one
 * concurrent webhook delivery wins; the rest see no document and bail cleanly.
 */
async function capturePayment({ cfOrderId, cfPaymentId, amountPaise, eventName, rawPayload }) {
  const intent = await PaymentIntent.findOneAndUpdate(
    { cfOrderId, appliedAt: { $exists: false } },
    {
      $set:  { cfPaymentId, status: 'captured', appliedAt: new Date() },
      $push: { events: { event: eventName, payload: rawPayload } },
    },
    { new: true }
  );

  if (!intent) {
    logger.info({ cfOrderId, cfPaymentId }, 'Payment intent not claimable — likely already processed');
    return { ok: true, action: 'already_applied_or_unknown' };
  }

  // Amount sanity check
  if (Math.abs(intent.amountPaise - amountPaise) > 100) {
    logger.error({ expected: intent.amountPaise, got: amountPaise, cfPaymentId }, 'Amount mismatch — possible tampering');
    return { ok: false, action: 'amount_mismatch' };
  }

  try {
    if (intent.purpose === 'subscription') {
      await subscriptionService.activateFromPayment({
        subscriptionId: intent.subscriptionId,
        paymentIntentId: intent._id,
        cfPaymentId,
      });
      await Transaction.create({
        type: 'credit',
        owner: { kind: 'platform', id: null },
        amountPaise: intent.amountPaise,
        reason: Transaction.REASONS.SUBSCRIPTION_REVENUE,
        refSubscriptionId: intent.subscriptionId,
        refPaymentIntentId: intent._id,
        idempotencyKey: `platform:sub:${cfPaymentId}`,
        description: 'Subscription payment received',
      }).catch((e) => { if (e.code !== 11000) throw e; });

    } else if (intent.purpose === 'wallet_topup') {
      await walletService.apply({
        kind: intent.owner.kind,
        id: intent.owner.id,
        type: 'credit',
        amountPaise: intent.amountPaise,
        reason: Transaction.REASONS.WALLET_TOPUP,
        idempotencyKey: `topup:${cfPaymentId}`,
        refs: { paymentIntentId: intent._id },
        description: 'Wallet top-up',
      });

    } else if (intent.purpose === 'order_payment') {
      const order = await Order.findById(intent.orderId);
      if (order) {
        order.payment.status = 'paid';
        order.payment.transactionId = cfPaymentId;
        order.payment.paidAt = new Date();
        await order.save();
      }

    } else if (intent.purpose === 'booking_payment' || intent.purpose === 'repair_payment') {
      // The webhook (or the reconcile sweep) is the only place a booking is marked paid —
      // never the client's "success" callback.
      const source = intent.bookingSource || 'repair';
      const payable = payables.PAYABLES[source];
      const booking = await payable.load(intent.bookingId || intent.orderId);
      if (booking) {
        payable.markPaid(booking, intent._id);
        await booking.save();

        // Only the platform's own cut is revenue now; the provider's share is paid at
        // settlement, so crediting the gross would double-count once the payout runs.
        const commissionPaise = payable.commission(booking);
        if (commissionPaise > 0) {
          await Transaction.create({
            type: 'credit',
            owner: { kind: 'platform', id: null },
            amountPaise: commissionPaise,
            reason: Transaction.REASONS.PLATFORM_COMMISSION,
            refPaymentIntentId: intent._id,
            idempotencyKey: `platform:${source}:${cfPaymentId}`,
            description: `${source} commission — ${booking.reference}`,
          }).catch((e) => { if (e.code !== 11000) throw e; });
        }
      }
    }

    return { ok: true, action: 'applied', purpose: intent.purpose };

  } catch (err) {
    // Side-effect failed after payment captured. Money is in Cashfree but our
    // domain didn't apply. Mark for reconciliation + alert ops. (#95/#96)
    logger.error({ err: err.message, cfPaymentId, purpose: intent.purpose }, '[PAYMENT] Side-effect failed — marking for reconciliation');
    await PaymentIntent.updateOne(
      { cfOrderId: intent.cfOrderId },
      {
        $set: {
          reconciliationRequired: true,
          reconciliationReason: err.message,
          reconciliationAt: new Date(),
        },
      }
    ).catch(() => {});

    const { redis: r } = require('../../config/redis');
    r.publish('notification:admin:ops', JSON.stringify({
      type: 'payment_reconciliation_required',
      title: '⚠️ Payment needs reconciliation',
      body: `${intent.purpose} · ₹${(intent.amountPaise / 100).toFixed(0)} · ${cfPaymentId}`,
      data: { cfPaymentId, cfOrderId: intent.cfOrderId, purpose: intent.purpose, err: err.message },
      urgent: true,
    })).catch(() => {});
    throw err;
  }
}

/**
 * Post-checkout confirmation from frontend.
 * Cashfree doesn't return a signature on checkout — we confirm by fetching
 * payment status from the Cashfree API. Webhook remains the source of truth.
 */
async function handleCheckoutVerification({ cfOrderId, cfPaymentId }) {
  // Fetch all payments for this order — pick the successful one
  let payments;
  try {
    payments = await cashfree.getOrderPayments(cfOrderId);
  } catch (err) {
    throw Object.assign(new Error('Could not verify payment with gateway'), { status: 502, code: 'GATEWAY_VERIFY_FAILED' });
  }

  const successful = Array.isArray(payments)
    ? payments.find((p) => p.payment_status === 'SUCCESS' && String(p.cf_payment_id) === String(cfPaymentId))
    : null;

  if (!successful) {
    return { ok: false, status: 'not_confirmed' };
  }

  return capturePayment({
    cfOrderId,
    cfPaymentId: String(successful.cf_payment_id),
    amountPaise: Math.round(successful.payment_amount * 100),
    eventName: 'manual.verify',
    rawPayload: { source: 'checkout-verify', payment: successful },
  });
}

/**
 * Backup for a missed webhook (outage, network, misconfigured URL): ask
 * Cashfree directly about payments still pending here. A success is captured
 * through the same exactly-once path; one abandoned past the window expires.
 */
const RECONCILE_AFTER_MS = 2 * 60 * 1000;
const EXPIRE_AFTER_MS = 60 * 60 * 1000;

async function reconcilePendingIntents({ now = Date.now(), limit = 50 } = {}) {
  if (!payables.gatewayReady()) return { checked: 0 };
  const pending = await PaymentIntent.find({
    status: 'created',
    createdAt: { $lte: new Date(now - RECONCILE_AFTER_MS), $gte: new Date(now - 24 * 60 * 60 * 1000) },
  }).sort({ createdAt: 1 }).limit(limit).lean();

  let captured = 0, expired = 0;
  for (const intent of pending) {
    try {
      const payments = await cashfree.getOrderPayments(intent.cfOrderId);
      const ok = Array.isArray(payments) && payments.find((p) => p.payment_status === 'SUCCESS');
      if (ok) {
        await capturePayment({
          cfOrderId: intent.cfOrderId,
          cfPaymentId: String(ok.cf_payment_id),
          amountPaise: Math.round(ok.payment_amount * 100),
          eventName: 'reconcile.sweep',
          rawPayload: { source: 'reconcile', payment: ok },
        });
        captured++;
      } else if (now - new Date(intent.createdAt).getTime() > EXPIRE_AFTER_MS) {
        await PaymentIntent.updateOne({ _id: intent._id, status: 'created' }, { $set: { status: 'expired' } });
        expired++;
      }
    } catch (err) {
      logger.warn({ err: err.message, cfOrderId: intent.cfOrderId }, '[PAYMENT] reconcile check failed — will retry');
    }
  }
  return { checked: pending.length, captured, expired };
}

/**
 * Return a cancelled booking's online payment. Never blocks the cancellation:
 * if the gateway call fails the refund is flagged for ops instead of lost.
 */
async function refundBookingPayment({ source, bookingId, amountPaise, reason = 'Booking cancelled' }) {
  const intent = await PaymentIntent.findOne({ bookingSource: source, bookingId, status: 'captured' });
  if (!intent) return { refunded: false, reason: 'not_paid_online' };
  const amount = Math.min(amountPaise ?? intent.amountPaise, intent.amountPaise);
  if (amount <= 0) return { refunded: false, reason: 'nothing_to_refund' };
  if (intent.refund?.status === 'requested' || intent.refund?.status === 'processed') return { refunded: true, duplicate: true };

  const refundId = `rf_${intent._id}`;
  try {
    const res = await cashfree.createRefund({ orderId: intent.cfOrderId, amountPaise: amount, refundId, note: reason.slice(0, 100) });
    await PaymentIntent.updateOne({ _id: intent._id }, {
      $set: { refund: { status: 'requested', amountPaise: amount, cfRefundId: res?.cf_refund_id || refundId, reason, at: new Date() } },
    });
    return { refunded: true, amountPaise: amount };
  } catch (err) {
    await PaymentIntent.updateOne({ _id: intent._id }, {
      $set: {
        refund: { status: 'manual_required', amountPaise: amount, reason, at: new Date() },
        reconciliationRequired: true, reconciliationReason: `refund failed: ${err.message}`, reconciliationAt: new Date(),
      },
    });
    const { redis: r } = require('../../config/redis');
    r.publish('notification:admin:ops', JSON.stringify({
      type: 'refund_manual_required',
      title: 'Refund needs manual action',
      body: `${source} · ₹${(amount / 100).toFixed(0)} · ${intent.cfOrderId}`,
      data: { cfOrderId: intent.cfOrderId, source, bookingId: String(bookingId) },
      urgent: true,
    })).catch(() => {});
    return { refunded: false, reason: 'manual_required' };
  }
}

module.exports = {
  createOrderForPurpose,
  handleWebhook,
  handleCheckoutVerification,
  reconcilePendingIntents,
  refundBookingPayment,
};
