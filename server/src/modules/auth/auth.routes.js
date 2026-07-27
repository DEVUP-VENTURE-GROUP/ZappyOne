const express = require('express');
const Joi = require('joi');
const ctrl = require('./auth.controller');
const { validate } = require('../../middlewares/validate');
const { authLimiter, adminAuthLimiter, otpPhoneLimiter } = require('../../middlewares/rateLimit');
const { authenticate, requireRole } = require('../../middlewares/auth');

const router = express.Router();

const phoneSchema = Joi.string().pattern(/^[0-9]{10,15}$/).required();

router.post(
  '/otp/request',
  otpPhoneLimiter,
  authLimiter,
  validate(Joi.object({
    phone: phoneSchema,
    role:  Joi.string().valid('user', 'worker', 'event_partner').optional(),
  })),
  ctrl.requestOtp,
);

router.post(
  '/otp/resend',
  otpPhoneLimiter,
  authLimiter,
  validate(Joi.object({ phone: phoneSchema })),
  ctrl.resendOtp,
);

router.post(
  '/user/login',
  authLimiter,
  validate(Joi.object({ phone: phoneSchema, otp: Joi.string().min(4).max(6).required(), name: Joi.string().max(100).optional() })),
  ctrl.loginUser
);

router.post(
  '/worker/login',
  authLimiter,
  validate(Joi.object({
    phone:    phoneSchema,
    otp:      Joi.string().min(4).max(6).required(),
    name:     Joi.string().max(100).optional(),
    skills:   Joi.array().items(Joi.string()).optional(),
    deviceId: Joi.string().max(200).optional(), // hardware fingerprint for multi-account detection
  })),
  ctrl.loginWorker
);

// ── Worker credential login (#2): password + Worker ID, forgot/reset/change ──
// Set (or update) a Worker ID + password — authenticated worker, after approval.
router.post(
  '/worker/set-credentials',
  authenticate,
  requireRole('worker'),
  validate(Joi.object({
    username: Joi.string().lowercase().pattern(/^[a-z0-9_]{3,30}$/).allow('', null).optional(),
    password: Joi.string().min(8).max(100).required(),
  })),
  ctrl.setWorkerCredentials,
);

// Sign in with Worker ID / email / phone + password (no OTP).
router.post(
  '/worker/login-password',
  authLimiter,
  validate(Joi.object({
    identifier: Joi.string().max(100).required(),
    password:   Joi.string().min(1).max(100).required(),
  })),
  ctrl.loginWorkerPassword,
);

// Forgot password → sends an OTP to the account's phone.
router.post(
  '/worker/forgot-password',
  otpPhoneLimiter,
  authLimiter,
  validate(Joi.object({ identifier: Joi.string().max(100).required() })),
  ctrl.forgotWorkerPassword,
);

// Reset password using the phone OTP.
router.post(
  '/worker/reset-password',
  authLimiter,
  validate(Joi.object({
    phone:       phoneSchema,
    otp:         Joi.string().min(4).max(6).required(),
    newPassword: Joi.string().min(8).max(100).required(),
  })),
  ctrl.resetWorkerPassword,
);

// Change password — authenticated worker.
router.post(
  '/worker/change-password',
  authenticate,
  requireRole('worker'),
  validate(Joi.object({
    currentPassword: Joi.string().max(100).allow('', null).optional(),
    newPassword:     Joi.string().min(8).max(100).required(),
  })),
  ctrl.changeWorkerPassword,
);

router.post(
  '/partner/login',
  authLimiter,
  validate(Joi.object({
    phone:        phoneSchema,
    otp:          Joi.string().min(4).max(6).required(),
    businessName: Joi.string().max(150).optional(),
    ownerName:    Joi.string().max(100).optional(),
    cities:       Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  })),
  ctrl.loginPartner
);

router.post(
  '/partner/google',
  authLimiter,
  validate(Joi.object({
    idToken:      Joi.string().required(),
    businessName: Joi.string().max(150).optional(),
    ownerName:    Joi.string().max(100).optional(),
    cities:       Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  })),
  ctrl.googlePartnerLogin
);

router.post(
  '/admin/login',
  adminAuthLimiter,  // 3 attempts / 15 min — much stricter than user authLimiter (#79)
  validate(Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required() })),
  ctrl.loginAdmin
);

// No body validation — refresh token comes from httpOnly cookie (primary) or
// body (legacy). Nothing meaningful to validate at the route level.
router.post('/refresh', authLimiter, ctrl.refresh);
router.post('/logout', ctrl.logout);

// Revoke all sessions for the authenticated user (sign out everywhere).
router.post('/revoke-all', authenticate, ctrl.revokeAll);

// Re-verify OTP for sensitive actions (payout, bank account changes).
// Must have first requested an OTP via /otp/request for their phone number.
router.post(
  '/otp/verify-action',
  authLimiter,
  authenticate,
  validate(Joi.object({ otp: Joi.string().min(4).max(6).required() })),
  ctrl.verifySensitiveOtp,
);

module.exports = router;
