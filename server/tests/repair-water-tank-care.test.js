/**
 * Water & Tank Care vertical — catalog integrity, safety gating, diagnosis.
 *
 * What this suite exists to prove:
 *
 *   1. CATALOG INTEGRITY holds, same as every other vertical: no dangling
 *      references, every repair reachable, no ranges, only real service modes.
 *
 *   2. TANK TYPE occupies the brand slot and CAPACITY the model slot — no
 *      product types are seeded, so the customer flow stays shallow
 *      (brand -> model, no extra screen) exactly like mobile.
 *
 *   3. THE SAFETY GATE HOLDS. A confined-space or flooding report must route
 *      to an inspection, never to a priced repair and never auto-dispatched —
 *      the same pattern proven for EV thermal faults and CNG leaks. The
 *      hazard question is asked FIRST and cannot be skipped.
 *
 *   4. A SYMPTOM IS NOT A REPAIR (§10). "There's a leak" resolves to a fitting
 *      fix or a structural repair depending on WHERE it leaks from, not a
 *      single guessed outcome. A tank cleaned within 6 months that still
 *      smells routes to an inspection, not a repeat clean that would not fix
 *      the actual cause.
 */

const { startMongo, stopMongo } = require('./helpers');

const Brand = require('../src/modules/service/brand.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const diagnostic = require('../src/modules/repair/services/diagnostic.service');
const { SERVICE_MODES } = require('../src/modules/repair/service-modes');
const { VERTICALS } = require('../src/modules/repair/vertical');

const wt = require('../src/modules/repair/seed/water-tank-care.seed');
const wtModels = require('../src/modules/repair/seed/water-tank-care-models.seed');
const { FLOWS } = require('../src/modules/repair/seed/water-tank-care-diagnostics.seed');

jest.setTimeout(90000);

const V = 'water_tank_care';
const flowByCode = new Map(FLOWS.map((f) => [f.code, f]));

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: V });

  for (const b of wt.BRANDS) {
    await Brand.create({ code: b.code, name: b.name, category: V, sortOrder: b.sortOrder });
  }
  const brandIds = new Map((await Brand.find({ category: V }).lean()).map((b) => [b.code, b._id]));

  await DeviceModel.insertMany(wtModels.MODELS.map((m) => ({
    code: wtModels.toCode(m.brandCode, m.name),
    name: m.name,
    vertical: V,
    brandId: brandIds.get(m.brandCode),
    brandCode: m.brandCode,
    productTypeCode: null,
  })));

  const cats = {};
  for (const c of wt.PROBLEM_CATEGORIES) {
    const doc = await ProblemCategory.create({ code: c.code, name: c.name, vertical: V, displayOrder: c.displayOrder });
    cats[c.code] = doc._id;
  }

  await Problem.insertMany(wt.PROBLEMS.map((p) => ({
    code: p.code, name: p.name, vertical: V,
    categoryId: cats[p.categoryCode], categoryCode: p.categoryCode,
    candidateRepairCodes: p.candidateRepairCodes || [],
    requiresDiagnosis: !!p.requiresDiagnosis,
    severity: p.severity || 'normal',
  })));

  await Repair.insertMany(wt.REPAIRS.map((r) => ({
    code: r.code, name: r.name, vertical: V,
    pricingMode: r.pricingMode,
    requiresDiagnosis: r.pricingMode === 'diagnosis_required',
    minSkillLevel: r.minSkillLevel,
    allowedServiceModes: r.modes,
    estimatedDurationMin: r.durationMin,
    warrantyDays: r.warrantyDays,
    problemCodes: wt.PROBLEMS.filter((p) => (p.candidateRepairCodes || []).includes(r.code)).map((p) => p.code),
  })));
});

afterAll(async () => { await stopMongo(); });

/* ─── Catalog integrity ──────────────────────────────────────────────────── */

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

  it('is doorstep-only — a tank does not travel to a workshop', async () => {
    const notDoorstep = (await Repair.find({ vertical: V }).lean())
      .filter((r) => !(r.allowedServiceModes || []).includes('doorstep'))
      .map((r) => r.code);
    expect(notDoorstep).toEqual([]);
  });
});

