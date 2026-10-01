jest.setTimeout(120000);

/**
 * The whole repair business, start to finish, the way it actually happens.
 *
 * Every other suite tests one service in isolation. This one plays the real
 * scenarios end to end — customer books, shop is rung, shop accepts, shop hands
 * it to a technician, technician travels and diagnoses, quote is raised and
 * approved, work is done, QA passes, cash is taken, money settles — and then
 * the ways it goes wrong: the provider passes, nobody answers, the customer
 * cancels, the part is not there.
 *
 * It exists because bugs kept surfacing in exactly the seams these steps share:
 * a price resolved one way at booking and another at settlement, a job released
 * with nobody to release it to, a reservation refused because there was nothing
 * to reserve. None of those are visible from inside a single service.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { Repair } = require('../src/modules/repair/models/repair.model');
const { Problem, ProblemCategory } = require('../src/modules/repair/models/problem.model');
const { PartQuality } = require('../src/modules/repair/models/part.model');
const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
const { ProviderServiceArea, RepairConfig } = require('../src/modules/repair/models/config.model');
const { ProviderPricing, ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const Worker = require('../src/modules/worker/worker.model');
const Shop = require('../src/modules/shop/shop.model');

const bookingService = require('../src/modules/repair/services/booking.service');
const matching = require('../src/modules/repair/services/matching.service');
const pricingService = require('../src/modules/repair/services/pricing.service');
const cancellationService = require('../src/modules/repair/services/cancellation.service');

const LAT = 17.4375;
const LNG = 78.4483;
const CUSTOMER = new mongoose.Types.ObjectId();

/** The shop quotes ONE all-in price, as providers are now asked to. */
const SHOP_PRICE_PAISE = 75000;

let shop;
let tech;

beforeAll(async () => {
  await startMongo();

  await RepairConfig.create({
    vertical: 'mobile',
    commissionPct: 15,
    taxPct: 0,
    platformFeePaise: 0,
    pickupBaseFeePaise: 3000,
    pickupPerKmPaise: 800,
    pickupFreeKm: 2,
    pickupMaxFeePaise: 25000,
    autoApproveGreen: true,
    sla: { acceptMinutes: 10 },
  });

  const cat = await ProblemCategory.create({ vertical: 'mobile', code: 'display', name: 'Display' });
  await Problem.create({
    vertical: 'mobile', code: 'cracked_screen', name: 'Cracked screen',
    categoryId: cat._id, categoryCode: 'display',
    candidateRepairCodes: ['screen_replacement'],
    requiresDiagnosis: false,
  });
  await Repair.create({
    vertical: 'mobile', code: 'screen_replacement', name: 'Screen Replacement',
    minSkillLevel: 3, pricingMode: 'fixed', warrantyDays: 90,
    allowedServiceModes: ['doorstep', 'workshop', 'pickup_repair'],
    isActive: true, partRequirements: [{ componentCode: 'screen', required: true, quantity: 1 }],
  });
  await PartQuality.create({ code: 'premium', name: 'Premium', rank: 20, isActive: true });

  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'screen_replacement',
    minPaise: 60000, recommendedPaise: 80000, maxPaise: 120000,
    partCostPaise: 50000, labourPaise: 30000, warrantyDays: 90,
  });

  shop = await Shop.create({
    businessName: 'Test Repairs', ownerName: 'Owner', phone: '9000000001',
    kyc: { status: 'approved' }, isActive: true, services: ['mobile_repair'],
  });
  tech = await Worker.create({
    phone: '9000000002', name: 'Tech One', shopId: shop._id,
    kyc: { status: 'approved' }, skills: ['mobile_repair'],
  });

  await ProviderServiceArea.create({
    shopId: shop._id, cityCode: 'hyderabad',
    center: { coordinates: [LNG, LAT] }, radiusKm: 20,
    serviceModes: ['doorstep', 'workshop', 'pickup_repair'], isActive: true,
  });
  await ProviderCapability.create({
    shopId: shop._id, vertical: 'mobile', repairCode: 'screen_replacement',
    brandCodes: ['samsung'], serviceModes: ['doorstep', 'workshop', 'pickup_repair'],
    skillLevel: 4, verificationStatus: 'approved', isActive: true,
  });
  await ProviderPricing.create({
    shopId: shop._id, vertical: 'mobile', repairCode: 'screen_replacement',
    brandCode: 'samsung', totalPaise: SHOP_PRICE_PAISE,
    warrantyDays: 90, approvalStatus: 'approved',
  });

  pricingService.invalidateConfigCache();
});

