require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const Admin = require('./admin.model');
const { hashPassword } = require('../auth/auth.service');
const logger = require('../../core/logger');

/**
 * Idempotent — runs on every startup, creates the default admin only if no
 * admin with that email exists yet. Reads credentials from env vars:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 */
async function ensureAdminSeeded() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME || 'Super';
  const lastName = process.env.ADMIN_LAST_NAME || 'Admin';
  const name = `${firstName} ${lastName}`.trim();

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) return; // already seeded

  await Admin.create({
    email: email.toLowerCase(),
    name,
    passwordHash: await hashPassword(password),
    role: 'super_admin',
    isActive: true,
  });

  logger.info({ email }, 'Default admin account created from env');
}

module.exports = { ensureAdminSeeded };
