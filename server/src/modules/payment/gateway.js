// Which gateway takes online payments: Cashfree whenever its keys are set, else Razorpay when its keys are set, else none (cash only). One answer for every flow.
const config = require('../../config');

function active() {
  const cf = Boolean(config.cashfree.appId && config.cashfree.secretKey);
  const rz = Boolean(config.razorpay.keyId && config.razorpay.keySecret);
  if (config.paymentGateway === 'razorpay' && rz) return 'razorpay';
  if (config.paymentGateway === 'cashfree' && cf) return 'cashfree';
  if (cf) return 'cashfree';
  if (rz) return 'razorpay';
  return null;
}

// Event and ad payments run on Cashfree alone for now; without it they say so instead of failing at the gateway.
function assertCashfree() {
  if (active() !== 'cashfree') throw Object.assign(new Error('Online payment for this is not available yet. Please try again later.'), { status: 503, code: 'GATEWAY_UNAVAILABLE' });
}

module.exports = { active, assertCashfree };
