/**
 * Wallet Service
 * ----------------------------------------------------------------------------
 * Two invariants this service must preserve at all times:
 *
 *   1. Wallet.balancePaise == SUM(Transaction.amountPaise) for that owner
 *   2. No transaction is ever applied twice (idempotency by key)
 *
 * How:
 *   - Every credit/debit goes through `apply()`.
 *   - `apply()` first attempts to create the Transaction with the idempotency
 *     key. If the unique-key constraint trips, the operation was already done
 *     and we return the existing row — no double credit.
 *   - Then a single `findOneAndUpdate` on Wallet bumps balance + version,
 *     atomic at the document level.
 *   - If the wallet update fails (frozen / insufficient funds), we mark the
 *     transaction as `reversed` so the ledger sum still reconciles.
 *
 * Why not Mongo multi-doc transactions on every wallet write? Hot path —
 * worker earnings credit on every completion. Document-level atomicity here
 * is sufficient because the Transaction row is itself the source of truth;
 * Wallet is just a cache.
 * ----------------------------------------------------------------------------
 */

const Wallet = require('./wallet.model');
const Transaction = require('../payment/transaction.model');
const logger = require('../../core/logger');

async function getOrCreate({ kind, id }) {
  let w = await Wallet.findOne({ 'owner.kind': kind, 'owner.id': id });
  if (!w) {
    try {
      w = await Wallet.create({ owner: { kind, id }, balancePaise: 0 });
    } catch (err) {
      // Race: another request created it. Re-fetch.
      if (err.code === 11000) {
        w = await Wallet.findOne({ 'owner.kind': kind, 'owner.id': id });
      } else {
        throw err;
      }
    }
  }
  return w;
}

/**
 * Apply a wallet movement.
 *
 * @param {object}   p
 * @param {string}   p.kind         'user' | 'worker'
 * @param {ObjectId} p.id
 * @param {string}   p.type         'credit' | 'debit'
 * @param {number}   p.amountPaise  Always positive — sign is derived from `type`
 * @param {string}   p.reason       From Transaction.REASONS
 * @param {string}   p.idempotencyKey  REQUIRED for retry safety
 * @param {object}   [p.refs]       { orderId, paymentIntentId, subscriptionId }
 * @param {string}   [p.description]
 * @param {object}   [p.metadata]
 */
