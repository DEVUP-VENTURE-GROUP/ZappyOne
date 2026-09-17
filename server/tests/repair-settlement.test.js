/**
 * The three things that stood between "onboarded" and "actually earning":
 *
 *   1. a booking must REACH the provider, not sit at PENDING
 *   2. a completed repair must PAY the provider
 *   3. neither may double-fire on a replay
 *
 * Money movement is asserted through the real wallet ledger rather than a
 * mock, because the failure mode being guarded against — a completed job that
 * credits nothing — is invisible to any test that stubs the wallet out.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');

const { Repair } = require('../src/modules/repair/models/repair.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { QAInspection } = require('../src/modules/repair/models/custody.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const Transaction = require('../src/modules/payment/transaction.model');
const Wallet = require('../src/modules/wallet/wallet.model');
const Worker = require('../src/modules/worker/worker.model');
const bookingService = require('../src/modules/repair/services/booking.service');
const settlement = require('../src/modules/repair/services/settlement.service');

jest.setTimeout(60000);

const userId = new mongoose.Types.ObjectId();
let workerId;

const loc = { coordinates: [78.3489, 17.44], address: '12 Test Street', cityCode: 'hyderabad' };

async function walletBalance(id) {
  const w = await Wallet.findOne({ 'owner.kind': 'worker', 'owner.id': id }).lean();
  return w?.balancePaise ?? w?.balance ?? 0;
}

beforeAll(async () => {
  await startMongo();

  /**
   * Wait for the unique index on Transaction.idempotencyKey to actually exist.
   *
   * Mongoose builds indexes asynchronously, so against a fresh in-memory server
   * a duplicate insert can land BEFORE the index is ready and succeed — which
   * would make the idempotency assertions below pass or fail on timing rather
   * than on behaviour. Production databases have the index long since built;
   * `init()` reproduces that precondition instead of papering over it.
   */
  await Transaction.init();

  // This suite exercises the ONLINE settlement direction (platform holds the
  // money and pays the provider out), so online payment has to be switched on —
  // createBooking now refuses an online booking when no gateway is configured.
  await RepairConfig.create({
    vertical: 'mobile', commissionPct: 15, taxPct: 18, onlinePaymentsEnabled: true,
  });
  await Repair.create({
    code: 'battery_replacement', name: 'Battery Replacement', vertical: 'mobile',
    pricingMode: 'fixed', minSkillLevel: 2, warrantyDays: 180,
    allowedServiceModes: ['doorstep', 'workshop'],
    qaChecklistCodes: [],
  });

  // Without a reference band createBooking correctly refuses with
  // NO_PRICE_AVAILABLE — the booking needs something to be priced against.
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement',
    minPaise: 90000, recommendedPaise: 100000, maxPaise: 120000,
  });

  const w = await Worker.create({
    phone: '9876500123', name: 'Settle Test', rating: 4.6,
    skills: ['battery_replacement'], kyc: { status: 'approved' },
  });
  workerId = w._id;
});

afterAll(async () => { await stopMongo(); });

/** Create a booking already carrying a known snapshot, then drive it to done. */
async function bookAndComplete(
  key,
  { total = 118000, commission = 15000, shopId = null, paymentMethod = 'online' } = {},
) {
  const { booking } = await bookingService.createBooking({
    userId, brandCode: 'samsung', modelCode: 'samsung-s23',
    repairCode: 'battery_replacement', serviceMode: 'doorstep',
    workerId: shopId ? null : workerId, shopId,
    // Stated rather than defaulted: the two methods settle in opposite
    // directions, so a test that does not say which it means is testing
    // whatever the default happens to be today.
    paymentMethod,
    location: loc, idempotencyKey: key,
  });

  // The customer gave their handover codes; this suite is not about that.
  await passHandoverGates(booking._id);

  await RepairBooking.updateOne(
    { _id: booking._id },
    { $set: { 'priceSnapshot.totalPaise': total, 'priceSnapshot.commissionPaise': commission } },
  );

  for (const s of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) {
    await bookingService.transition(booking._id, s, { actorRole: 'worker', actorId: workerId });
  }

  // On a cash job the money changes hands before the job is closed, which is
  // also the order the state machine insists on.
  if (paymentMethod === 'cash') {
    await bookingService.collectCash({ bookingId: booking._id, actorRole: 'worker', actorId: workerId });
  }

  return bookingService.transition(booking._id, 'COMPLETED', { actorRole: 'worker', actorId: workerId });
}

describe('booking reaches the provider', () => {
  it('leaves PENDING immediately and lands on PROVIDER_ASSIGNED', async () => {
    const { booking } = await bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23',
      repairCode: 'battery_replacement', serviceMode: 'doorstep',
      workerId, location: loc, idempotencyKey: 'settle-assign-1',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(booking._id);

    // Previously this stayed at PENDING and the worker was never told.
    expect(booking.status).toBe('PROVIDER_ASSIGNED');
    const history = booking.statusHistory.map((h) => h.status);
    expect(history).toEqual(['PENDING', 'CONFIRMED', 'PROVIDER_ASSIGNED']);
  });

  it('stops at CONFIRMED when no provider was chosen', async () => {
    const { booking } = await bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23',
      serviceMode: 'diagnosis_only',
      location: loc, idempotencyKey: 'settle-assign-2',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(booking._id);
    // Nobody to notify yet — it awaits assignment rather than pretending.
    expect(booking.status).toBe('CONFIRMED');
  });

  it('is reachable through the provider job list', async () => {
    const jobs = await RepairBooking.find({
      workerId,
      status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'] },
    }).lean();
    expect(jobs.length).toBeGreaterThan(0);
  });
});

