/**
 * Bootstrap an admin account. Run ONCE on a fresh deployment.
 *
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=ChangeMe_Now9 \
 *     node scripts/bootstrap-admin.js
 *
 * Idempotent: if an admin with this email already exists, the script no-ops.
 */
require('dotenv').config();
const { connectMongo } = require('../src/config/mongo');
const Admin = require('../src/modules/admin/admin.model');
const { hashPassword } = require('../src/modules/auth/auth.service');

(async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  await connectMongo();

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Admin ${email} already exists — skipping.`);
    process.exit(0);
  }

  const admin = await Admin.create({
    email: email.toLowerCase(),
    name,
    passwordHash: await hashPassword(password),
    role: 'super_admin',
    isActive: true,
  });

  console.log(`Created super admin: ${admin.email} (id=${admin._id})`);
  console.log('Log in at POST /api/auth/admin/login');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
