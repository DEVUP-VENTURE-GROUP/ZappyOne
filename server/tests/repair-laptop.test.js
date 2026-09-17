/**
 * Laptop vertical — catalog isolation, diagnostics, and part fitment.
 *
 * Two questions this suite exists to answer:
 *
 *   1. Do the verticals stay apart? A laptop screen must never be offered for a
 *      phone, and a mobile technician must not appear for a laptop job. Sharing
 *      one engine is only safe if the scoping actually holds.
 *
 *   2. Does the diagnostic tree earn its keep? §10's example — "screen
 *      flickering" — has seven plausible causes spanning ₹0 to ₹25,000. Selling
 *      a panel on the strength of the word "flickering" is guesswork with the
 *      customer's money, so the branches that avoid it are tested explicitly.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const Brand = require('../src/modules/service/brand.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const DiagnosticFlow = require('../src/modules/service/diagnostic-flow.model');
const { ProductType, DeviceConfiguration } = require('../src/modules/repair/models/catalog.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { Part, PartQuality } = require('../src/modules/repair/models/part.model');
const { SkillLevel } = require('../src/modules/repair/models/capability.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const diagnostic = require('../src/modules/repair/services/diagnostic.service');

const laptop = require('../src/modules/repair/seed/laptop.seed');
const mobile = require('../src/modules/repair/seed/catalog.seed');
const { FLOWS: LAPTOP_FLOWS } = require('../src/modules/repair/seed/laptop-diagnostics.seed');

jest.setTimeout(90000);

const ctx = {};

/** Insert both verticals' catalogs, exactly as the seeders do. */
async function seedVertical(spec, flows) {
  const V = spec.VERTICAL;
  await RepairConfig.create({ vertical: V });

  for (const b of spec.BRANDS) {
    await Brand.create({ code: b.code, name: b.name, category: V, sortOrder: b.sortOrder ?? b.displayOrder ?? 0 });
  }

  const cats = {};
  for (const c of spec.PROBLEM_CATEGORIES) {
    const doc = await ProblemCategory.create({ code: c.code, name: c.name, vertical: V, displayOrder: c.displayOrder });
    cats[c.code] = doc._id;
  }

  await Problem.insertMany(spec.PROBLEMS.map((p) => ({
    code: p.code, name: p.name, vertical: V,
    categoryId: cats[p.categoryCode], categoryCode: p.categoryCode,
    candidateRepairCodes: p.candidateRepairCodes || [],
    requiresDiagnosis: !!p.requiresDiagnosis,
    severity: p.severity || 'normal',
  })));

  await Repair.insertMany(spec.REPAIRS.map((r) => ({
    code: r.code, name: r.name, vertical: V,
    pricingMode: r.pricingMode,
    requiresDiagnosis: r.pricingMode === 'diagnosis_required',
    minSkillLevel: r.minSkillLevel,
    allowedServiceModes: r.modes,
    estimatedDurationMin: r.durationMin,
    warrantyDays: r.warrantyDays,
  })));

  await SkillLevel.insertMany(spec.SKILL_LEVELS.map((l) => ({
    level: l.level, name: l.name, vertical: V,
    description: l.description, requiresVerification: l.requiresVerification,
  })));

  for (const f of flows) {
    await DiagnosticFlow.create({ code: f.code, category: f.category, title: f.title, questions: f.questions });
    if (f.problemCodes.length) {
      await Problem.updateMany(
        { code: { $in: f.problemCodes }, vertical: V },
        { $set: { diagnosticFlowCode: f.code } },
      );
    }
  }
}

