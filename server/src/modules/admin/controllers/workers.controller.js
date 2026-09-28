const Worker = require('../../worker/worker.model');
const Order = require('../../order/order.model');
const { redis } = require('../../../config/redis');
const auditService = require('../audit.service');

async function listWorkers(req, res, next) {
  try {
    const { q, skill, online, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (q) {
      // Escape special regex characters to prevent ReDoS attacks.
      const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: new RegExp(safeQ, 'i') },
        { phone: new RegExp(safeQ, 'i') },
      ];
    }
    if (skill) filter.skills = skill;
    if (online !== undefined) filter.isOnline = online === 'true';
    const [workers, total] = await Promise.all([
      Worker.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Worker.countDocuments(filter),
    ]);
    res.json({ workers, total });
  } catch (err) {
    next(err);
  }
}

async function blockWorker(req, res, next) {
  try {
    const before = await Worker.findById(req.params.id)
      .select('isBlocked')
      .lean();
    if (!before) return res.status(404).json({ error: 'Worker not found' });
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isBlocked: req.body.blocked,
          isOnline: false,
          isAvailable: false,
        },
      },
      { new: true },
    );

    // Full geo pool removal (geo hash + skills sets + alive zset) not just zrem.
    const geoService = require('../../worker/geo.service');
    await geoService.markOffline(String(req.params.id));

    // Invalidate the 60-second ban cache so the new status takes effect immediately.
    const { invalidateBanCache } = require('../../../middlewares/auth');
    invalidateBanCache('worker', String(req.params.id)).catch(() => {});

    // When BLOCKING: find any active order and re-dispatch so the user is not
    // left stranded with an assigned-but-blocked worker.
    if (req.body.blocked) {
      const activeOrder = await Order.findOne({
        workerId: req.params.id,
        status: { $in: ['assigned', 'on_the_way', 'arrived'] },
      }).lean();
      if (activeOrder) {
        const orderService = require('../../order/order.service');
        await orderService
          .workerCancel({
            orderId: String(activeOrder._id),
            workerId: String(req.params.id),
            reason: 'admin_blocked_worker',
          })
          .catch((err) => {
            // Best-effort — log but don't fail the block action.
            const logger = require('../../../core/logger');
            logger.error(
              { err: err.message, orderId: activeOrder._id },
              'Failed to re-dispatch on worker block',
            );
          });
      }
    }

    await auditService.fromRequest(
      req,
      req.body.blocked ? 'admin.worker_block' : 'admin.worker_unblock',
      { kind: 'worker', id: req.params.id },
      { isBlocked: before.isBlocked },
      { isBlocked: worker.isBlocked },
    );
    res.json({ worker });
  } catch (err) {
    next(err);
  }
}

async function approveKyc(req, res, next) {
  try {
    const before = await Worker.findById(req.params.id).select('kyc').lean();
    if (!before) return res.status(404).json({ error: 'Worker not found' });
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'kyc.status':          'approved',
          'kyc.reviewedAt':      new Date(),
          'kyc.reviewedBy':      req.auth.sub,
          'kyc.rejectionReason': null,
          'kyc.changeRequest':   null, // clear any pending change request on approval
          // Set profile photo from selfie — permanent, no URL expiry via avatar endpoint
          ...(before.kyc?.selfieUrl && { profilePhotoKey: before.kyc.selfieUrl }),
        },
      },
      { new: true },
    );
    await auditService.fromRequest(
      req,
      'admin.kyc_approve',
      { kind: 'worker', id: req.params.id },
      before.kyc,
      worker.kyc,
    );

    // Notify worker they're cleared to go online
    try {
      const notifService = require('../../notification/notification.service');
      await notifService.notify({
        recipient: { kind: 'worker', id: req.params.id },
        type: 'kyc_approved',
        title: '✅ KYC Approved — You can go online!',
        body: 'Your documents have been verified. Go online to start accepting jobs.',
        deepLink: '/worker',
        data: { kycStatus: 'approved' },
      });
    } catch { /* non-fatal */ }

    res.json({ worker });
  } catch (err) {
    next(err);
  }
}

