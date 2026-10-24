// Store reviewers cannot receive an SMS code, so they sign in with phone + password. Creates or refreshes that one Rakshak account; it is approved for no service, so it never gets real work.
// Run:  REVIEW_PASSWORD='<password>' NODE_ENV=production node scripts/play-review-account.js --yes-production
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const overlay = path.resolve(__dirname, `../.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });

const Worker = require('../src/modules/worker/worker.model');

const PHONE = process.env.REVIEW_PHONE || '9000090000';
const EMAIL = 'play-review@zappyone.com';

async function upsertReviewer(password) {
  if (!password || password.length < 8) throw new Error('Set REVIEW_PASSWORD (8+ characters)');
  const now = new Date();
  const set = {
    name: 'Play Review', email: EMAIL, passwordHash: await bcrypt.hash(password, 12), passwordSetAt: now,
    photoPromptSeenAt: now, onboardingComplete: true, isBlocked: false, isOnline: false, shopId: null,
  };
  await Worker.updateOne({ phone: PHONE }, { $set: set, $setOnInsert: { phone: PHONE } }, { upsert: true });
  return Worker.findOne({ phone: PHONE }).select('phone email employment').lean();
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('Refusing to change production without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const w = await upsertReviewer(process.env.REVIEW_PASSWORD);
  console.log(`Review account ready: phone ${w.phone}, email ${w.email}. Sign in with "Use password".`);
  await mongoose.disconnect();
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { upsertReviewer, PHONE };