beforeAll(async () => {
  await startMongo();
  // Both verticals live in the same database — that is the whole point.
  await seedVertical(mobile, require('../src/modules/repair/seed/diagnostics.seed').FLOWS);
  await seedVertical(laptop, LAPTOP_FLOWS);

  await ProductType.insertMany(laptop.PRODUCT_TYPES.map((t) => ({
    code: t.code, name: t.name, vertical: 'laptop', displayOrder: t.displayOrder,
  })));

  ctx.displayFlow = await DiagnosticFlow.findOne({ code: 'laptop_display' });
  ctx.powerFlow = await DiagnosticFlow.findOne({ code: 'laptop_power' });
  ctx.triageFlow = await DiagnosticFlow.findOne({ code: 'laptop_triage' });

  await PartQuality.insertMany([
    { code: 'oem', name: 'OEM / Genuine', rank: 30, isGenuine: true },
    { code: 'premium', name: 'Premium Compatible', rank: 20, isGenuine: false },
  ]);

  const brand = await Brand.findOne({ code: 'lenovo' });
  const model = await DeviceModel.create({
    brandId: brand._id, brandCode: 'lenovo', vertical: 'laptop',
    name: 'ThinkPad E14 Gen 5', code: 'lenovo-thinkpad-e14-g5',
    productTypeCode: 'business_laptop', familyCode: 'thinkpad',
    productNumbers: ['21JK', '21JL'],
  });
  ctx.modelCode = model.code;

  // Two builds of the SAME model with panels that are not interchangeable —
  // the exact trap that makes laptop fitment different from phones.
  ctx.fhdConfig = await DeviceConfiguration.create({
    code: 'e14-g5-fhd', name: 'i5 / 16GB / 512GB / FHD', vertical: 'laptop',
    modelId: model._id, modelCode: model.code,
    ramGb: 16, ramType: 'DDR4', storageGb: 512, storageType: 'NVMe',
    displaySize: '14', displayResolution: '1920x1080', displayPanel: 'IPS', isTouch: false,
  });
  ctx.touchConfig = await DeviceConfiguration.create({
    code: 'e14-g5-touch', name: 'i7 / 16GB / 1TB / FHD Touch', vertical: 'laptop',
    modelId: model._id, modelCode: model.code,
    ramGb: 16, ramType: 'DDR4', storageGb: 1024, storageType: 'NVMe',
    displaySize: '14', displayResolution: '1920x1080', displayPanel: 'IPS', isTouch: true,
  });
});

afterAll(async () => { await stopMongo(); });

/* ─── Catalog isolation ────────────────────────────────────────────────── */

describe('vertical isolation', () => {
  it('keeps both catalogs in the same database without collision', async () => {
    expect(await Problem.countDocuments({ vertical: 'mobile' })).toBe(65);
    expect(await Problem.countDocuments({ vertical: 'laptop' })).toBe(175);
    expect(await Repair.countDocuments({ vertical: 'laptop' })).toBe(39);
  });

  it('allows the same category code in both verticals', async () => {
    // "display" is legitimate for phones AND laptops. A global unique index made
    // the second vertical fail to seed — that is what migration 001 fixed.
    const both = await ProblemCategory.find({ code: 'display' }).lean();
    expect(both.map((c) => c.vertical).sort()).toEqual(['laptop', 'mobile']);
  });

  it('allows the same skill level number in both verticals', async () => {
    const levels = await SkillLevel.find({ level: 2 }).lean();
    expect(levels).toHaveLength(2);
    expect(levels.map((l) => l.vertical).sort()).toEqual(['laptop', 'mobile']);
  });

  it('still refuses a duplicate code WITHIN one vertical', async () => {
    await expect(
      ProblemCategory.create({ code: 'display', name: 'Duplicate', vertical: 'laptop' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('never returns laptop repairs to a mobile query', async () => {
    const mobileRepairs = await Repair.find({ vertical: 'mobile' }).lean();
    expect(mobileRepairs.every((r) => !r.code.startsWith('lt_'))).toBe(true);
  });
});

/* ─── §10: symptom ≠ repair ────────────────────────────────────────────── */

describe('§10 — screen flickering must not assume a panel', () => {
  it('resolves to a CABLE repair when the fault follows the lid angle', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_flickering_display',
      flow: ctx.displayFlow,
      answers: { physical_damage: 'no', external_monitor: 'external_fine', lid_angle: 'yes', hinge_condition: 'no' },
    });
    // A chafed cable, not a ₹15,000 panel.
    expect(result.primaryRepairCode).toBe('lt_display_cable_repair');
    expect(result.primaryRepairCode).not.toBe('lt_screen_replacement');
  });

  it('escalates to the HINGE when the hinge is what is destroying the cable', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_flickering_display',
      flow: ctx.displayFlow,
      answers: { physical_damage: 'no', external_monitor: 'external_fine', lid_angle: 'yes', hinge_condition: 'yes' },
    });
    // Repairing only the cable would put the customer back here in a month.
    expect(result.primaryRepairCode).toBe('lt_hinge_repair');
  });

  it('resolves to SOFTWARE when an external monitor shows the same fault after an update', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_flickering_display',
      flow: ctx.displayFlow,
      answers: { physical_damage: 'no', external_monitor: 'external_same', after_software_change: 'yes' },
    });
    // Cheapest plausible cause, and it needs no parts at all.
    expect(result.primaryRepairCode).toBe('lt_driver_installation');
  });

  it('refuses to price board-level artefacts visible before Windows loads', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_flickering_display',
      flow: ctx.displayFlow,
      answers: {
        physical_damage: 'no', external_monitor: 'external_same',
        after_software_change: 'no', artifacts_present: 'yes',
      },
    });
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.primaryRepairCode).toBeNull();
    expect(result.urgency).toBe('urgent');
  });

  it('goes straight to a panel when the screen is physically cracked', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_cracked_screen',
      flow: ctx.displayFlow,
      answers: { physical_damage: 'yes' },
    });
    expect(result.primaryRepairCode).toBe('lt_screen_replacement');
  });

  it('does not ask electrical questions once damage is visible', () => {
    const visible = diagnostic.nextQuestions(ctx.displayFlow, { physical_damage: 'yes' }).map((q) => q.id);
    expect(visible).not.toContain('external_monitor');
    expect(visible).not.toContain('lid_angle');
  });
});

