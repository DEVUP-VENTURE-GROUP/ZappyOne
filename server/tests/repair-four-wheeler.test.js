/**
 * Four-wheeler vertical — catalog integrity, dual scoping, safety gates.
 *
 * What this suite exists to prove, beyond the two-wheeler equivalent:
 *
 *   1. TWO INDEPENDENT SCOPES HOLD. A car's body and its powertrain vary
 *      separately, so a symptom is filtered by both. An EV owner must never be
 *      asked about spark plugs; a petrol owner never about a CNG regulator;
 *      only a diesel owner about a DPF.
 *
 *   2. A WARNING LIGHT NEVER BECOMES A PART. Check-engine, ABS, airbag and
 *      ADAS faults name a SYSTEM. Quoting a component off a dashboard symbol is
 *      inventing a number, so all of them stay diagnosis-required.
 *
 *   3. "AC NOT COOLING" IS NOT "GAS REFILL". The single most common way this
 *      category overcharges people, and the tree that prevents it is tested
 *      branch by branch.
 *
 *   4. TWO DANGEROUS FUEL SYSTEMS ARE GATED. High-voltage packs and CNG
 *      cylinders both route to an inspection, never to a priced repair.
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

const fw = require('../src/modules/repair/seed/four-wheeler.seed');
const fwModels = require('../src/modules/repair/seed/four-wheeler-models.seed');
const { FLOWS } = require('../src/modules/repair/seed/four-wheeler-diagnostics.seed');

jest.setTimeout(90000);

const V = 'four_wheeler';
const flowByCode = new Map(FLOWS.map((f) => [f.code, f]));

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: V });

  for (const b of fw.BRANDS) {
    await Brand.create({ code: b.code, name: b.name, category: V, sortOrder: b.sortOrder });
  }
  const brandIds = new Map((await Brand.find({ category: V }).lean()).map((b) => [b.code, b._id]));

  await ProductType.insertMany(fw.PRODUCT_TYPES.map((t) => ({
    code: t.code, name: t.name, vertical: V, displayOrder: t.displayOrder,
  })));

  await DeviceModel.insertMany(fwModels.MODELS.map((m) => ({
    code: fwModels.toCode(m.brandCode, m.name),
    name: m.name,
    vertical: V,
    brandId: brandIds.get(m.brandCode),
    brandCode: m.brandCode,
    productTypeCode: m.productTypeCode,
    fuelTypes: m.fuelTypes,
  })));

  const cats = {};
  for (const c of fw.PROBLEM_CATEGORIES) {
    const doc = await ProblemCategory.create({ code: c.code, name: c.name, vertical: V, displayOrder: c.displayOrder });
    cats[c.code] = doc._id;
  }

  await Problem.insertMany(fw.PROBLEMS.map((p) => ({
    code: p.code, name: p.name, vertical: V,
    categoryId: cats[p.categoryCode], categoryCode: p.categoryCode,
    candidateRepairCodes: p.candidateRepairCodes || [],
    requiresDiagnosis: !!p.requiresDiagnosis,
    severity: p.severity || 'normal',
    appliesToProductTypeCodes: p.appliesToProductTypeCodes || [],
    appliesToFuelTypes: p.appliesToFuelTypes || [],
  })));

  await Repair.insertMany(fw.REPAIRS.map((r) => ({
    code: r.code, name: r.name, vertical: V,
    pricingMode: r.pricingMode,
    requiresDiagnosis: r.pricingMode === 'diagnosis_required',
    minSkillLevel: r.minSkillLevel,
    allowedServiceModes: r.modes,
    estimatedDurationMin: r.durationMin,
    warrantyDays: r.warrantyDays,
    problemCodes: fw.PROBLEMS.filter((p) => (p.candidateRepairCodes || []).includes(r.code)).map((p) => p.code),
  })));
});

afterAll(async () => { await stopMongo(); });

/* Catalog integrity */

