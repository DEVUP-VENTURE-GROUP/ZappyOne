/**
 * Cashback Service
 *
 * Rules (configurable via Redis key `config:cashback`):
 *   - Default: 5% cashback on every order, capped at ₹50
 *   - First-3-orders bonus: 10% cashback for new users' first 3 orders
 *   - Premium users get an additional 2% boost (read from subscription effects)
 *
 * Cashback is credited to the user's wallet immediately on order completion,
 * with deterministic idempotency so re-running completion never double-credits.
 */

const { redis } = require('../../config/redis');
const Order = require('../order/order.model');
const Transaction = require('../payment/transaction.model');
const walletService = require('./wallet.service');
const subscriptionService = require('../subscription/subscription.service');
const notificationService = require('../notification/notification.service');
const logger = require('../../core/logger');

const DEFAULT_RATE = 0.05;
const FIRST_ORDERS_BONUS_RATE = 0.10;
const FIRST_ORDERS_THRESHOLD = 3;
const DEFAULT_CAP_PAISE = 5000; // ₹50

async function getRules() {
  const raw = await redis.get('config:cashback');
  if (!raw) return { rate: DEFAULT_RATE, capPaise: DEFAULT_CAP_PAISE, enabled: true };
  try { return { rate: DEFAULT_RATE, capPaise: DEFAULT_CAP_PAISE, enabled: true, ...JSON.parse(raw) }; }
  catch { return { rate: DEFAULT_RATE, capPaise: DEFAULT_CAP_PAISE, enabled: true }; }
}

async function setRules(patch) {
  const current = await getRules();
  const next = { ...current, ...patch };
  await redis.set('config:cashback', JSON.stringify(next), 'EX', 86400);
  return next;
}

/**
 * Credit cashback to the user for a completed order. Idempotent.
 */
async function applyForOrder(order) {
  if (order.status !== 'completed') return null;

  const rules = await getRules();
  if (!rules.enabled) return null;

  // Determine rate: base, +bonus for first orders, +bonus for premium
  let rate = rules.rate;
  const userOrderCount = await Order.countDocuments({
    userId: order.userId,
    status: 'completed',
  });
  if (userOrderCount <= FIRST_ORDERS_THRESHOLD) rate = FIRST_ORDERS_BONUS_RATE;

  const effects = await subscriptionService.getEffects({ kind: 'user', id: order.userId });
  if (effects.cashbackBoost) rate += effects.cashbackBoost;

  const totalPaise = order.pricing.total * 100;
  let cashbackPaise = Math.round(totalPaise * rate);
  cashbackPaise = Math.min(cashbackPaise, rules.capPaise);

  if (cashbackPaise <= 0) return null;

  try {
    const result = await walletService.apply({
      kind: 'user',
      id: order.userId,
      type: 'credit',
      amountPaise: cashbackPaise,
      reason: Transaction.REASONS.CASHBACK,
      idempotencyKey: `cashback:${order._id}`,
      refs: { orderId: order._id },
      description: `Cashback (${(rate * 100).toFixed(0)}%) on order`,
    });

    if (!result.deduped) {
      // Notify only the first time
      notificationService.notify({
        recipient: { kind: 'user', id: order.userId },
        type: 'cashback_received',
        title: `🎁 ₹${cashbackPaise / 100} cashback credited`,
        body: `${(rate * 100).toFixed(0)}% back on your order`,
        deepLink: '/wallet',
      }).catch(() => {});
    }
    return result;
  } catch (err) {
    logger.error({ err: err.message, orderId: order._id }, 'Cashback application failed');
    return null;
  }
}

module.exports = { applyForOrder, getRules, setRules };
