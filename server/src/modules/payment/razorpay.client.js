// Razorpay client, used only when Cashfree has no keys (payment/gateway). Amounts are paise, auth is Basic key:secret, our own order id rides as the receipt.
const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../core/logger');

const BASE_URL = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 15000;

async function rzRequest(method, path, body) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw Object.assign(new Error('Razorpay did not answer'), { status: 502, code: 'RAZORPAY_UNREACHABLE', cause: err });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error({ status: res.status, code: data?.error?.code, path }, 'Razorpay API error');
    throw Object.assign(new Error(data?.error?.description || 'Razorpay API error'), { status: 502, code: 'RAZORPAY_API_ERROR' });
  }
  return data;
}

// notes: at most 15 string values of 256 characters each.
const notesOf = (tags = {}) => Object.fromEntries(Object.entries(tags).slice(0, 15).map(([k, v]) => [k, String(v).slice(0, 256)]));

const createOrder = ({ orderId, amountPaise, tags }) =>
  rzRequest('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt: orderId.slice(0, 40), notes: notesOf(tags), payment_capture: 1 });

const getOrderPayments = async (rzOrderId) => (await rzRequest('GET', `/orders/${encodeURIComponent(rzOrderId)}/payments`)).items || [];

const getPayment = (paymentId) => rzRequest('GET', `/payments/${encodeURIComponent(paymentId)}`);

// An authorised payment is captured for its full amount; Razorpay refunds an authorised payment left uncaptured.
const capture = (paymentId, amountPaise) => rzRequest('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' });

const createRefund = ({ paymentId, amountPaise, refundId, note = '' }) =>
  rzRequest('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, receipt: refundId.slice(0, 40), notes: notesOf({ reason: note }) });

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8'); const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

// The signature checkout hands back: HMAC-SHA256(order_id|payment_id, key secret), hex.
function verifyCheckoutSignature(rzOrderId, paymentId, signature) {
  if (!config.razorpay.keySecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${rzOrderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

// Webhook body signature: HMAC-SHA256(raw body, webhook secret), hex, in X-Razorpay-Signature.
function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

module.exports = { createOrder, getOrderPayments, getPayment, capture, createRefund, verifyCheckoutSignature, verifyWebhookSignature };
