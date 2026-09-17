/**
 * Feature Routes — All 10 unique competitive features
 * Mounted at /api/orders/:id/* and /api/workers/* via index.js
 */

const express = require('express');
const Joi     = require('joi');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { authLimiter } = require('../../middlewares/rateLimit');

const router = express.Router({ mergeParams: true });

/* ── Customer SOS ────────────────────────────────────────────────── */

/**
 * The customer's panic button, during a job.
 *
 * The screen has had this button all along and it posted here — to a route
 * that did not exist. The client swallows the failure, so the phone dialled
 * 112, the toast said support had been notified, and nothing reached Zappy.
 *
 * Rate-limited like the worker's: a panic button is tapped repeatedly by
 * someone frightened, and each tap must not open another urgent ticket.
 */
router.post('/:id/sos',
  authenticate, requireRole('user'), authLimiter,
  validate(Joi.object({
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
    message: Joi.string().max(300).optional(),
  })),
  async (req, res, next) => {
    try {
      const sosService = require('../worker/sos.service');
      const result = await sosService.triggerCustomerSOS({
        userId: req.auth.sub,
        orderId: req.params.id,
        lat: req.body.lat,
        lng: req.body.lng,
        message: req.body.message,
      });
      res.json(result);
    } catch (err) { next(err); }
  },
);

/* ── Feature 1: Live Service Photos ─────────────────────────────── */
router.post('/:id/service-photos',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    url:     Joi.string().uri().required(),
    phase:   Joi.string().valid('before', 'during', 'after', 'issue', 'material').default('during'),
    caption: Joi.string().max(200).optional(),
  })),
  async (req, res, next) => {
    try {
      const svc = require('./service-photo.service');
      const photo = await svc.addServicePhoto({
        orderId:  req.params.id,
        workerId: req.auth.sub,
        url:      req.body.url,
        phase:    req.body.phase,
        caption:  req.body.caption,
      });
      res.status(201).json({ photo });
    } catch (err) { next(err); }
  }
);

router.get('/:id/service-photos', authenticate, async (req, res, next) => {
  try {
    const svc    = require('./service-photo.service');
    const photos = await svc.listServicePhotos(req.params.id);
    res.json({ photos });
  } catch (err) { next(err); }
});

/* ── Feature 3: Voice Tip ────────────────────────────────────────── */
router.post('/:id/tip',
  authenticate, requireRole('user'),
  validate(Joi.object({
    amountPaise:  Joi.number().integer().min(100).required(),
    voiceNoteUrl: Joi.string().uri().optional().allow(null, ''),
    message:      Joi.string().max(200).optional().allow(null, ''),
  })),
  async (req, res, next) => {
    try {
      const svc    = require('./tip.service');
      const result = await svc.sendTip({
        orderId:      req.params.id,
        userId:       req.auth.sub,
        amountPaise:  req.body.amountPaise,
        voiceNoteUrl: req.body.voiceNoteUrl,
        message:      req.body.message,
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

router.get('/:id/tip', authenticate, async (req, res, next) => {
  try {
    const svc = require('./tip.service');
    const tip = await svc.getTip(req.params.id);
    res.json({ tip });
  } catch (err) { next(err); }
});

/* ── Feature 4: Mid-Service Price Revision ───────────────────────── */
router.post('/:id/price-revision',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    requestedTotal: Joi.number().positive().required(),
    reason:         Joi.string().min(10).max(500).required(),
    evidenceUrls:   Joi.array().items(Joi.string().uri()).max(5).default([]),
  })),
  async (req, res, next) => {
    try {
      const svc      = require('./price-revision.service');
      const revision = await svc.requestRevision({
        orderId:        req.params.id,
        workerId:       req.auth.sub,
        requestedTotal: req.body.requestedTotal,
        reason:         req.body.reason,
        evidenceUrls:   req.body.evidenceUrls,
      });
      res.status(201).json({ revision });
    } catch (err) { next(err); }
  }
);

router.post('/:id/price-revision/respond',
  authenticate, requireRole('user'),
  validate(Joi.object({
    revisionId: Joi.string().hex().length(24).required(),
    approved:   Joi.boolean().required(),
  })),
  async (req, res, next) => {
    try {
      const svc    = require('./price-revision.service');
      const result = await svc.respondRevision({
        revisionId: req.body.revisionId,
        orderId:    req.params.id,
        userId:     req.auth.sub,
        approved:   req.body.approved,
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.get('/:id/price-revision', authenticate, async (req, res, next) => {
  try {
    const svc      = require('./price-revision.service');
    const revision = await svc.getPendingRevision(req.params.id);
    res.json({ revision });
  } catch (err) { next(err); }
});

/* ── Feature 6: Skill Auction ────────────────────────────────────── */
router.get('/:id/auction', authenticate, async (req, res, next) => {
  try {
    const svc     = require('./auction.service');
    const auction = await svc.getAuction(req.params.id);
    res.json({ auction });
  } catch (err) { next(err); }
});

router.post('/:id/auction/bid',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    auctionId:     Joi.string().hex().length(24).required(),
    proposedPrice: Joi.number().positive().required(),
    etaMinutes:    Joi.number().integer().min(5).max(120).required(),
    approach:      Joi.string().min(10).max(500).required(),
  })),
  async (req, res, next) => {
    try {
      const svc     = require('./auction.service');
      const auction = await svc.submitBid({
        auctionId:     req.body.auctionId,
        orderId:       req.params.id,
        workerId:      req.auth.sub,
        proposedPrice: req.body.proposedPrice,
        etaMinutes:    req.body.etaMinutes,
        approach:      req.body.approach,
      });
      res.status(201).json({ auction });
    } catch (err) { next(err); }
  }
);

router.post('/:id/auction/select',
  authenticate, requireRole('user'),
  validate(Joi.object({
    auctionId: Joi.string().hex().length(24).required(),
    bidId:     Joi.string().hex().length(24).required(),
  })),
  async (req, res, next) => {
    try {
      const svc    = require('./auction.service');
      const result = await svc.selectBid({
        auctionId: req.body.auctionId,
        orderId:   req.params.id,
        userId:    req.auth.sub,
        bidId:     req.body.bidId,
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

module.exports = router;
