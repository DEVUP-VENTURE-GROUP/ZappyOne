const { ProviderCapability, SkillLevel } = require('../../models/capability.model');
const { ProviderServiceArea } = require('../../models/config.model');
const { ProviderInventory } = require('../../models/inventory.model');
const { ProviderPricing } = require('../../models/pricing.model');
const { ProviderCatalogRequest } = require('../../models/governance.model');
const { ProblemCategory, Problem } = require('../../models/problem.model');
const { Part } = require('../../models/part.model');
const { Repair } = require('../../models/repair.model');
const { RepairBooking } = require('../../models/booking.model');
const { verticalOf } = require('../../vertical');
const { ownerFilter } = require('./owner');

/** Signing up for work: the work catalog, bulk sign-up, readiness, jobs, catalog additions. */

/* Jobs */

async function listJobs(req, res, next) {
  try {
    const filter = { ...ownerFilter(req) };
    if (req.query.active === 'true') {
      filter.status = { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'] };
    }
    const bookings = await RepairBooking.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ bookings });
  } catch (err) { next(err); }
}

/** Readiness summary — tells a provider exactly what is stopping them earning. */
async function onboardingStatus(req, res, next) {
  try {
    const filter = ownerFilter(req);
    const vertical = verticalOf(req);

    /**
     * Setup is per vertical, so the checklist must be too.
     *
     * Counting across verticals would tell a provider who priced their phone
     * work that their laptop setup is finished — and then leave them wondering
     * why no laptop jobs arrive. Service AREA is the exception: where someone
     * works does not change with what they repair, so it stays global.
     */
    const [capabilities, areas, pricing, stockedParts] = await Promise.all([
      ProviderCapability.countDocuments({ ...filter, vertical, isActive: true }),
      ProviderServiceArea.countDocuments({ ...filter, isActive: true }),
      ProviderPricing.countDocuments({
        ...filter, vertical, supersededAt: null, approvalStatus: { $in: ['approved', 'auto_approved'] },
      }),
      ProviderInventory.find({ ...filter, quantity: { $gt: 0 } }).select('partId').lean(),
    ]);

    // Stock belongs to a vertical through its part, not through the row.
    const inventory = stockedParts.length
      ? await Part.countDocuments({ _id: { $in: stockedParts.map((r) => r.partId) }, vertical })
      : 0;

    const pendingVerification = await ProviderCapability.countDocuments({ ...filter, vertical, verificationStatus: 'pending' });
    const pendingPrices = await ProviderPricing.countDocuments({
      ...filter, vertical, approvalStatus: 'pending', supersededAt: null,
    });

    /**
     * What setup actually requires.
     *
     * Stock is NOT on this list any more. Providers quote one final price with
     * the part included and are no longer asked to keep an inventory, so
     * requiring one left every provider permanently "incomplete" with a step
     * the app no longer has a screen for.
     *
     * It is still reported, because a provider who does track stock ranks above
     * one who does not — but as a count they can act on, never as a blocker.
     */
    const steps = [
      { key: 'capabilities', label: 'Add the repairs you can do', done: capabilities > 0, count: capabilities },
      { key: 'serviceArea', label: 'Set your service area', done: areas > 0, count: areas },
      { key: 'pricing', label: 'Set and get your prices approved', done: pricing > 0, count: pricing },
    ];

    res.json({
      steps,
      complete: steps.every((s) => s.done),
      // Optional, and deliberately outside `steps` so no screen can turn it
      // back into a requirement by iterating the list.
      optional: { stockedParts: inventory },
      pending: { skillVerifications: pendingVerification, priceApprovals: pendingPrices },
    });
  } catch (err) { next(err); }
}


/* The work a provider can sign up for */

/**
 * Everything the "what do you fix?" step needs, in one call.
 *
 * Grouped under the SAME headings the customer sees — Display, Battery & Power,
 * Storage — because a provider ticking boxes and a customer picking a symptom
 * should be looking at one catalog, not two that drift. The link runs through
 * the problems: a heading owns problems, and each problem names the repairs
 * that fix it.
 *
 * Each repair carries whether this provider already claims it, so the UI can
 * render ticks without a second round trip, and the skill floor, so a level-1
 * technician is told why board work is closed to them rather than being
 * rejected days later.
 */
