/**
 * Helping Services task execution.
 *
 * The invariants this file defends, all of them from §61 and §60:
 *
 *   NEVER silently substitute.      An alternative item creates an approval and
 *                                   stops the helper until the customer answers.
 *   NEVER overspend.                A price above what was approved is refused
 *                                   at the point of purchase, not reconciled
 *                                   afterwards.
 *   NEVER fabricate a purchase.     An item reaches `purchased` only with a real
 *                                   price, and `actualPaise` is summed from
 *                                   those rows — never typed in.
 *   NEVER mix the two monies.       Item spend moves on PRODUCT_PURCHASE /
 *                                   WORKER_ADVANCE / WORKER_REIMBURSEMENT
 *                                   ledger reasons; earnings move on
 *                                   WORKER_EARNING. They cannot be summed by
 *                                   accident because they are different rows.
 *   NEVER promise a merchant.       Handing a parcel over sets
 *                                   `pending_merchant`, and nothing a helper
 *                                   does can set `refund_confirmed`.
 */

const crypto = require('crypto');
const { HelpingTask } = require('../models/task.model');
const pricingService = require('./pricing.service');
const money = require('./money.service');
const { OFFERED_PAYMENT_MODELS, normalisePaymentModel } = require('../models/config.model');
const walletService = require('../../wallet/wallet.service');
const Transaction = require('../../payment/transaction.model');
const notificationService = require('../../notification/notification.service');
const logger = require('../../../core/logger');
const zoneService = require('../../zone/zone.service');
const { httpError } = require('../../../core/errors');


function reference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return `ZH${out}`;
}

const notify = (userId, title, body, task, extra = {}) => notificationService.notify({
  recipient: { kind: 'user', id: userId },
  type: 'order_placed',
  title,
  body,
  deepLink: `/helping/tasks/${task._id}`,
  data: { helpingTaskId: String(task._id), ...extra },
}).catch(() => {});

/* Creation */

/**
 * Create a task, priced by the server.
 *
 * Nothing about the money is taken from the client (§58): the caller sends
 * what they WANT done and where, and every figure is derived here. A price
 * arriving in the request body is ignored entirely.
 */
