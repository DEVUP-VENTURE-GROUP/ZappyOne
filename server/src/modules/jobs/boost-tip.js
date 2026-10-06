/**
 * Boost and tip, for every kind of job (repairs, pet care, helping).
 *
 * BOOST — while we are still finding a provider, the customer may add
 * +₹10/+₹20/… for a faster match. It goes 100% to whoever takes the job, is
 * shown to providers on the alert, and re-rings everyone nearby, including
 * those who passed at the lower price. Paid with the booking (its own line);
 * nothing is charged if they cancel before anyone accepts.
 *
 * TIP — once the job is done, a thank-you that goes 100% to the provider:
 * from the customer's wallet balance (money moves now), or "I gave it in
 * cash" (recorded so the provider sees the thanks; nothing moves). Card tips
 * wait for online payments.
 *
 * The amounts, the maximums and the on/off switch are set in Admin →
 * Economics → Boost & tips (the first version's settings, PricingConfig).
 */
const { KINDS } = require('./kinds');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** While a boost can still change who takes the job: nobody has accepted yet. */
const BOOSTABLE = {
  repair: ['CONFIRMED', 'PROVIDER_ASSIGNED'],
  pet: ['BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED'],
  helping: ['CONFIRMED', 'WORKER_SEARCHING', 'WORKER_ASSIGNED'],
};

async function settings() {
  const cfg = await require('../pricing/services/config.service').getActiveConfig();
  return {
    boostEnabled: cfg.boostEnabled !== false,
    boostOptions: (cfg.boostOptions || [10, 20, 30, 50, 100]).filter((n) => n > 0),
    boostMaxPaise: cfg.boostMaxPaise ?? 20000,
    tipOptions: (cfg.tipOptions || [20, 50, 100]).filter((n) => n > 0),
    tipMaxPaise: cfg.tipMaxPaise ?? 50000,
  };
}

const boostPaise = (doc) => (doc?.boost?.paise > 0 ? doc.boost.paise : 0);
const paidAlready = (kind, doc) => doc.paymentStatus === 'paid';

/** What the customer's screen may offer for boosting right now. */
async function boostView(kind, doc, s = null) {
  s = s || await settings();
  const open = !!BOOSTABLE[kind]?.includes(doc.status) && !paidAlready(kind, doc);
  const current = boostPaise(doc);
  return {
    available: s.boostEnabled && open && current < s.boostMaxPaise,
    currentPaise: current,
    maxPaise: s.boostMaxPaise,
    options: s.boostOptions.filter((r) => current + r * 100 <= s.boostMaxPaise),
  };
}

/** The customer adds to the offer. */
async function addBoost({ kind, id, userId, amountPaise }) {
  const Model = KINDS[kind]?.model();
  if (!Model || !BOOSTABLE[kind]) throw err(400, 'NOT_SUPPORTED', 'This booking cannot be boosted.');
  const s = await settings();
  if (!s.boostEnabled) throw err(409, 'BOOST_OFF', 'Boosting is not available right now.');
  if (!s.boostOptions.map((r) => r * 100).includes(amountPaise)) throw err(400, 'BAD_AMOUNT', 'Choose one of the amounts shown.');

  // Atomic: only while nobody has accepted, and never past the maximum.
  const doc = await Model.findOneAndUpdate(
    {
      _id: id, userId, status: { $in: BOOSTABLE[kind] }, paymentStatus: { $ne: 'paid' },
      $or: [{ 'boost.paise': { $exists: false } }, { 'boost.paise': { $lte: s.boostMaxPaise - amountPaise } }],
    },
    { $inc: { 'boost.paise': amountPaise }, $push: { 'boost.history': { paise: amountPaise, at: new Date() } } },
    { new: true },
  );
  if (!doc) {
    const now = await Model.findOne({ _id: id, userId }).select('status boost').lean();
    if (!now) throw err(404, 'NOT_FOUND', 'Booking not found');
    if (!BOOSTABLE[kind].includes(now.status)) throw err(409, 'ALREADY_TAKEN', 'Someone has already taken your booking, so there is nothing to boost.');
    throw err(409, 'BOOST_MAX', `You can add up to ${rupees(s.boostMaxPaise)} in total.`);
  }

  await reRing(kind, doc);
  return { boostPaise: boostPaise(doc), message: `Added ${rupees(amountPaise)}. We are telling providers nearby now.` };
}

