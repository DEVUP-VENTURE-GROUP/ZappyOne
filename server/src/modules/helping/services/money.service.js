/**
 * Money on a helping task: the service fee and the customer's item money,
 * which are always tracked apart.
 *
 *   fee     task.paymentStatus / task.paymentMethod          → settles to the helper
 *   items   task.itemMoney.{heldPaise, customerPaidPaise}    → reimburses the helper
 *
 * Items, by payment model:
 *   worker_advance   the helper pays at the shop; the customer repays the receipt
 *                    total at delivery, in cash to the helper or online
 *   prepaid_wallet   the budget is debited from the customer's wallet at booking;
 *                    anything spent above it is repaid at delivery, anything
 *                    below it goes back to the wallet
 *
 * Nothing about items is due until the shopping is finished — every item bought,
 * unavailable, rejected or skipped — because until then nobody knows the total.
 */

const walletService = require('../../wallet/wallet.service');
const Transaction = require('../../payment/transaction.model');
const { httpError } = require('../../../core/errors');

const ITEM_FINAL = new Set(['purchased', 'not_found', 'out_of_stock', 'rejected', 'skipped']);

const shoppingDone = (task) => (task.items || []).every((i) => ITEM_FINAL.has(i.status));

function feeDuePaise(task) {
  return task.paymentStatus === 'paid' ? 0 : (task.charge?.serviceChargePaise || 0);
}

/** Item money still owed by the customer, or null while the shopping is unfinished. */
function itemsDuePaise(task) {
  const spend = task.computeItemSpend();
  const covered = (task.itemMoney?.heldPaise || 0) + (task.itemMoney?.customerPaidPaise || 0);
  if (!shoppingDone(task)) return null;
  return Math.max(0, spend - covered);
}

/** What the customer owes right now, split so each part lands in the right place. */
function amountDue(task) {
  const feePaise = feeDuePaise(task);
  const items = itemsDuePaise(task);
  return {
    feePaise,
    itemsPaise: items ?? 0,
    itemsPending: items === null,
    totalPaise: feePaise + (items ?? 0),
  };
}

/** Why the helper may not finish yet, or null. */
function completionBlocker(task) {
  if (!shoppingDone(task)) {
    return { code: 'ITEMS_NOT_FINAL', message: 'Mark every item as bought or unavailable before completing' };
  }
  const due = amountDue(task);
  if (due.totalPaise <= 0) return null;
  const onlineFee = due.feePaise > 0 && task.paymentMethod !== 'cash';
  return onlineFee
    ? { code: 'PAYMENT_PENDING', message: 'The customer has not paid online yet. Ask them to pay in the app, or collect cash before completing' }
    : { code: 'CASH_NOT_COLLECTED', message: 'Collect the amount due in cash and record it before completing' };
}

/* Online (payables registry) */

const payable = {
  isPaid(task) {
    const due = amountDue(task);
    return due.totalPaise === 0 && !due.itemsPending;
  },
  payable(task) {
    const due = amountDue(task);
    if (due.totalPaise <= 0 && due.itemsPending) {
      throw httpError('Your helper is still shopping — pay once the bill is final', 409, 'ITEMS_NOT_FINAL');
    }
    return { amountPaise: due.totalPaise, breakdown: { feePaise: due.feePaise, itemsPaise: due.itemsPaise } };
  },
  /** Apply a captured payment, part by part, exactly as it was charged. */
  markPaid(task, intent) {
    const split = intent.breakdown || { feePaise: intent.amountPaise, itemsPaise: 0 };
    if (split.feePaise > 0) {
      task.paymentStatus = 'paid';
      task.paymentId = String(intent._id);
    }
    if (split.itemsPaise > 0) {
      task.itemMoney.customerPaidPaise = (task.itemMoney.customerPaidPaise || 0) + split.itemsPaise;
      task.itemMoney.collectedVia = 'online';
    }
  },
};

/* Cash at the door */

/**
 * The helper took what was due in cash. Returns what was recorded.
 * A fee chosen as online becomes a cash fee; a payment already in the gateway blocks this.
 */
async function recordCash(task) {
  const due = amountDue(task);
  if (due.feePaise > 0 && task.paymentMethod !== 'cash') {
    const PaymentIntent = require('../../payment/payment-intent.model');
    const inGateway = await PaymentIntent.exists({
      bookingSource: 'helping', bookingId: task._id, status: { $in: ['authorized', 'captured'] },
    });
    if (inGateway) throw httpError('The customer has already paid online; it is being confirmed', 409, 'ONLINE_PAYMENT_IN_PROGRESS');
    task.paymentMethod = 'cash';
  }
  if (due.feePaise > 0) {
    task.paymentStatus = 'paid';
    task.cashCollectedAt = new Date();
  }
  if (due.itemsPaise > 0) {
    task.itemMoney.customerPaidPaise = (task.itemMoney.customerPaidPaise || 0) + due.itemsPaise;
    task.itemMoney.collectedVia = 'cash';
  }
  return due;
}

/* Settlement helpers */

/**
 * What the helper gets back for purchases. They paid every purchase at the
 * shop; whatever the customer handed them in cash they already hold.
 */
function reimbursementPaise(task) {
  const spend = task.computeItemSpend();
  const heldByHelper = task.itemMoney?.collectedVia === 'cash' ? (task.itemMoney.customerPaidPaise || 0) : 0;
  return Math.max(0, spend - heldByHelper);
}

/** Held budget the customer gets back: what was not spent, or all of it if nothing was bought. */
function unspentHoldPaise(task) {
  return Math.max(0, (task.itemMoney?.heldPaise || 0) - task.computeItemSpend() - (task.itemMoney?.refundedPaise || 0));
}

/* Prepaid wallet hold */

/** Debit the budget from the customer's wallet. Idempotent per task. */
async function holdBudget(task) {
  const amount = task.itemMoney?.budgetPaise || 0;
  if (task.itemMoney.paymentModel !== 'prepaid_wallet' || amount <= 0) return;
  try {
    await walletService.apply({
      kind: 'user',
      id: task.userId,
      type: 'debit',
      amountPaise: amount,
      reason: Transaction.REASONS.PRODUCT_PURCHASE,
      idempotencyKey: `helping-budget-hold-${task._id}`,
      refs: { helpingTaskId: task._id },
      description: `Shopping budget held for ${task.reference}`,
    });
  } catch (err) {
    throw httpError('Your wallet does not have enough for this shopping budget — top up, or pay the helper at delivery',
      402, 'WALLET_INSUFFICIENT', { budgetPaise: amount });
  }
  task.itemMoney.heldPaise = amount;
}

/** Give held money back to the customer's wallet. Idempotent per task. */
async function releaseHold(task, { amountPaise, why }) {
  if (amountPaise <= 0) return 0;
  await walletService.apply({
    kind: 'user',
    id: task.userId,
    type: 'credit',
    amountPaise,
    reason: Transaction.REASONS.PRODUCT_REFUND,
    idempotencyKey: `helping-unspent-${task._id}`,
    refs: { helpingTaskId: task._id },
    description: `${why} — ${task.reference}`,
  });
  task.itemMoney.refundedPaise = (task.itemMoney.refundedPaise || 0) + amountPaise;
  return amountPaise;
}

module.exports = {
  ITEM_FINAL,
  shoppingDone,
  amountDue,
  completionBlocker,
  payable,
  recordCash,
  reimbursementPaise,
  unspentHoldPaise,
  holdBudget,
  releaseHold,
};
