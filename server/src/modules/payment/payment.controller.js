const paymentService = require('./payment.service');
const config = require('../../config');

// What an app needs to open the checkout the server chose (payment/gateway); every create-order route answers with this.
function checkoutBody(result) {
  const base = { paymentIntentId: result.paymentIntent._id, cfOrderId: result.paymentIntent.cfOrderId, amountPaise: result.paymentIntent.amountPaise, currency: 'INR' };
  if (result.razorpayOrder) return { ...base, gateway: 'razorpay', razorpayOrderId: result.razorpayOrder.id, razorpayKeyId: config.razorpay.keyId };
  return { ...base, gateway: 'cashfree', paymentSessionId: result.cfOrder.payment_session_id, cashfreeEnv: config.cashfree.env };
}

async function createOrder(req, res, next) {
  try {
    const result = await paymentService.createOrderForPurpose({
      owner: { kind: req.auth.role, id: req.auth.sub },
      ...req.body,
    });
    res.status(201).json(checkoutBody(result));
  } catch (err) { next(err); }
}

// Partners paying dues from the app: a Razorpay page to open, then a check once they come back.
async function createDuesLink(req, res, next) {
  try {
    const r = await paymentService.createOrderForPurpose({
      owner: { kind: req.auth.role, id: req.auth.sub }, purpose: 'dues_payment', amountPaise: req.body.amountPaise, returnUrl: req.body.returnUrl, link: true,
    });
    res.status(201).json({ url: r.paymentLink.short_url, cfOrderId: r.paymentIntent.cfOrderId, amountPaise: r.paymentIntent.amountPaise });
  } catch (err) { next(err); }
}

async function checkDuesLink(req, res, next) {
  try { res.json(await paymentService.checkLink({ cfOrderId: req.params.cfOrderId, owner: { kind: req.auth.role, id: req.auth.sub } })); } catch (err) { next(err); }
}

async function verify(req, res, next) {
  try {
    const result = await paymentService.handleCheckoutVerification({
      cfOrderId:   req.body.cfOrderId,
      cfPaymentId: req.body.cfPaymentId,
      razorpaySignature: req.body.razorpaySignature || null,
    });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { createOrder, verify, checkoutBody, createDuesLink, checkDuesLink };
