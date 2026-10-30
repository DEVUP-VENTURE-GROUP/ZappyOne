// Which gateway takes online payments: Cashfree whenever its keys are set, else Razorpay when its keys are set, else none (cash only). One answer for every flow.
const config = require('../../config');

function active() {
  if (config.cashfree.appId && config.cashfree.secretKey) return 'cashfree';
  if (config.razorpay.keyId && config.razorpay.keySecret) return 'razorpay';
  return null;
}

// Event and ad payments run on Cashfree alone for now; without it they say so instead of failing at the gateway.
function assertCashfree() {
  if (active() !== 'cashfree') throw Object.assign(new Error('Online payment for this is not available yet. Please try again later.'), { status: 503, code: 'GATEWAY_UNAVAILABLE' });
}

module.exports = { active, assertCashfree };
