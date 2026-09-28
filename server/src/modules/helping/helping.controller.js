/**
 * Helping Services HTTP layer.
 *
 * Every handler re-derives money and ownership server-side. A price, a worker
 * id, a status or a refund state arriving in a request body is treated as a
 * claim to be checked, never as an instruction (§58).
 */

const { HelpingTask, CANCELLABLE_FROM } = require('./models/task.model');
const { HelpingConfig, SERVICE_TYPES } = require('./models/config.model');
const taskService = require('./services/task.service');
const pricingService = require('./services/pricing.service');
const s3Service = require('../../utils/s3.service');
const Worker = require('../worker/worker.model');

/** Object-level authorisation — the customer, the assigned helper, or admin. */
function mayView(task, auth) {
  const id = String(auth.sub);
  return auth.role === 'admin'
    || (auth.role === 'user' && String(task.userId) === id)
    || (auth.role === 'worker' && String(task.workerId || '') === id);
}

/** Sign every stored key before it reaches a browser; the bucket is private. */
async function signTask(task) {
  const signed = await s3Service.signDocMedia({
    proofKeys: (task.proofs || []).map((p) => p.key),
  });
  const urls = signed.proofKeys || [];
  return {
    ...task,
    proofs: (task.proofs || []).map((p, i) => ({ ...p, url: urls[i] || null })),
  };
}

/* Catalog & pricing */

/** What this category offers and what it costs — read by the customer UI. */
async function listServices(req, res, next) {
  try {
    const configs = await HelpingConfig.find({ isActive: true }).lean();
    res.json({
      services: configs.map((c) => ({
        serviceType: c.serviceType,
        baseFeePaise: c.baseFeePaise,
        freeWaitingMinutes: c.freeWaitingMinutes,
        maxStops: c.maxStops,
        maxItems: c.maxItems,
        allowedPaymentModels: c.allowedPaymentModels,
        maxWorkerAdvancePaise: c.maxWorkerAdvancePaise,
        maxItemBudgetPaise: c.maxItemBudgetPaise,
        restrictedItemCategories: c.restrictedItemCategories,
        disclaimer: c.disclaimer,
        distanceSlabs: c.distanceSlabs,
      })),
    });
  } catch (err) { next(err); }
}

/**
 * Price before booking (§9).
 *
 * Returns the service charge and the item budget as SEPARATE figures, with the
 * note that says so — the UI is not trusted to explain the difference on its
 * own.
 */
async function quote(req, res, next) {
  try {
    const {
      serviceType, pickupLocation, destination, stops = [], items = [], specialHandling = false,
    } = req.body;

    const itemBudgetPaise = (items || []).reduce(
      (sum, i) => sum + (i.maxApprovedPricePaise || 0) * (i.quantity || 1), 0,
    );

    const charge = await pricingService.quote({
      serviceType, pickupLocation, destination, stops, specialHandling, itemBudgetPaise,
    });

    res.json({
      charge,
      authorisation: pricingService.authorisationTotal(charge, itemBudgetPaise),
    });
  } catch (err) { next(err); }
}

/* Customer */

async function createTask(req, res, next) {
  try {
    const { task, replayed } = await taskService.createTask({
      ...req.body,
      userId: req.auth.sub,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey || null,
    });
    res.status(replayed ? 200 : 201).json({ task, replayed });
  } catch (err) { next(err); }
}

async function listMyTasks(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const filter = { userId: req.auth.sub };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;

    const [tasks, total] = await Promise.all([
      HelpingTask.find(filter).sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      HelpingTask.countDocuments(filter),
    ]);
    res.json({ tasks, total, page });
  } catch (err) { next(err); }
}

async function getTask(req, res, next) {
  try {
    const task = await HelpingTask.findById(req.params.id).lean();
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!mayView(task, req.auth)) {
      return res.status(403).json({ error: 'You do not have access to this task' });
    }

    const signed = await signTask(task);
    res.json({
      task: signed,
      canCancel: CANCELLABLE_FROM.includes(task.status),
      // Shown as two figures, always.
      authorisation: pricingService.authorisationTotal(task.charge, task.itemMoney?.budgetPaise || 0),
    });
  } catch (err) { next(err); }
}

async function respondToApproval(req, res, next) {
  try {
    const task = await taskService.respondToApproval({
      taskId: req.params.id,
      userId: req.auth.sub,
      approvalId: req.params.approvalId,
      approved: !!req.body.approved,
    });
    res.json({ task });
  } catch (err) { next(err); }
}

