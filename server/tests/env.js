// Provide env vars BEFORE the config module loads — otherwise Joi validation fails.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test'; // overridden by memory server
process.env.REDIS_URL = 'redis://127.0.0.1:6379';         // mocked
process.env.JWT_SECRET = 'test_secret_that_is_at_least_32_characters_long_xxxxx';
process.env.GOOGLE_MAPS_KEY = 'test';
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_S3_BUCKET = 'test';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.ADMIN_LOGIN_SLUG = 'test-admin';

// ── No test may reach a real sender ─────────────────────────────────────
// config/index.js loads the project .env, which carries LIVE SMS keys. A test
// that requests an OTP would then dispatch a real message to whatever number
// the fixture used — costing credits and texting a stranger. Blanking the
// provider keys here forces the local fallback path in every test run.
process.env.TWO_FACTOR_API_KEY = '';
process.env.FAST2SMS_KEY = '';
process.env.MSG91_AUTH_KEY = '';
process.env.MSG91_SENDER_ID = '';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';

// Silence maps fetches — the real Google Distance Matrix isn't reachable in tests.
// Our maps.service.js catches fetch errors and falls back to Haversine, which is fine.
