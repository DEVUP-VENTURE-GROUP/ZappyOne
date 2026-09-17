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
async function createOrderForPurpose({ owner, purpose, planCode, amountPaise, orderId, returnUrl }) {
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
  } else if (purpose === 'repair_payment') {
    /**
     * Repair bookings are a separate collection from Order, with their own
     * immutable price snapshot. The amount is taken from that snapshot rather
     * than from anything the client sends, so a tampered request cannot
     * under-pay a booking.
     */
    if (!orderId) throw Object.assign(new Error('bookingId required'), { status: 400, code: 'BOOKING_ID_REQUIRED' });
    const { RepairBooking } = require('../repair/models/booking.model');
    const booking = await RepairBooking.findById(orderId).lean();
    if (!booking) throw Object.assign(new Error('Repair booking not found'), { status: 404 });
    if (String(booking.userId) !== String(owner.id)) throw Object.assign(new Error('Not your booking'), { status: 403 });
    if (booking.paymentStatus === 'paid') {
      throw Object.assign(new Error('This repair is already paid'), { status: 409, code: 'ALREADY_PAID' });
    }

    // A diagnosis-first repair must not be charged its estimate before the
    // customer has approved a real quote — that is the §53 promise.
    if (booking.priceSnapshot?.isEstimate && booking.status !== 'APPROVED') {
      throw Object.assign(
        new Error('This repair is priced after diagnosis — approve the quote before paying.'),
        { status: 409, code: 'QUOTE_APPROVAL_REQUIRED' },
      );
    }

    resolvedAmount = booking.priceSnapshot?.totalPaise;
    if (!resolvedAmount || resolvedAmount <= 0) {
      throw Object.assign(new Error('This booking has no payable amount yet'), { status: 409, code: 'NO_AMOUNT' });
    }
    cfOrderIdPrefix = 'rpr';
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
    },
  });

  const intent = await PaymentIntent.create({
    cfOrderId,
    owner,
    purpose,
    planId,
    subscriptionId,
    orderId,
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
      if (refund?.cf_payment_id) {
        await PaymentIntent.updateOne(
          { cfPaymentId: String(refund.cf_payment_id) },
          { $set: { status: 'refunded' }, $push: { events: { event: eventType, payload } } }
        );
      }
      return { ok: true, action: 'marked_refunded' };
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

    } else if (intent.purpose === 'repair_payment') {
      // The webhook is the source of truth for payment, never the client's
      // "success" callback — this is the only place a repair is marked paid.
      const { RepairBooking } = require('../repair/models/booking.model');
      const booking = await RepairBooking.findById(intent.orderId);
      if (booking) {
        booking.paymentStatus = 'paid';
        booking.paymentId = intent._id;
        await booking.save();

        // Book only the platform's own cut here. The provider's share is paid
        // at settlement, so crediting the gross to the platform would overstate
        // revenue and double-count once the payout runs.
        const commissionPaise = booking.priceSnapshot?.commissionPaise || 0;
        if (commissionPaise > 0) {
          await Transaction.create({
            type: 'credit',
            owner: { kind: 'platform', id: null },
            amountPaise: commissionPaise,
            reason: Transaction.REASONS.PLATFORM_COMMISSION,
            refPaymentIntentId: intent._id,
            idempotencyKey: `platform:repair:${cfPaymentId}`,
            description: `Repair commission — ${booking.reference}`,
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

module.exports = {
  createOrderForPurpose,
  handleWebhook,
  handleCheckoutVerification,
};