describe('catalog integrity', () => {
  it('registers the vertical', () => {
    expect(VERTICALS).toContain(V);
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
    expect(FLOWS.flatMap((f) => (f.problemCodes || []).filter((c) => !codes.has(c)))).toEqual([]);
  });

  it('scopes every problem to body types and fuels that exist', async () => {
    const types = new Set(fw.PRODUCT_TYPES.map((t) => t.code));
    const fuels = new Set(fw.FUEL_TYPES.map((f) => f.code));
    const bad = [];
    for (const p of await Problem.find({ vertical: V }).lean()) {
      for (const t of p.appliesToProductTypeCodes || []) if (!types.has(t)) bad.push(`${p.code} type ${t}`);
      for (const f of p.appliesToFuelTypes || []) if (!fuels.has(f)) bad.push(`${p.code} fuel ${f}`);
    }
    expect(bad).toEqual([]);
  });

  it('leaves no repair unreachable from any problem', async () => {
    const orphans = (await Repair.find({ vertical: V }).lean())
      .filter((r) => !(r.problemCodes || []).length).map((r) => r.code);
    expect(orphans).toEqual([]);
  });

  it('offers only service modes the engine recognises, and prices nothing as a range', async () => {
    const bad = [];
    for (const r of await Repair.find({ vertical: V }).lean()) {
      for (const m of r.allowedServiceModes || []) if (!SERVICE_MODES.includes(m)) bad.push(`${r.code} -> ${m}`);
    }
    expect(bad).toEqual([]);
    expect((await Repair.find({ vertical: V, pricingMode: 'range' }).lean()).map((r) => r.code)).toEqual([]);
  });

  it('gives every model a real brand, body type and at least one fuel', async () => {
    const brands = new Set((await Brand.find({ category: V }).lean()).map((b) => b.code));
    const types = new Set(fw.PRODUCT_TYPES.map((t) => t.code));
    const fuels = new Set(fw.FUEL_TYPES.map((f) => f.code));
    const models = await DeviceModel.find({ vertical: V }).lean();

    expect(models.length).toBeGreaterThan(80);
    expect(models.filter((m) => !brands.has(m.brandCode))).toEqual([]);
    expect(models.filter((m) => !types.has(m.productTypeCode))).toEqual([]);
    expect(models.filter((m) => !(m.fuelTypes || []).length).map((m) => m.code)).toEqual([]);
    expect(models.filter((m) => (m.fuelTypes || []).some((f) => !fuels.has(f)))).toEqual([]);
  });
});

/* Dual scoping */

/** What a customer on this exact car would actually be offered. */
async function problemsFor(productTypeCode, fuelType) {
  const all = await Problem.find({ vertical: V }).lean();
  return all.filter((p) => {
    const typeOk = !(p.appliesToProductTypeCodes || []).length
      || p.appliesToProductTypeCodes.includes(productTypeCode);
    const fuelOk = !(p.appliesToFuelTypes || []).length
      || p.appliesToFuelTypes.includes(fuelType);
    return typeOk && fuelOk;
  });
}