/** A rating that could be rewritten is not a rating — set once, like a repair's. */
async function rateTask(req, res, next) {
  try {
    const task = await HelpingTask.findOne({ _id: req.params.id, userId: req.auth.sub })
      .select('status ratedAt workerId').lean();
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (!['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED'].includes(task.status)) {
      return res.status(409).json({ error: 'You can rate this once the task is finished', code: 'NOT_COMPLETED' });
    }
    if (task.ratedAt) {
      return res.status(409).json({ error: 'You have already rated this task', code: 'ALREADY_RATED' });
    }

    await HelpingTask.updateOne(
      { _id: req.params.id, ratedAt: null },
      { $set: { rating: req.body.rating, ratingComment: req.body.comment || '', ratedAt: new Date() } },
    );

    // Same rolling-average formula every provider's rating uses on this
    // platform — one truth about a provider's rating, not a second copy of it.
    const ratingService = require('../repair/services/rating.service');
    await ratingService.applyRepairRating({
      workerId: task.workerId, shopId: null, rating: req.body.rating,
    }).catch(() => { /* the customer's rating is recorded either way */ });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function cancelTask(req, res, next) {
  try {
    const task = await HelpingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (String(task.userId) !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'Not your task' });
    }
    if (!CANCELLABLE_FROM.includes(task.status)) {
      return res.status(409).json({
        error: 'This task can no longer be cancelled', code: 'NOT_CANCELLABLE',
      });
    }

    task.cancellationReason = req.body.reason || '';
    task.transitionTo('CANCELLED', { by: req.auth.sub, byRole: 'user' });
    await task.save();
    res.json({ task: task.toObject() });
  } catch (err) { next(err); }
}

/* Worker */

/**
 * Open work near the helper.
 *
 * Earnings are shown BEFORE accepting (§55) — a helper deciding whether a trip
 * is worth making needs the number, not a surprise afterwards. The item budget
 * is shown too, separately, because a task needing a large advance is a
 * different proposition even at the same fee.
 */
async function listAvailable(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).select('location').lean();
    const coords = worker?.location?.coordinates;

    const filter = { status: { $in: ['CONFIRMED', 'WORKER_SEARCHING'] }, workerId: null };
    const query = coords?.length === 2
      ? HelpingTask.find({
        ...filter,
        pickupLocation: { $near: { $geometry: { type: 'Point', coordinates: coords }, $maxDistance: 15000 } },
      })
      : HelpingTask.find(filter).sort({ createdAt: -1 });

    const tasks = await query.limit(30).lean();

    res.json({
      tasks: tasks.map((t) => ({
        _id: t._id,
        reference: t.reference,
        serviceType: t.serviceType,
        title: t.title,
        itemCount: (t.items || []).length,
        stopCount: (t.stops || []).length,
        distanceKm: t.charge?.distanceKm,
        // What they take home, not what the customer pays.
        earningPaise: t.charge?.workerEarningPaise || 0,
        // Flagged separately: this is money they may need to front.
        itemBudgetPaise: t.itemMoney?.budgetPaise || 0,
        advanceRequired: t.itemMoney?.paymentModel === 'worker_advance',
        pickupAddress: t.pickupLocation?.address,
        destinationAddress: t.destination?.address,
        scheduledAt: t.scheduledAt,
      })),
    });
  } catch (err) { next(err); }
}

async function acceptTask(req, res, next) {
  try {
    /*
     * Claimed atomically. Two helpers tapping accept at the same instant must
     * not both get the task (§47/§59) — the filter asserts it is still free,
     * so the loser's update matches nothing.
     */
    const task = await HelpingTask.findOneAndUpdate(
      { _id: req.params.id, workerId: null, status: { $in: ['CONFIRMED', 'WORKER_SEARCHING', 'WORKER_ASSIGNED'] } },
      {
        $set: { workerId: req.auth.sub, status: 'WORKER_ACCEPTED' },
        $push: {
          statusHistory: {
            status: 'WORKER_ACCEPTED', at: new Date(), by: req.auth.sub, byRole: 'worker',
          },
        },
      },
      { new: true },
    ).lean();

    if (!task) {
      return res.status(409).json({
        error: 'Another helper has already taken this task', code: 'ALREADY_CLAIMED',
      });
    }
    res.json({ task });
  } catch (err) { next(err); }
}

/** Move a task along. The server checks the move is legal for the state. */
async function advanceStatus(req, res, next) {
  try {
    const task = await HelpingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (String(task.workerId || '') !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'This is not your task' });
    }

    task.transitionTo(req.body.status, {
      by: req.auth.sub, byRole: 'worker', note: req.body.note || '',
    });
    await task.save();
    res.json({ task: task.toObject() });
  } catch (err) { next(err); }
}