async function rejectKyc(req, res, next) {
  try {
    const before = await Worker.findById(req.params.id).select('kyc').lean();
    if (!before) return res.status(404).json({ error: 'Worker not found' });
    const now = new Date();
    const isUpdate = before.kyc?.isUpdate === true;
    const SUSPENSION_THRESHOLD = 5;

    let worker;

    if (isUpdate && before.kyc?.approvedSnapshot) {
      // Rejecting an update from an already-approved worker:
      // revert docs to the previously approved snapshot instead of marking as rejected.
      const snap = before.kyc.approvedSnapshot;
      worker = await Worker.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            'kyc.status':          'approved',   // revert to approved
            'kyc.aadhaarUrl':      snap.aadhaarUrl,
            'kyc.licenseUrl':      snap.licenseUrl,
            'kyc.selfieUrl':       snap.selfieUrl,
            'kyc.selfieMetadata':  snap.selfieMetadata ?? null,
            'kyc.reviewedAt':      now,
            'kyc.reviewedBy':      req.auth.sub,
            'kyc.rejectionReason': req.body.reason,
            'kyc.lastRejectedAt':  now,
            'kyc.isUpdate':        false,
            'kyc.approvedSnapshot': null,
            'kyc.submissionHistory.$[last].outcome': 'rejected',
            'kyc.submissionHistory.$[last].rejectionReason': req.body.reason,
          },
        },
        { new: true, arrayFilters: [{ 'last.outcome': 'pending' }] }
      );
    } else {
      const newRejectionCount = (before.kyc?.rejectionCount || 0) + 1;
      worker = await Worker.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            'kyc.status':
              newRejectionCount >= SUSPENSION_THRESHOLD ? 'suspended' : 'rejected',
            'kyc.reviewedAt': now,
            'kyc.reviewedBy': req.auth.sub,
            'kyc.rejectionReason': req.body.reason,
            'kyc.lastRejectedAt': now,
            'kyc.rejectionCount': newRejectionCount,
            'kyc.isUpdate': false,
            'kyc.submissionHistory.$[last].outcome': 'rejected',
            'kyc.submissionHistory.$[last].rejectionReason': req.body.reason,
            isOnline: false,
            isAvailable: false,
          },
        },
        { new: true, arrayFilters: [{ 'last.outcome': 'pending' }] }
      );
      // Force offline only for non-update rejections (update rejections revert to approved)
      await redis.zrem('workers:online', String(req.params.id));
      await redis.del(`worker:available:${req.params.id}`);
    }

    // Force worker out of all geo/availability indices immediately
    await redis.zrem('workers:online', String(req.params.id));
    await redis.del(`worker:available:${req.params.id}`);

    // Push real-time force-offline event to the worker's socket session
    // so their dashboard flips to offline instantly without waiting for a poll.
    try {
      const { redis: pubRedis } = require('../../../config/redis');
      await pubRedis.publish('worker:kyc_rejected', JSON.stringify({
        workerId: String(req.params.id),
        reason:   req.body.reason,
        status:   worker.kyc.status,
      }));
    } catch { /* non-fatal — socket push is best-effort */ }

    // Send push notification to worker
    try {
      const notifService = require('../../notification/notification.service');
      await notifService.notify({
        recipient: { kind: 'worker', id: req.params.id },
        type: 'kyc_rejected',
        title: '⚠️ KYC not approved',
        body: req.body.reason
          ? `Reason: ${req.body.reason}. Please resubmit with correct documents.`
          : 'Your KYC was not approved. Tap to resubmit.',
        deepLink: '/worker/kyc',
        data: { kycStatus: worker.kyc.status },
      });
    } catch { /* non-fatal */ }
    await auditService.fromRequest(
      req,
      'admin.kyc_reject',
      { kind: 'worker', id: req.params.id },
      before.kyc,
      worker.kyc,
    );
    res.json({ worker, suspended: newRejectionCount >= SUSPENSION_THRESHOLD });
  } catch (err) {
    next(err);
  }
}

