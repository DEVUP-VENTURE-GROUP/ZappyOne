/**
 * Environment configuration.
 * ----------------------------------------------------------------------------
 * Loads `.env` as the BASE, then overlays `.env.<NODE_ENV>` when that file
 * exists, with the overlay winning.
 *
 * This keeps production behaviour byte-identical (no `.env.production` file is
 * deployed, so only `.env` is read) while letting development point at an
 * isolated database and sandbox credentials without ever editing the shared
 * `.env`.
 *
 * WHY THIS EXISTS: `NODE_ENV=development` previously said nothing about which
 * DATABASE was in use — a local dev process was connected to the live Atlas
 * `zappy` database. Environment now selects the data store, not just the
 * process mode.
 * ----------------------------------------------------------------------------
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '../../');

// Base config — always loaded.
require('dotenv').config({ path: path.join(projectRoot, '.env') });

// Environment overlay. `override: true` lets it win over the base file.
const overlayPath = path.join(projectRoot, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlayPath)) {
  require('dotenv').config({ path: overlayPath, override: true });
}
const Joi = require('joi');

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(4000),
  MONGO_URI: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  GOOGLE_MAPS_KEY: Joi.string().default(''),  // optional — haversine fallback used when absent
  AWS_REGION: Joi.string().default('ap-south-1'),
  AWS_S3_BUCKET: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  DISPATCH_RADIUS_KM: Joi.number().default(5),
  DISPATCH_MAX_CANDIDATES: Joi.number().default(20),
  DISPATCH_OFFER_TIMEOUT_MS: Joi.number().default(35000),
  DISPATCH_STEP_WINDOW_MS: Joi.number().default(35000),    // ms per radius step (35s)
  DISPATCH_MIN_SEARCH_MS: Joi.number().default(300000),    // 5-min minimum before force-assign (standard tier)
  DISPATCH_MIN_WORKER_RATING: Joi.number().default(3.0),   // skip workers rated below this
  DISPATCH_FORCE_ASSIGN_RADIUS_KM: Joi.number().default(20), // max radius for force-assign
  DISPATCH_QUEUE_CAP: Joi.number().default(2000),            // circuit-breaker: reject new orders above this BullMQ queue depth
  DISPATCH_GEO_READINESS_KM: Joi.number().default(25),       // radius to check for available workers before creating order
  PRICING_TIMEOUT_MS: Joi.number().default(8000),            // abort pricing call after this many ms
  BASE_FEE: Joi.number().default(40),
  PER_KM_FEE: Joi.number().default(12),
  PER_MIN_FEE: Joi.number().default(2),
  PLATFORM_FEE: Joi.number().default(10),
  MIN_FARE: Joi.number().default(60),
  // Frontend origin — used for CORS. Must be set in production.
  CLIENT_URL: Joi.string().uri().optional(),
  // Cashfree Payment Gateway
  CASHFREE_APP_ID:        Joi.string().default(''),
  CASHFREE_SECRET_KEY:    Joi.string().default(''),
  CASHFREE_WEBHOOK_URL:   Joi.string().uri().optional(),   // set to your /api/payments/webhook URL
  CASHFREE_ENV:           Joi.string().valid('sandbox', 'production').default('sandbox'),
  // Firebase Admin SDK (service account — replaces legacy server key)
  FIREBASE_PROJECT_ID:    Joi.string().default(''),
  FIREBASE_CLIENT_EMAIL:  Joi.string().default(''),
  FIREBASE_PRIVATE_KEY:   Joi.string().default(''),
  // Legacy server key (kept for backwards compat, prefer Admin SDK above)
  FIREBASE_SERVER_KEY: Joi.string().default(''),
  // SMS — optional (set to enable; if empty, SMS is logged only)
  SMS_PROVIDER_KEY: Joi.string().default(''),
  SMS_FROM: Joi.string().default('ZAPPY'),
  // ZappyLens — visual service search via OpenRouter (OpenAI-compatible gateway)
  OPENROUTER_API_KEY:        Joi.string().default(''),   // empty → Lens disabled (503)
  LENS_MODEL_FAST:           Joi.string().default('google/gemini-2.5-flash'),       // cheap first-pass vision (OpenRouter slug)
  LENS_MODEL_SMART:          Joi.string().default('anthropic/claude-sonnet-4.6'),   // escalation for ambiguous scans
  LENS_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.7),               // below → escalate to smart model
  LENS_TIMEOUT_MS:           Joi.number().default(20000),
  LENS_PUBLIC_URL:           Joi.string().default('https://www.zappyone.com'),       // sent as OpenRouter HTTP-Referer
  // Worker KYC verification — 3rd-party API provider (Surepass-style). Empty → manual only.
  KYC_PROVIDER:  Joi.string().default(''),          // e.g. 'surepass' — empty disables auto-verification
  KYC_API_URL:   Joi.string().allow('').default(''),// provider base URL
  KYC_API_KEY:   Joi.string().allow('').default(''),// provider bearer token
  KYC_TIMEOUT_MS: Joi.number().default(15000),
}).unknown();

const { value: env, error } = schema.validate(process.env, { abortEarly: false });
if (error) {
  // eslint-disable-next-line no-console
  console.error('Invalid env config:', error.message);
  process.exit(1);
}

module.exports = {
  env: env.NODE_ENV,
  port: env.PORT,
  mongo: { uri: env.MONGO_URI },
  redis: { url: env.REDIS_URL },
  jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
  googleMaps: { key: env.GOOGLE_MAPS_KEY },
  aws: {
    region: env.AWS_REGION,
    bucket: env.AWS_S3_BUCKET,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  dispatch: {
    radiusKm:            env.DISPATCH_RADIUS_KM,
    maxCandidates:       env.DISPATCH_MAX_CANDIDATES,
    offerTimeoutMs:      env.DISPATCH_OFFER_TIMEOUT_MS,
    stepWindowMs:        env.DISPATCH_STEP_WINDOW_MS,
    minSearchMs:         env.DISPATCH_MIN_SEARCH_MS,
    minWorkerRating:     env.DISPATCH_MIN_WORKER_RATING,
    forceAssignRadiusKm: env.DISPATCH_FORCE_ASSIGN_RADIUS_KM,
    queueCap:           env.DISPATCH_QUEUE_CAP,
    geoReadinessKm:     env.DISPATCH_GEO_READINESS_KM,
    pricingTimeoutMs:   env.PRICING_TIMEOUT_MS,
    // Standard: 10 steps × 35s ≈ 5.8 min before force-assign.
    // Express overrides to 15s/step, 60s total. Priority: 25s/step, 2 min total.
    radiusSteps: [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.5, 5.0, 8.0, 12.0],
  },
  pricing: {
    baseFee: env.BASE_FEE,
    perKmFee: env.PER_KM_FEE,
    perMinFee: env.PER_MIN_FEE,
    platformFee: env.PLATFORM_FEE,
    minFare: env.MIN_FARE,
  },
  cashfree: {
    appId:     env.CASHFREE_APP_ID,
    secretKey: env.CASHFREE_SECRET_KEY,
    webhookUrl: env.CASHFREE_WEBHOOK_URL || '',
    env:        env.CASHFREE_ENV,
  },
  firebase: {
    projectId:   env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey:  env.FIREBASE_PRIVATE_KEY,
    serverKey:   env.FIREBASE_SERVER_KEY, // legacy fallback
  },
  sms: {
    providerKey: env.SMS_PROVIDER_KEY,
    from: env.SMS_FROM,
  },
  kyc: {
    provider:  env.KYC_PROVIDER,
    apiUrl:    env.KYC_API_URL,
    apiKey:    env.KYC_API_KEY,
    timeoutMs: env.KYC_TIMEOUT_MS,
  },
  lens: {
    apiKey:              env.OPENROUTER_API_KEY,
    modelFast:           env.LENS_MODEL_FAST,
    modelSmart:          env.LENS_MODEL_SMART,
    confidenceThreshold: env.LENS_CONFIDENCE_THRESHOLD,
    timeoutMs:           env.LENS_TIMEOUT_MS,
    publicUrl:           env.LENS_PUBLIC_URL,
  },
};