afterAll(async () => { await stopMongo(); });
afterEach(async () => { await RepairBooking.deleteMany({}); });

const handoverSvc = require('../src/modules/repair/services/handover.service');

/**
 * Play the customer: read the code out so the technician can proceed.
 *
 * Real flows cannot move a device without it, so the tests cannot either —
 * a test that bypassed the gate would be testing a system nobody ships.
 */
async function passGate(bookingId, status, serviceMode, actorId) {
  const kind = handoverSvc.gateFor(status, serviceMode);
  if (!kind) return;
  const code = await handoverSvc.issue(bookingId, kind);
  await handoverSvc.verify({ bookingId, kind, code, actorRole: 'worker', actorId });
}

const baseBooking = (extra = {}) => ({
  vertical: 'mobile',
  userId: CUSTOMER,
  brandCode: 'samsung',
  modelCode: 'samsung-galaxy-s23',
  problemCodes: ['cracked_screen'],
  repairCode: 'screen_replacement',
  serviceMode: 'workshop',
  paymentMethod: 'cash',
  location: { address: 'Somewhere', coordinates: [LNG, LAT], cityCode: 'hyderabad' },
  idempotencyKey: `j-${Math.random()}`,
  ...extra,
});

describe('the happy path, all the way through', () => {
  it('a customer can find this shop', async () => {
    const res = await matching.findProviders({
      vertical: 'mobile', repairCode: 'screen_replacement',
      brandCode: 'samsung', modelCode: 'samsung-galaxy-s23',
      serviceMode: 'workshop', lat: LAT, lng: LNG,
    });

    expect(res.providers).toHaveLength(1);
    expect(res.providers[0].name).toBe('Test Repairs');
    // The shop's own number, not a band.
    expect(res.providers[0].totalPaise).toBe(SHOP_PRICE_PAISE);
  });

  it("books at the shop's price and rings them, not at a national band", async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));

    expect(booking.status).toBe('PROVIDER_ASSIGNED');
    expect(String(booking.shopId)).toBe(String(shop._id));
    expect(booking.priceSnapshot.totalPaise).toBe(SHOP_PRICE_PAISE);
    // The provider quoted one number; we must not invent a breakdown.
    expect(booking.priceSnapshot.partPaise).toBe(0);
    expect(booking.priceSnapshot.labourPaise).toBe(0);
    // An accept clock, or the watchdog can never see it.
    expect(booking.stageDeadlineAt).toBeTruthy();
  });

  it('runs accept → assign → travel → work → QA → complete without a dead end', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));
    const id = booking._id;

    await bookingService.transition(id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    await bookingService.assignWorker({ bookingId: id, shopId: shop._id, workerId: tech._id });

    const assigned = await RepairBooking.findById(id).lean();
    expect(String(assigned.workerId)).toBe(String(tech._id));

    const actor = { actorRole: 'worker', actorId: String(tech._id) };
    for (const step of ['ON_THE_WAY', 'ARRIVED', 'DIAGNOSING', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) {
      // eslint-disable-next-line no-await-in-loop
      await bookingService.transition(id, step, actor);
    }

    // Cash first — completion bills commission on the basis that they were paid.
    await bookingService.collectCash({ bookingId: id, actorRole: 'worker', actorId: String(tech._id) });
    const paid = await RepairBooking.findById(id).lean();
    expect(paid.paymentStatus).toBe('paid');

    // The device is handed back, and the owner proves they received it.
    await passGate(id, 'COMPLETED', 'workshop', String(tech._id));
    await bookingService.transition(id, 'COMPLETED', actor);
    const done = await RepairBooking.findById(id).lean();
    expect(done.status).toBe('COMPLETED');
  });

  it('refuses to complete a cash job nobody has paid for', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));
    const id = booking._id;
    const actor = { actorRole: 'worker', actorId: String(tech._id) };

    await bookingService.transition(id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    // Assign first, or this fails on access rather than on the money — which
    // would pass the test for entirely the wrong reason.
    await bookingService.assignWorker({ bookingId: id, shopId: shop._id, workerId: tech._id });
    for (const step of ['ON_THE_WAY', 'ARRIVED', 'DIAGNOSING', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) {
      // eslint-disable-next-line no-await-in-loop
      await bookingService.transition(id, step, actor);
    }

    // Clear the return gate first, or this fails on the code rather than on
    // the money — passing for the wrong reason.
    await passGate(id, 'COMPLETED', 'workshop', String(tech._id));
    await expect(bookingService.transition(id, 'COMPLETED', actor))
      .rejects.toThrow(/cash|paid|collect/i);
  });
});