/** Everyone nearby hears the higher offer, including those who passed at the lower one. */
async function reRing(kind, doc) {
  const events = require('./job-events');
  const id = String(doc._id);
  try {
    if (kind === 'pet') {
      // Passing on the lower price is not passing on this one.
      await KINDS.pet.model().updateOne({ _id: doc._id }, { $set: { declinedBy: [] } });
      doc.declinedBy = [];
    }
    const plain = doc.toObject();
    const holder = plain.shopId ? { kind: 'shop', id: plain.shopId } : plain.workerId ? { kind: 'worker', id: plain.workerId } : null;
    if (holder) {
      // Offered to one provider: their offer card updates, and they are told.
      events.toProvider(holder.kind, holder.id, 'job.update', { kind, id, status: plain.status, boostPaise: boostPaise(plain), at: new Date().toISOString() });
      await events.push(holder, {
        title: `Customer added ${rupees(boostPaise(plain))}`,
        body: 'All of it is yours if you take this job.',
        deepLink: KINDS[kind].providerLink(id), data: { kind, id, status: plain.status },
      });
    } else if (kind === 'repair') {
      // Repairs are offered one provider at a time: start the round again, passers included.
      await KINDS.repair.model().updateOne({ _id: doc._id }, { $set: { declines: [] } });
      await require('../repair/services/booking/assignment').redispatch(doc._id).catch(() => null);
    } else {
      await events.alertNearbyProviders(kind, plain);
    }
    events.toProvider('user', plain.userId, 'job.update', { kind, id, status: plain.status, at: new Date().toISOString() });
  } catch (e) {
    require('../../core/logger').warn({ err: e.message, id }, '[boost] re-ring failed');
  }
}

/**
 * The booking settled: the boost is the provider's. Online, ZappyOne holds it
 * and pays it on; cash, the provider already has it. Idempotent per booking.
 */
async function settleBoost(kind, bookingId) {
  const Model = KINDS[kind]?.model();
  if (!Model) return null;
  const doc = await Model.findOneAndUpdate(
    { _id: bookingId, 'boost.paise': { $gt: 0 }, 'boost.settledAt': null },
    { $set: { 'boost.settledAt': new Date() } },
    { new: true },
  ).lean();
  if (!doc || doc.paymentMethod === 'cash') return doc ? 0 : null;
  const Transaction = require('../payment/transaction.model');
  if (doc.workerId && !doc.shopId) {
    await require('../wallet/wallet.service').apply({
      kind: 'worker', id: doc.workerId, type: 'credit', amountPaise: doc.boost.paise,
      reason: Transaction.REASONS.WORKER_EARNING, idempotencyKey: `boost:${kind}:${doc._id}`,
      description: `Customer's boost on ${doc.reference || 'a job'}`,
    });
  } else if (doc.shopId) {
    await Transaction.create({
      type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: doc.boost.paise,
      reason: Transaction.REASONS.WORKER_EARNING, idempotencyKey: `boost:shop:${kind}:${doc._id}`,
      description: `Shop earning (customer's boost) — ${kind} ${doc.reference || ''}`,
      metadata: { shopId: String(doc.shopId), bookingId: String(doc._id) }, status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });
  }
  return doc.boost.paise;
}

/* Tips */

const isDone = (kind, doc) => !!KINDS[kind]?.earning?.done.includes(doc.status);