describe('completed repair pays the provider', () => {
  it('credits the worker their share and books the platform commission', async () => {
    const before = await walletBalance(workerId);
    const booking = await bookAndComplete('settle-pay-1', { total: 118000, commission: 15000 });

    expect(booking.status).toBe('COMPLETED');

    const after = await walletBalance(workerId);
    expect(after - before).toBe(103000);   // 118000 - 15000

    const commission = await Transaction.findOne({
      idempotencyKey: `repair:commission:${booking._id}`,
    }).lean();
    expect(commission.amountPaise).toBe(15000);
    expect(commission.owner.kind).toBe('platform');
  });

  it('settles from the SNAPSHOT, not from live config', async () => {
    // Commission rate changes after the booking was priced.
    await RepairConfig.updateMany({ vertical: 'mobile' }, { $set: { commissionPct: 40 } });

    const before = await walletBalance(workerId);
    const booking = await bookAndComplete('settle-pay-2', { total: 100000, commission: 10000 });
    const after = await walletBalance(workerId);

    // Still the 10% the booking was actually sold under, not the new 40%.
    expect(after - before).toBe(90000);
    expect(booking.priceSnapshot.commissionPaise).toBe(10000);

    await RepairConfig.updateMany({ vertical: 'mobile' }, { $set: { commissionPct: 15 } });
  });

  it('does not pay twice when completion is replayed', async () => {
    const booking = await RepairBooking.findOne({ idempotencyKey: 'settle-pay-1' });
    const before = await walletBalance(workerId);

    // Re-running settlement directly, as a retried webhook or ops re-run would.
    await settlement.settleSafely(booking);

    expect(await walletBalance(workerId)).toBe(before);
    const credits = await Transaction.countDocuments({ idempotencyKey: `repair:earning:${booking._id}` });
    expect(credits).toBe(1);
  });

  it('pays nothing on a zero-value booking', async () => {
    const booking = await RepairBooking.findOne({ idempotencyKey: 'settle-pay-1' });
    const result = await settlement.settleBooking({
      ...booking.toObject(),
      _id: new mongoose.Types.ObjectId(),
      priceSnapshot: { totalPaise: 0, commissionPaise: 0 },
    });
    // An inspection fully credited against a repair leaves nothing to move.
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('zero_value');
  });

  it('never pays the provider a negative amount', () => {
    const split = settlement.splitFor({
      _id: new mongoose.Types.ObjectId(),
      priceSnapshot: { totalPaise: 50000, commissionPaise: 90000 },  // nonsense input
    });
    expect(split.providerPaise).toBeGreaterThanOrEqual(0);
    expect(split.platformPaise).toBeLessThanOrEqual(split.totalPaise);
  });

  it('routes a shop booking’s earning to the shop, not the worker', async () => {
    const shopId = new mongoose.Types.ObjectId();
    const before = await walletBalance(workerId);

    const result = await settlement.settleBooking({
      _id: new mongoose.Types.ObjectId(),
      reference: 'ZRSHOP01',
      shopId,
      workerId,
      priceSnapshot: { totalPaise: 100000, commissionPaise: 15000 },
    });

    expect(result.ownerKind).toBe('shop');
    // The worker is paid by their shop, so their own wallet must not move.
    expect(await walletBalance(workerId)).toBe(before);
  });

  it('reports failure loudly instead of silently swallowing it', async () => {
    const result = await settlement.settleSafely({
      _id: new mongoose.Types.ObjectId(),
      reference: 'ZRBROKEN',
      workerId: null, shopId: null,
      priceSnapshot: { totalPaise: 100000, commissionPaise: 15000 },
    });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe('no_provider');
  });
});

/* ─── Cash settles the other way round ─────────────────────────────────── */

/**
 * On a cash job the technician takes the customer's money directly, so there is
 * nothing to pay them — they OWE us the commission. Getting this backwards pays
 * a provider twice for one job, which is why it is tested from both ends.
 */