/* ─── §11: the power tree ──────────────────────────────────────────────── */

describe('§11 — power diagnosis', () => {
  it('identifies a faulty adapter before suggesting internal work', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_wont_turn_on',
      flow: ctx.powerFlow,
      answers: { charge_indicator: 'no', cable_wiggle: 'no', different_charger: 'works' },
    });
    // The cheapest cause, correctly ruled in first.
    expect(result.primaryRepairCode).toBe('lt_adapter_replacement');
  });

  it('identifies a charging port when the light follows the cable', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_battery_not_charging',
      flow: ctx.powerFlow,
      answers: { charge_indicator: 'flickers', cable_wiggle: 'yes' },
    });
    expect(result.primaryRepairCode).toBe('lt_charging_port_repair');
  });

  it('refuses a remote price when the board is implicated', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_wont_turn_on',
      flow: ctx.powerFlow,
      answers: { charge_indicator: 'yes', power_button_response: 'nothing' },
    });
    // Charging light on, zero response — board work, priced after inspection.
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.urgency).toBe('urgent');
  });

  it('routes a post-spill machine to liquid treatment', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_wont_turn_on',
      flow: ctx.powerFlow,
      answers: {
        charge_indicator: 'no', cable_wiggle: 'no',
        different_charger: 'still_dead', liquid_exposure_power: 'yes',
      },
    });
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.recommendations.map((r) => r.repairCode)).toContain('lt_liquid_damage_treatment');
  });
});

/* ─── §12: "I don't know what's wrong" ─────────────────────────────────── */

describe('§12 — guided triage', () => {
  it('turns a vague complaint into a concrete repair', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_laptop_slow',
      flow: ctx.triageFlow,
      answers: { turns_on: 'yes', reaches_desktop: 'yes', main_complaint: 'battery' },
    });
    expect(result.primaryRepairCode).toBe('lt_battery_replacement');
  });

  it('admits when triage cannot narrow it, instead of guessing', async () => {
    const result = await diagnostic.resolve({
      problemCode: 'lt_laptop_slow',
      flow: ctx.triageFlow,
      answers: { turns_on: 'yes', reaches_desktop: 'yes', main_complaint: 'other' },
    });

    // The customer walked the whole tree and it still identified nothing. That
    // is a finding, not a gap — so it must NOT quietly fall back to the
    // symptom's generic candidate list and quote one of them with confidence.
    expect(result.requiresDiagnosis).toBe(true);
    expect(result.primaryRepairCode).toBeNull();
    expect(result.recommendations).toHaveLength(0);
    expect(result.summary).toContain('cannot be priced accurately');
  });
});

/* ─── §16–§19: part specification and fitment ──────────────────────────── */

