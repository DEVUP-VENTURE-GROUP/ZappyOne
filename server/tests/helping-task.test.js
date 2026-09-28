/**
 * Helping Services — the rules that protect the customer's money and the
 * helper's pocket, and the one promise this product must never make.
 *
 * The four things proved here, each of which is a way this category goes
 * wrong in the real world:
 *
 *   1. ITEM MONEY IS NOT EARNINGS (§7, §32, §34). What a helper spends at a
 *      till is the customer's money passing through. If it ever lands in an
 *      earnings figure, helpers appear to earn thousands for a ₹150 errand
 *      and every payout, commission and revenue report is wrong.
 *
 *   2. NOTHING IS SUBSTITUTED OR OVERSPENT SILENTLY (§6, §61). A different
 *      product, or a higher price, stops the helper and asks.
 *
 *   3. A REFUND IS NEVER CLAIMED (§30, §60). Handing a parcel to a merchant
 *      proves only that the merchant has it.
 *
 *   4. NOTHING IS HARDCODED (§51). Every fee comes from config; changing the
 *      config changes the price with no deploy.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { HelpingConfig } = require('../src/modules/helping/models/config.model');
const { HelpingTask } = require('../src/modules/helping/models/task.model');
const pricingService = require('../src/modules/helping/services/pricing.service');
const taskService = require('../src/modules/helping/services/task.service');
const Transaction = require('../src/modules/payment/transaction.model');
const Wallet = require('../src/modules/wallet/wallet.model');

jest.setTimeout(60000);

const inr = (r) => r * 100;
const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();

// Hyderabad-ish points roughly 3 km apart.
const HERE = { type: 'Point', coordinates: [78.4867, 17.3850], address: 'Start' };
const THERE = { type: 'Point', coordinates: [78.5100, 17.3900], address: 'End' };

async function seedConfig(overrides = {}) {
  await HelpingConfig.deleteMany({});
  pricingService.invalidateConfigCache();
  return HelpingConfig.create({
    serviceType: 'shopping',
    baseFeePaise: inr(80),
    distanceSlabs: [
      { fromKm: 0, toKm: 2, feePaise: inr(0) },
      { fromKm: 2, toKm: 5, feePaise: inr(30) },
      { fromKm: 5, toKm: 10, feePaise: inr(60) },
      { fromKm: 10, toKm: null, feePaise: 0, requiresQuote: true },
    ],
    freeWaitingMinutes: 10,
    waitingPerMinutePaise: inr(2),
    includedStops: 1,
    additionalStopFeePaise: inr(25),
    maxStops: 3,
    commissionPct: 20,
    platformFeePaise: 0,
    taxPct: 0,
    allowedPaymentModels: ['customer_preauth', 'worker_advance', 'prepaid_wallet'],
    maxWorkerAdvancePaise: inr(1000),
    maxItemBudgetPaise: inr(10000),
    priceTolerancePct: 0,
    ...overrides,
  });
}

beforeAll(async () => { await startMongo(); });
afterAll(async () => { await stopMongo(); });

beforeEach(async () => {
  await HelpingTask.deleteMany({});
  await Transaction.deleteMany({});
  await Wallet.deleteMany({});
  await seedConfig();
});

const twoItems = () => ([
  { name: '12W LED bulb', quantity: 1, maxApprovedPricePaise: inr(250) },
  { name: 'Tap washer', quantity: 2, maxApprovedPricePaise: inr(50) },
]);

const baseTask = (over = {}) => ({
  userId,
  serviceType: 'shopping',
  pickupLocation: HERE,
  destination: THERE,
  items: twoItems(),
  ...over,
});

/* Pricing comes from config, never from code */

