/**
 * Pet profiles ask, never assume, what a provider must know:
 *   - create needs size, gender, age, weight, temperament, vaccination, bite and strangers
 *   - a new profile is marked answered; an edit never resets a stored answer
 *   - an older profile is finished by answering them all in one edit
 */
process.env.NODE_ENV = 'test';
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const PetPassport = require('../src/modules/service/pet-passport.model');

let app; let token; let userId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const ANSWERS = {
  size: 'large', gender: 'male', dob: new Date(Date.now() - 3 * 365 * 86400e3).toISOString(), weight: 28,
  temperament: 'friendly', vaccinationStatus: 'up_to_date', biteRisk: 'medium', aggressionLevel: 'low',
};

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  userId = new mongoose.Types.ObjectId();
  token = signAccessToken({ sub: String(userId), role: 'user' });
});
afterAll(stopMongo);

test('creating a pet without the safety answers is refused', async () => {
  const res = await request(app).post('/api/pet/my-pets').set(auth()).send({ name: 'Bruno', species: 'dog' });
  expect(res.status).toBe(400);
  const halfway = await request(app).post('/api/pet/my-pets').set(auth())
    .send({ name: 'Bruno', species: 'dog', ...ANSWERS, biteRisk: undefined });
  expect(halfway.status).toBe(400);
});

test('a full profile is saved as answered, and an edit keeps the answers', async () => {
  const res = await request(app).post('/api/pet/my-pets').set(auth()).send({ name: 'Bruno', species: 'dog', ...ANSWERS });
  expect(res.status).toBe(201);
  expect(res.body.pet.safetyAnsweredAt).toBeTruthy();
  expect(res.body.pet.biteRisk).toBe('medium');

  const edit = await request(app).patch(`/api/pet/my-pets/${res.body.pet._id}`).set(auth()).send({ name: 'Bruno Jr' });
  expect(edit.status).toBe(200);
  expect(edit.body.pet).toMatchObject({ name: 'Bruno Jr', biteRisk: 'medium', aggressionLevel: 'low', size: 'large', vaccinationStatus: 'up_to_date' });
});

test('an older profile is finished by answering every question', async () => {
  const old = await PetPassport.create({ userId, name: 'Kitty', species: 'cat' });
  expect(old.safetyAnsweredAt).toBeNull();

  const partial = await request(app).patch(`/api/pet/my-pets/${old._id}`).set(auth()).send({ size: 'small' });
  expect(partial.body.pet.safetyAnsweredAt).toBeNull();

  const done = await request(app).patch(`/api/pet/my-pets/${old._id}`).set(auth()).send({ ...ANSWERS, size: 'small', weight: 4 });
  expect(done.status).toBe(200);
  expect(done.body.pet.safetyAnsweredAt).toBeTruthy();
});