async function createTask({
  userId,
  serviceType,
  title = '',
  instructions = '',
  pickupLocation,
  destination,
  stops = [],
  items = [],
  returnDetail = null,
  scheduledAt = null,
  paymentMethod = 'cash',
  paymentModel = 'worker_advance',
  specialHandling = false,
  idempotencyKey = null,
}) {
  if (idempotencyKey) {
    const existing = await HelpingTask.findOne({ idempotencyKey }).lean();
    if (existing) return { task: existing, replayed: true };
  }
  await zoneService.assertBookableLocation(pickupLocation);
  require('../../payment/payables').assertOnlineAvailable(paymentMethod);

  const cfg = await pricingService.getConfig(serviceType);

  const model = normalisePaymentModel(paymentModel);
  const offered = new Set((cfg.allowedPaymentModels || []).map(normalisePaymentModel));
  if (!OFFERED_PAYMENT_MODELS.includes(model) || !offered.has(model)) {
    throw httpError('That way of paying for items is not available for this service', 400, 'PAYMENT_MODEL_NOT_ALLOWED');
  }
  if (items.length > cfg.maxItems) {
    throw httpError(`At most ${cfg.maxItems} items can go on one task`, 400, 'TOO_MANY_ITEMS');
  }

  /*
   * The budget is the SUM OF PER-ITEM CEILINGS, not a pooled figure.
   *
   * A single pot would let a helper spend the whole budget on the first item
   * and come back without the rest — per-item ceilings are what make §6's
   * approval rule enforceable at the till.
   */
  const itemBudgetPaise = items.reduce(
    (sum, i) => sum + (i.maxApprovedPricePaise || 0) * (i.quantity || 1), 0,
  );

  const restricted = (cfg.restrictedItemCategories || []);
  if (restricted.length && items.length) {
    const hay = items.map((i) => `${i.name} ${i.description || ''}`.toLowerCase());
    const hit = restricted.find((cat) => hay.some((h) => h.includes(String(cat).toLowerCase())));
    if (hit) {
      throw httpError(
        'This is not something a ZappyOne helper can buy or carry', 400, 'RESTRICTED_ITEM',
        { category: hit },
      );
    }
  }

  // A helper fronting the shopping is capped; above that the customer prepays.
  if (model === 'worker_advance' && itemBudgetPaise > cfg.maxWorkerAdvancePaise) {
    throw httpError(
      'That is more than a helper can pay upfront — prepay the budget from your wallet, or reduce it',
      409, 'ADVANCE_LIMIT_EXCEEDED', { limitPaise: cfg.maxWorkerAdvancePaise },
    );
  }

  const charge = await pricingService.quote({
    serviceType, pickupLocation, destination, stops, specialHandling, itemBudgetPaise,
  });

  if (charge.quoteRequired) {
    throw httpError(
      'This trip is longer than we price automatically — our team will quote it',
      409, 'MANUAL_QUOTE_REQUIRED', { distanceKm: charge.distanceKm },
    );
  }

  const task = new HelpingTask({
    reference: reference(),
    userId,
    serviceType,
    title,
    instructions,
    pickupLocation,
    destination,
    stops,
    items,
    returnDetail,
    scheduledAt,
    paymentMethod,
    estimatedDurationMinutes: cfg.defaultDurationMinutes,
    charge,
    itemMoney: { budgetPaise: itemBudgetPaise, paymentModel: model },
    status: 'DRAFT',
    statusHistory: [{ status: 'DRAFT', at: new Date(), by: userId, byRole: 'user' }],
    idempotencyKey,
    handoverOtp: String(crypto.randomInt(1000, 9999)),
  });

  task.transitionTo('REQUESTED', { by: userId, byRole: 'user' });
  // The service fee is settled after the task (cash, or online when it's done),
  // so a placed task is confirmed at once and goes straight to helpers.
  task.transitionTo('CONFIRMED', { by: userId, byRole: 'user' });

  // Prepaid: the budget leaves the wallet before anyone is sent to buy anything.
  await money.holdBudget(task);
  try {
    await task.save();
  } catch (err) {
    await money.releaseHold(task, { amountPaise: task.itemMoney.heldPaise, why: 'Booking failed, budget returned' }).catch(() => {});
    throw err;
  }

  return { task: task.toObject(), replayed: false };
}

/* Item execution (§12, §13) */

/**
 * Record what the helper found for one item.
 *
 * `purchased` is the only status that moves money, and it is refused unless a
 * real price is supplied and that price is within what the customer approved.
 * The alternative is the pattern that erodes trust fastest: a helper buys
 * something pricier "because it was the only one", and the customer discovers
 * it on the bill.
 */
