/**
 * The shared review store:
 *   - one review per job, whatever the job kind; a second write never overwrites
 *   - contact details and abuse are flagged for a human, never auto-hidden
 *   - excluding a review takes it out of the provider's published average
 *   - the public profile shows real reviews only, with masked names, and "New"
 *     (no rating) when there are none
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let Review; let reviews; let Worker; let User;
const userId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  Review = require('../src/modules/review/review.model');
  reviews = require('../src/modules/review/review.service');
  Worker = require('../src/modules/worker/worker.model');
  User = require('../src/modules/user/user.model');
  await User.collection.insertOne({ _id: userId, name: 'Ravi Kumar', phone: '+919000000901' });
});
afterAll(stopMongo);
beforeEach(() => Review.deleteMany({}));

async function worker() {
  const _id = new mongoose.Types.ObjectId();
  await Worker.collection.insertOne({ _id, name: 'Asha', phone: `9${String(Date.now()).slice(-9)}`, rating: 5, reviewCount: 0 });
  return _id;
}

test('one review per job; a repeat write does not overwrite it', async () => {
  const workerId = await worker();
  const jobId = new mongoose.Types.ObjectId();
  await reviews.recordReview({ kind: 'repair', jobId, userId, workerId, rating: 5, comment: 'Great' });
  await reviews.recordReview({ kind: 'repair', jobId, userId, workerId, rating: 1, comment: 'Changed my mind' });
  const rows = await Review.find({ jobId }).lean();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ rating: 5, comment: 'Great', status: 'visible', flagged: false });
});

test('contact details and abuse are flagged, not hidden', async () => {
  const workerId = await worker();
  const a = await reviews.recordReview({ kind: 'pet', jobId: new mongoose.Types.ObjectId(), userId, workerId, rating: 4, comment: 'Call me on 9876543210' });
  expect(a).toMatchObject({ flagged: true, flagReason: 'Contains contact details', status: 'visible' });
  expect(reviews.autoFlag('he was a bastard')).toBe('Abusive language');
  expect(reviews.autoFlag('Fixed my screen in 30 minutes')).toBeNull();
});

test('excluding a review removes it from the published average', async () => {
  const workerId = await worker();
  const fake = await reviews.recordReview({ kind: 'helping', jobId: new mongoose.Types.ObjectId(), userId, workerId, rating: 1, comment: 'x' });
  await reviews.recordReview({ kind: 'helping', jobId: new mongoose.Types.ObjectId(), userId, workerId, rating: 5 });
  expect(await reviews.recomputeRating({ workerId })).toEqual({ rating: 3, reviewCount: 2 });
  await Review.updateOne({ _id: fake._id }, { $set: { excluded: true } });
  expect(await reviews.recomputeRating({ workerId })).toEqual({ rating: 5, reviewCount: 1 });
  expect(await Worker.findById(workerId).lean()).toMatchObject({ rating: 5, reviewCount: 1 });
});

test('public summary: real words only, masked names, hidden text left out', async () => {
  const workerId = await worker();
  await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId, workerId, rating: 5, comment: 'Quick and tidy' });
  const hidden = await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId, workerId, rating: 2, comment: 'rude words' });
  await Review.updateOne({ _id: hidden._id }, { $set: { status: 'hidden' } });
  const out = await reviews.publicSummary({ workerId });
  expect(out.reviews).toHaveLength(1);
  expect(out.reviews[0]).toMatchObject({ text: 'Quick and tidy', by: 'Ravi K.', rating: 5 });
  // Hidden words still count as stars.
  expect(out.breakdown).toMatchObject({ 5: 1, 2: 1 });
});

test("a provider sees their own reviews, reports one, and only they can", async () => {
  const w = await worker();
  const job = () => new mongoose.Types.ObjectId();
  await reviews.recordReview({ kind: 'repair', jobId: job(), userId, workerId: w, rating: 5, comment: 'Quick and neat', serviceLabel: 'Screen' });
  const bad = await reviews.recordReview({ kind: 'pet', jobId: job(), userId, workerId: w, rating: 1, comment: 'Never came' });

  const out = await reviews.mine({ role: 'worker', id: w });
  expect(out).toMatchObject({ rating: 3, reviewCount: 2, total: 2, breakdown: { 1: 1, 5: 1 } });
  expect(out.reviews[0]).toMatchObject({ by: 'Ravi K.', reported: false });

  await reviews.report({ role: 'worker', id: w }, String(bad._id), 'I was never assigned this job');
  expect((await Review.findById(bad._id)).flagReason).toMatch(/Reported by provider/);
  const stranger = new mongoose.Types.ObjectId();
  await expect(reviews.report({ role: 'worker', id: stranger }, String(bad._id), 'not mine at all')).rejects.toMatchObject({ status: 404 });
  await expect(reviews.mine({ role: 'user', id: userId })).rejects.toMatchObject({ status: 403 });
});

test('admin decides on a reported review; excluding it fixes the rating', async () => {
  const w = await worker();
  await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId, workerId: w, rating: 5 });
  const bad = await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId, workerId: w, rating: 1, comment: 'call 9876543210' });
  expect((await reviews.adminList({ flagged: true })).reviews.map((r) => r.id)).toEqual([String(bad._id)]);

  await reviews.moderate(String(bad._id), { action: 'exclude', reason: 'Not this provider' }, null);
  expect(await Worker.findById(w).lean()).toMatchObject({ rating: 5, reviewCount: 1 });
  expect((await reviews.adminList({ flagged: true })).total).toBe(0);
  await reviews.moderate(String(bad._id), { action: 'include' }, null);
  expect(await Worker.findById(w).lean()).toMatchObject({ rating: 3, reviewCount: 2 });
});
