const subscriptionService = require('./subscription.service');
const paymentService = require('../payment/payment.service');
const Subscription = require('./subscription.model');
const config = require('../../config');

async function listPlans(req, res, next) {
  try {
    const plans = await subscriptionService.listPlans({ audience: req.query.audience });
    res.json({ plans });
  } catch (err) { next(err); }
}

async function getMySubscription(req, res, next) {
  try {
    const view = await subscriptionService.getActiveFor({ kind: req.auth.role, id: req.auth.sub });
    if (!view) return res.json({ subscription: null });
    res.json({ subscription: view });
  } catch (err) { next(err); }
}

async function subscribe(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Only users and workers can subscribe', code: 'BAD_AUDIENCE' });
    }
    const result = await paymentService.createOrderForPurpose({
      owner: { kind: req.auth.role, id: req.auth.sub },
      purpose: 'subscription',
      planCode: req.body.planCode,
    });
    res.status(201).json({
      paymentIntentId:  result.paymentIntent._id,
      cfOrderId:        result.cfOrder.order_id,
      paymentSessionId: result.cfOrder.payment_session_id,
      amountPaise:      result.paymentIntent.amountPaise,
      currency:         'INR',
      cashfreeEnv:      config.cashfree.env,
    });
  } catch (err) { next(err); }
}

async function cancelSubscription(req, res, next) {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    if (String(sub.owner.id) !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'Not your subscription' });
    }
    const updated = await subscriptionService.cancel({ subscriptionId: req.params.id, reason: req.body.reason, byOwner: true });
    res.json({ subscription: updated });
  } catch (err) { next(err); }
}

module.exports = { listPlans, getMySubscription, subscribe, cancelSubscription };
