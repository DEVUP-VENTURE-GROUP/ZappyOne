/**
 * Auto-provision coverage the moment a provider is actually reachable.
 *
 * THE BUG THIS FIXES: a real provider could be fully verified, fully priced,
 * and physically standing 50 metres from a customer — and still never be
 * offered the job. `ProviderServiceArea` (repair verticals) and
 * `PetProviderCapability` (pet lines) are what the matching engines actually
 * query, and NOTHING created either one automatically. A provider only got a
 * row if they separately found a settings screen and configured it by hand —
 * for Pet Services there was not even a self-service screen to find. Most
 * real providers, onboarding for the first time tomorrow, would never do
 * that, and nothing on any screen would tell them why they see no jobs.
 *
 * THE FIX IS A DEFAULT, NOT A REQUIREMENT. This runs at the two moments a
 * provider's real location becomes known — a shop's registered address at
 * approval, or an individual's first verified GPS fix on going online — and
 * writes a sensible starting radius/capacity. It never overwrites a row that
 * already exists: a provider who has customised their coverage keeps exactly
 * what they set. This is a safety net under the manual controls, not a
 * replacement for them.
 */

const logger = require('../../utils/logger');
const Worker = require('../worker/worker.model');

/** Matches the modes actually seeded for each category's variants. */
const PET_DEFAULT_MODES = {
  pet_grooming: ['doorstep', 'provider_location'],
  pet_boarding: ['boarding', 'daycare'],
  pet_walk: ['doorstep', 'home_visit'],
  pet_home_care: ['home_visit'],
  pet_transport: ['transport', 'pickup_and_return'],
  pet_vet_assist: ['transport', 'pickup_and_return', 'provider_location'],
  pet_check: ['home_visit'],
};

/** One ProviderServiceArea per owner covers every repair vertical they hold. */
async function provisionRepairArea(key, coordinates) {
  const { ProviderServiceArea } = require('../repair/models/config.model');

  const rows = await ProviderServiceArea.find(key).lean();

  /*
   * A row with neither a map pin nor a pincode matches NOBODY — it is not a
   * choice the provider made, it is an unfinished form that makes them
   * invisible. Filling in the centre of such a row is repair, not override.
   * A row that does reach someone is left exactly as the provider set it.
   */
  const reachable = (a) => a.center?.coordinates?.length === 2 || (a.pincodes || []).length > 0;
  if (rows.some(reachable)) return;
  if (rows.length) {
    await ProviderServiceArea.updateMany(
      { ...key, _id: { $in: rows.map((r) => r._id) } },
      { $set: { center: { type: 'Point', coordinates } } },
    );
    logger.info({ ...key, coordinates }, '[auto-provision] repaired an unreachable service area');
    return;
  }

  await ProviderServiceArea.create({
    ...key,
    cityCode: 'hyderabad',
    center: { type: 'Point', coordinates },
    radiusKm: 10,
    serviceModes: ['doorstep', 'pickup_repair'],
    isActive: true,
  });
  logger.info({ ...key, coordinates }, '[auto-provision] created a default repair service area');
}

/** One PetProviderCapability per owner; categories accumulate as more lines are approved. */
async function provisionPetCapability(key, coordinates, categoryCode) {
  const { PetProviderCapability } = require('../pet/models/config.model');

  const existing = await PetProviderCapability.findOne(key);
  if (existing) {
    let touched = false;
    if (!existing.categoryCodes.includes(categoryCode)) {
      existing.categoryCodes.push(categoryCode);
      touched = true;
    }
    // A boarding line with zero capacity is exactly this same bug again —
    // verified, priced, and still unbookable. Give it a starting number.
    if (categoryCode === 'pet_boarding' && !existing.boardingCapacity) {
      existing.boardingCapacity = 2;
      existing.daycareCapacity = existing.daycareCapacity || 4;
      touched = true;
    }
    // Approval IS the verification event — but never downgrade a status an
    // admin has since changed (e.g. suspended).
    if (['pending', 'document_review'].includes(existing.verificationStatus)) {
      existing.verificationStatus = 'verified';
      touched = true;
    }
    if (touched) await existing.save();
    return;
  }

  await PetProviderCapability.create({
    ...key,
    providerType: key.shopId ? 'pet_care_agency' : 'pet_caregiver',
    species: ['dog', 'cat'],
    sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: [categoryCode],
    modes: PET_DEFAULT_MODES[categoryCode] || ['doorstep'],
    boardingCapacity: categoryCode === 'pet_boarding' ? 2 : 0,
    daycareCapacity: categoryCode === 'pet_boarding' ? 4 : 0,
    baseLocation: { type: 'Point', coordinates },
    serviceRadiusKm: 10,
    verificationStatus: 'verified',
    isActive: true,
  });
  logger.info({ ...key, categoryCode }, '[auto-provision] created a default pet provider capability');
}

/**
 * Called with a provider's real, verified coordinates. Looks at every line
 * they hold an APPROVED enrolment for and provisions whatever that line's
 * matching engine needs to actually find them.
 *
 * Best-effort by design: a failure here must never block an approval or a
 * goOnline call, which is why every branch is individually guarded.
 */
async function provisionCoverage({ shopId = null, workerId = null, coordinates }) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return;
  const key = shopId ? { shopId } : { workerId };
  if (!key.shopId && !key.workerId) return;
  // A shop's technician works under the shop's coverage, never their own.
  if (workerId && await Worker.exists({ _id: workerId, shopId: { $ne: null } })) return;

  const { ProviderEnrolment, ServiceLine } = require('./onboarding.model');
  const enrolments = await ProviderEnrolment.find({ ...key, status: 'approved' }).lean();
  if (!enrolments.length) return;

  const lines = await ServiceLine.find({ code: { $in: enrolments.map((e) => e.lineCode) } }).lean();

  const needsRepairArea = lines.some((l) => l.repairVertical);
  if (needsRepairArea) {
    await provisionRepairArea(key, coordinates).catch((err) => {
      logger.warn({ err: err.message, ...key }, '[auto-provision] repair service area failed');
    });
  }

  for (const line of lines.filter((l) => l.domainCode === 'pet_services')) {
    await provisionPetCapability(key, coordinates, line.code).catch((err) => {
      logger.warn({ err: err.message, ...key, categoryCode: line.code }, '[auto-provision] pet capability failed');
    });
  }
}

module.exports = { provisionCoverage };