async function workCatalog(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const cityCode = (req.query.cityCode || '').toLowerCase();

    const [categories, problems, repairs, mine, levels] = await Promise.all([
      ProblemCategory.find({ vertical, isActive: true, isArchived: false })
        .sort({ displayOrder: 1, name: 1 }).lean(),
      Problem.find({ vertical, isActive: true, isArchived: false })
        .select('code name categoryCode candidateRepairCodes').lean(),
      Repair.find({ vertical, isActive: true, isArchived: false })
        .sort({ displayOrder: 1, name: 1 }).lean(),
      ProviderCapability.find({ ...ownerFilter(req), vertical })
        .select('repairCode skillLevel serviceModes brandCodes isActive').lean(),
      SkillLevel.find({ vertical }).sort({ level: 1 }).lean(),
    ]);

    const mineByCode = new Map(mine.map((c) => [c.repairCode, c]));

    // A repair added for one city is not offered to providers elsewhere — see
    // the note on Repair.cityCodes.
    const inLocality = (r) => !r.cityCodes?.length || (cityCode && r.cityCodes.includes(cityCode));

    /**
     * Which headings a repair belongs under, via the problems it answers.
     *
     * ALL of them, not the first one found. A charging port repair answers both
     * "won't charge" under Charging and "port damaged" under Physical Damage,
     * and a technician looking under either heading has to find it.
     *
     * Keeping only the first match quietly deleted work from this screen: the
     * laptop provider saw 38 entries where the catalog holds 75, and headings
     * whose every repair had already been claimed by an earlier heading — phone
     * Connectivity, laptop Upgrade and Data Recovery — came out empty and were
     * then dropped altogether. The customer, who browses PROBLEMS rather than
     * repairs, saw the full catalog throughout, which is why the two panels
     * looked so different.
     *
     * Ticking is by repair code, so the same repair shown under two headings is
     * one choice in two places, not two separate claims.
     */
    const categoriesOfRepair = new Map();
    /**
     * The customer's words for each repair.
     *
     * A customer browses SYMPTOMS — "cracked screen", "black screen", "touch not
     * working" — while a provider claims FIXES. One fix answers many symptoms,
     * so the two counts never match: eleven display issues are covered by three
     * display repairs, and a provider looking at "3 jobs" beside the customer's
     * "11 issues" reasonably concludes something is missing.
     *
     * Nothing is missing, and the honest answer is not to fake parity by making
     * providers tick eleven boxes that mean the same three things — it is to
     * show which symptoms each fix already covers. So every repair carries the
     * problems that point at it, and every heading carries its symptom count.
     */
    const problemsOfRepair = new Map();

    for (const p of problems) {
      for (const code of p.candidateRepairCodes || []) {
        if (!categoriesOfRepair.has(code)) categoriesOfRepair.set(code, new Set());
        categoriesOfRepair.get(code).add(p.categoryCode);

        if (!problemsOfRepair.has(code)) problemsOfRepair.set(code, []);
        problemsOfRepair.get(code).push(p.name);
      }
    }

    const groups = categories.map((c) => ({
      code: c.code,
      name: c.name,
      icon: c.icon,
      imageUrl: c.imageUrl || '',
      // What the customer sees under this heading, so the provider's screen can
      // reconcile its own count against it instead of contradicting it.
      problemCount: problems.filter((p) => p.categoryCode === c.code).length,
      repairs: repairs
        .filter((r) => categoriesOfRepair.get(r.code)?.has(c.code) && inLocality(r))
        .map((r) => ({
          code: r.code,
          name: r.name,
          minSkillLevel: r.minSkillLevel || 1,
          allowedServiceModes: r.allowedServiceModes || [],
          pricingMode: r.pricingMode,
          estimatedDurationMin: r.estimatedDurationMin,
          warrantyDays: r.warrantyDays,
          // A repair that swaps a physical component can be quoted at more than
          // one part grade, so the pricing screen offers OEM / premium / standard
          // for it. A labour-only job (cleaning, software) has exactly one price,
          // and asking for three would be asking a question with no answer.
          usesPart: !!r.componentCode || (r.partRequirements || []).length > 0,
          /** The customer-facing symptoms this one fix answers. */
          answers: problemsOfRepair.get(r.code) || [],
          isLocal: !!r.cityCodes?.length,
          selected: mineByCode.has(r.code),
          mySkillLevel: mineByCode.get(r.code)?.skillLevel || null,
        })),
    }));

    /**
     * Headings are NOT dropped for being empty.
     *
     * They used to be, which meant a gap in the catalog — a heading whose
     * problems name no repair yet — removed the heading from the provider's
     * screen entirely. The provider then had no way to tell us they do that
     * work, and nobody could see the gap to fix it. An empty heading now opens
     * and offers "I do something not listed here", which turns a silent hole
     * into a request we can act on.
     */

    // Repairs no problem points at would otherwise be unreachable in this UI.
    const grouped = new Set(groups.flatMap((g) => g.repairs.map((r) => r.code)));
    const ungrouped = repairs.filter((r) => !grouped.has(r.code) && inLocality(r));
    if (ungrouped.length) {
      groups.push({
        code: 'other',
        name: 'Other',
        icon: '',
        imageUrl: '',
        repairs: ungrouped.map((r) => ({
          code: r.code,
          name: r.name,
          minSkillLevel: r.minSkillLevel || 1,
          allowedServiceModes: r.allowedServiceModes || [],
          pricingMode: r.pricingMode,
          estimatedDurationMin: r.estimatedDurationMin,
          warrantyDays: r.warrantyDays,
          usesPart: !!r.componentCode || (r.partRequirements || []).length > 0,
          selected: mineByCode.has(r.code),
          mySkillLevel: mineByCode.get(r.code)?.skillLevel || null,
        })),
      });
    }

    // The brands they already claim, so returning to this screen shows what
    // they chose last time instead of an empty grid.
    const brands = [...new Set(mine.flatMap((c) => c.brandCodes || []))];

    res.json({
      groups,
      brands,
      skillLevel: mine[0]?.skillLevel || null,
      skillLevels: levels.map((l) => ({
        level: l.level, name: l.name, description: l.description, requiresVerification: l.requiresVerification,
      })),
      selectedCount: mine.length,
    });
  } catch (err) { next(err); }
}

