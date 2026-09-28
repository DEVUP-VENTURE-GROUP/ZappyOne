/**
 * Two-wheeler vertical — catalog integrity, product-type scoping, safety gates.
 *
 * Four questions this suite exists to answer:
 *
 *   1. Is the seeded catalog internally consistent? A problem naming a repair
 *      that does not exist is a dead end the customer reaches, not a typo.
 *
 *   2. Does product-type scoping actually hold? A scooter has no chain and an
 *      electric has no spark plug. Asking their owners about either wastes the
 *      one screen where they are telling us what is wrong — and the scoping is
 *      data, so only a test proves it is right.
 *
 *   3. Do the safety gates hold? A swollen lithium pack must never become a
 *      priced repair booking, however much cheaper that answer would be.
 *
 *   4. Do the verticals stay apart? A brake pad must never be offered for a
 *      phone. Sharing one engine is only safe if the scoping holds.
 */

const { startMongo, stopMongo } = require('./helpers');

const Brand = require('../src/modules/service/brand.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const { ProductType } = require('../src/modules/repair/models/catalog.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const diagnostic = require('../src/modules/repair/services/diagnostic.service');
const { SERVICE_MODES } = require('../src/modules/repair/service-modes');
const { VERTICALS } = require('../src/modules/repair/vertical');

const tw = require('../src/modules/repair/seed/two-wheeler.seed');
const twModels = require('../src/modules/repair/seed/two-wheeler-models.seed');
const { FLOWS } = require('../src/modules/repair/seed/two-wheeler-diagnostics.seed');
const mobile = require('../src/modules/repair/seed/catalog.seed');

jest.setTimeout(90000);

const V = 'two_wheeler';
const flowByCode = new Map(FLOWS.map((f) => [f.code, f]));

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: V });

  for (const b of tw.BRANDS) {
    await Brand.create({ code: b.code, name: b.name, category: V, sortOrder: b.sortOrder });
  }
  const brandIds = new Map((await Brand.find({ category: V }).lean()).map((b) => [b.code, b._id]));

  await ProductType.insertMany(tw.PRODUCT_TYPES.map((t) => ({
    code: t.code, name: t.name, vertical: V, displayOrder: t.displayOrder,
  })));

  await DeviceModel.insertMany(twModels.MODELS.map((m) => ({
    code: twModels.toCode(m.brandCode, m.name),
    name: m.name,
    vertical: V,
    brandId: brandIds.get(m.brandCode),
    brandCode: m.brandCode,
    productTypeCode: m.productTypeCode,
  })));

  const cats = {};
  for (const c of tw.PROBLEM_CATEGORIES) {
    const doc = await ProblemCategory.create({ code: c.code, name: c.name, vertical: V, displayOrder: c.displayOrder });
    cats[c.code] = doc._id;
  }

  await Problem.insertMany(tw.PROBLEMS.map((p) => ({
    code: p.code, name: p.name, vertical: V,
    categoryId: cats[p.categoryCode], categoryCode: p.categoryCode,
    candidateRepairCodes: p.candidateRepairCodes || [],
    requiresDiagnosis: !!p.requiresDiagnosis,
    severity: p.severity || 'normal',
    appliesToProductTypeCodes: p.appliesToProductTypeCodes || [],
  })));

  await Repair.insertMany(tw.REPAIRS.map((r) => ({
    code: r.code, name: r.name, vertical: V,
    pricingMode: r.pricingMode,
    requiresDiagnosis: r.pricingMode === 'diagnosis_required',
    minSkillLevel: r.minSkillLevel,
    allowedServiceModes: r.modes,
    estimatedDurationMin: r.durationMin,
    warrantyDays: r.warrantyDays,
    problemCodes: tw.PROBLEMS.filter((p) => (p.candidateRepairCodes || []).includes(r.code)).map((p) => p.code),
  })));

  // A neighbouring vertical, so isolation can actually be observed.
  await Repair.insertMany(mobile.REPAIRS.slice(0, 5).map((r) => ({
    code: r.code, name: r.name, vertical: 'mobile',
    pricingMode: r.pricingMode || 'fixed', minSkillLevel: r.minSkillLevel || 1,
    allowedServiceModes: r.modes || ['doorstep'],
  })));
});

afterAll(async () => { await stopMongo(); });

/* Catalog integrity */

