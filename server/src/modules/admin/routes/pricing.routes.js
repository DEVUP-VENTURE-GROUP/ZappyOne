const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const ctrl = require('../controllers/pricing.controller');

const router = express.Router();

router.get('/pricing-config', ctrl.getPricingConfig);
router.put(
  '/pricing-config',
  validate(Joi.object({
    // Fare
    baseFeePaise:    Joi.number().integer().min(0),
    perKmFeePaise:   Joi.number().integer().min(0),
    perMinFeePaise:  Joi.number().integer().min(0),
    platformFeePaise: Joi.number().integer().min(0).max(10000),
    minFarePaise:    Joi.number().integer().min(0).max(100000),
    surgeMaxCap:     Joi.number().min(1).max(10),
    // Commission
    commissionRate:       Joi.number().min(0).max(0.50),
    couponCommissionRate: Joi.number().min(0).max(0.50),
    // Tips
    tipMaxPaise:  Joi.number().integer().min(0).max(100000),
    tipOptions:   Joi.array().items(Joi.number().integer().min(1)).max(6),
    // Boost
    boostEnabled:        Joi.boolean(),
    boostMaxPaise:       Joi.number().integer().min(0).max(100000),
    boostOptions:        Joi.array().items(Joi.number().integer().min(1)).max(8),
    boostDispatchWeight: Joi.number().min(0).max(10),
    // Dispatch behaviour
    forceAssignBonusPaise:       Joi.number().integer().min(0).max(10000),
    workerAutoOfflineRejectRate: Joi.number().min(0.1).max(1),
    workerRejectWarnRate:        Joi.number().min(0.1).max(1),
    rejectRatePenaltyWeight:     Joi.number().min(0).max(20),
    cancelRatePenaltyWeight:     Joi.number().min(0).max(20),
    minWorkerRating:             Joi.number().min(1).max(5),
    // Acceptance-first dispatch (never force a non-consenting worker)
    forceAssignEnabled:     Joi.boolean(),
    // Geo-readiness gate (null = defer to env/NODE_ENV)
    geoReadinessEnabled:    Joi.boolean().allow(null),
    geoReadinessKm:         Joi.number().min(1).max(100),
    urgencyBonusEnabled:    Joi.boolean(),
    urgencyBonusStartStep:  Joi.number().integer().min(0).max(10),
    urgencyBonusStepPaise:  Joi.number().integer().min(0).max(10000),
    urgencyBonusMaxPaise:   Joi.number().integer().min(0).max(20000),
    bestFirstEnabled:       Joi.boolean(),
    bestFirstWindowMs:      Joi.number().integer().min(0).max(30000),
    bestFirstTopN:          Joi.number().integer().min(1).max(5),
    // ZeroWait Instant Match
    readyPoolEnabled:            Joi.boolean(),
    readyMaxMinutes:             Joi.number().integer().min(5).max(120),
    readyDefaultRadiusKm:        Joi.number().min(1).max(25),
    readyBonusPaise:             Joi.number().integer().min(0).max(20000),
    readyMinRating:              Joi.number().min(1).max(5),
    readyMinAcceptRate:          Joi.number().min(0).max(1),
    readyMinCompletedJobs:       Joi.number().integer().min(0).max(500),
    readyCancelBanHours:         Joi.number().integer().min(0).max(168),
    readyTiersOnly:              Joi.array().items(Joi.string().valid('standard', 'priority', 'express')).max(3),
    tierBonusMultiplierExpress:  Joi.number().min(1).max(5),
    tierBonusMultiplierPriority: Joi.number().min(1).max(5),
    expressBonusFromStep0:       Joi.boolean(),
    warmDispatchEnabled:         Joi.boolean(),
    warmTtlSec:                  Joi.number().integer().min(15).max(600),
    positioningEnabled:          Joi.boolean(),
    positioningBonusPaise:       Joi.number().integer().min(0).max(20000),
    positioningMinGap:           Joi.number().integer().min(1).max(50),
    // Stale watchdog
    staleNudgeMinutes:      Joi.number().integer().min(1).max(30),
    staleRedispatchMinutes: Joi.number().integer().min(2).max(60),
    staleOtwAlertMinutes:   Joi.number().integer().min(5).max(120),
    // Referral
    referralReferrerBonusPaise: Joi.number().integer().min(0).max(100000),
    referralRefereeBonusPaise:  Joi.number().integer().min(0).max(50000),
    // Worker finance
    earnedWageAdvanceEnabled:      Joi.boolean(),
    earnedWageAdvanceRate:         Joi.number().min(0.1).max(0.9),
    emergencyFundContributionRate: Joi.number().min(0).max(0.05),
    // Late arrival penalty
    lateArrivalPenaltyPaisePerMin: Joi.number().integer().min(0).max(5000),
    lateArrivalGraceMinutes:       Joi.number().integer().min(0).max(15),
    // Service tiers
    tierMultiplierPriority:  Joi.number().min(1).max(3),
    tierMultiplierExpress:   Joi.number().min(1).max(3),
    tierExpressMaxSearchMs:  Joi.number().integer().min(10000).max(600000),
    tierPriorityMaxSearchMs: Joi.number().integer().min(10000).max(600000),
  }).min(1)),
  ctrl.setPricingConfig,
);

router.patch(
  '/toggles',
  validate(Joi.object({
    surgeEnabled: Joi.boolean(),
    surgeMaxCap: Joi.number().min(1).max(3),
    commissionRate: Joi.number().min(0).max(0.45),
    dispatchEnabled: Joi.boolean(),
  })),
  ctrl.updateToggles,
);

router.patch(
  '/dispatch/toggle',
  validate(Joi.object({ dispatchEnabled: Joi.boolean().required() })),
  ctrl.toggleDispatch,
);

router.get('/cancellation-config', ctrl.getCancellationConfig);
router.patch(
  '/cancellation-config',
  validate(Joi.object({
    freeCancelWindowSec:        Joi.number().integer().min(0).max(3600),
    userCancelFeeAssignedPaise:  Joi.number().integer().min(0).max(100000),
    userCancelFeeOnWayPaise:     Joi.number().integer().min(0).max(100000),
    userCancelFeeArrivedPaise:   Joi.number().integer().min(0).max(100000),
    workerShareOnWayPct:         Joi.number().min(0).max(100),
    workerShareArrivedPct:       Joi.number().min(0).max(100),
    workerCancelPenaltyPaise:    Joi.number().integer().min(0),
    workerNoShowPenaltyPaise:    Joi.number().integer().min(0),
    lateWorkerCancelMultiplier:  Joi.number().min(1).max(10),
    workerRejectLimit:           Joi.number().integer().min(1),
    workerCancelLimit:           Joi.number().integer().min(1),
    workerCancelWindowSec:       Joi.number().integer().min(3600),
    rejectRatePenaltyWeight:     Joi.number().min(0).max(20),
    cancelRatePenaltyWeight:     Joi.number().min(0).max(20),
    notes:                       Joi.string().max(500).allow('', null),
  }).min(1)),
  ctrl.updateCancellationConfig,
);

module.exports = router;
