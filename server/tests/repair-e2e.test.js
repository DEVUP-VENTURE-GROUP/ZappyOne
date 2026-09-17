/**
 * §49 golden-path E2E: Samsung S23 Ultra → cracked screen → diagnosis →
 * repair → provider → booking → worker acceptance → QA → completion.
 *
 * The assertion that matters most is the last one: customer, worker and admin
 * must all be looking at the SAME booking with the same price and status. A
 * system where each side has its own truth is the failure this test exists to
 * catch.
 *
 * Runs against the service layer rather than HTTP so the whole flow is covered
 * without standing up auth plumbing for four different roles.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');

const DiagnosticFlow = require('../src/modules/service/diagnostic-flow.model');
const Brand = require('../src/modules/service/brand.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { Part, PartQuality } = require('../src/modules/repair/models/part.model');
const { ProviderInventory } = require('../src/modules/repair/models/inventory.model');
const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
const { ProviderServiceArea, RepairConfig, QAChecklist } = require('../src/modules/repair/models/config.model');
const { ZappyReferencePricing, ProviderPricing } = require('../src/modules/repair/models/pricing.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { QAInspection, DeviceInspection } = require('../src/modules/repair/models/custody.model');
const Worker = require('../src/modules/worker/worker.model');

const diagnostic = require('../src/modules/repair/services/diagnostic.service');
const matching = require('../src/modules/repair/services/matching.service');
const booking = require('../src/modules/repair/services/booking.service');
const pricing = require('../src/modules/repair/services/pricing.service');

const { FLOWS } = require('../src/modules/repair/seed/diagnostics.seed');
const seed = require('../src/modules/repair/seed/catalog.seed');

jest.setTimeout(90000);

const LAT = 17.4400;
const LNG = 78.3489;
const ctx = {};

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({
    vertical: 'mobile',
    // Stated, not inherited: tax and commission are operator-set in admin and
    // default to 0/10, so a test asserting rupee amounts has to fix its own rates.
    taxPct: 18,
    commissionPct: 15,
  });

  /* Catalog */
  const brand = await Brand.create({ code: 'samsung', name: 'Samsung', category: 'mobile' });
  const model = await DeviceModel.create({
    brandId: brand._id, brandCode: 'samsung',
    name: 'Galaxy S23 Ultra', code: 'samsung-s23-ultra', seriesName: 'Galaxy S23',
  });
  ctx.modelId = model._id;

  const cat = await ProblemCategory.create({ code: 'display', name: 'Display', vertical: 'mobile' });
  await Problem.create({
    code: 'cracked_screen', name: 'Cracked screen',
    categoryId: cat._id, categoryCode: 'display', vertical: 'mobile',
    candidateRepairCodes: ['glass_replacement', 'display_assembly_replacement'],
    diagnosticFlowCode: 'mobile_display',
  });

  await Repair.insertMany(
    seed.REPAIRS
      .filter((r) => ['glass_replacement', 'display_assembly_replacement'].includes(r.code))
      .map((r) => ({
        code: r.code, name: r.name, vertical: 'mobile',
        pricingMode: r.pricingMode, minSkillLevel: r.minSkillLevel,
        allowedServiceModes: r.modes, estimatedDurationMin: r.durationMin,
        warrantyDays: r.warrantyDays, qaChecklistCodes: ['mobile_standard'],
        partRequirements: [{ componentCode: 'display_assembly', required: true, quantity: 1 }],
      })),
  );

  const spec = FLOWS.find((f) => f.code === 'mobile_display');
  ctx.flow = await DiagnosticFlow.create({
    code: spec.code, category: spec.category, title: spec.title, questions: spec.questions,
  });

  await QAChecklist.create({
    ...seed.QA_CHECKLISTS[0], vertical: 'mobile',
  });

  await PartQuality.create({ code: 'premium', name: 'Premium Compatible', rank: 20, isGenuine: false });
  const part = await Part.create({
    sku: 'SCR-S23U-PREM', name: 'S23 Ultra Display (Premium)',
    componentCode: 'display_assembly', brandCode: 'samsung',
    compatibleModelCodes: ['samsung-s23-ultra'], qualityCode: 'premium',
  });
  ctx.partId = part._id;

  /* Zappy reference band */
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'display_assembly_replacement',
    brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'premium',
    minPaise: 1800000, recommendedPaise: 2000000, maxPaise: 2300000,
    partCostPaise: 1500000, labourPaise: 500000, warrantyDays: 180,
  });

  /* Provider */
  const worker = await Worker.create({
    phone: '9876500001', name: 'Ravi Repairs', rating: 4.8, completedJobs: 120,
    skills: ['display_assembly_replacement'], kyc: { status: 'approved' },
  });
  ctx.workerId = worker._id;

  await ProviderServiceArea.create({
    workerId: worker._id, cityCode: 'hyderabad',
    center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 15,
    serviceModes: ['doorstep', 'workshop', 'pickup_repair'],
  });
  await ProviderCapability.create({
    workerId: worker._id, vertical: 'mobile',
    repairCode: 'display_assembly_replacement',
    brandCodes: ['samsung'], qualityCodes: ['premium'],
    serviceModes: ['doorstep', 'workshop', 'pickup_repair'],
    skillLevel: 3, verificationStatus: 'approved', estimatedDurationMin: 60,
  });
  await ProviderPricing.create({
    workerId: worker._id, vertical: 'mobile',
    repairCode: 'display_assembly_replacement',
    brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'premium',
    partCostPaise: 1550000, labourPaise: 450000, totalPaise: 2000000,
    warrantyDays: 180, approvalStatus: 'approved',
  });
  await ProviderInventory.create({
    workerId: worker._id, partId: part._id, partSku: 'SCR-S23U-PREM',
    quantity: 4, costPaise: 1500000,
  });

  ctx.userId = new mongoose.Types.ObjectId();
});