async function listKycPending(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 50;
    const [workers, total] = await Promise.all([
      Worker.find({ 'kyc.status': 'pending_review' })
        .sort({ 'kyc.submittedAt': 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Worker.countDocuments({ 'kyc.status': 'pending_review' }),
    ]);
    res.json({ workers, total });
  } catch (err) {
    next(err);
  }
}

async function getWorkerPenaltyStats(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id)
      .select(
        'name phone penalties rating completedJobs totalJobs isBlocked isAvailable',
      )
      .lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const { redis: redisClient } = require('../../../config/redis');
    const rejectWindowRaw = await redisClient.lrange(
      `worker:offers:${req.params.id}`,
      0,
      -1,
    );
    const cancelStrikesRaw = await redisClient.get(
      `cancel:strikes:${req.params.id}`,
    );

    const recentRejectRate =
      rejectWindowRaw.length > 0
        ? rejectWindowRaw.filter((i) => i === 'reject' || i === 'timeout')
            .length / rejectWindowRaw.length
        : 0;

    const lifetimeRejectRate =
      (worker.penalties?.totalOffers || 0) > 0
        ? (worker.penalties.totalRejects || 0) / worker.penalties.totalOffers
        : 0;
    const lifetimeCancelRate =
      (worker.completedJobs || 0) > 0
        ? (worker.penalties?.totalCancels || 0) / worker.completedJobs
        : 0;

    res.json({
      worker: {
        _id: worker._id,
        name: worker.name,
        phone: worker.phone,
        isBlocked: worker.isBlocked,
        isAvailable: worker.isAvailable,
      },
      penalties: worker.penalties || {},
      recentWindow: {
        size: rejectWindowRaw.length,
        rejectRate: Math.round(recentRejectRate * 100) / 100,
        outcomes: rejectWindowRaw,
      },
      cancelStrikes: { active: parseInt(cancelStrikesRaw || '0', 10) },
      lifetimeRates: {
        rejectRate: Math.round(lifetimeRejectRate * 100) / 100,
        cancelRate: Math.round(lifetimeCancelRate * 100) / 100,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Generate short-lived (15 min) presigned view URLs for all KYC documents.
 * Admin-only. Keys never leave the server — client gets a time-limited URL.
 */
/**
 * Returns KYC metadata + stream URL paths for each document.
 * Actual images are served via /workers/:id/kyc/stream/:docType (no expiry, admin-auth gated).
 */
async function kycDocUrls(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id)
      .select('kyc name phone')
      .lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const { kyc } = worker;

    // Return availability flags (has a key stored) — client uses stream endpoint for actual image
    res.json({
      docs: {
        hasAadhaar: !!kyc?.aadhaarUrl,
        hasLicense:  !!kyc?.licenseUrl,
        hasSelfie:   !!kyc?.selfieUrl,
      },
      selfieMetadata:  kyc?.selfieMetadata ?? null,
      isUpdate:        kyc?.isUpdate ?? false,
      hasApprovedSnapshot: !!(kyc?.approvedSnapshot?.aadhaarUrl),
    });
  } catch (err) { next(err); }
}

/**
 * Stream a KYC document directly from S3 — no presigned URL, no expiry.
 * Bucket is private; this endpoint is the admin-authenticated gateway.
 * docType: aadhaar | license | selfie | snap_aadhaar | snap_license | snap_selfie
 */
async function kycStreamDoc(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id).select('kyc').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const { docType } = req.params;
    const ALLOWED_DOC_TYPES = ['aadhaar', 'license', 'selfie', 'snap_aadhaar', 'snap_license', 'snap_selfie'];
    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }
    const kyc = worker.kyc ?? {};

    const keyMap = {
      aadhaar:      kyc.aadhaarUrl,
      license:      kyc.licenseUrl,
      selfie:       kyc.selfieUrl,
      snap_aadhaar: kyc.approvedSnapshot?.aadhaarUrl,
      snap_license: kyc.approvedSnapshot?.licenseUrl,
      snap_selfie:  kyc.approvedSnapshot?.selfieUrl,
    };

    const key = keyMap[docType];
    if (!key) return res.status(404).json({ error: `No ${docType} document on file` });

    const s3Service = require('../../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (err) {
    if (err?.name === 'NoSuchKey') return res.status(404).json({ error: 'Document not found in storage' });
    next(err);
  }
}

/**
 * Request clarification from a worker — does NOT reject, does NOT change status.
 * Sends a push notification telling the worker exactly what needs fixing.
 */