async function apply({
  kind, id, type, amountPaise, reason, idempotencyKey, refs = {}, description, metadata,
}) {
  if (!idempotencyKey) {
    throw Object.assign(new Error('idempotencyKey is required'), { code: 'WALLET_NO_IDEMPOTENCY' });
  }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw Object.assign(new Error('amountPaise must be a positive integer'), { code: 'WALLET_BAD_AMOUNT' });
  }
  if (!['credit', 'debit'].includes(type)) {
    throw Object.assign(new Error('type must be credit or debit'), { code: 'WALLET_BAD_TYPE' });
  }

  // Step 1: try to record the transaction. Unique idempotencyKey guarantees
  // at-most-once application.
  const signedAmount = type === 'credit' ? amountPaise : -amountPaise;
  let txn;
  try {
    txn = await Transaction.create({
      type,
      owner: { kind, id },
      amountPaise: signedAmount,
      reason,
      refOrderId: refs.orderId,
      refHelpingTaskId: refs.helpingTaskId,
      refPaymentIntentId: refs.paymentIntentId,
      refSubscriptionId: refs.subscriptionId,
      description,
      metadata,
      idempotencyKey,
      status: 'pending',
    });
  } catch (err) {
    if (err.code === 11000) {
      // Already applied. Return the existing one.
      const existing = await Transaction.findOne({ idempotencyKey });
      logger.info({ idempotencyKey }, 'Wallet apply skipped — already processed');
      return { transaction: existing, wallet: await getOrCreate({ kind, id }), deduped: true };
    }
    throw err;
  }

  // Step 2: bump wallet balance atomically.
  //
  // Overdraft rules by owner kind:
  //   - user:   hard floor at 0 (must have balance to pay)
  //   - worker: allowed to go negative (commission debt) down to hard limit.
  //             Soft limit (-₹200) triggers warnings elsewhere; the hard limit
  //             (-₹500) blocks the debit at the DB filter.
  //
  // Freeze semantics:
  //   - DEBITS  on frozen wallets: always blocked (prevents withdrawals during fraud review)
  //   - CREDITS on frozen wallets: allowed — a worker who earned money while frozen
  //     must still receive their earnings; the freeze exists to block outflows, not
  //     to confiscate wages already earned. Payout.service separately checks isFrozen
  //     before any withdrawal is initiated.
  const filter = { 'owner.kind': kind, 'owner.id': id };
  if (type === 'debit') {
    filter.isFrozen = false; // debits blocked on frozen wallets
    if (kind === 'user') {
      filter.balancePaise = { $gte: amountPaise };
    } else if (kind === 'worker') {
      // Allow the debit only if resulting balance >= HARD_LIMIT
      const HARD_LIMIT_PAISE = -50000; // -₹500
      filter.balancePaise = { $gte: HARD_LIMIT_PAISE + amountPaise };
    }
  }

  const update = {
    $inc: {
      balancePaise: signedAmount,
      version: 1,
      [type === 'credit' ? 'lifetimeCreditedPaise' : 'lifetimeDebitedPaise']: amountPaise,
    },
  };

  let wallet = await Wallet.findOneAndUpdate(filter, update, { new: true });

  if (!wallet) {
    // Either the wallet didn't exist, or the guard failed (frozen / insufficient).
    // Try to create + retry once.
    await getOrCreate({ kind, id });
    wallet = await Wallet.findOneAndUpdate(filter, update, { new: true });
  }

  if (!wallet) {
    // Real failure — reverse the transaction so the ledger stays consistent.
    txn.status = 'reversed';
    await txn.save();
    const msg = type === 'debit'
      ? (kind === 'worker'
          ? 'Debit would breach hard limit (-₹500). Clear dues first.'
          : 'Insufficient funds or wallet frozen')
      : 'Wallet credit failed — wallet document could not be created';
    throw Object.assign(new Error(msg), {
      status: 400,
      code: type === 'debit'
        ? (kind === 'worker' ? 'WALLET_HARD_LIMIT' : 'WALLET_INSUFFICIENT')
        : 'WALLET_WRITE_FAILED',
    });
  }

  // Mark transaction succeeded with the post-balance snapshot.
  txn.status = 'succeeded';
  txn.balanceAfterPaise = wallet.balancePaise;
  await txn.save();

  return { transaction: txn, wallet, deduped: false };
}

async function getBalance({ kind, id }) {
  const w = await getOrCreate({ kind, id });
  return { balancePaise: w.balancePaise, currency: w.currency, isFrozen: w.isFrozen };
}

async function listTransactions({ kind, id, page = 1, limit = 50, reason }) {
  const filter = { 'owner.kind': kind, 'owner.id': id };
  if (reason) filter.reason = reason;
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

/**
 * Admin-only: reconcile a wallet's denormalized balance against the ledger.
 * Returns true if they matched, false if a correction was applied.
 */
async function reconcile({ kind, id }) {
  const agg = await Transaction.aggregate([
    {
      $match: {
        'owner.kind': kind,
        'owner.id': id,
        status: 'succeeded',
      },
    },
    { $group: { _id: null, sum: { $sum: '$amountPaise' } } },
  ]);
  const trueBalance = agg[0]?.sum || 0;
  const w = await getOrCreate({ kind, id });
  if (w.balancePaise === trueBalance) return { matched: true, balance: trueBalance };

  logger.warn(
    { kind, id, denorm: w.balancePaise, ledger: trueBalance },
    'Wallet balance mismatch — reconciling'
  );
  w.balancePaise = trueBalance;
  await w.save();
  return { matched: false, balance: trueBalance, corrected: true };
}

/**
 * Internal transfer between two principals (e.g. user refund from platform).
 * Uses two `apply()` calls, each with its own idempotency key derived from
 * a shared transferId.
 */
async function transfer({ from, to, amountPaise, reason, transferId, description }) {
  if (!transferId) throw Object.assign(new Error('transferId required'), { code: 'TRANSFER_NO_ID' });
  // Debit source first; if it fails we never credit the destination.
  if (from.kind !== 'platform') {
    await apply({
      ...from,
      type: 'debit',
      amountPaise,
      reason,
      idempotencyKey: `transfer:${transferId}:debit`,
      description,
    });
  }
  if (to.kind !== 'platform') {
    await apply({
      ...to,
      type: 'credit',
      amountPaise,
      reason,
      idempotencyKey: `transfer:${transferId}:credit`,
      description,
    });
  }
  return { ok: true };
}

module.exports = {
  getOrCreate,
  apply,
  getBalance,
  listTransactions,
  reconcile,
  transfer,
};