async function updateItem({ taskId, workerId, itemId, status, actualPricePaise = null, reason = '', receiptKey = '' }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (String(task.workerId || '') !== String(workerId)) {
    throw httpError('This is not your task', 403, 'FORBIDDEN');
  }

  const item = task.items.id(itemId);
  if (!item) throw httpError('Item not found', 404, 'ITEM_NOT_FOUND');

  if (status === 'purchased') {
    if (actualPricePaise == null || actualPricePaise < 0) {
      throw httpError('A purchase needs the price actually paid', 400, 'PRICE_REQUIRED');
    }

    const approvedCeiling = item.customerApproved && item.alternative
      ? item.alternative.pricePaise * (item.quantity || 1)
      : item.maxApprovedPricePaise * (item.quantity || 1);

    const ok = await pricingService.withinTolerance(
      task.serviceType, approvedCeiling, actualPricePaise,
    );
    if (!ok) {
      // Refused at the till, not reconciled later.
      throw httpError(
        'That is more than the customer approved — request approval first',
        409, 'APPROVAL_REQUIRED',
        { approvedPaise: approvedCeiling, attemptedPaise: actualPricePaise },
      );
    }

    // The helper pays at the till with their own money; on worker_advance that
    // is capped, so a helper never ends up financing the customer's shopping.
    if (task.itemMoney.paymentModel !== 'prepaid_wallet') {
      const previous = item.status === 'purchased' ? (item.actualPricePaise || 0) : 0;
      const spendAfter = task.computeItemSpend() - previous + actualPricePaise;
      const check = await pricingService.advanceCheck(task.serviceType, spendAfter);
      if (!check.allowed) {
        throw httpError(
          'That takes the shopping past what a helper may pay upfront — ask the customer first',
          409, 'ADVANCE_LIMIT_EXCEEDED', { limitPaise: check.limitPaise, attemptedPaise: spendAfter },
        );
      }
    }

    item.actualPricePaise = actualPricePaise;
    item.receiptKey = receiptKey || item.receiptKey;
  }

  if (['not_found', 'out_of_stock'].includes(status)) item.unavailableReason = reason;

  item.status = status;

  // Spend is always recomputed from purchased rows — never incremented, so it
  // cannot drift if a status is corrected.
  task.itemMoney.actualPaise = task.computeItemSpend();
  // Every purchase is paid by the helper at the shop.
  task.itemMoney.workerAdvancePaise = task.itemMoney.actualPaise;
  await task.save();

  return task.toObject();
}

/**
 * Propose a different product, and stop.
 *
 * Creates the approval AND moves the task to APPROVAL_REQUIRED, because a
 * helper who keeps shopping while the customer decides is how the wrong thing
 * gets bought.
 */
async function proposeAlternative({ taskId, workerId, itemId, alternative }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (String(task.workerId || '') !== String(workerId)) {
    throw httpError('This is not your task', 403, 'FORBIDDEN');
  }

  const item = task.items.id(itemId);
  if (!item) throw httpError('Item not found', 404, 'ITEM_NOT_FOUND');

  item.alternative = alternative;
  item.status = 'awaiting_approval';
  item.customerApproved = null;

  const previous = item.maxApprovedPricePaise * (item.quantity || 1);
  const proposed = (alternative.pricePaise || 0) * (alternative.quantity || item.quantity || 1);

  task.approvals.push({
    kind: 'alternative_item',
    itemId: item._id,
    reason: alternative.note || `Alternative for ${item.name}`,
    previousAmountPaise: previous,
    newAmountPaise: proposed,
    status: 'pending',
    evidenceKeys: alternative.photoKey ? [alternative.photoKey] : [],
  });

  if (task.canTransition('APPROVAL_REQUIRED')) {
    task.transitionTo('APPROVAL_REQUIRED', { by: workerId, byRole: 'worker', note: item.name });
  }
  await task.save();

  await notify(
    task.userId,
    'Your helper needs a decision',
    `${item.name} wasn't available. A different option is waiting for your approval.`,
    task,
  );

  return task.toObject();
}

/**
 * The customer answers. Immutable: the approval row records both amounts, who
 * decided and when, and is never rewritten (§36).
 */
async function respondToApproval({ taskId, userId, approvalId, approved }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (String(task.userId) !== String(userId)) throw httpError('Not your task', 403, 'FORBIDDEN');

  const approval = task.approvals.id(approvalId);
  if (!approval) throw httpError('Approval not found', 404, 'APPROVAL_NOT_FOUND');
  if (approval.status !== 'pending') {
    throw httpError('That has already been answered', 409, 'ALREADY_ANSWERED');
  }

  approval.status = approved ? 'approved' : 'rejected';
  approval.respondedAt = new Date();
  approval.respondedBy = userId;

  if (approval.itemId) {
    const item = task.items.id(approval.itemId);
    if (item) {
      item.customerApproved = approved;
      item.status = approved ? 'approved' : 'rejected';
      /*
       * An approved alternative RAISES this item's ceiling to the proposed
       * price — otherwise the purchase the customer just authorised would be
       * refused by the overspend guard a moment later.
       */
      if (approved && item.alternative) {
        item.maxApprovedPricePaise = item.alternative.pricePaise;
        task.itemMoney.budgetPaise = task.items.reduce(
          (sum, i) => sum + i.maxApprovedPricePaise * (i.quantity || 1), 0,
        );
      }
    }
  }

  // Back to work only when nothing else is outstanding.
  if (!task.hasPendingApproval() && task.status === 'APPROVAL_REQUIRED') {
    task.transitionTo('IN_PROGRESS', { by: userId, byRole: 'user' });
  }
  await task.save();
  return task.toObject();
}

