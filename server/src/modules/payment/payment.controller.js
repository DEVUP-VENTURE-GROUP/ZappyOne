const paymentService = require('./payment.service');
const config = require('../../config');

async function createOrder(req, res, next) {
  try {
    const result = await paymentService.createOrderForPurpose({
      owner: { kind: req.auth.role, id: req.auth.sub },
      ...req.body,
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

async function verify(req, res, next) {
  try {
    const result = await paymentService.handleCheckoutVerification({
      cfOrderId:   req.body.cfOrderId,
      cfPaymentId: req.body.cfPaymentId,
    });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { createOrder, verify };