describe('pricing is configuration, not code', () => {
  it('prices an errand from the configured slabs', async () => {
    const q = await pricingService.quote({
      serviceType: 'shopping', pickupLocation: HERE, destination: THERE,
    });
    // ~2.5 km → the 2–5 km slab.
    expect(q.distanceFeePaise).toBe(inr(30));
    expect(q.baseFeePaise).toBe(inr(80));
    expect(q.serviceChargePaise).toBe(inr(110));
  });

  it('changes the price when an operator changes the config — no deploy', async () => {
    await seedConfig({ baseFeePaise: inr(140) });
    const q = await pricingService.quote({
      serviceType: 'shopping', pickupLocation: HERE, destination: THERE,
    });
    expect(q.serviceChargePaise).toBe(inr(170));
  });

  it('gives the first 10 waiting minutes away and meters the rest', async () => {
    const free = await pricingService.quote({
      serviceType: 'shopping', pickupLocation: HERE, destination: THERE, waitingMinutes: 10,
    });
    expect(free.waitingFeePaise).toBe(0);

    const paid = await pricingService.quote({
      serviceType: 'shopping', pickupLocation: HERE, destination: THERE, waitingMinutes: 25,
    });
    // 15 billable minutes × ₹2
    expect(paid.waitingFeePaise).toBe(inr(30));
  });

  it('charges only for stops beyond the included one', async () => {
    const stops = [
      { location: HERE, purpose: 'shop' },
      { location: THERE, purpose: 'shop' },
    ];
    const q = await pricingService.quote({
      serviceType: 'shopping', pickupLocation: HERE, destination: THERE, stops,
    });
    expect(q.multiStopFeePaise).toBe(inr(25));
  });

  it('refuses to invent a price for a trip past the last slab', async () => {
    const far = { type: 'Point', coordinates: [79.5, 17.9], address: 'Far' };
    const q = await pricingService.quote({
      serviceType: 'shopping', pickupLocation: HERE, destination: far,
    });
    expect(q.quoteRequired).toBe(true);

    await expect(taskService.createTask(baseTask({ destination: far })))
      .rejects.toMatchObject({ code: 'MANUAL_QUOTE_REQUIRED' });
  });

  it('measures the whole trip, not just the endpoints', async () => {
    const detour = { type: 'Point', coordinates: [78.6, 17.5] };
    const direct = pricingService.tripDistanceKm({ pickupLocation: HERE, destination: THERE });
    const viaStop = pricingService.tripDistanceKm({
      pickupLocation: HERE, destination: THERE, stops: [{ location: detour }],
    });
    // Underpaying the helper on multi-stop work is the failure this prevents.
    expect(viaStop).toBeGreaterThan(direct);
  });
});

/* The separation that defines this category */