/* Money (§7, §8, §35) */

/**
 * Record that the helper paid the shop out of their own pocket.
 *
 * Capped by config. A helper is a person doing an errand, not a source of
 * working capital, and a task that needs more than the cap must be funded by
 * the customer before anyone sets off.
 */
async function recordWorkerAdvance({ taskId, workerId, amountPaise }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (String(task.workerId || '') !== String(workerId)) {
    throw httpError('This is not your task', 403, 'FORBIDDEN');
  }

  const check = await pricingService.advanceCheck(task.serviceType, amountPaise);
  if (!check.allowed) {
    throw httpError(
      'That is more than a helper may advance — the customer must fund it',
      409, 'ADVANCE_LIMIT_EXCEEDED', { limitPaise: check.limitPaise },
    );
  }

  task.itemMoney.workerAdvancePaise = amountPaise;
  await task.save();

  logger.info({ taskId, workerId, amountPaise }, '[Helping] worker advance recorded');
  return task.toObject();
}

/**
 * Settlement — the step where the two monies stay apart.
 *
 * Two DIFFERENT ledger movements, deliberately never combined:
 *
 *   1. WORKER_REIMBURSEMENT — giving back exactly what the helper spent. Not
 *      income; it must never appear in an earnings report.
 *   2. The service fee, through the shared settlement: paid online, the helper
 *      is credited their earning; paid in cash, they already hold the fee and
 *      are billed the platform's share instead.
 *
 * Unspent budget goes back to the customer as PRODUCT_REFUND, because
 * authorising ₹1,000 and spending ₹640 must not leave ₹360 sitting with the
 * platform.
 */
async function settleTask({ taskId, actorId = null }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (!['COMPLETED', 'CUSTOMER_CONFIRMED', 'DISPUTED'].includes(task.status)) {
    throw httpError('This task is not finished', 409, 'NOT_COMPLETE');
  }
  if (task.status === 'SETTLED') return task.toObject();

  const spend = task.computeItemSpend();
  task.itemMoney.actualPaise = spend;

  if (task.workerId) {
    // 1. Give the helper back what they paid at the shop, less any cash the customer handed them for it.
    const owed = money.reimbursementPaise(task);
    if (owed > 0 && task.itemMoney.workerReimbursedPaise < owed) {
      await walletService.apply({
        kind: 'worker',
        id: task.workerId,
        type: 'credit',
        amountPaise: owed,
        reason: Transaction.REASONS.WORKER_REIMBURSEMENT,
        idempotencyKey: `helping-reimburse-${task._id}`,
        refs: { helpingTaskId: task._id },
        description: `Reimbursement for purchases on ${task.reference}`,
      });
      task.itemMoney.workerReimbursedPaise = owed;
    }

    // 2. The service fee. What the helper keeps is their earning; the rest is the platform's.
    const feePaise = task.charge?.serviceChargePaise || 0;
    await require('../../payment/settlement').settleProviderShare({
      source: 'helping',
      booking: task,
      reference: task.reference,
      paymentMethod: task.paymentMethod,
      totalPaise: feePaise,
      platformPaise: Math.max(0, feePaise - (task.charge?.workerEarningPaise || 0)),
      refs: { helpingTaskId: task._id },
    });
  }

  // 3. Return whatever was held from the customer's wallet but not spent.
  await money.releaseHold(task, { amountPaise: money.unspentHoldPaise(task), why: 'Unspent shopping budget' });

  task.transitionTo('SETTLED', { by: actorId, byRole: 'system' });
  await task.save();

  return task.toObject();
}