afterAll(async () => { await stopMongo(); });

describe('§49 golden path — doorstep display replacement', () => {
  it('1. diagnoses the symptom into a concrete repair', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'cracked_screen',
      flow: ctx.flow,
      // Panel dead → this really is a full assembly, not glass-only.
      answers: { display_on: 'yes', touch_works: 'no' },
    });
    expect(result.primaryRepairCode).toBe('display_assembly_replacement');
    expect(result.requiresDiagnosis).toBe(false);
    ctx.diagnosis = result;
  });

  it('2. finds an eligible provider with a real price', async () => {
    const res = await matching.findProviders({
      vertical: 'mobile',
      repairCode: 'display_assembly_replacement',
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      qualityCode: 'premium', serviceMode: 'doorstep',
      lat: LAT, lng: LNG, cityCode: 'hyderabad',
    });
    expect(res.recommended).toBeTruthy();
    expect(res.recommended.totalPaise).toBe(2000000);
    expect(String(res.recommended.workerId)).toBe(String(ctx.workerId));
    ctx.provider = res.recommended;
  });

  it('3. creates a booking with a frozen price snapshot', async () => {
    const { booking: b } = await booking.createBooking({
      userId: ctx.userId,
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra', modelId: ctx.modelId,
      problemCodes: ['cracked_screen'],
      diagnosticFlowCode: 'mobile_display',
      diagnosticAnswers: { display_on: 'yes', touch_works: 'no' },
      repairCode: 'display_assembly_replacement',
      qualityCode: 'premium',
      serviceMode: 'doorstep',
      workerId: ctx.workerId,
      zappyRecommended: true,
      location: { coordinates: [LNG, LAT], address: '12 Test Street, Hyderabad', cityCode: 'hyderabad' },
      idempotencyKey: 'e2e-booking-1',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(b._id);

    // Auto-advanced so the chosen provider is actually notified — a booking
    // left at PENDING was invisible to the worker it had been assigned to.
    expect(b.status).toBe('PROVIDER_ASSIGNED');
    expect(b.priceSnapshot.subtotalPaise).toBe(2000000);
    expect(b.priceSnapshot.taxPaise).toBe(360000);   // 18%
    expect(b.priceSnapshot.totalPaise).toBe(2360000);
    expect(b.priceSnapshot.isEstimate).toBe(false);
    expect(b.reference).toMatch(/^ZR/);
    ctx.bookingId = b._id;
  });

  it('4. reserved exactly one unit of stock', async () => {
    const inv = await ProviderInventory.findOne({ workerId: ctx.workerId, partId: ctx.partId }).lean();
    expect(inv.reserved).toBe(1);
    expect(inv.quantity).toBe(4);
  });

  it('5. is idempotent — replaying the request returns the same booking', async () => {
    const { booking: b, replayed } = await booking.createBooking({
      userId: ctx.userId,
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      repairCode: 'display_assembly_replacement', qualityCode: 'premium',
      serviceMode: 'doorstep', workerId: ctx.workerId,
      location: { coordinates: [LNG, LAT], address: '12 Test Street, Hyderabad', cityCode: 'hyderabad' },
      idempotencyKey: 'e2e-booking-1',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(b._id);
    expect(replayed).toBe(true);
    expect(String(b._id)).toBe(String(ctx.bookingId));

    const inv = await ProviderInventory.findOne({ workerId: ctx.workerId, partId: ctx.partId }).lean();
    expect(inv.reserved).toBe(1); // not double-reserved
  });

  it('6. walks the worker lifecycle to the point of QA', async () => {
    // CONFIRMED and PROVIDER_ASSIGNED already happened at creation.
    const steps = ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED'];
    for (const s of steps) {
      const b = await booking.transition(ctx.bookingId, s, { actorRole: 'worker', actorId: ctx.workerId });
      expect(b.status).toBe(s);
    }

    await DeviceInspection.create({
      bookingId: ctx.bookingId, stage: 'check_in',
      imei: '350000000000001', powersOn: true,
      performedByWorkerId: ctx.workerId,
    });

    const b = await booking.transition(ctx.bookingId, 'REPAIR_IN_PROGRESS', { actorRole: 'worker', actorId: ctx.workerId });
    expect(b.status).toBe('REPAIR_IN_PROGRESS');
  });

  it('7. refuses completion until QA has actually passed', async () => {
    await booking.transition(ctx.bookingId, 'QA_PENDING', { actorRole: 'worker', actorId: ctx.workerId });

    // No QA record yet.
    await expect(
      booking.transition(ctx.bookingId, 'COMPLETED', { actorRole: 'worker', actorId: ctx.workerId }),
    ).rejects.toMatchObject({ code: 'QA_REQUIRED' });

    // A failing required item must also block.
    await QAInspection.create({
      bookingId: ctx.bookingId, stage: 'after', checklistCode: 'mobile_standard',
      results: [
        { itemCode: 'display', label: 'Display', required: true, result: 'pass' },
        { itemCode: 'touch', label: 'Touch', required: true, result: 'fail' },
      ],
      performedByWorkerId: ctx.workerId,
    });

    await expect(
      booking.transition(ctx.bookingId, 'COMPLETED', { actorRole: 'worker', actorId: ctx.workerId }),
    ).rejects.toMatchObject({ code: 'QA_FAILED' });
  });

  it('8. completes once QA passes, and consumes the reserved stock', async () => {
    await QAInspection.create({
      bookingId: ctx.bookingId, stage: 'after', checklistCode: 'mobile_standard',
      results: [
        { itemCode: 'display', label: 'Display', required: true, result: 'pass' },
        { itemCode: 'touch', label: 'Touch', required: true, result: 'pass' },
        { itemCode: 'charging', label: 'Charging', required: true, result: 'pass' },
      ],
      performedByWorkerId: ctx.workerId,
    });

    // A cash job cannot be completed before the technician has the money —
    // completion settles commission on the assumption they were paid.
    await expect(
      booking.transition(ctx.bookingId, 'COMPLETED', { actorRole: 'worker', actorId: ctx.workerId }),
    ).rejects.toMatchObject({ code: 'CASH_NOT_COLLECTED' });

    await booking.collectCash({
      bookingId: ctx.bookingId, actorRole: 'worker', actorId: ctx.workerId,
    });

    const b = await booking.transition(ctx.bookingId, 'COMPLETED', { actorRole: 'worker', actorId: ctx.workerId });
    expect(b.status).toBe('COMPLETED');
    expect(b.paymentStatus).toBe('paid');
    expect(b.completedAt).toBeTruthy();

    const inv = await ProviderInventory.findOne({ workerId: ctx.workerId, partId: ctx.partId }).lean();
    expect(inv.quantity).toBe(3);  // consumed
    expect(inv.reserved).toBe(0);  // released
  });

  it('9. shows customer, worker and admin the SAME booking', async () => {
    const record = await RepairBooking.findById(ctx.bookingId).lean();

    // Customer view — scoped to their own id.
    const customerView = await RepairBooking.findOne({ _id: ctx.bookingId, userId: ctx.userId }).lean();
    // Worker view — scoped to the assigned worker.
    const workerView = await RepairBooking.findOne({ _id: ctx.bookingId, workerId: ctx.workerId }).lean();
    // Admin view — unscoped.
    const adminView = await RepairBooking.findById(ctx.bookingId).lean();

    for (const view of [customerView, workerView, adminView]) {
      expect(view).toBeTruthy();
      expect(String(view._id)).toBe(String(record._id));
      expect(view.status).toBe('COMPLETED');
      expect(view.priceSnapshot.totalPaise).toBe(2360000);
      expect(view.reference).toBe(record.reference);
    }
  });

  it('10. denies a different customer access to the booking', async () => {
    const stranger = new mongoose.Types.ObjectId();
    expect(() =>
      booking.assertActorMayAct({ userId: ctx.userId, workerId: ctx.workerId }, 'customer', stranger),
    ).toThrow(/do not have access/);
  });

  it('11. leaves the price untouched when the catalog is re-priced afterwards', async () => {
    const current = await ZappyReferencePricing.findOne({ modelCode: 'samsung-s23-ultra', supersededAt: null });
    current.supersededAt = new Date();
    await current.save();
    await ZappyReferencePricing.create({
      vertical: 'mobile', repairCode: 'display_assembly_replacement',
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'premium',
      minPaise: 2500000, recommendedPaise: 2800000, maxPaise: 3000000,
      version: 2, supersedesId: current._id,
    });
    pricing.invalidateConfigCache();

    const after = await RepairBooking.findById(ctx.bookingId).lean();
    // The completed booking must still hold the price it was sold at.
    expect(after.priceSnapshot.totalPaise).toBe(2360000);
  });
});

describe('§28 pickup & repair path', () => {
  it('runs diagnosis → quote → approval → pickup → workshop → return', async () => {
    const { booking: b } = await booking.createBooking({
      userId: ctx.userId,
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      problemCodes: ['cracked_screen'],
      repairCode: 'display_assembly_replacement', qualityCode: 'premium',
      serviceMode: 'pickup_repair',
      workerId: ctx.workerId,
      location: { coordinates: [LNG, LAT], address: '12 Test Street', cityCode: 'hyderabad' },
      idempotencyKey: 'e2e-pickup-1',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(b._id);

    await booking.transition(b._id, 'WORKER_ACCEPTED', { actorRole: 'worker', actorId: ctx.workerId });

    // §28 opens with a HOME diagnosis, so the worker travels and arrives first.
    await booking.transition(b._id, 'ON_THE_WAY', { actorRole: 'worker', actorId: ctx.workerId });
    await booking.transition(b._id, 'ARRIVED', { actorRole: 'worker', actorId: ctx.workerId });

    // Worker quotes after inspecting.
    const { quote } = await booking.submitQuote({
      bookingId: b._id,
      actorRole: 'worker', actorId: ctx.workerId,
      diagnosisSummary: 'Panel and digitizer both failed; full assembly required.',
      repairCode: 'display_assembly_replacement',
      qualityCode: 'premium',
      warrantyDays: 180,
      items: [
        { kind: 'part', label: 'Display assembly (Premium)', unitPricePaise: 1550000, quantity: 1 },
        { kind: 'labour', label: 'Fitting + calibration', unitPricePaise: 450000, quantity: 1 },
      ],
      idempotencyKey: 'e2e-quote-1',
    });

    expect(quote.revision).toBe(1);
    expect(quote.subtotalPaise).toBe(2000000);
    expect(quote.status).toBe('sent');

    const afterQuote = await RepairBooking.findById(b._id).lean();
    expect(afterQuote.status).toBe('CUSTOMER_APPROVAL_PENDING');

    // Customer approves — the quote becomes the authoritative price.
    const { booking: approved } = await booking.respondToQuote({
      quoteId: quote._id, userId: ctx.userId, decision: 'approve',
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.priceSnapshot.totalPaise).toBe(2360000);
    expect(approved.priceSnapshot.isEstimate).toBe(false);

    for (const s of ['PICKUP_SCHEDULED', 'DEVICE_PICKED_UP', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'QA_PENDING']) {
      await booking.transition(b._id, s, { actorRole: 'worker', actorId: ctx.workerId });
    }

    await QAInspection.create({
      bookingId: b._id, stage: 'after', checklistCode: 'mobile_standard',
      results: [{ itemCode: 'display', label: 'Display', required: true, result: 'pass' }],
      performedByWorkerId: ctx.workerId,
    });

    await booking.transition(b._id, 'READY_FOR_RETURN', { actorRole: 'worker', actorId: ctx.workerId });
    await booking.transition(b._id, 'OUT_FOR_RETURN', { actorRole: 'worker', actorId: ctx.workerId });

    // Payment happens on handover, which is the moment the device goes back.
    await booking.collectCash({ bookingId: b._id, actorRole: 'worker', actorId: ctx.workerId });

    const done = await booking.transition(b._id, 'COMPLETED', { actorRole: 'worker', actorId: ctx.workerId });

    expect(done.status).toBe('COMPLETED');
  });

  it('refuses to quote before the device has been seen', async () => {
    const { booking: b } = await booking.createBooking({
      userId: ctx.userId,
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      repairCode: 'display_assembly_replacement', qualityCode: 'premium',
      serviceMode: 'doorstep', workerId: ctx.workerId,
      location: { coordinates: [LNG, LAT], address: '12 Test Street', cityCode: 'hyderabad' },
      idempotencyKey: 'e2e-premature-quote',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(b._id);
    await booking.transition(b._id, 'WORKER_ACCEPTED', { actorRole: 'worker', actorId: ctx.workerId });

    // Quoting from WORKER_ACCEPTED once silently created a quote the customer
    // was never asked to approve. It must now fail loudly instead.
    await expect(booking.submitQuote({
      bookingId: b._id, actorRole: 'worker', actorId: ctx.workerId,
      diagnosisSummary: 'Guessing before arrival.',
      repairCode: 'display_assembly_replacement',
      items: [{ kind: 'part', label: 'Display', unitPricePaise: 2000000, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'NOT_QUOTABLE' });

    const after = await RepairBooking.findById(b._id).lean();
    expect(after.status).toBe('WORKER_ACCEPTED');
    expect(after.activeQuoteId).toBeNull();
  });

  it('§31 — a second quote supersedes rather than edits the approved one', async () => {
    const { booking: b } = await booking.createBooking({
      userId: ctx.userId,
      brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      repairCode: 'display_assembly_replacement', qualityCode: 'premium',
      serviceMode: 'workshop', workerId: ctx.workerId,
      location: { coordinates: [LNG, LAT], address: '12 Test Street', cityCode: 'hyderabad' },
      idempotencyKey: 'e2e-revision-1',
    });

    // The customer gave their handover codes; this suite is not about that.
    await passHandoverGates(b._id);
    await booking.transition(b._id, 'WORKER_ACCEPTED', { actorRole: 'worker', actorId: ctx.workerId });
    await booking.transition(b._id, 'ON_THE_WAY', { actorRole: 'worker', actorId: ctx.workerId });
    await booking.transition(b._id, 'ARRIVED', { actorRole: 'worker', actorId: ctx.workerId });

    const first = await booking.submitQuote({
      bookingId: b._id, actorRole: 'worker', actorId: ctx.workerId,
      diagnosisSummary: 'Display only.', repairCode: 'display_assembly_replacement',
      items: [{ kind: 'part', label: 'Display', unitPricePaise: 2000000, quantity: 1 }],
    });

    const second = await booking.submitQuote({
      bookingId: b._id, actorRole: 'worker', actorId: ctx.workerId,
      diagnosisSummary: 'Frame damage found as well.', repairCode: 'display_assembly_replacement',
      items: [
        { kind: 'part', label: 'Display', unitPricePaise: 2000000, quantity: 1 },
        { kind: 'part', label: 'Frame', unitPricePaise: 400000, quantity: 1 },
      ],
    });

    expect(second.quote.revision).toBe(2);
    expect(String(second.quote.supersedesId)).toBe(String(first.quote._id));

    const { RepairQuote } = require('../src/modules/repair/models/quote.model');
    const old = await RepairQuote.findById(first.quote._id).lean();
    expect(old.status).toBe('superseded');
    // The original figure is preserved, not rewritten.
    expect(old.subtotalPaise).toBe(2000000);
  });
});
