const Worker = require('./worker.model');
const auditService = require('../admin/audit.service');

// Resubmission controls
const RESUBMIT_COOLDOWN_MS  = 24 * 60 * 60 * 1000; // 24h after rejection
const SUSPENSION_THRESHOLD  = 5;                     // 5 rejections → KYC suspended

async function submitKyc(req, res, next) {
  try {
    const w = await Worker.findById(req.auth.sub).select('kyc').lean();
    if (!w) return res.status(404).json({ error: 'Worker not found' });

    // Approved workers can only resubmit AFTER admin approves a change request.
    // Direct resubmission without approval is blocked to prevent document tampering.
    const isUpdate = w.kyc?.status === 'approved';
    if (isUpdate) {
      const crStatus = w.kyc?.changeRequest?.status;
      if (crStatus !== 'approved') {
        return res.status(409).json({
          error: 'Your KYC is already approved. Submit a document change request first, then wait for admin approval.',
          code: 'KYC_CHANGE_REQUEST_REQUIRED',
          changeRequestStatus: crStatus ?? null,
        });
      }
    }
    // An active admin clarification re-opens re-upload even while pending_review.
    const clarificationActive = w.kyc?.clarification?.active === true;
    if (w.kyc?.status === 'pending_review' && !isUpdate && !clarificationActive) {
      return res.status(409).json({ error: 'KYC already submitted and under review', code: 'KYC_PENDING' });
    }
    if (w.kyc?.status === 'pending_review' && isUpdate) {
      return res.status(409).json({ error: 'A KYC update is already under review', code: 'KYC_UPDATE_PENDING' });
    }
    if (w.kyc?.status === 'suspended') {
      return res.status(403).json({
        error: 'KYC submissions suspended after multiple rejections. Contact support.',
        code: 'KYC_SUSPENDED',
      });
    }

    // Resubmission cooldown: must wait 24h after rejection
    if (w.kyc?.status === 'rejected' && w.kyc?.lastRejectedAt) {
      const msSinceRejection = Date.now() - new Date(w.kyc.lastRejectedAt).getTime();
      if (msSinceRejection < RESUBMIT_COOLDOWN_MS) {
        const waitHours = Math.ceil((RESUBMIT_COOLDOWN_MS - msSinceRejection) / 3600000);
        return res.status(429).json({
          error: `Please wait ${waitHours} more hour(s) before resubmitting KYC.`,
          code: 'KYC_COOLDOWN',
          waitHours,
        });
      }
    }

    // Location is MANDATORY — anti-fraud + dispatch zoning. Reject submissions
    // whose live selfie has no GPS fix (denied/spoofed/unavailable).
    const meta = req.body.selfieMetadata;
    if (!meta || typeof meta.lat !== 'number' || typeof meta.lng !== 'number') {
      return res.status(400).json({
        error: 'Location is required. Please enable GPS/location and recapture your live selfie.',
        code: 'KYC_LOCATION_REQUIRED',
      });
    }
    // Reject mock-provider fixes and coordinates outside the service area
    // (VPN / IP-geolocation place spoofed selfies in e.g. Peru / Costa Rica).
    const { validateLocation } = require('../../core/geo/validate');
    const locCheck = validateLocation({ lat: meta.lat, lng: meta.lng, accuracy: meta.accuracy, mock: meta.mock, maxAccuracy: 500 });
    if (!locCheck.ok) {
      return res.status(422).json({
        error: locCheck.reason === 'mock_location'
          ? 'Mock/spoofed location detected. Disable fake-GPS apps and recapture your live selfie.'
          : 'Your captured location is outside the service area. Turn off any VPN, enable precise GPS, and recapture.',
        code: 'KYC_LOCATION_INVALID',
        reason: locCheck.reason,
      });
    }

    const now = new Date();
    const rejectionCount = w.kyc?.rejectionCount || 0;

    // Auto-suspend after threshold rejections
    if (rejectionCount >= SUSPENSION_THRESHOLD) {
      await Worker.updateOne({ _id: req.auth.sub }, { $set: { 'kyc.status': 'suspended' } });
      return res.status(403).json({
        error: 'KYC submissions suspended after repeated rejections. Contact support to proceed.',
        code: 'KYC_SUSPENDED',
      });
    }

    const updated = await Worker.findByIdAndUpdate(
      req.auth.sub,
      {
        $set: {
          'kyc.status':          'pending_review',
          'kyc.aadhaarUrl':      req.body.aadhaarUrl,
          'kyc.licenseUrl':      req.body.licenseUrl || null,
          'kyc.selfieUrl':       req.body.selfieUrl,
          'kyc.selfieMetadata':  req.body.selfieMetadata ?? null,
          'kyc.submittedAt':     now,
          'kyc.rejectionReason': null,
          'kyc.isUpdate':        isUpdate,
          'kyc.changeRequest':   null, // clear approved change request after submission
          'kyc.clarification':   null, // clear admin clarification — fresh docs supersede it
          // Snapshot previous approved docs for comparison and revert-on-reject
          ...(isUpdate && {
            'kyc.approvedSnapshot': {
              aadhaarUrl:    w.kyc.aadhaarUrl,
              licenseUrl:    w.kyc.licenseUrl,
              selfieUrl:     w.kyc.selfieUrl,
              selfieMetadata: w.kyc.selfieMetadata ?? null,
              approvedAt:    w.kyc.reviewedAt,
            },
          }),
        },
        // Append immutable audit trail entry
        $push: {
          'kyc.submissionHistory': {
            aadhaarUrl:    req.body.aadhaarUrl,
            licenseUrl:    req.body.licenseUrl || null,
            selfieUrl:     req.body.selfieUrl,
            submittedAt:   now,
            outcome:       'pending',
          },
        },
      },
      { new: true }
    );
    await auditService.fromRequest(req, 'worker.kyc_submit', { kind: 'worker', id: req.auth.sub }, w.kyc, updated.kyc);
    res.json({ kyc: updated.kyc });
  } catch (err) { next(err); }
}

