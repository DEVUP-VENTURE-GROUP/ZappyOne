// Reward points into wallet money: the wallet accepts the reward reasons, and a database-worded failure never reaches a person.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let rewards;
beforeAll(async () => { await startMongo(); rewards = require('../src/modules/rewards/rewards.service'); });
afterAll(stopMongo);

test('redeeming points credits the wallet and leaves no rollback', async () => {
  const userId = new mongoose.Types.ObjectId();
  const cfg = await rewards.getConfig();
  if (!cfg.enabled) await rewards.updateConfig({ enabled: true });
  await rewards.awardPoints({ userId, points: 277, reason: 'admin_grant', ref: 't', idempotencyKey: `g:${userId}` });
  const out = await rewards.redeemPoints({ userId, points: 277 });
  expect(out).toMatchObject({ redeemedPoints: 277, creditedRupees: 28 });
  const { PointsLedger } = require('../src/modules/rewards/rewards.models');
  expect(await PointsLedger.countDocuments({ userId, reason: 'redeem_rollback' })).toBe(0);
});

test('a database-worded validation error is our fault: 500 with a calm sentence, never the wording', async () => {
  const express = require('express');
  const request = require('supertest');
  const { errorHandler } = require('../src/middlewares/error');
  const app = express();
  app.get('/enum', async (req, res, next) => {
    const M = mongoose.models.ErrT || mongoose.model('ErrT', new mongoose.Schema({ reason: { type: String, enum: ['a'] } }));
    try { await M.create({ reason: 'b' }); } catch (e) { next(e); }
  });
  app.get('/mine', async (req, res, next) => {
    const M = mongoose.models.ErrU || mongoose.model('ErrU', new mongoose.Schema({ age: { type: Number, min: [18, 'You must be 18 or older.'] } }));
    try { await M.create({ age: 5 }); } catch (e) { next(e); }
  });
  app.use(errorHandler);
  const bad = await request(app).get('/enum');
  expect(bad.status).toBe(500);
  expect(bad.body.error).not.toMatch(/enum|`/);
  const own = await request(app).get('/mine');
  expect(own.status).toBe(400);
  expect(own.body.error).toBe('You must be 18 or older.');
});