describe('cash repairs', () => {
  const walletOf = async (id) => {
    const Wallet = require('../src/modules/wallet/wallet.model');
    return Wallet.findOne({ 'owner.kind': 'worker', 'owner.id': id }).lean();
  };

  it('does not pay the provider — they already have the money', async () => {
    const before = await walletOf(workerId);
    const startBalance = before?.balancePaise ?? 0;

    const booking = await bookAndComplete('cash-settle-1', {
      total: 118000, commission: 15000, paymentMethod: 'cash',
    });

    const after = await walletOf(workerId);
    // Their balance falls by the commission, not rises by the fare.
    expect(after.balancePaise).toBe(startBalance - 15000);
    expect(booking.paymentStatus).toBe('paid');
  });

  it('books the platform commission either way the customer pays', async () => {
    const txn = await Transaction.findOne({
      idempotencyKey: `repair:commission:${(await RepairBooking.findOne({ idempotencyKey: 'cash-settle-1' }))._id}`,
    }).lean();

    expect(txn).toBeTruthy();
    expect(txn.amountPaise).toBe(15000);
    expect(txn.metadata.cash).toBe(true);
  });

  it('refuses to complete a cash job before the money is collected', async () => {
    const { booking } = await bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23',
      repairCode: 'battery_replacement', serviceMode: 'doorstep',
      workerId, paymentMethod: 'cash', location: loc, idempotencyKey: 'cash-uncollected',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(booking._id);
    await RepairBooking.updateOne({ _id: booking._id }, { $set: { 'priceSnapshot.totalPaise': 100000 } });

    // Naming a worker at creation assigns them, so the walk starts from there.
    for (const step of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) {
      await bookingService.transition(booking._id, step, { actorRole: 'worker', actorId: workerId });
    }

    await expect(
      bookingService.transition(booking._id, 'COMPLETED', { actorRole: 'worker', actorId: workerId }),
    ).rejects.toMatchObject({ code: 'CASH_NOT_COLLECTED' });
  });

  it('records the collection once, however many times it is tapped', async () => {
    const booking = await RepairBooking.findOne({ idempotencyKey: 'cash-uncollected' });

    const first = await bookingService.collectCash({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
    });
    const second = await bookingService.collectCash({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
    });

    expect(first.alreadyPaid).toBe(false);
    expect(second.alreadyPaid).toBe(true);
    expect(second.booking.cashCollectedAt).toEqual(first.booking.cashCollectedAt);
  });

  it('keeps the commission as a due when the wallet is already at its limit', async () => {
    const Wallet = require('../src/modules/wallet/wallet.model');
    // Push them to the floor, the way a run of cash jobs would.
    await Wallet.updateOne(
      { 'owner.kind': 'worker', 'owner.id': workerId },
      { $set: { balancePaise: -49000 } },
    );

    const booking = await bookAndComplete('cash-at-limit', {
      total: 118000, commission: 15000, paymentMethod: 'cash',
    });

    // The debt is recorded rather than lost — the platform's revenue does not
    // depend on whether the provider's wallet could absorb it.
    const due = await Transaction.findOne({
      idempotencyKey: `repair:cash_commission_unpaid:${booking._id}`,
    }).lean();
    expect(due).toBeTruthy();
    expect(due.status).toBe('pending');
    expect(due.amountPaise).toBe(-15000);
  });
});

/* ─── Passing on a job ─────────────────────────────────────────────────── */

/**
 * A technician who is mid-job, out of the part, or simply too far must be able
 * to say no. Treating a decline as a failure teaches providers to ignore offers
 * instead, which leaves the customer waiting on someone who was never coming.
 */
describe('declining a job', () => {
  async function assignedBooking(key) {
    const { booking } = await bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23',
      repairCode: 'battery_replacement', serviceMode: 'doorstep',
      workerId, paymentMethod: 'cash', location: loc, idempotencyKey: key,
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(booking._id);
    return booking;
  }

  it('puts the job back so someone else can take it', async () => {
    const booking = await assignedBooking('decline-1');

    const after = await bookingService.declineBooking({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId, reason: 'no_part',
    });

    expect(after.status).toBe('CONFIRMED');
    expect(after.workerId).toBeNull();
    // Kept, so dispatch does not hand it straight back to the same person.
    expect(after.declines[0].reason).toBe('no_part');
    expect(String(after.declines[0].providerId)).toBe(String(workerId));
  });

  it('refuses once the job is actually under way', async () => {
    const booking = await assignedBooking('decline-2');
    await bookingService.transition(booking._id, 'WORKER_ACCEPTED', { actorRole: 'worker', actorId: workerId });
    await bookingService.transition(booking._id, 'ON_THE_WAY', { actorRole: 'worker', actorId: workerId });

    await expect(
      bookingService.declineBooking({ bookingId: booking._id, actorRole: 'worker', actorId: workerId }),
    ).rejects.toMatchObject({ code: 'TOO_LATE_TO_DECLINE' });
  });

  it('releases the part it was holding', async () => {
    const { ProviderInventory } = require('../src/modules/repair/models/inventory.model');
    const booking = await assignedBooking('decline-3');

    // Pretend a part was reserved for this job, as matching would have done.
    const inv = await ProviderInventory.findOneAndUpdate(
      { workerId, partId: new mongoose.Types.ObjectId() },
      { $set: { quantity: 2, reserved: 1 } },
      { upsert: true, new: true },
    );
    await RepairBooking.updateOne({ _id: booking._id }, { $set: { partId: inv.partId } });

    await bookingService.declineBooking({ bookingId: booking._id, actorRole: 'worker', actorId: workerId });

    const after = await ProviderInventory.findById(inv._id).lean();
    // The next provider must be offered a job that is genuinely doable.
    expect(after.reserved).toBe(0);
  });
});