describe('item money and service money never mix', () => {
  it('keeps the shopping budget out of the service charge', async () => {
    const { task } = await taskService.createTask(baseTask());
    // ₹250 + (₹50 × 2) = ₹350 of goods…
    expect(task.itemMoney.budgetPaise).toBe(inr(350));
    // …and the errand itself is priced entirely separately.
    expect(task.charge.serviceChargePaise).toBe(inr(110));
    expect(task.charge.serviceChargePaise).not.toBe(inr(460));
  });

  it('presents the authorisation as two numbers, never one', async () => {
    const { task } = await taskService.createTask(baseTask());
    const auth = pricingService.authorisationTotal(task.charge, task.itemMoney.budgetPaise);
    expect(auth.serviceChargePaise).toBe(inr(110));
    expect(auth.itemBudgetPaise).toBe(inr(350));
    expect(auth.maxAuthorisationPaise).toBe(inr(460));
    expect(auth.note).toMatch(/separate/i);
  });

  it('never commissions the item money', async () => {
    const { task } = await taskService.createTask(baseTask());
    // 20% of the ₹110 fee, not of ₹460.
    expect(task.charge.commissionPaise).toBe(inr(22));
    expect(task.charge.workerEarningPaise).toBe(inr(88));
  });

  it('pays the helper their fee and their money back as SEPARATE ledger rows', async () => {
    const { task } = await taskService.createTask(baseTask({ paymentModel: 'worker_advance' }));
    const doc = await HelpingTask.findById(task._id);
    doc.workerId = workerId;
    doc.status = 'COMPLETED';
    doc.items[0].status = 'purchased';
    doc.items[0].actualPricePaise = inr(240);
    doc.itemMoney.workerAdvancePaise = inr(240);
    await doc.save();

    await taskService.settleTask({ taskId: task._id });

    const rows = await Transaction.find({ refHelpingTaskId: task._id }).lean();
    const byReason = Object.fromEntries(rows.map((r) => [r.reason, r.amountPaise]));

    // The reimbursement is the helper's own ₹240 coming back…
    expect(byReason[Transaction.REASONS.WORKER_REIMBURSEMENT]).toBe(inr(240));
    // …and the earning is the ₹88 fee. Two rows, two reasons.
    expect(byReason[Transaction.REASONS.WORKER_EARNING]).toBe(inr(88));

    // The invariant that matters: an earnings report reading WORKER_EARNING
    // sees ₹88, not ₹328.
    const earnings = rows
      .filter((r) => r.reason === Transaction.REASONS.WORKER_EARNING)
      .reduce((s, r) => s + r.amountPaise, 0);
    expect(earnings).toBe(inr(88));
  });

  it('returns unspent budget rather than keeping it', async () => {
    const { task } = await taskService.createTask(baseTask({ paymentModel: 'prepaid_wallet' }));
    const doc = await HelpingTask.findById(task._id);
    doc.workerId = workerId;
    doc.status = 'COMPLETED';
    doc.items[0].status = 'purchased';
    doc.items[0].actualPricePaise = inr(200);
    doc.items[1].status = 'not_found';
    await doc.save();

    const settled = await taskService.settleTask({ taskId: task._id });
    // ₹350 authorised, ₹200 spent — the other ₹150 goes back.
    expect(settled.itemMoney.actualPaise).toBe(inr(200));
    expect(settled.itemMoney.refundedPaise).toBe(inr(150));
  });

  it('counts only genuinely purchased items as spend', async () => {
    const { task } = await taskService.createTask(baseTask());
    const doc = await HelpingTask.findById(task._id);
    doc.items[0].status = 'found';          // seen, not bought
    doc.items[0].actualPricePaise = inr(250);
    doc.items[1].status = 'purchased';
    doc.items[1].actualPricePaise = inr(90);
    await doc.save();

    // "Found" is not "bought" — only the real purchase counts.
    expect(doc.computeItemSpend()).toBe(inr(90));
  });
});

/* Nothing substituted, nothing overspent */