describe('a customer is only asked about systems their car has', () => {
  it('never asks an EV owner about spark plugs, fuel, exhaust or the engine', async () => {
    const shown = await problemsFor('suv', 'electric');
    const impossible = shown.filter((p) => ['fw_engine', 'fw_fuel', 'fw_cng', 'fw_exhaust', 'fw_clutch']
      .includes(p.categoryCode));
    expect(impossible).toEqual([]);
    expect(shown.find((p) => p.code === 'fw_spark_plug_issue')).toBeUndefined();
    expect(shown.find((p) => p.code === 'fw_oil_change_req')).toBeUndefined();
  });

  it('never asks a petrol owner about the CNG system or the EV battery', async () => {
    const shown = await problemsFor('hatchback', 'petrol');
    expect(shown.filter((p) => p.categoryCode === 'fw_cng')).toEqual([]);
    expect(shown.filter((p) => p.categoryCode.startsWith('fw_ev_'))).toEqual([]);
  });

  it('asks a CNG owner about the CNG system, and nobody else', async () => {
    const cng = await problemsFor('hatchback', 'cng');
    expect(cng.find((p) => p.code === 'fw_cng_not_switching')).toBeDefined();
    expect(cng.find((p) => p.code === 'fw_cng_leak')).toBeDefined();

    for (const f of ['petrol', 'diesel', 'electric', 'hybrid']) {
      const other = await problemsFor('hatchback', f);
      expect(other.find((p) => p.code === 'fw_cng_not_switching')).toBeUndefined();
    }
  });

  it('asks only a diesel owner about the DPF', async () => {
    expect((await problemsFor('suv', 'diesel')).find((p) => p.code === 'fw_dpf_issue')).toBeDefined();
    for (const f of ['petrol', 'cng', 'electric', 'hybrid']) {
      expect((await problemsFor('suv', f)).find((p) => p.code === 'fw_dpf_issue')).toBeUndefined();
    }
  });

  it('shows a hybrid BOTH the engine and the EV battery — it has both', async () => {
    const shown = await problemsFor('muv', 'hybrid');
    expect(shown.find((p) => p.code === 'fw_rough_idle')).toBeDefined();
    expect(shown.find((p) => p.code === 'fw_ev_reduced_range')).toBeDefined();
  });

  it('still shows the universal problems to every car', async () => {
    for (const t of fw.PRODUCT_TYPES.map((x) => x.code)) {
      for (const f of fw.FUEL_TYPES.map((x) => x.code)) {
        const shown = await problemsFor(t, f);
        expect(shown.find((p) => p.code === 'fw_flat_tyre')).toBeDefined();
        expect(shown.find((p) => p.code === 'fw_ac_not_cooling')).toBeDefined();
        expect(shown.find((p) => p.code === 'fw_brake_noise')).toBeDefined();
        expect(shown.length).toBeGreaterThan(90);
      }
    }
  });
});

/* AC: the §24 worked example */

describe('"AC not cooling" does not become an automatic gas refill', () => {
  const flow = () => flowByCode.get('fw_ac_triage');

  it('sends no-air-at-all to the blower, not to refrigerant', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_ac_not_cooling', flow: flow(), vertical: V,
      answers: { airflow: 'no_air' },
    });
    expect(r.primaryRepairCode).toBe('fw_ac_blower_repair');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('fw_ac_gas_refill');
  });

  it('sends a compressor that never engages to diagnosis, not to a refill', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_ac_not_cooling', flow: flow(), vertical: V,
      answers: { airflow: 'good_air', compressor: 'no_engage' },
    });
    // Gas into a system whose compressor never runs is money spent on nothing.
    expect(r.primaryRepairCode).toBe('fw_ac_diagnosis');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('fw_ac_gas_refill');
  });

  it('reads short-cycling as genuinely low refrigerant', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_ac_not_cooling', flow: flow(), vertical: V,
      answers: { airflow: 'good_air', compressor: 'cycles_fast' },
    });
    expect(r.primaryRepairCode).toBe('fw_ac_gas_refill');
  });

  it('reads warm-only-in-traffic as the condenser, never a refill', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_ac_not_cooling', flow: flow(), vertical: V,
      answers: { airflow: 'good_air', compressor: 'engages', history: 'only_idle' },
    });
    // Condenser work is inspection-priced, so no firm number is offered — but
    // it must still be what the tree points at, and never a refill.
    expect(r.recommendations[0].repairCode).toBe('fw_ac_condenser_repair');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('fw_ac_gas_refill');
  });

  it('escalates a grinding compressor', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_ac_compressor_noise', flow: flow(), vertical: V,
      answers: { airflow: 'good_air', compressor: 'noise' },
    });
    expect(r.recommendations[0].repairCode).toBe('fw_ac_compressor_repair');
    expect(r.urgency).toBe('high');
  });
});