describe('collection is priced by distance', () => {
  it('charges more to collect from further away', async () => {
    const near = await bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'pickup_repair',
      location: { address: 'Close', coordinates: [LNG, LAT], cityCode: 'hyderabad' },
    }));
    const far = await bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'pickup_repair',
      // ~11 km north.
      location: { address: 'Far', coordinates: [LNG, LAT + 0.1], cityCode: 'hyderabad' },
    }));

    expect(far.booking.priceSnapshot.pickupPaise)
      .toBeGreaterThan(near.booking.priceSnapshot.pickupPaise);
    // And the repair itself is untouched by how far it travelled.
    expect(far.booking.priceSnapshot.totalPaise)
      .toBeGreaterThan(near.booking.priceSnapshot.totalPaise);
  });
});

describe('when it goes wrong', () => {
  it('hands the job on when the provider passes', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));

    const after = await bookingService.declineBooking({
      bookingId: booking._id, actorRole: 'shop', actorId: String(shop._id), reason: 'busy',
    });

    // Only one provider exists, so it correctly finds nobody — but it LOOKED,
    // and the booking is left in a recoverable state rather than stuck.
    expect(after.status).toBe('CONFIRMED');
    expect(after.declines).toHaveLength(1);
  });

  it('cancelling before anyone is sent is free', async () => {
    const { booking } = await bookingService.createBooking(baseBooking());
    const quote = await cancellationService.quoteCancellation(
      await RepairBooking.findById(booking._id).lean(), { userId: CUSTOMER },
    );
    expect(quote.allowed).toBe(true);
    expect(quote.feePaise).toBe(0);
  });

  it('a shop job does not set off until a technician is named', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));
    await bookingService.transition(booking._id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    await expect(bookingService.transition(booking._id, 'ON_THE_WAY', { actorRole: 'shop', actorId: String(shop._id) }))
      .rejects.toMatchObject({ code: 'ASSIGN_TECHNICIAN_FIRST' });
  });

  it('cancelling once a technician is travelling is not', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));
    await bookingService.transition(booking._id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    await bookingService.assignWorker({ bookingId: booking._id, shopId: shop._id, workerId: tech._id });
    await bookingService.transition(booking._id, 'ON_THE_WAY', { actorRole: 'shop', actorId: String(shop._id) });

    const quote = await cancellationService.quoteCancellation(
      await RepairBooking.findById(booking._id).lean(), { userId: CUSTOMER },
    );
    expect(quote.feePaise).toBeGreaterThan(0);
  });

  it('a booking with no provider is still created, for dispatch to pick up', async () => {
    const { booking } = await bookingService.createBooking(baseBooking());
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.shopId).toBeFalsy();
  });

  it('never books a service mode the repair does not allow', async () => {
    await Repair.updateOne(
      { code: 'screen_replacement', vertical: 'mobile' },
      { $set: { allowedServiceModes: ['workshop'] } },
    );

    await expect(bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'doorstep',
    }))).rejects.toThrow();

    await Repair.updateOne(
      { code: 'screen_replacement', vertical: 'mobile' },
      { $set: { allowedServiceModes: ['doorstep', 'workshop', 'pickup_repair'] } },
    );
  });

  it('is idempotent — a double tap cannot create two bookings', async () => {
    const key = `dup-${Date.now()}`;
    const first = await bookingService.createBooking(baseBooking({ shopId: shop._id, idempotencyKey: key }));
    const second = await bookingService.createBooking(baseBooking({ shopId: shop._id, idempotencyKey: key }));

    expect(second.replayed).toBe(true);
    expect(String(second.booking._id)).toBe(String(first.booking._id));
    expect(await RepairBooking.countDocuments({ idempotencyKey: key })).toBe(1);
  });
});

