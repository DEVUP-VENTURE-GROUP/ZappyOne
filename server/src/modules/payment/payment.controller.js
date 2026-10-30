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

module.exports = { createOrder, verify, checkoutBody };