async function tipView(kind, doc, s = null) {
  s = s || await settings();
  const done = isDone(kind, doc) && !!(doc.workerId || doc.shopId);
  return {
    available: done && s.tipMaxPaise > 0 && !(doc.tip?.paise > 0),
    given: doc.tip?.paise > 0 ? { paise: doc.tip.paise, method: doc.tip.method } : null,
    options: s.tipOptions.filter((r) => r * 100 <= s.tipMaxPaise),
    maxPaise: s.tipMaxPaise,
  };
}

/** The customer thanks the provider. Once per job. */
async function addTip({ kind, id, userId, amountPaise, method = 'wallet', message = '' }) {
  const Model = KINDS[kind]?.model();
  if (!Model) throw err(400, 'NOT_SUPPORTED', 'This booking cannot take a tip.');
  const s = await settings();
  if (!Number.isInteger(amountPaise) || amountPaise < 100 || amountPaise > s.tipMaxPaise) {
    throw err(400, 'BAD_AMOUNT', `A tip is ₹1 to ${rupees(s.tipMaxPaise)}.`);
  }
  const doc = await Model.findOne({ _id: id, userId });
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  if (!isDone(kind, doc)) throw err(409, 'NOT_DONE', 'You can tip once the job is done.');
  if (!(doc.workerId || doc.shopId)) throw err(409, 'NO_PROVIDER', 'Nobody to tip on this booking.');

  // Claim the tip slot first, so two taps never tip twice.
  const claimed = await Model.findOneAndUpdate(
    { _id: id, userId, $or: [{ 'tip.paise': { $exists: false } }, { 'tip.paise': 0 }] },
    { $set: { tip: { paise: amountPaise, method, message: String(message || '').slice(0, 200), at: new Date() } } },
    { new: true },
  ).lean();
  if (!claimed) throw err(409, 'ALREADY_TIPPED', 'You have already tipped for this job. Thank you!');

  const Transaction = require('../payment/transaction.model');
  const wallet = require('../wallet/wallet.service');
  if (method === 'wallet') {
    try {
      await wallet.apply({
        kind: 'user', id: userId, type: 'debit', amountPaise, reason: Transaction.REASONS.TIP,
        idempotencyKey: `tip:user:${kind}:${id}`, description: `Tip for ${claimed.reference || 'your job'}`,
      });
    } catch {
      await Model.updateOne({ _id: id }, { $unset: { tip: 1 } });
      throw err(402, 'LOW_BALANCE', `Your wallet has less than ${rupees(amountPaise)}. You can give the tip in cash instead.`);
    }
    if (claimed.workerId && !claimed.shopId) {
      await wallet.apply({
        kind: 'worker', id: claimed.workerId, type: 'credit', amountPaise, reason: Transaction.REASONS.TIP,
        idempotencyKey: `tip:worker:${kind}:${id}`, description: `Tip on ${claimed.reference || 'a job'}`,
      });
    } else {
      await Transaction.create({
        type: 'credit', owner: { kind: 'platform', id: null }, amountPaise, reason: Transaction.REASONS.TIP,
        idempotencyKey: `tip:shop:${kind}:${id}`, description: `Tip for shop on ${claimed.reference || ''}`,
        metadata: { shopId: String(claimed.shopId), bookingId: String(id) }, status: 'succeeded',
      });
    }
  }

  const to = claimed.workerId ? { kind: 'worker', id: claimed.workerId } : { kind: 'shop', id: claimed.shopId };
  require('./job-events').push(to, {
    title: `${rupees(amountPaise)} tip from your customer`,
    body: method === 'cash'
      ? `They say they gave it to you in cash.${claimed.tip.message ? ` "${claimed.tip.message}"` : ''}`
      : `It is in your wallet now.${claimed.tip.message ? ` "${claimed.tip.message}"` : ''}`,
    deepLink: '/worker/earnings', data: { kind, id: String(id) },
  }).catch(() => {});
  return { tipPaise: amountPaise, method, message: 'Thank you. Your tip has gone to them.' };
}

module.exports = { settings, boostView, addBoost, settleBoost, tipView, addTip, boostPaise, BOOSTABLE };