/* ─── Shallow catalog: tank type as brand, capacity as model ─────────────── */

describe('tank type occupies the brand slot, capacity the model slot', () => {
  it('seeds no product types — the flow stays shallow like mobile', () => {
    expect(wt.PRODUCT_TYPES).toEqual([]);
  });

  it('gives every tank type a real capacity ladder plus an "unknown" escape hatch', async () => {
    const models = await DeviceModel.find({ vertical: V }).lean();
    const brands = new Set((await Brand.find({ category: V }).lean()).map((b) => b.code));

    expect(models.length).toBeGreaterThan(20);
    expect(models.filter((m) => !brands.has(m.brandCode))).toEqual([]);

    // §5: "I don't know" must be a real, seeded path — not a client-side
    // special case bolted on separately, and available for EVERY tank type,
    // including "Other".
    for (const brandCode of brands) {
      const hasUnknown = models.some((m) => m.brandCode === brandCode && /unknown/i.test(m.name));
      expect(hasUnknown).toBe(true);
    }
  });

  it('gives underground sumps and society tanks a larger capacity ladder than domestic tanks', async () => {
    const models = await DeviceModel.find({ vertical: V }).lean();
    const sumpCapacities = models.filter((m) => m.brandCode === 'underground_sump').map((m) => m.name);
    const overheadCapacities = models.filter((m) => m.brandCode === 'overhead').map((m) => m.name);
    // A sump's smallest bracket starts where an overhead tank's largest ends.
    expect(sumpCapacities.some((c) => /10,000/.test(c))).toBe(true);
    expect(overheadCapacities.some((c) => /10,000/.test(c))).toBe(false);
  });
});

/* ─── Safety: the confined-space / flooding gate ─────────────────────────── */

describe('a confined-space or flooding report never becomes a priced repair', () => {
  it('asks the hazard question FIRST and unskippably on both safety-relevant trees', () => {
    for (const [code, qid] of [['wt_leak_triage', 'hazard'], ['wt_confined_space_check', 'access']]) {
      const flow = flowByCode.get(code);
      expect(flow.questions[0].id).toBe(qid);
      expect(flow.questions[0].showIf).toBeUndefined();
    }
  });

  it('routes a flooding / confined-space leak straight to an inspection', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_leakage', flow: flowByCode.get('wt_leak_triage'), vertical: V,
      answers: { hazard: 'unsafe' },
    });
    expect(r.recommendations[0].repairCode).toBe('wt_health_inspection');
    expect(r.urgency).toBe('urgent');
    // The recommendation itself is a fixed-price bookable inspection VISIT —
    // that is correct and different from claiming the REPAIR is priced.
    expect(r.recommendations[0].pricingMode).toBe('fixed');
  });

  it('routes a confined-space damage report to an inspection, never to structural repair directly', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_crack_damage', flow: flowByCode.get('wt_confined_space_check'), vertical: V,
      answers: { access: 'confined' },
    });
    expect(r.recommendations[0].repairCode).toBe('wt_health_inspection');
    expect(r.recommendations.map((x) => x.repairCode)).not.toContain('wt_structural_repair');
  });

  it('marks structural/confined problems critical and always diagnosis-required', async () => {
    const critical = await Problem.find({ vertical: V, severity: 'critical' }).lean();
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.filter((p) => !p.requiresDiagnosis).map((p) => p.code)).toEqual([]);
  });

  it('never auto-prices structural repair — it is diagnosis_required in the catalog', async () => {
    const structural = await Repair.findOne({ vertical: V, code: 'wt_structural_repair' }).lean();
    expect(structural.pricingMode).toBe('diagnosis_required');
    expect(structural.requiresDiagnosis).toBe(true);
  });
});

/* ─── Diagnosis: a symptom is not a repair (§10) ─────────────────────────── */