async function getKycStatus(req, res, next) {
  try {
    const w = await Worker.findById(req.auth.sub).select('kyc').lean();
    res.json({ kyc: w?.kyc || { status: 'not_submitted' } });
  } catch (err) { next(err); }
}

/**
 * Stream a worker's own KYC document — auth-gated, no URL expiry.
 * docType: aadhaar | license | selfie
 */
async function streamMyDoc(req, res, next) {
  try {
    const w = await Worker.findById(req.auth.sub).select('kyc').lean();
    if (!w) return res.status(404).json({ error: 'Worker not found' });

    const keyMap = {
      aadhaar: w.kyc?.aadhaarUrl,
      license: w.kyc?.licenseUrl,
      selfie:  w.kyc?.selfieUrl,
    };
    const key = keyMap[req.params.docType];
    if (!key) return res.status(404).json({ error: 'Document not found' });

    const s3Service = require('../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (err) {
    if (err?.name === 'NoSuchKey') return res.status(404).json({ error: 'Document not found in storage' });
    next(err);
  }
}

/**
 * Worker requests a document change after KYC is approved.
 * Admin must approve before the worker can upload new documents.
 */
async function requestDocumentChange(req, res, next) {
  try {
    const w = await Worker.findById(req.auth.sub).select('kyc name').lean();
    if (!w) return res.status(404).json({ error: 'Worker not found' });

    if (w.kyc?.status !== 'approved') {
      return res.status(409).json({ error: 'Can only request a change on approved KYC', code: 'KYC_NOT_APPROVED' });
    }
    if (w.kyc?.changeRequest?.status === 'pending') {
      return res.status(409).json({ error: 'A change request is already pending admin review', code: 'CHANGE_REQUEST_PENDING' });
    }

    await Worker.updateOne(
      { _id: req.auth.sub },
      {
        $set: {
          'kyc.changeRequest': {
            status:      'pending',
            message:     req.body.message,
            requestedAt: new Date(),
            reviewedAt:  null,
            reviewedBy:  null,
            denialReason: null,
          },
        },
      }
    );

    // Notify the admin team (system notification)
    const notifService = require('../notification/notification.service');
    notifService.notify({
      recipient: { kind: 'worker', id: req.auth.sub },
      type: 'system_alert',
      title: '📋 Change request submitted',
      body: 'Your document change request has been sent to admin for review.',
      deepLink: '/worker/kyc',
    }).catch(() => {});

    res.json({ ok: true, status: 'pending' });
  } catch (err) { next(err); }
}

module.exports = { submitKyc, getKycStatus, streamMyDoc, requestDocumentChange };
