'use strict';

const bcrypt = require('bcryptjs');
const ZIUser = require('./models/ZIUser');

async function seedZIAdmin() {
  const email = process.env.ZI_ADMIN_EMAIL;
  const password = process.env.ZI_ADMIN_PASSWORD;
  if (!email || !password) return;

  const exists = await ZIUser.findOne({ email });
  if (exists) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await ZIUser.create({
    email,
    passwordHash,
    role: 'super_admin',
    isActive: true,
  });
  console.log(`[ZI] Super admin seeded → ${email}`);
}

module.exports = { seedZIAdmin };