describe('leakage is triaged by WHERE it leaks, not assumed', () => {
  const flow = () => flowByCode.get('wt_leak_triage');

  it('sends a safe, visible fitting leak to a fitting repair', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_leakage', flow: flow(), vertical: V,
      answers: { hazard: 'safe', location: 'fitting', severity: 'drip' },
    });
    expect(r.primaryRepairCode).toBe('wt_fitting_repair');
  });

  it('sends a wall/base leak to structural repair, not a fitting swap', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_leakage', flow: flow(), vertical: V,
      answers: { hazard: 'safe', location: 'wall' },
    });
    // Structural work is inspection-priced, so the engine correctly withholds
    // a firm number — but it must still point at the right repair.
    expect(r.recommendations[0].repairCode).toBe('wt_structural_repair');
    expect(r.requiresDiagnosis).toBe(true);
  });

  it('sends "not sure where" to an inspection rather than guessing', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_leakage', flow: flow(), vertical: V,
      answers: { hazard: 'safe', location: 'not_sure' },
    });
    expect(r.recommendations[0].repairCode).toBe('wt_health_inspection');
  });

  it('escalates urgency for a steady flow at a fitting', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_leakage', flow: flow(), vertical: V,
      answers: { hazard: 'safe', location: 'fitting', severity: 'steady' },
    });
    expect(r.urgency).toBe('high');
  });
});

describe('a recently-cleaned tank with symptoms is inspected, not re-cleaned', () => {
  it('routes to inspection when cleaned within 6 months', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_bad_smell', flow: flowByCode.get('wt_cleaning_triage'), vertical: V,
      answers: { recency: 'recent' },
    });
    // Re-cleaning a tank that was just cleaned will not fix a different root
    // cause (a leak letting in contamination, a damaged lid) — an inspection
    // finds it.
    expect(r.primaryRepairCode).toBe('wt_health_inspection');
    expect(r.primaryRepairCode).not.toBe('wt_deep_cleaning');
  });

  it('routes to cleaning when genuinely overdue', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_visible_algae', flow: flowByCode.get('wt_cleaning_triage'), vertical: V,
      answers: { recency: 'overdue', strength: 'mild' },
    });
    expect(r.primaryRepairCode).toBe('wt_deep_cleaning');
  });
});

describe('flushing is not offered again right after it was just done', () => {
  it('routes to inspection when flushed within the last month', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_low_flow', flow: flowByCode.get('wt_flushing_triage'), vertical: V,
      answers: { recency: 'recent' },
    });
    expect(r.primaryRepairCode).toBe('wt_health_inspection');
  });

  it('routes to flushing when genuinely overdue', async () => {
    const r = await diagnostic.resolve({
      problemCode: 'wt_low_flow', flow: flowByCode.get('wt_flushing_triage'), vertical: V,
      answers: { recency: 'overdue' },
    });
    expect(r.primaryRepairCode).toBe('wt_tank_pipe_flushing');
  });
});

/* ─── QA & skill gating ───────────────────────────────────────────────────── */

describe('QA and skill requirements', () => {
  it('has a QA checklist for every service category', async () => {
    const codes = wt.QA_CHECKLISTS.map((c) => c.code);
    expect(codes).toContain('wt_cleaning_standard');
    expect(codes).toContain('wt_inspection_standard');
    expect(codes).toContain('wt_flushing_standard');
    expect(codes).toContain('wt_repair_standard');
  });

  it('has a dedicated confined-space safety checklist, checked BEFORE work starts', () => {
    const safety = wt.QA_CHECKLISTS.find((c) => c.code === 'wt_safety');
    expect(safety).toBeTruthy();
    expect(safety.stage).toBe('before');
  });

  it('gates confined-space and structural work behind the verified skill level', async () => {
    const gated = await Repair.find({
      vertical: V, code: { $in: ['wt_structural_repair', 'wt_tank_installation'] },
    }).lean();
    for (const r of gated) expect(r.minSkillLevel).toBeGreaterThanOrEqual(2);
  });

  it('requires verification for the confined-space skill level', () => {
    const level3 = wt.SKILL_LEVELS.find((l) => l.level === 3);
    expect(level3.requiresVerification).toBe(true);
  });
});

/* ─── Isolation ──────────────────────────────────────────────────────────── */

describe('verticals stay apart', () => {
  it('keeps every water-tank-care code in its own namespace', async () => {
    const all = await Repair.find({ vertical: V }).lean();
    expect(all.every((r) => r.code.startsWith('wt_'))).toBe(true);
  });
});