/**
 * Every status the server can move on from must have a way forward.
 *
 * A technician reached DIAGNOSING on a job whose price was already agreed and
 * found no button: the screen offered "Raise a quote" and nothing else, while
 * the server was perfectly willing to accept REPAIR_IN_PROGRESS. A state the
 * machine can leave but the UI cannot is a stranded job and a phone call.
 */
describe('no state is a dead end', () => {
  const { TRANSITIONS } = require('../src/modules/repair/models/booking.model');

  /** Mirrors nextAction() in WorkerRepairJobPage.jsx. */
  function uiNextAction(status, serviceMode) {
    const collecting = serviceMode === 'pickup_repair';
    const map = {
      PROVIDER_ASSIGNED: 'WORKER_ACCEPTED',
      WORKER_ACCEPTED: collecting ? 'PICKUP_SCHEDULED' : 'ON_THE_WAY',
      ON_THE_WAY: 'ARRIVED',
      ARRIVED: 'DIAGNOSING',
      DIAGNOSING: 'REPAIR_IN_PROGRESS',
      APPROVED: 'REPAIR_IN_PROGRESS',
      REPAIR_IN_PROGRESS: 'QA_PENDING',
      QA_PENDING: collecting ? 'READY_FOR_RETURN' : 'COMPLETED',
      PICKUP_SCHEDULED: 'DEVICE_PICKED_UP',
      DEVICE_PICKED_UP: 'AT_WORKSHOP',
      AT_WORKSHOP: 'DIAGNOSING',
      READY_FOR_RETURN: 'OUT_FOR_RETURN',
      OUT_FOR_RETURN: 'COMPLETED',
    };
    return map[status] || null;
  }

  /**
   * Statuses the technician is not meant to drive out of: waiting on the
   * customer, waiting on a refund, or already finished.
   */
  const NOT_THE_TECHNICIANS_MOVE = [
    'PENDING', 'CONFIRMED', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING',
    'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED',
    'RETURN_REQUIRED', 'REFUND_PENDING', 'REFUNDED',
  ];

  it.each(['workshop', 'pickup_repair'])('offers a way out of every working state (%s)', (mode) => {
    const stranded = Object.entries(TRANSITIONS)
      .filter(([status, onward]) => onward.length > 0
        && !NOT_THE_TECHNICIANS_MOVE.includes(status)
        && !uiNextAction(status, mode))
      .map(([status]) => status);

    expect(stranded).toEqual([]);
  });

  it.each(['workshop', 'pickup_repair'])('only ever offers a move the server allows (%s)', (mode) => {
    const illegal = Object.keys(TRANSITIONS)
      .map((status) => [status, uiNextAction(status, mode)])
      .filter(([status, to]) => to && !TRANSITIONS[status].includes(to));

    expect(illegal).toEqual([]);
  });

  it('walks a pickup job through custody, end to end', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'pickup_repair',
    }));
    const id = booking._id;

    await bookingService.transition(id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    await bookingService.assignWorker({ bookingId: id, shopId: shop._id, workerId: tech._id });
    const actor = { actorRole: 'worker', actorId: String(tech._id) };

    // Exactly the sequence the buttons now produce for a collected device.
    let status = 'WORKER_ACCEPTED';
    const visited = [];
    while (status !== 'COMPLETED') {
      const to = uiNextAction(status, 'pickup_repair');
      expect(to).toBeTruthy();
      if (to === 'COMPLETED') {
        // eslint-disable-next-line no-await-in-loop
        await bookingService.collectCash({ bookingId: id, actorRole: 'worker', actorId: String(tech._id) });
      }
      // The customer's code at every step that moves the device.
      // eslint-disable-next-line no-await-in-loop
      await passGate(id, to, 'pickup_repair', String(tech._id));
      // eslint-disable-next-line no-await-in-loop
      await bookingService.transition(id, to, actor);
      visited.push(to);
      status = to;
    }

    expect(visited).toEqual([
      'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP', 'AT_WORKSHOP', 'DIAGNOSING',
      'REPAIR_IN_PROGRESS', 'QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN', 'COMPLETED',
    ]);
  });
});