describe('catalog integrity', () => {
  it('registers the vertical and the roadside service mode', () => {
    expect(VERTICALS).toContain(V);
    expect(SERVICE_MODES).toContain('roadside');
  });

  it('has no problem pointing at a repair that does not exist', async () => {
    const codes = new Set((await Repair.find({ vertical: V }).lean()).map((r) => r.code));
    const dangling = [];
    for (const p of await Problem.find({ vertical: V }).lean()) {
      for (const c of p.candidateRepairCodes || []) {
        if (!codes.has(c)) dangling.push(`${p.code} -> ${c}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('has no diagnostic branch recommending a repair that does not exist', async () => {
    const codes = new Set((await Repair.find({ vertical: V }).lean()).map((r) => r.code));
    const dangling = [];
    for (const f of FLOWS) {
      for (const q of f.questions) {
        for (const o of q.options) {
          if (o.recommendedServiceCode && !codes.has(o.recommendedServiceCode)) {
            dangling.push(`${f.code}/${q.id}/${o.id} -> ${o.recommendedServiceCode}`);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('has no diagnostic flow attached to a problem that does not exist', async () => {
    const codes = new Set((await Problem.find({ vertical: V }).lean()).map((p) => p.code));
    const unknown = FLOWS.flatMap((f) => (f.problemCodes || []).filter((c) => !codes.has(c)));
    expect(unknown).toEqual([]);
  });

  it('scopes every problem to product types that actually exist', async () => {
    const types = new Set(tw.PRODUCT_TYPES.map((t) => t.code));
    const bad = [];
    for (const p of await Problem.find({ vertical: V }).lean()) {
      for (const t of p.appliesToProductTypeCodes || []) {
        if (!types.has(t)) bad.push(`${p.code} -> ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('leaves no repair unreachable from any problem', async () => {
    const orphans = (await Repair.find({ vertical: V }).lean())
      .filter((r) => !(r.problemCodes || []).length)
      .map((r) => r.code);
    expect(orphans).toEqual([]);
  });

  it('offers only service modes the engine recognises', async () => {
    const bad = [];
    for (const r of await Repair.find({ vertical: V }).lean()) {
      for (const m of r.allowedServiceModes || []) {
        if (!SERVICE_MODES.includes(m)) bad.push(`${r.code} -> ${m}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('prices nothing as a range', async () => {
    // Faizan's rule: a customer is never shown "₹1,400–₹1,800".
    const ranged = (await Repair.find({ vertical: V, pricingMode: 'range' }).lean()).map((r) => r.code);
    expect(ranged).toEqual([]);
  });

  it('gives every model a real brand and a real vehicle type', async () => {
    const brands = new Set((await Brand.find({ category: V }).lean()).map((b) => b.code));
    const types = new Set(tw.PRODUCT_TYPES.map((t) => t.code));
    const models = await DeviceModel.find({ vertical: V }).lean();

    expect(models.length).toBeGreaterThan(50);
    expect(models.filter((m) => !brands.has(m.brandCode))).toEqual([]);
    expect(models.filter((m) => !types.has(m.productTypeCode))).toEqual([]);
  });
});

/* Product-type scoping */

/** The list a customer on this vehicle type would actually be offered. */
async function problemsFor(productTypeCode) {
  const all = await Problem.find({ vertical: V }).lean();
  return all.filter((p) => !(p.appliesToProductTypeCodes || []).length
    || p.appliesToProductTypeCodes.includes(productTypeCode));
}

describe('a customer is only asked about parts their vehicle has', () => {
  it('never asks a scooter owner about the chain', async () => {
    const shown = await problemsFor('scooter');
    expect(shown.filter((p) => p.categoryCode === 'tw_chain_drive')).toEqual([]);
  });

  it('never asks a motorcycle owner about the CVT belt', async () => {
    const shown = await problemsFor('motorcycle');
    expect(shown.filter((p) => p.categoryCode === 'tw_cvt')).toEqual([]);
  });

  it('never asks an electric owner about spark plugs, fuel or gears', async () => {
    const shown = await problemsFor('electric_scooter');
    const petrolOnly = shown.filter((p) => ['tw_fuel', 'tw_engine', 'tw_clutch_gear', 'tw_cooling']
      .includes(p.categoryCode));
    expect(petrolOnly).toEqual([]);
    expect(shown.find((p) => p.code === 'tw_spark_plug_issue')).toBeUndefined();
  });

  it('never offers a petrol owner the EV categories', async () => {
    const shown = await problemsFor('motorcycle');
    expect(shown.filter((p) => p.categoryCode.startsWith('tw_ev_'))).toEqual([]);
  });

  it('still shows the universal problems to every vehicle type', async () => {
    for (const t of tw.PRODUCT_TYPES.map((x) => x.code)) {
      const shown = await problemsFor(t);
      // Brakes, tyres and punctures exist on all of them.
      expect(shown.find((p) => p.code === 'tw_puncture')).toBeDefined();
      expect(shown.find((p) => p.code === 'tw_front_brake_problem')).toBeDefined();
      expect(shown.length).toBeGreaterThan(80);
    }
  });
});

/* Safety */

describe('safety-critical faults never become a priced repair', () => {
  it('forces diagnosis on every critical problem', async () => {
    const critical = await Problem.find({ vertical: V, severity: 'critical' }).lean();
    expect(critical.length).toBeGreaterThan(0);

    // A critical fault that could be auto-priced is one that could be
    // auto-dispatched to whoever is nearest. Smoke is not a booking.
    const priceable = critical.filter((p) => !p.requiresDiagnosis).map((p) => p.code);
    expect(priceable).toEqual([]);
  });

  it('covers the EV thermal hazards and the fuel leak', async () => {
    const codes = (await Problem.find({ vertical: V, severity: 'critical' }).lean()).map((p) => p.code);
    for (const c of ['tw_ev_battery_swollen', 'tw_ev_battery_smoke', 'tw_ev_battery_leak',
      'tw_ev_battery_overheating', 'tw_fuel_leakage']) {
      expect(codes).toContain(c);
    }
  });

  it('asks about a thermal hazard BEFORE anything else on the EV tree', () => {
    const flow = flowByCode.get('tw_ev_no_power');
    expect(flow.questions[0].id).toBe('hazard');
    // No `showIf` — it can never be skipped past.
    expect(flow.questions[0].showIf).toBeUndefined();
  });

  it('routes a reported hazard to a safety inspection, not a repair', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'tw_ev_battery_not_charging',
      flow: flowByCode.get('tw_ev_no_power'),
      answers: { hazard: 'hazard_yes' },
    });
    // A safety inspection is itself inspection-priced, so the engine correctly
    // refuses to name a firm repair — but it must still be what it points at.
    expect(result.recommendations[0].repairCode).toBe('tw_ev_safety_inspection');
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.primaryRepairCode).toBeNull();
    // Emphatically NOT the cheaper answer the customer came in hoping for.
    expect(result.recommendations.map((r) => r.repairCode)).not.toContain('tw_ev_battery_replacement');
  });

  it('keeps all high-voltage work off the roadside', async () => {
    const hv = await Repair.find({
      vertical: V,
      code: { $in: ['tw_ev_battery_replacement', 'tw_ev_bms_service', 'tw_ev_controller_repair', 'tw_ev_safety_inspection'] },
    }).lean();
    expect(hv.length).toBe(4);
    for (const r of hv) {
      expect(r.allowedServiceModes).not.toContain('roadside');
      expect(r.allowedServiceModes).not.toContain('doorstep');
      expect(r.minSkillLevel).toBe(4);
    }
  });
});

/* Diagnosis: a symptom is not a repair (§10) */

describe('"won\'t start" is triaged, never assumed', () => {
  const flow = () => flowByCode.get('tw_no_start_petrol');

  it('sends an empty tank to fuel delivery, not a battery', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_wont_start_roadside', flow: flow(), answers: { fuel: 'empty' },
    });
    expect(r.primaryRepairCode).toBe('tw_fuel_delivery');
    expect(r.primaryRepairCode).not.toBe('tw_battery_replacement');
  });

  it('reads a single click as the battery', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_wont_start_roadside',
      flow: flow(),
      answers: { fuel: 'has_fuel', lights: 'normal', self_start_sound: 'click' },
    });
    expect(r.primaryRepairCode).toBe('tw_battery_replacement');
  });

  it('reads silence with working lights as the starter motor', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_self_start_not_working',
      flow: flow(),
      answers: { fuel: 'has_fuel', lights: 'normal', self_start_sound: 'silence' },
    });
    expect(r.primaryRepairCode).toBe('tw_starter_repair');
  });

  it('sends a bike that cranks but will not fire after standing to the carburettor', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_engine_not_starting',
      flow: flow(),
      answers: { fuel: 'has_fuel', lights: 'normal', self_start_sound: 'cranks_no_fire', recent_history: 'stood' },
    });
    // Not an engine strip — a bike that sat for a month has stale fuel.
    expect(r.primaryRepairCode).toBe('tw_carburetor_service');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('tw_engine_repair');
  });

  it('escalates a loud noise before the stop to the engine', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_engine_not_starting',
      flow: flow(),
      answers: { fuel: 'has_fuel', lights: 'normal', self_start_sound: 'cranks_no_fire', recent_history: 'noise' },
    });
    // Engine work is inspection-priced, so no firm number is offered — which
    // is the honest outcome for "it made a loud noise and stopped".
    expect(r.recommendations[0].repairCode).toBe('tw_engine_repair');
    expect(r.requiresDiagnosis).toBe(true);
  });
});

describe('the battery tree does not sell the same failure twice', () => {
  it('replaces the battery when a ride recharges it', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_battery_draining',
      flow: flowByCode.get('tw_battery_triage'),
      answers: { age: '1_to_3', after_ride: 'starts_after' },
    });
    expect(r.primaryRepairCode).toBe('tw_battery_replacement');
  });

  it('fixes the CHARGING SYSTEM when a ride does not recharge it', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_battery_draining',
      flow: flowByCode.get('tw_battery_triage'),
      answers: { age: '1_to_3', after_ride: 'still_dead' },
    });
    // Fitting a new battery here would put the customer back in a month.
    expect(r.recommendations[0].repairCode).toBe('tw_stator_repair');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('tw_battery_replacement');
  });
});

describe('puncture triage packs the right kit', () => {
  it('refuses to patch a split sidewall', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_puncture',
      flow: flowByCode.get('tw_puncture_triage'),
      answers: { tyre_type: 'tubeless', condition: 'sidewall' },
    });
    // A sidewall patch fails at speed — this is a replacement, not a repair.
    expect(r.primaryRepairCode).toBe('tw_tyre_replacement');
  });

  it('distinguishes tube from tubeless', async () => {
    const tubeless = await diagnostic.resolve({
      problemCode: 'tw_puncture', flow: flowByCode.get('tw_puncture_triage'),
      answers: { tyre_type: 'tubeless', condition: 'nail' },
    });
    const tube = await diagnostic.resolve({
      problemCode: 'tw_puncture', flow: flowByCode.get('tw_puncture_triage'),
      answers: { tyre_type: 'tube', condition: 'nail' },
    });
    expect(tubeless.primaryRepairCode).toBe('tw_puncture_tubeless');
    expect(tube.primaryRepairCode).toBe('tw_puncture_tube');
  });
});

describe('scooter pickup is a transmission question', () => {
  it('reads revs-without-speed as a slipping CVT belt', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'tw_scooter_poor_pickup',
      flow: flowByCode.get('tw_cvt_triage'),
      answers: { behaviour: 'revs_no_speed' },
    });
    expect(r.primaryRepairCode).toBe('tw_cvt_belt_replacement');
  });

  it('still says belt when the mileage question is also answered', async () => {
    /*
     * The regression this guards against only appears with BOTH answers.
     *
     * Later answers are weighted more heavily, so a supplementary question
     * carrying its own recommendation can outvote the decisive symptom — which
     * is exactly what happened here: a high-mileage scooter with a textbook
     * slipping belt was being recommended a general service instead.
     */
    const r = await diagnostic.resolve({
      problemCode: 'tw_scooter_poor_pickup',
      flow: flowByCode.get('tw_cvt_triage'),
      answers: { behaviour: 'revs_no_speed', distance: 'over_30k' },
    });
    expect(r.primaryRepairCode).toBe('tw_cvt_belt_replacement');
    expect(r.primaryRepairCode).not.toBe('tw_cvt_service');
  });
});

/* Roadside */

describe('roadside work is genuinely offered roadside', () => {
  it('offers the stranding repairs at the roadside', async () => {
    const stranding = await Repair.find({
      vertical: V,
      code: { $in: ['tw_puncture_tubeless', 'tw_puncture_tube', 'tw_jump_start', 'tw_fuel_delivery', 'tw_towing'] },
    }).lean();
    expect(stranding.length).toBe(5);
    for (const r of stranding) expect(r.allowedServiceModes).toContain('roadside');
  });

  it('keeps bench work off the roadside', async () => {
    const bench = await Repair.find({
      vertical: V, code: { $in: ['tw_engine_repair', 'tw_gearbox_repair', 'tw_wheel_alignment'] },
    }).lean();
    for (const r of bench) expect(r.allowedServiceModes).not.toContain('roadside');
  });

  it('marks the strandings urgent so they sort above scheduled work', async () => {
    for (const code of ['tw_wont_start_roadside', 'tw_puncture', 'tw_battery_dead_roadside', 'tw_out_of_fuel']) {
      const p = await Problem.findOne({ vertical: V, code }).lean();
      expect(['high', 'critical']).toContain(p.severity);
    }
  });
});

/* Isolation */

describe('verticals stay apart', () => {
  it('never returns a two-wheeler repair for a phone', async () => {
    const forMobile = await Repair.find({ vertical: 'mobile' }).lean();
    expect(forMobile.length).toBeGreaterThan(0);
    expect(forMobile.filter((r) => r.code.startsWith('tw_'))).toEqual([]);
  });

  it('never returns a phone repair for a two-wheeler', async () => {
    const forTw = await Repair.find({ vertical: V }).lean();
    expect(forTw.every((r) => r.code.startsWith('tw_'))).toBe(true);
  });

  it('keeps the brand lists separate', async () => {
    const twBrands = await Brand.find({ category: V }).lean();
    expect(twBrands.length).toBeGreaterThan(20);
    expect(twBrands.find((b) => b.code === 'hero')).toBeDefined();
    // `honda-2w`, not `honda` — a phone brand and a bike brand must not collide.
    expect(twBrands.find((b) => b.code === 'honda-2w')).toBeDefined();
  });
});