/* Safety */

describe('dangerous faults never become a priced repair', () => {
  it('forces diagnosis on every critical problem', async () => {
    const critical = await Problem.find({ vertical: V, severity: 'critical' }).lean();
    expect(critical.length).toBeGreaterThan(5);
    expect(critical.filter((p) => !p.requiresDiagnosis).map((p) => p.code)).toEqual([]);
  });

  it('routes a high-voltage hazard to an inspection', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_ev_not_charging', flow: flowByCode.get('fw_ev_triage'), vertical: V,
      answers: { hazard: 'hazard_yes' },
    });
    expect(r.recommendations[0].repairCode).toBe('fw_ev_safety_inspection');
    expect(r.requiresDiagnosis).toBe(true);
    expect(r.urgency).toBe('urgent');
  });

  it('routes a smell of gas to a CNG inspection, not a service', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_cng_not_switching', flow: flowByCode.get('fw_cng_triage'), vertical: V,
      answers: { leak: 'leak_yes' },
    });
    expect(r.recommendations[0].repairCode).toBe('fw_cng_safety_inspection');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('fw_cng_system_service');
    expect(r.urgency).toBe('urgent');
  });

  it('asks the hazard question FIRST and unskippably on both dangerous trees', () => {
    for (const [code, qid] of [['fw_ev_triage', 'hazard'], ['fw_cng_triage', 'leak']]) {
      const flow = flowByCode.get(code);
      expect(flow.questions[0].id).toBe(qid);
      expect(flow.questions[0].showIf).toBeUndefined();
    }
  });

  it('keeps high-voltage, CNG and ADAS work in a workshop', async () => {
    const gated = await Repair.find({
      vertical: V,
      code: { $in: ['fw_ev_bms_service', 'fw_ev_safety_inspection', 'fw_cng_safety_inspection', 'fw_adas_calibration'] },
    }).lean();
    expect(gated.length).toBe(4);
    for (const r of gated) {
      expect(r.allowedServiceModes).not.toContain('roadside');
      expect(r.allowedServiceModes).not.toContain('doorstep');
      expect(r.minSkillLevel).toBe(4);
    }
  });

  it('never treats a deployed airbag or accident damage as an ordinary job', async () => {
    // `critical` is reserved for hazards that must never be auto-dispatched at
    // all — a fired pyrotechnic charge and a collision-damaged structure.
    for (const code of ['fw_airbag_deployed', 'fw_accident_damage', 'fw_airbag_warning']) {
      const p = await Problem.findOne({ vertical: V, code }).lean();
      expect(p.severity).toBe('critical');
      expect(p.requiresDiagnosis).toBe(true);
    }

    // A car that cannot be moved is a RECOVERY, not a hazard: urgent, but the
    // job is well understood. Towing stays diagnosis-priced because the
    // distance is not known when the customer taps the button.
    const stuck = await Problem.findOne({ vertical: V, code: 'fw_vehicle_immobilised' }).lean();
    expect(stuck.severity).toBe('high');
    const tow = await Repair.findOne({ vertical: V, code: 'fw_towing' }).lean();
    expect(tow.requiresDiagnosis).toBe(true);
  });
});

/* Warning lights are systems, not parts */

describe('a warning light is never quoted as a component', () => {
  it('keeps every dashboard-warning problem diagnosis-required', async () => {
    const lights = await Problem.find({
      vertical: V,
      code: { $in: ['fw_check_engine_light', 'fw_abs_warning', 'fw_airbag_warning', 'fw_adas_warning', 'fw_esc_warning', 'fw_emission_warning'] },
    }).lean();
    expect(lights.length).toBe(6);
    expect(lights.filter((p) => !p.requiresDiagnosis).map((p) => p.code)).toEqual([]);
  });

  it('sends a car that still drives to a scan', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_check_engine_light', flow: flowByCode.get('fw_warning_light'), vertical: V,
      answers: { colour: 'amber', behaviour: 'drives_fine' },
    });
    expect(r.recommendations[0].repairCode).toBe('fw_obd_scan');
  });

  it('sends an undriveable car to recovery, not to a workshop booking', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_unknown_warning_light', flow: flowByCode.get('fw_warning_light'), vertical: V,
      answers: { colour: 'red', behaviour: 'undriveable' },
    });
    expect(r.recommendations[0].repairCode).toBe('fw_towing');
    expect(r.urgency).toBe('urgent');
  });
});

