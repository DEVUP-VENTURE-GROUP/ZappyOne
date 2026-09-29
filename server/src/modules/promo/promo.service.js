const Promo = require('./promo.model');
const { PromoUsage } = require('./promo.model');
const { redis } = require('../../config/redis');

/**
 * Validate and compute discount for a promo code.
 * Returns { discountPaise, code, description } on success.
 * Throws an error with { status, code } on failure.
 */
async function applyPromo({ code, userId, orderTotalPaise, service }) {
  await require('../feature-flags/feature-flag.service').assertEnabled('promo_codes');
  const promo = await Promo.findOne({ code: code.toUpperCase(), isActive: true }).lean();
  if (!promo) throw Object.assign(new Error('Invalid or expired promo code'), { status: 400, code: 'PROMO_INVALID' });

  const now = new Date();
  if (now < promo.validity.startAt || now > promo.validity.endAt) {
    throw Object.assign(new Error('Promo code has expired'), { status: 400, code: 'PROMO_EXPIRED' });
  }

  // Service restriction
  if (promo.services.length > 0 && !promo.services.includes(service)) {
    throw Object.assign(new Error('Promo not valid for this service'), { status: 400, code: 'PROMO_SERVICE_MISMATCH' });
  }

  // Minimum order check
  if (promo.discount.minOrderPaise > 0 && orderTotalPaise < promo.discount.minOrderPaise) {
    throw Object.assign(new Error(`Minimum order ₹${Math.round(promo.discount.minOrderPaise / 100)} required`), {
      status: 400, code: 'PROMO_MIN_ORDER',
    });
  }

  // Total uses check
  if (promo.limits.totalUses > 0 && promo.limits.usedCount >= promo.limits.totalUses) {
    throw Object.assign(new Error('Promo code limit reached'), { status: 400, code: 'PROMO_EXHAUSTED' });
  }

  // Per-user uses check — Redis lock prevents the TOCTOU race where two concurrent
  // requests both pass countDocuments before either recordUsage increments the counter.
  if (promo.limits.perUserUses > 0) {
    const lockKey   = `promo:apply:${promo.code}:${userId}`;
    const lockToken = `${Date.now()}`;
    const acquired  = await redis.set(lockKey, lockToken, 'NX', 'PX', 10000).catch(() => null);
    if (!acquired) {
      throw Object.assign(new Error('Promo is already being applied to another order'), { status: 409, code: 'PROMO_CONCURRENT' });
    }
    let userUses;
    try {
      userUses = await PromoUsage.countDocuments({ code: promo.code, userId });
    } finally {
      redis.eval(
        `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`,
        1, lockKey, lockToken
      ).catch(() => {});
    }
    if (userUses >= promo.limits.perUserUses) {
      throw Object.assign(new Error('You have already used this promo'), { status: 400, code: 'PROMO_USER_LIMIT' });
    }
  }

  // First-order check
  if (promo.type === 'first_order') {
    const Order = require('../order/order.model');
    const prevCompleted = await Order.countDocuments({ userId, status: 'completed' });
    if (prevCompleted > 0) {
      throw Object.assign(new Error('This promo is for first-time orders only'), { status: 400, code: 'PROMO_NOT_FIRST_ORDER' });
    }
  }

  // Compute discount
  let discountPaise = 0;
  if (promo.type === 'percent') {
    discountPaise = Math.round(orderTotalPaise * (promo.discount.value / 100));
    if (promo.discount.maxDiscountPaise > 0) {
      discountPaise = Math.min(discountPaise, promo.discount.maxDiscountPaise);
    }
  } else {
    discountPaise = promo.discount.value;
  }
  discountPaise = Math.min(discountPaise, orderTotalPaise); // can't discount more than order total

  return {
    discountPaise,
    code: promo.code,
    description: promo.description || promo.name,
  };
}

/** Record usage atomically after order is created. */
async function recordUsage({ code, userId, orderId, discountPaise }) {
  await Promise.all([
    PromoUsage.create({ code, userId, orderId, discountPaise }),
    Promo.updateOne({ code }, { $inc: { 'limits.usedCount': 1 } }),
  ]);
}

// Admin CRUD

async function listAll({ page = 1, limit = 20 }) {
  const [promos, total] = await Promise.all([
    Promo.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Promo.countDocuments(),
  ]);
  return { promos, total, totalPages: Math.ceil(total / limit), page };
}

async function create(data) {
  return Promo.create({ ...data, code: data.code.toUpperCase() });
}

async function update(id, patch) {
  if (patch.code) patch.code = patch.code.toUpperCase();
  return Promo.findByIdAndUpdate(id, { $set: patch }, { new: true });
}

async function remove(id) {
  return Promo.findByIdAndDelete(id);
}

// Validate without consuming (for checkout UI preview)
async function validate({ code, userId, orderTotalPaise, service }) {
  return applyPromo({ code, userId, orderTotalPaise, service });
}

module.exports = { applyPromo, recordUsage, validate, listAll, create, update, remove };