describe('part specifications', () => {
  it('rejects a display part with no panel spec', async () => {
    await expect(Part.create({
      sku: 'BAD-PANEL-1', name: 'Mystery panel', vertical: 'laptop',
      componentCode: 'lt_display', brandCode: 'lenovo', qualityCode: 'premium',
      spec: { specType: 'display' },   // no size, no resolution
    })).rejects.toThrow(/needs sizeInches and resolution/);
  });

  it('rejects RAM with no generation or capacity', async () => {
    await expect(Part.create({
      sku: 'BAD-RAM-1', name: 'Mystery RAM', vertical: 'laptop',
      componentCode: 'lt_ram', brandCode: 'lenovo', qualityCode: 'premium',
      spec: { specType: 'ram', speedMhz: 3200 },
    })).rejects.toThrow(/ddrGeneration and capacityGb/);
  });

  it('accepts a fully specified panel and summarises it for a technician', async () => {
    const part = await Part.create({
      sku: 'LEN-E14-FHD-NT', name: 'ThinkPad E14 14" FHD IPS (non-touch)',
      vertical: 'laptop', componentCode: 'lt_display',
      brandCode: 'lenovo', qualityCode: 'premium',
      compatibleModelCodes: ['lenovo-thinkpad-e14-g5'],
      compatibleConfigurationCodes: ['e14-g5-fhd'],
      manufacturerPartNumber: 'B140HAN04.0',
      spec: {
        specType: 'display', sizeInches: 14, resolution: '1920x1080',
        panelType: 'IPS', isTouch: false, connector: '30-pin eDP',
      },
    });
    expect(part.specSummary()).toContain('14"');
    expect(part.specSummary()).toContain('1920x1080');
    ctx.nonTouchPanel = part;
  });

  it('does NOT fit a different configuration of the same model', async () => {
    // The trap: same model, but the touch build takes a different panel.
    expect(ctx.nonTouchPanel.fits({
      modelCode: 'lenovo-thinkpad-e14-g5', configurationCode: 'e14-g5-fhd',
    })).toBe(true);

    expect(ctx.nonTouchPanel.fits({
      modelCode: 'lenovo-thinkpad-e14-g5', configurationCode: 'e14-g5-touch',
    })).toBe(false);
  });

  it('does not fit a different model at all', () => {
    expect(ctx.nonTouchPanel.fits({ modelCode: 'hp-pavilion-15', configurationCode: 'e14-g5-fhd' })).toBe(false);
  });

  it('treats an unrestricted part as fitting any configuration', async () => {
    const universal = await Part.create({
      sku: 'UNIV-THERMAL-1', name: 'Thermal paste', vertical: 'laptop',
      componentCode: 'lt_consumable', brandCode: 'lenovo', qualityCode: 'premium',
      spec: { specType: 'generic' },
    });
    expect(universal.fits({ modelCode: 'anything', configurationCode: 'any-config' })).toBe(true);
  });

  it('keeps laptop parts out of mobile part queries', async () => {
    const mobileParts = await Part.find({ vertical: 'mobile' }).lean();
    expect(mobileParts).toHaveLength(0);
    expect(await Part.countDocuments({ vertical: 'laptop' })).toBeGreaterThan(0);
  });
});

/* ─── §27: doorstep eligibility is a real operational claim ────────────── */

describe('§27 — service mode eligibility', () => {
  it('keeps board-level work out of doorstep', async () => {
    const board = await Repair.findOne({ code: 'lt_motherboard_repair' }).lean();
    // A bench, a microscope and hot air are not going to a customer's kitchen.
    expect(board.allowedServiceModes).not.toContain('doorstep');
    expect(board.allowedServiceModes).toContain('workshop');
  });

  it('allows doorstep for the upgrades that genuinely suit it', async () => {
    const ram = await Repair.findOne({ code: 'lt_ram_upgrade' }).lean();
    const ssd = await Repair.findOne({ code: 'lt_ssd_upgrade' }).lean();
    expect(ram.allowedServiceModes).toContain('doorstep');
    expect(ssd.allowedServiceModes).toContain('doorstep');
  });

  it('offers remote support only for software work', async () => {
    const remote = await Repair.find({ vertical: 'laptop', allowedServiceModes: 'remote_support' }).lean();
    const codes = remote.map((r) => r.code).sort();
    expect(codes).toEqual(['lt_driver_installation', 'lt_os_installation', 'lt_os_repair', 'lt_virus_removal']);
    // Nothing physical can be fixed down a wire.
    expect(codes).not.toContain('lt_screen_replacement');
  });

  it('marks every liquid and board problem as diagnosis-required', async () => {
    const risky = await Problem.find({
      vertical: 'laptop',
      categoryCode: { $in: ['liquid_damage', 'advanced_hardware'] },
    }).lean();
    expect(risky.length).toBeGreaterThan(0);
    expect(risky.every((p) => p.requiresDiagnosis)).toBe(true);
  });
});