/* Starting, overheating, roadside */

describe('starting is triaged, never assumed', () => {
  const flow = () => flowByCode.get('fw_no_start');

  it('reads a single click as the battery', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_wont_start_roadside', flow: flow(), vertical: V,
      answers: { dash: 'normal', crank: 'click' },
    });
    expect(r.primaryRepairCode).toBe('fw_battery_replacement');
  });

  it('reads silence with good lights as the starter', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_no_crank', flow: flow(), vertical: V,
      answers: { dash: 'normal', crank: 'silence' },
    });
    expect(r.recommendations[0].repairCode).toBe('fw_starter_repair');
  });

  it('sends cranks-but-wont-fire with a warning light to a scan, not a part', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_cranks_no_start', flow: flow(), vertical: V,
      answers: { dash: 'normal', crank: 'cranks_no_fire', context: 'warning_light' },
    });
    expect(r.primaryRepairCode).toBe('fw_obd_scan');
  });
});

describe('overheating stops the customer driving on', () => {
  it('recovers a car that is overheating right now', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_overheating_roadside', flow: flowByCode.get('fw_overheating_triage'), vertical: V,
      answers: { driving_now: 'driving' },
    });
    // Driving on destroys the engine within minutes — this is a recovery, not
    // an appointment.
    expect(r.recommendations[0].repairCode).toBe('fw_towing');
    expect(r.urgency).toBe('urgent');
  });

  it('reads overheating only in traffic as the cooling fan', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'fw_engine_overheating', flow: flowByCode.get('fw_overheating_triage'), vertical: V,
      answers: { driving_now: 'stopped', when: 'in_traffic', coolant: 'no_leak' },
    });
    expect(r.primaryRepairCode).toBe('fw_radiator_fan_replacement');
  });
});

describe('roadside work is genuinely offered roadside', () => {
  it('offers the strandings at the roadside', async () => {
    const stranding = await Repair.find({
      vertical: V,
      code: { $in: ['fw_jump_start', 'fw_puncture_repair', 'fw_fuel_delivery', 'fw_towing', 'fw_spare_wheel_fitment'] },
    }).lean();
    expect(stranding.length).toBe(5);
    for (const r of stranding) expect(r.allowedServiceModes).toContain('roadside');
  });

  it('keeps rig-bound work in the workshop', async () => {
    // Alignment and balancing need equipment bolted to a workshop floor.
    for (const code of ['fw_wheel_alignment', 'fw_wheel_balancing', 'fw_adas_calibration']) {
      const r = await Repair.findOne({ vertical: V, code }).lean();
      expect(r.allowedServiceModes).toEqual(['workshop']);
    }
  });
});

/* Isolation */

describe('verticals stay apart', () => {
  it('keeps every four-wheeler code in its own namespace', async () => {
    const all = await Repair.find({ vertical: V }).lean();
    expect(all.every((r) => r.code.startsWith('fw_'))).toBe(true);
  });

  it('does not collide with the two-wheeler brand codes', async () => {
    // `honda-car` and `honda-2w` are different businesses to a workshop.
    const brands = (await Brand.find({ category: V }).lean()).map((b) => b.code);
    expect(brands).toContain('honda-car');
    expect(brands).not.toContain('honda-2w');
    expect(brands).not.toContain('hero');
  });
});