/**
 * Save a whole heading's worth of choices at once.
 *
 * The provider ticks a screenful and presses save once; sending one request per
 * repair would leave them half-saved on a dropped connection, which on a shop's
 * phone in a basement is not an edge case.
 *
 * Unticking removes the capability — the honest reading of an empty box — but
 * only within the codes the client actually sent, so one screen cannot wipe
 * work claimed on another.
 */
async function bulkCapabilities(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const owner = ownerFilter(req);
    const {
      repairCodes = [], candidateCodes = [], brandCodes = [], serviceModes = ['doorstep'], skillLevel = 1,
    } = req.body;

    /**
     * De-duplicated, because the same repair legitimately appears under several
     * headings — a charging port answers both "won't charge" and "port damaged".
     * The client sends every code on screen as the scope, so without this a
     * repair shown twice is written twice and counted twice in the response.
     */
    const scope = [...new Set(candidateCodes.length ? candidateCodes : repairCodes)];
    const chosen = new Set(repairCodes);

    const repairs = await Repair.find({ code: { $in: scope }, vertical, isActive: true }).lean();
    const byCode = new Map(repairs.map((r) => [r.code, r]));

    const tooHigh = [];
    const saved = [];

    for (const code of scope) {
      const repair = byCode.get(code);
      if (!repair) continue;

      if (!chosen.has(code)) {
        await ProviderCapability.deleteOne({ ...owner, vertical, repairCode: code });
        continue;
      }

      // The skill floor is the repair's, not the provider's opinion of it.
      if (skillLevel < (repair.minSkillLevel || 1)) {
        tooHigh.push({ code, name: repair.name, requiredLevel: repair.minSkillLevel });
        continue;
      }

      const level = await SkillLevel.findOne({ level: skillLevel, vertical }).lean();
      const modes = serviceModes.filter((m) => repair.allowedServiceModes.includes(m));

      await ProviderCapability.findOneAndUpdate(
        { ...owner, vertical, repairCode: code },
        {
          $set: {
            brandCodes,
            serviceModes: modes.length ? modes : repair.allowedServiceModes.slice(0, 1),
            skillLevel,
            isActive: true,
            // Levels that need checking start pending, exactly as the single-add
            // path does — bulk entry must not be a way around verification.
            verificationStatus: level?.requiresVerification ? 'pending' : 'not_required',
          },
          $setOnInsert: { providerKind: req.auth.role === 'shop' ? 'shop' : 'individual' },
        },
        { upsert: true, new: true },
      );
      saved.push(code);
    }

    res.json({ saved: saved.length, skipped: tooHigh, selected: saved });
  } catch (err) { next(err); }
}

/**
 * "You don't list the job I do."
 *
 * Captured as a request rather than a catalog write: what customers can book
 * has to carry a price, a skill level and a QA check, none of which a provider
 * form can decide. Duplicates from the same provider collapse into one row.
 */
async function requestCatalogAddition(req, res, next) {
  try {
    const vertical = verticalOf(req);
    const isShop = req.auth.role === 'shop';
    const owner = ownerFilter(req);
    const { categoryCode = '', proposedName, description = '', cityCode = '' } = req.body;

    const existing = await ProviderCatalogRequest.findOne({
      ...owner,
      vertical,
      status: 'pending',
      proposedName: new RegExp(`^${String(proposedName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (existing) return res.json({ request: existing, deduped: true });

    const request = await ProviderCatalogRequest.create({
      vertical,
      providerKind: isShop ? 'shop' : 'individual',
      ...owner,
      categoryCode: String(categoryCode).toLowerCase(),
      proposedName,
      description,
      cityCode: String(cityCode).toLowerCase(),
    });

    return res.status(201).json({ request, deduped: false });
  } catch (err) { return next(err); }
}

/** This provider's own additions, so they can see what happened to them. */
async function listCatalogRequests(req, res, next) {
  try {
    const rows = await ProviderCatalogRequest.find({ ...ownerFilter(req), vertical: verticalOf(req) })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ requests: rows });
  } catch (err) { next(err); }
}

module.exports = {
  listJobs,
  onboardingStatus,
  workCatalog,
  bulkCapabilities,
  requestCatalogAddition,
  listCatalogRequests,
};
