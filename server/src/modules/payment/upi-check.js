// Is a UPI ID real, and whose is it: asks Razorpay when its keys are set. Never blocks on our side: no keys or no answer means 'unchecked'.
const config = require('../../config');
const logger = require('../../core/logger');

const FORMAT = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

/** { status: 'verified', name } | { status: 'invalid' } | { status: 'unchecked' } */
async function checkUpi(raw) {
  const upiId = String(raw || '').trim();
  if (!FORMAT.test(upiId)) return { status: 'invalid' };
  if (!(config.razorpay.keyId && config.razorpay.keySecret)) return { status: 'unchecked' };
  try {
    const r = await require('./razorpay.client').validateVpa(upiId);
    if (r?.success === false) return { status: 'invalid' };
    if (r?.success) return { status: 'verified', name: String(r.customer_name || '').trim().slice(0, 100) };
    return { status: 'unchecked' };
  } catch (err) {
    if (/invalid.*(vpa|upi)|(vpa|upi).*(invalid|not (valid|found|exist))/i.test(err.message || '')) return { status: 'invalid' };
    logger.warn({ err: err.message, code: err.code }, '[upi-check] Razorpay could not check a UPI ID');
    return { status: 'unchecked' };
  }
}

module.exports = { checkUpi, FORMAT };