/**
 * A device only changes hands with the owner's code.
 *
 * An order proves one moment — work started. A repair has to prove up to three,
 * because the device physically leaves its owner: work starting at their door,
 * the device being collected, and the device coming back. Without these,
 * "collected" and "returned" are a technician tapping a button on their own
 * phone, and a dispute over a device that never came back has nothing on either
 * side.
 */
describe('handover codes', () => {
  const handover = require('../src/modules/repair/services/handover.service');

  it('refuses to collect a device without the customer code', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'pickup_repair',
    }));
    const id = booking._id;
    await bookingService.transition(id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    await bookingService.assignWorker({ bookingId: id, shopId: shop._id, workerId: tech._id });
    const actor = { actorRole: 'worker', actorId: String(tech._id) };
    await bookingService.transition(id, 'PICKUP_SCHEDULED', actor);

    await expect(bookingService.transition(id, 'DEVICE_PICKED_UP', actor))
      .rejects.toMatchObject({ code: 'OTP_REQUIRED', otpKind: 'handover' });
  });

  it('allows it once the right code is given', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'pickup_repair',
    }));
    const id = booking._id;
    await bookingService.transition(id, 'WORKER_ACCEPTED', { actorRole: 'shop', actorId: String(shop._id) });
    await bookingService.assignWorker({ bookingId: id, shopId: shop._id, workerId: tech._id });
    const actor = { actorRole: 'worker', actorId: String(tech._id) };
    await bookingService.transition(id, 'PICKUP_SCHEDULED', actor);

    const code = await handover.issue(id, 'handover');
    expect(code).toMatch(/^[0-9]{6}$/);

    await handover.verify({ bookingId: id, kind: 'handover', code, actorRole: 'worker', actorId: String(tech._id) });
    const moved = await bookingService.transition(id, 'DEVICE_PICKED_UP', actor);
    expect(moved.status).toBe('DEVICE_PICKED_UP');
  });

  it('rejects a wrong code', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({
      shopId: shop._id, serviceMode: 'pickup_repair',
    }));
    await handover.issue(booking._id, 'handover');

    await expect(handover.verify({
      bookingId: booking._id, kind: 'handover', code: '000000',
      actorRole: 'worker', actorId: String(tech._id),
    })).rejects.toMatchObject({ code: 'OTP_INVALID' });
  });

  it('issues the same code twice rather than moving it under the customer', async () => {
    const { booking } = await bookingService.createBooking(baseBooking({ shopId: shop._id }));
    const first = await handover.issue(booking._id, 'start');
    const second = await handover.issue(booking._id, 'start');
    expect(second).toBe(first);
  });

  /**
   * A doorstep repair never leaves the house, so demanding a return code for it
   * would be theatre — and would strand the technician at the last step.
   */
  it('asks for no return code when the device never left', () => {
    expect(handover.gateFor('COMPLETED', 'doorstep')).toBeNull();
    expect(handover.gateFor('COMPLETED', 'pickup_repair')).toBe('return');
    expect(handover.gateFor('REPAIR_IN_PROGRESS', 'doorstep')).toBe('start');
    expect(handover.gateFor('REPAIR_IN_PROGRESS', 'pickup_repair')).toBeNull();
  });
});