async function updateItem(req, res, next) {
  try {
    const task = await taskService.updateItem({
      taskId: req.params.id,
      workerId: req.auth.sub,
      itemId: req.params.itemId,
      ...req.body,
      receiptKey: req.body.receiptKey ? s3Service.keyFromMedia(req.body.receiptKey) : '',
    });
    res.json({ task });
  } catch (err) { next(err); }
}

async function proposeAlternative(req, res, next) {
  try {
    const alternative = {
      ...req.body,
      photoKey: req.body.photoKey ? s3Service.keyFromMedia(req.body.photoKey) : '',
    };
    const task = await taskService.proposeAlternative({
      taskId: req.params.id, workerId: req.auth.sub, itemId: req.params.itemId, alternative,
    });
    res.json({ task });
  } catch (err) { next(err); }
}

async function recordAdvance(req, res, next) {
  try {
    const task = await taskService.recordWorkerAdvance({
      taskId: req.params.id, workerId: req.auth.sub, amountPaise: req.body.amountPaise,
    });
    res.json({ task });
  } catch (err) { next(err); }
}

async function addProof(req, res, next) {
  try {
    const task = await HelpingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (String(task.workerId || '') !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'This is not your task' });
    }

    task.proofs.push({
      kind: req.body.kind,
      key: s3Service.keyFromMedia(req.body.key),
      note: req.body.note || '',
      capturedAt: new Date(),
      ...(req.body.lat != null && req.body.lng != null
        ? { location: { type: 'Point', coordinates: [req.body.lng, req.body.lat] } }
        : {}),
    });
    await task.save();
    res.json({ task: await signTask(task.toObject()) });
  } catch (err) { next(err); }
}

async function recordHandover(req, res, next) {
  try {
    const task = await taskService.recordHandover({
      taskId: req.params.id,
      workerId: req.auth.sub,
      trackingNumber: req.body.trackingNumber || '',
      acknowledgement: req.body.acknowledgement || '',
      proofKeys: (req.body.proofKeys || []).map((k) => s3Service.keyFromMedia(k)),
    });
    res.json({ task });
  } catch (err) { next(err); }
}

/** Finish, then settle. Settlement is what splits the two monies apart. */
async function completeTask(req, res, next) {
  try {
    const task = await HelpingTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (String(task.workerId || '') !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'This is not your task' });
    }
    if (task.hasPendingApproval()) {
      return res.status(409).json({
        error: 'The customer still has a decision outstanding', code: 'APPROVAL_PENDING',
      });
    }

    task.transitionTo('COMPLETED', { by: req.auth.sub, byRole: 'worker' });
    await task.save();

    const settled = await taskService.settleTask({ taskId: task._id, actorId: req.auth.sub });
    res.json({ task: settled });
  } catch (err) { next(err); }
}

/* Admin (§37, §51) */

async function adminListTasks(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 25;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    // The exceptions screen: everything that needs a human.
    if (req.query.exceptions === 'true') {
      filter.status = {
        $in: ['ITEM_UNAVAILABLE', 'MERCHANT_REJECTED', 'EXCHANGE_UNAVAILABLE', 'DISPUTED', 'FAILED', 'APPROVAL_REQUIRED'],
      };
    }

    const [tasks, total] = await Promise.all([
      HelpingTask.find(filter).sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      HelpingTask.countDocuments(filter),
    ]);
    res.json({ tasks, total, page });
  } catch (err) { next(err); }
}

async function adminGetConfig(req, res, next) {
  try {
    const configs = await HelpingConfig.find({}).lean();
    res.json({ configs, serviceTypes: SERVICE_TYPES });
  } catch (err) { next(err); }
}

async function adminUpdateConfig(req, res, next) {
  try {
    const config = await HelpingConfig.findOneAndUpdate(
      { serviceType: req.params.serviceType },
      { $set: req.body },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    // The pricing engine caches for 30s; an operator's edit must be immediate.
    pricingService.invalidateConfigCache(req.params.serviceType);
    res.json({ config });
  } catch (err) { next(err); }
}

/** Only this path may confirm a merchant refund, and only with a reference. */
async function adminRefundOutcome(req, res, next) {
  try {
    const task = await taskService.recordMerchantRefundOutcome({
      taskId: req.params.id,
      status: req.body.status,
      externalReference: req.body.externalReference || '',
    });
    res.json({ task });
  } catch (err) { next(err); }
}

module.exports = {
  listServices, quote,
  createTask, listMyTasks, getTask, respondToApproval, cancelTask, rateTask,
  listAvailable, acceptTask, advanceStatus, updateItem, proposeAlternative,
  recordAdvance, addProof, recordHandover, completeTask,
  adminListTasks, adminGetConfig, adminUpdateConfig, adminRefundOutcome,
};
