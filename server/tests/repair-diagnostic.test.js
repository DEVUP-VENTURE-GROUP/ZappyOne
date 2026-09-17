/**
 * Diagnostic engine tests.
 *
 * The headline case is §7's: a customer reporting "cracked screen" must NOT be
 * routed straight to a display assembly replacement. If the panel and touch
 * still work, the honest answer is a glass-only repair — a materially cheaper
 * job. Getting this wrong is an upsell, so it is tested first and explicitly.
 */

const { startMongo, stopMongo } = require('./helpers');
const DiagnosticFlow = require('../src/modules/service/diagnostic-flow.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const diagnostic = require('../src/modules/repair/services/diagnostic.service');
const { FLOWS } = require('../src/modules/repair/seed/diagnostics.seed');
const seed = require('../src/modules/repair/seed/catalog.seed');

jest.setTimeout(60000);

let displayFlow;

beforeAll(async () => {
  await startMongo();

  const cat = await ProblemCategory.create({ code: 'display', name: 'Display', vertical: 'mobile' });

  await Problem.insertMany(
    seed.PROBLEMS
      .filter((p) => p.categoryCode === 'display' || p.code === 'water_liquid_damage')
      .map((p) => ({
        code: p.code,
        name: p.name,
        categoryId: cat._id,
        categoryCode: 'display',
        vertical: 'mobile',
        candidateRepairCodes: p.candidateRepairCodes || [],
        requiresDiagnosis: !!p.requiresDiagnosis,
        diagnosticFlowCode: 'mobile_display',
      })),
  );

  await Repair.insertMany(
    seed.REPAIRS.map((r) => ({
      code: r.code,
      name: r.name,
      vertical: 'mobile',
      pricingMode: r.pricingMode,
      requiresDiagnosis: r.pricingMode === 'diagnosis_required',
      allowedServiceModes: r.modes,
      estimatedDurationMin: r.durationMin,
      warrantyDays: r.warrantyDays,
      minSkillLevel: r.minSkillLevel,
    })),
  );

  const spec = FLOWS.find((f) => f.code === 'mobile_display');
  displayFlow = await DiagnosticFlow.create({
    code: spec.code, category: spec.category, title: spec.title, questions: spec.questions,
  });
});

afterAll(async () => { await stopMongo(); });

describe('conditional branching', () => {
  it('hides follow-up questions until their precondition is answered', () => {
    const first = diagnostic.nextQuestions(displayFlow, {});
    expect(first.map((q) => q.id)).toEqual(['display_on']);
  });

  it('reveals the touch question only when a picture is visible', () => {
    const visible = diagnostic.nextQuestions(displayFlow, { display_on: 'yes' }).map((q) => q.id);
    expect(visible).toContain('touch_works');
    // A dead screen cannot be touch-tested, so that branch must stay hidden.
    expect(visible).not.toContain('powers_on');
  });

  it('routes a black screen to the power fork instead of the touch fork', () => {
    const visible = diagnostic.nextQuestions(displayFlow, { display_on: 'no' }).map((q) => q.id);
    expect(visible).toContain('powers_on');
    expect(visible).not.toContain('touch_works');
  });

  it('knows when the visible branch is fully answered', () => {
    expect(diagnostic.isComplete(displayFlow, { display_on: 'yes' })).toBe(false);
    const done = { display_on: 'yes', touch_works: 'yes', glass_only: 'yes' };
    expect(diagnostic.isComplete(displayFlow, done)).toBe(true);
  });
});

describe('§7 — cracked screen must not assume a display swap', () => {
  it('resolves working panel + working touch to GLASS ONLY', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'cracked_screen',
      flow: displayFlow,
      answers: { display_on: 'yes', touch_works: 'yes', glass_only: 'yes' },
    });

    expect(result.primaryRepairCode).toBe('glass_replacement');
    expect(result.primaryRepairCode).not.toBe('display_assembly_replacement');
    expect(result.requiresDiagnosis).toBe(false);
    expect(result.recommendedQuality).toBe('premium');
  });

  it('resolves the same symptom to a full assembly when touch is dead', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'cracked_screen',
      flow: displayFlow,
      answers: { display_on: 'yes', touch_works: 'no' },
    });
    expect(result.primaryRepairCode).toBe('display_assembly_replacement');
  });

  it('escalates a completely dead phone away from display work entirely', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'black_display',
      flow: displayFlow,
      answers: { display_on: 'no', powers_on: 'no', liquid_exposure: 'no' },
    });
    // A dead board is not a screen job — and cannot be priced remotely.
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.primaryRepairCode).toBeNull();
    expect(result.urgency).toBe('urgent');
  });

  it('surfaces the right tools for the technician', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'cracked_screen',
      flow: displayFlow,
      answers: { display_on: 'yes', touch_works: 'yes' },
    });
    expect(result.suggestedTools).toEqual(expect.arrayContaining(['laser_separator', 'oca_laminator']));
  });
});

describe('diagnosis-required symptoms', () => {
  it('never returns a firm repair for liquid damage', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'water_liquid_damage',
      flow: displayFlow,
      answers: { display_on: 'partial', liquid_exposure: 'yes' },
    });
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.primaryRepairCode).toBeNull();
    expect(result.summary).toContain('cannot be priced accurately');
  });

  it('falls back to the problem candidates when no flow answers exist', async () => {
    const result = await diagnostic.resolve({ problemCode: 'green_pink_line', flow: null, answers: {} });
    expect(result.recommendations.map((r) => r.repairCode)).toContain('display_assembly_replacement');
  });

  it('reports honestly when the symptom maps nowhere', async () => {
    const result = await diagnostic.resolve({ problemCode: 'does_not_exist', flow: null, answers: {} });
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.recommendations).toHaveLength(0);
  });
});