describe('a helper cannot substitute or overspend in silence', () => {
  async function assignedTask() {
    const { task } = await taskService.createTask(baseTask());
    await HelpingTask.findByIdAndUpdate(task._id, {
      $set: { workerId, status: 'IN_PROGRESS' },
    });
    return task;
  }

  it('refuses a purchase above what the customer approved', async () => {
    const task = await assignedTask();
    const doc = await HelpingTask.findById(task._id);

    await expect(taskService.updateItem({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      status: 'purchased', actualPricePaise: inr(400), // approved: ₹250
    })).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });

  it('allows a purchase within the approved ceiling', async () => {
    const task = await assignedTask();
    const doc = await HelpingTask.findById(task._id);

    const updated = await taskService.updateItem({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      status: 'purchased', actualPricePaise: inr(230),
    });
    expect(updated.items[0].status).toBe('purchased');
    expect(updated.itemMoney.actualPaise).toBe(inr(230));
  });

  it('refuses to mark something purchased with no price', async () => {
    const task = await assignedTask();
    const doc = await HelpingTask.findById(task._id);
    await expect(taskService.updateItem({
      taskId: task._id, workerId, itemId: doc.items[0]._id, status: 'purchased',
    })).rejects.toMatchObject({ code: 'PRICE_REQUIRED' });
  });

  it('stops the task when an alternative is proposed', async () => {
    const task = await assignedTask();
    const doc = await HelpingTask.findById(task._id);

    const out = await taskService.proposeAlternative({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      alternative: { name: 'Philips 12W', pricePaise: inr(310), quantity: 1, photoKey: 'k/1.jpg' },
    });

    expect(out.status).toBe('APPROVAL_REQUIRED');
    expect(out.items[0].status).toBe('awaiting_approval');
    expect(out.approvals).toHaveLength(1);
    expect(out.approvals[0].previousAmountPaise).toBe(inr(250));
    expect(out.approvals[0].newAmountPaise).toBe(inr(310));
  });

  it('lets the purchase through once the customer approves, at the new price', async () => {
    const task = await assignedTask();
    let doc = await HelpingTask.findById(task._id);
    await taskService.proposeAlternative({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      alternative: { name: 'Philips 12W', pricePaise: inr(310), quantity: 1 },
    });

    doc = await HelpingTask.findById(task._id);
    const after = await taskService.respondToApproval({
      taskId: task._id, userId, approvalId: doc.approvals[0]._id, approved: true,
    });
    expect(after.status).toBe('IN_PROGRESS');

    // The ceiling moved with the approval, so the purchase now passes.
    const bought = await taskService.updateItem({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      status: 'purchased', actualPricePaise: inr(310),
    });
    expect(bought.items[0].status).toBe('purchased');
  });

  it('keeps the old ceiling when the customer says no', async () => {
    const task = await assignedTask();
    let doc = await HelpingTask.findById(task._id);
    await taskService.proposeAlternative({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      alternative: { name: 'Philips 12W', pricePaise: inr(310), quantity: 1 },
    });

    doc = await HelpingTask.findById(task._id);
    const after = await taskService.respondToApproval({
      taskId: task._id, userId, approvalId: doc.approvals[0]._id, approved: false,
    });
    expect(after.items[0].status).toBe('rejected');

    await expect(taskService.updateItem({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      status: 'purchased', actualPricePaise: inr(310),
    })).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });

  it('records who decided and when, and refuses a second answer', async () => {
    const task = await assignedTask();
    let doc = await HelpingTask.findById(task._id);
    await taskService.proposeAlternative({
      taskId: task._id, workerId, itemId: doc.items[0]._id,
      alternative: { name: 'Alt', pricePaise: inr(300), quantity: 1 },
    });
    doc = await HelpingTask.findById(task._id);
    const approvalId = doc.approvals[0]._id;

    const out = await taskService.respondToApproval({ taskId: task._id, userId, approvalId, approved: true });
    expect(String(out.approvals[0].respondedBy)).toBe(String(userId));
    expect(out.approvals[0].respondedAt).toBeTruthy();

    await expect(taskService.respondToApproval({ taskId: task._id, userId, approvalId, approved: false }))
      .rejects.toMatchObject({ code: 'ALREADY_ANSWERED' });
  });

  it('never lets another helper touch the task', async () => {
    const task = await assignedTask();
    const doc = await HelpingTask.findById(task._id);
    await expect(taskService.updateItem({
      taskId: task._id, workerId: new mongoose.Types.ObjectId(),
      itemId: doc.items[0]._id, status: 'found',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

/* The helper is not a lender */

describe('worker advance is capped', () => {
  it('allows an advance within the configured limit', async () => {
    const { task } = await taskService.createTask(baseTask());
    await HelpingTask.findByIdAndUpdate(task._id, { $set: { workerId } });
    const out = await taskService.recordWorkerAdvance({
      taskId: task._id, workerId, amountPaise: inr(900),
    });
    expect(out.itemMoney.workerAdvancePaise).toBe(inr(900));
  });

  it('refuses an advance above it, and says what the limit is', async () => {
    const { task } = await taskService.createTask(baseTask());
    await HelpingTask.findByIdAndUpdate(task._id, { $set: { workerId } });
    await expect(taskService.recordWorkerAdvance({
      taskId: task._id, workerId, amountPaise: inr(5000),
    })).rejects.toMatchObject({ code: 'ADVANCE_LIMIT_EXCEEDED', limitPaise: inr(1000) });
  });
});

/* The promise this product must never make */

describe('a refund is never claimed on the merchant\'s behalf', () => {
  async function returnTask() {
    await HelpingConfig.create({
      serviceType: 'return', baseFeePaise: inr(90),
      distanceSlabs: [{ fromKm: 0, toKm: 50, feePaise: inr(20) }],
      commissionPct: 20,
    });
    pricingService.invalidateConfigCache();

    const { task } = await taskService.createTask({
      userId, serviceType: 'return', pickupLocation: HERE, destination: THERE, items: [],
      returnDetail: {
        merchantName: 'Big Store', orderId: 'OD123', productName: 'Kettle',
        returnMethod: 'store_dropoff', customerConfirmedEligibility: true,
      },
    });
    await HelpingTask.findByIdAndUpdate(task._id, {
      $set: { workerId, status: 'AT_DROPOFF' },
    });
    return task;
  }

  it('starts a return with an unknown refund status', async () => {
    const task = await returnTask();
    const doc = await HelpingTask.findById(task._id).lean();
    expect(doc.returnDetail.refundStatus).toBe('unknown');
  });

  it('moves only to pending_merchant on handover — never to confirmed', async () => {
    const task = await returnTask();
    const out = await taskService.recordHandover({
      taskId: task._id, workerId, trackingNumber: 'AWB99', proofKeys: ['proof/1.jpg'],
    });

    expect(out.status).toBe('HANDED_OVER');
    expect(out.returnDetail.refundStatus).toBe('pending_merchant');
    // The lie this product must never tell.
    expect(out.returnDetail.refundStatus).not.toBe('refund_confirmed');
  });

  it('refuses a handover with no proof', async () => {
    const task = await returnTask();
    await expect(taskService.recordHandover({ taskId: task._id, workerId, proofKeys: [] }))
      .rejects.toMatchObject({ code: 'PROOF_REQUIRED' });
  });

  it('only an operator with a merchant outcome can confirm a refund', async () => {
    const task = await returnTask();
    await taskService.recordHandover({ taskId: task._id, workerId, proofKeys: ['p.jpg'] });

    const out = await taskService.recordMerchantRefundOutcome({
      taskId: task._id, status: 'refund_confirmed', externalReference: 'RF-1',
    });
    expect(out.returnDetail.refundStatus).toBe('refund_confirmed');
    expect(out.returnDetail.refundExternalReference).toBe('RF-1');
  });

  it('rejects an invented refund status', async () => {
    const task = await returnTask();
    await expect(taskService.recordMerchantRefundOutcome({ taskId: task._id, status: 'done' }))
      .rejects.toMatchObject({ code: 'BAD_REFUND_STATUS' });
  });
});

/* State machine */

describe('the server owns the task state', () => {
  it('refuses an illegal jump', async () => {
    const { task } = await taskService.createTask(baseTask());
    const doc = await HelpingTask.findById(task._id);
    // REQUESTED cannot leap to COMPLETED, however the request is shaped.
    expect(doc.canTransition('COMPLETED')).toBe(false);
    expect(() => doc.transitionTo('COMPLETED')).toThrow(/Cannot move a task/);
  });

  it('records every move with who made it', async () => {
    const { task } = await taskService.createTask(baseTask());
    const doc = await HelpingTask.findById(task._id).lean();
    expect(doc.statusHistory.map((h) => h.status)).toEqual(['DRAFT', 'REQUESTED']);
    expect(String(doc.statusHistory[1].by)).toBe(String(userId));
  });
});

/* Restricted goods */

describe('restricted items', () => {
  it('refuses a task for something a helper must not buy', async () => {
    await seedConfig({ restrictedItemCategories: ['alcohol', 'tobacco'] });
    await expect(taskService.createTask(baseTask({
      items: [{ name: 'Whisky bottle (alcohol)', quantity: 1, maxApprovedPricePaise: inr(2000) }],
    }))).rejects.toMatchObject({ code: 'RESTRICTED_ITEM' });
  });

  it('is admin-configurable, not baked in', async () => {
    await seedConfig({ restrictedItemCategories: [] });
    const { task } = await taskService.createTask(baseTask({
      items: [{ name: 'Whisky bottle (alcohol)', quantity: 1, maxApprovedPricePaise: inr(2000) }],
    }));
    expect(task.reference).toMatch(/^ZH/);
  });
});