/** Why the helper may not finish yet (shopping unfinished, or money still due), or null. */
const paymentBlocker = (task) => money.completionBlocker(task);

/**
 * The helper took what is due — the fee, and the receipt total on a
 * worker_advance task — in cash. Only once the shopping is final, so the
 * amount is the real bill and not a guess.
 */
async function recordCash({ taskId, workerId }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (String(task.workerId || '') !== String(workerId)) throw httpError('This is not your task', 403, 'FORBIDDEN');
  if (['CANCELLED', 'FAILED', 'SETTLED', 'DRAFT', 'REQUESTED', 'PAYMENT_PENDING'].includes(task.status)) {
    throw httpError('There is nothing to collect on this task right now', 409, 'NOTHING_DUE');
  }
  if (!money.shoppingDone(task)) {
    throw httpError('Finish the shopping first, so the customer pays the real bill', 409, 'ITEMS_NOT_FINAL');
  }
  const due = money.amountDue(task);
  if (due.totalPaise <= 0) return { task: task.toObject(), alreadyPaid: true, collectedPaise: 0 };

  await money.recordCash(task);
  await task.save();
  logger.info({ taskId: String(taskId), workerId: String(workerId), ...due }, '[Helping] cash collected');
  return { task: task.toObject(), alreadyPaid: false, collectedPaise: due.totalPaise, breakdown: due };
}

/* Return & exchange (§28, §29, §30) */

/**
 * The parcel changed hands. That is ALL this records.
 *
 * `pending_merchant` is the furthest a helper's action can move a refund.
 * Whether the merchant accepts, refunds or rejects is their decision, made
 * later, in their system — and claiming otherwise here would be the single
 * most damaging lie this product could tell (§30, §60).
 */
async function recordHandover({ taskId, workerId, trackingNumber = '', acknowledgement = '', proofKeys = [] }) {
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (String(task.workerId || '') !== String(workerId)) {
    throw httpError('This is not your task', 403, 'FORBIDDEN');
  }
  if (!task.returnDetail) throw httpError('This task is not a return', 400, 'NOT_A_RETURN');

  if (!proofKeys.length) {
    // A handover with no evidence is an assertion, not a proof.
    throw httpError('A handover needs photo or receipt proof', 400, 'PROOF_REQUIRED');
  }

  task.returnDetail.handoverAt = new Date();
  task.returnDetail.trackingNumber = trackingNumber;
  task.returnDetail.merchantAcknowledgement = acknowledgement;
  task.returnDetail.refundStatus = 'pending_merchant';

  for (const key of proofKeys) {
    task.proofs.push({ kind: 'merchant_acknowledgement', key, capturedAt: new Date() });
  }

  task.transitionTo('HANDED_OVER', { by: workerId, byRole: 'worker' });
  await task.save();

  await notify(
    task.userId,
    'Handed over to the merchant',
    'Your item was handed over and we have the proof. The merchant now reviews it under their own policy.',
    task,
  );

  return task.toObject();
}

/**
 * Only an operator, acting on something the merchant actually said, may move
 * a refund to confirmed or failed. Never a worker, never automatically.
 */
async function recordMerchantRefundOutcome({ taskId, status, externalReference = '' }) {
  if (!['refund_confirmed', 'refund_failed', 'not_applicable'].includes(status)) {
    throw httpError('Not a valid merchant outcome', 400, 'BAD_REFUND_STATUS');
  }
  const task = await HelpingTask.findById(taskId);
  if (!task) throw httpError('Task not found', 404, 'NOT_FOUND');
  if (!task.returnDetail) throw httpError('This task is not a return', 400, 'NOT_A_RETURN');

  task.returnDetail.refundStatus = status;
  task.returnDetail.refundExternalReference = externalReference;
  await task.save();
  return task.toObject();
}

module.exports = {
  createTask,
  updateItem,
  proposeAlternative,
  respondToApproval,
  recordWorkerAdvance,
  settleTask,
  paymentBlocker,
  recordCash,
  recordHandover,
  recordMerchantRefundOutcome,
};
