/**
 * Local dev seed. Run: node scripts/seed.js
 * Creates a customer and a few workers — all marked isOnline + KYC approved —
 * around Hyderabad.
 *
 * This once ran against production (before src/config/index.js's dev/prod
 * database split existed) and seeded 8 fake "online, KYC-approved" workers
 * straight into the live dispatch pool — one of them was actually matched to
 * a real customer's puncture booking, which then went nowhere and was
 * cancelled. Discovered and cleaned up 2026-08-16, see git history.
 *
 * connectMongo() → config/index.js already resolves the correct database via
 * the .env + .env.<NODE_ENV> overlay, so this is redundant protection, not
 * the only line of defense — but a script that seeds "online, approved"
 * workers into whatever database it connects to should never rely on an
 * indirect default. It refuses outright unless that resolved database is
 * unambiguously the dev one.
 */
const { connectMongo } = require('../src/config/mongo');
const mongoose = require('mongoose');
const User = require('../src/modules/user/user.model');
const Worker = require('../src/modules/worker/worker.model');
const geoService = require('../src/modules/worker/geo.service');
const { signToken } = require('../src/modules/auth/auth.service');

const CENTER = { lat: 17.4485, lng: 78.3908 }; // HITEC City

function jitter(coord, radiusKm = 3) {
  const dLat = (Math.random() - 0.5) * (radiusKm / 111);
  const dLng = (Math.random() - 0.5) * (radiusKm / (111 * Math.cos((coord.lat * Math.PI) / 180)));
  return { lat: coord.lat + dLat, lng: coord.lng + dLng };
}

(async () => {
  await connectMongo();

  const dbName = mongoose.connection.name;
  if (!/dev/i.test(dbName)) {
    console.error(
      `\nRefusing to seed fake "online, KYC-approved" workers into database "${dbName}" — ` +
      `its name doesn't contain "dev". This script only runs against an isolated ` +
      `development database (name must contain "dev", e.g. zappy_dev).\n\n` +
      `If this really is your isolated dev database, rename it to include "dev". ` +
      `Do not weaken this check — this exact gap once put fake workers into production.`
    );
    process.exit(1);
  }
  console.log(`Seeding into "${dbName}" (confirmed dev database).`);

  // Customer
  const user = await User.findOneAndUpdate(
    { phone: '9999900001' },
    { name: 'Test Customer' },
    { upsert: true, new: true }
  );

  // Workers — mix of skills, spread around center
  const skillSets = [
    ['puncture', 'helper'],
    ['plumbing', 'electrical'],
    ['electrical', 'ac_repair'],
    ['carpenter'],
    ['puncture'],
    ['plumbing'],
    ['ac_repair', 'electrical'],
    ['helper'],
  ];

  const workers = [];
  for (let i = 0; i < skillSets.length; i++) {
    const pos = jitter(CENTER, 4);
    const w = await Worker.findOneAndUpdate(
      { phone: `888880000${i}` },
      {
        name: `Worker ${i + 1}`,
        skills: skillSets[i],
        isOnline: true,
        isAvailable: true,
        rating: 4 + Math.random(),
        completedJobs: Math.floor(Math.random() * 50),
        currentLocation: { type: 'Point', coordinates: [pos.lng, pos.lat], updatedAt: new Date() },
        kyc: {
          status: 'approved',
          aadhaarUrl: 'seed',
          selfieUrl: 'seed',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
    workers.push(w);
    // Register worker in Redis geo index so dispatch can find them
    await geoService.markOnline(w).catch(() => {});
  }

  // Print tokens for quick API testing
  const userToken = signToken({ sub: user._id, role: 'user', phone: user.phone });
  const workerTokens = workers.map((w) => ({
    name: w.name,
    phone: w.phone,
    token: signToken({ sub: w._id, role: 'worker', phone: w.phone }),
  }));

  console.log('\n=== SEED COMPLETE ===');
  console.log('User token:', userToken);
  console.log('Workers:');
  workerTokens.forEach((w) => console.log(`  ${w.name} (${w.phone}): ${w.token.slice(0, 40)}…`));
  console.log(`\n${workers.length} workers placed around ${CENTER.lat},${CENTER.lng}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
