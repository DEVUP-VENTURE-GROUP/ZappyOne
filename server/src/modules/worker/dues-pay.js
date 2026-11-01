// A partner (pro or shop) paying ZappyOne its dues online: how much may be paid now, and clearing it once the gateway confirms.
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

async function owed(owner) {
  if (owner.kind === 'worker') return (await require('./worker-dues.service').getDuesStatus(owner.id)).duesPaise;
  if (owner.kind === 'shop') return (await require('../shop/shop-dues').duesOf(owner.id)).duesPaise;
  throw fail(403, 'NOT_A_PARTNER', 'Only partners pay dues.');
}

// The whole amount by default; part of it is allowed, never more than is owed and never under ₹1.
async function amountFor(owner, amountPaise) {
  const due = await owed(owner);
  if (due <= 0) throw fail(409, 'NOTHING_OWED', 'You do not owe ZappyOne anything right now.');
  const want = amountPaise == null ? due : Number(amountPaise);
  if (!Number.isInteger(want) || want < 100) throw fail(400, 'BAD_AMOUNT', 'Pay at least ₹1.');
  if (want > due) throw fail(400, 'TOO_MUCH', `You owe ${'₹'}${Math.round(due / 100).toLocaleString('en-IN')}. Pay that or less.`);
  return want;
}

// Once per gateway payment: the dues go down at once, so blocked work opens again without anyone checking.
async function applyPaid({ owner, amountPaise, paymentId, intentId }) {
  const Transaction = require('../payment/transaction.model');
  if (owner.kind === 'worker') {
    await require('../wallet/wallet.service').apply({
      kind: 'worker', id: owner.id, type: 'credit', amountPaise,
      reason: Transaction.REASONS.DUES_PAYMENT, idempotencyKey: `dues:online:${paymentId}`,
      refs: { paymentIntentId: intentId }, description: 'Dues paid to ZappyOne online',
    });
    const { redis } = require('../../config/redis');
    await redis.del(`dues:told:${owner.id}:blocked`, `dues:told:${owner.id}:warning`).catch(() => {});
  } else if (owner.kind === 'shop') {
    await require('../shop/shop-dues').recordPayment({ shopId: owner.id, amountPaise, reference: `online:${paymentId}` })
      .catch((e) => { if (e.code !== 'DUPLICATE_REFERENCE') throw e; });
  }
  const events = require('../jobs/job-events');
  events.toProvider(owner.kind, owner.id, 'dues.update', { paidPaise: amountPaise, at: new Date().toISOString() });
}

module.exports = { amountFor, applyPaid, owed };