async function kycRequestClarification(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id).select('kyc name').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Re-open re-upload for the worker. Status stays pending_review (so the
    // submission stays in the admin queue), but the active clarification flag
    // unlocks the upload form + lets submitKyc accept a fresh resubmission.
    await Worker.updateOne(
      { _id: req.params.id },
      {
        $set: {
          'kyc.clarification': {
            active:      true,
            message:     req.body.message,
            requestedAt: new Date(),
            requestedBy: req.auth?.sub ?? null,
          },
        },
      }
    );

    const notifService = require('../../notification/notification.service');
    await notifService.notify({
      recipient: { kind: 'worker', id: req.params.id },
      type: 'kyc_clarification',
      title: '📋 Action needed on your KYC',
      body: req.body.message,
      deepLink: '/worker/kyc',
      data: { kycStatus: worker.kyc?.status },
    });

    await auditService.fromRequest(
      req,
      'admin.kyc_clarification',
      { kind: 'worker', id: req.params.id },
      null,
      { message: req.body.message }
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * Permanently remove a worker from the platform.
 * Data is KEPT for compliance/fraud investigation — we only block+flag as deleted.
 * KYC documents remain in S3 forever.
 */
async function deleteWorker(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id).select('name phone kyc isBlocked').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Force offline + mark deleted
    await Worker.updateOne(
      { _id: req.params.id },
      {
        $set: {
          isBlocked:   true,
          isOnline:    false,
          isAvailable: false,
          deletedAt:   new Date(),
          deletedBy:   req.auth.sub,
          deletionReason: req.body.reason,
        },
      }
    );

    await redis.zrem('workers:online', String(req.params.id));
    await redis.del(`worker:available:${req.params.id}`);

    await auditService.fromRequest(
      req,
      'admin.worker_deleted',
      { kind: 'worker', id: req.params.id },
      { name: worker.name, phone: worker.phone },
      { reason: req.body.reason }
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** List all pending document change requests — for admin KYC review panel */
async function listChangeRequests(req, res, next) {
  try {
    const workers = await Worker.find({ 'kyc.changeRequest.status': 'pending' })
      .select('name phone skills kyc.changeRequest kyc.status kyc.submittedAt')
      .sort({ 'kyc.changeRequest.requestedAt': 1 })
      .lean();
    res.json({ workers, total: workers.length });
  } catch (err) { next(err); }
}

/** Admin approves or denies a document change request */
async function respondChangeRequest(req, res, next) {
  try {
    const { decision, denialReason } = req.body; // decision: 'approved' | 'denied'
    const worker = await Worker.findById(req.params.id).select('name kyc').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    if (worker.kyc?.changeRequest?.status !== 'pending') {
      return res.status(409).json({ error: 'No pending change request' });
    }

    await Worker.updateOne(
      { _id: req.params.id },
      {
        $set: {
          'kyc.changeRequest.status':      decision,
          'kyc.changeRequest.reviewedAt':  new Date(),
          'kyc.changeRequest.reviewedBy':  req.auth.sub,
          'kyc.changeRequest.denialReason': denialReason ?? null,
        },
      }
    );

    const notifService = require('../../notification/notification.service');
    notifService.notify({
      recipient: { kind: 'worker', id: req.params.id },
      type: decision === 'approved' ? 'kyc_approved' : 'kyc_rejected',
      title: decision === 'approved'
        ? '✅ Document change approved — you can now upload new documents'
        : '❌ Document change request denied',
      body: decision === 'denied' && denialReason ? denialReason : undefined,
      deepLink: '/worker/kyc',
    }).catch(() => {});

    await auditService.fromRequest(req, 'admin.kyc_change_request_respond',
      { kind: 'worker', id: req.params.id }, { status: 'pending' }, { status: decision });

    res.json({ ok: true, decision });
  } catch (err) { next(err); }
}

/**
 * Clear a worker's trusted-device bindings. Approves a legitimate device change
 * (their next sign-in re-registers the device) or revokes devices after a
 * suspected takeover.
 */
async function resetWorkerDevices(req, res, next) {
  try {
    const Worker = require('../../worker/worker.model');
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      { $set: { knownDevices: [], deviceIds: [], lastNewDeviceAt: null } },
      { new: true }
    ).select('_id name').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    const auditService = require('../audit.service');
    await auditService.fromRequest(req, 'admin.worker_reset_devices', { kind: 'worker', id: req.params.id }, null, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * Run 3rd-party KYC verification for a worker (bank penny-drop on their saved
 * account + optional PAN). Stores results on kyc.verification to assist review.
 */
async function runKycVerification(req, res, next) {
  try {
    const Worker = require('../../worker/worker.model');
    const kycVerify = require('../../worker/kyc-verification.service');
    if (!kycVerify.isConfigured()) {
      return res.status(503).json({ error: 'No KYC provider configured. Set KYC_PROVIDER/KYC_API_URL/KYC_API_KEY.' });
    }
    const worker = await Worker.findById(req.params.id).select('name savedBankAccounts kyc').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const bankAcct = (worker.savedBankAccounts || []).find((b) => b.isDefault) || (worker.savedBankAccounts || [])[0];
    const results = {};
    if (bankAcct) {
      results.bank = await kycVerify.verifyBankAccount({
        accountNumber: bankAcct.accountNumber, ifsc: bankAcct.ifsc,
        name: bankAcct.accountName || worker.name,
      });
    }
    if (req.body?.pan) {
      results.pan = await kycVerify.verifyPan({ pan: req.body.pan, name: worker.name });
    }

    await Worker.updateOne({ _id: req.params.id }, {
      $set: {
        ...(results.bank ? { 'kyc.verification.bank': results.bank } : {}),
        ...(results.pan ? { 'kyc.verification.pan': results.pan } : {}),
        'kyc.verification.lastRunAt': new Date(),
      },
    });
    const auditService = require('../audit.service');
    await auditService.fromRequest(req, 'admin.worker_kyc_verify', { kind: 'worker', id: req.params.id }, null, { checks: Object.keys(results) });
    res.json({ ok: true, results });
  } catch (err) { next(err); }
}

module.exports = {
  listWorkers,
  blockWorker,
  resetWorkerDevices,
  runKycVerification,
  approveKyc,
  rejectKyc,
  listKycPending,
  listChangeRequests,
  respondChangeRequest,
  getWorkerPenaltyStats,
  kycDocUrls,
  kycStreamDoc,
  kycRequestClarification,
  deleteWorker,
};
