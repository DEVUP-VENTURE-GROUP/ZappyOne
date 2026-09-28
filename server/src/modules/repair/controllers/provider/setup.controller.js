const { ProviderCapability, SkillLevel } = require('../../models/capability.model');
const { ProviderServiceArea } = require('../../models/config.model');
const { ProviderInventory } = require('../../models/inventory.model');
const { ApprovalRequest } = require('../../models/governance.model');
const { Part } = require('../../models/part.model');
const { Repair } = require('../../models/repair.model');
const { verticalOf } = require('../../vertical');
const { ownerOf, ownerFilter } = require('./owner');

/** What a provider offers and where: capabilities, service areas, inventory. */

/* Capabilities (§15) */

async function listCapabilities(req, res, next) {
  try {
    // A provider approved for two verticals has two separate skill lists —
    // showing phone capabilities on the laptop screen would invite them to
    // price work they are not verified for.
    const rows = await ProviderCapability.find({ ...ownerFilter(req), vertical: verticalOf(req) })
      .sort({ repairCode: 1 })
      .lean();

    // Pair each capability with its repair so the UI can show what it means
    // without the client having to hold the catalog.
    const codes = rows.map((r) => r.repairCode);
    const repairs = await Repair.find({ code: { $in: codes }, vertical: verticalOf(req) })
      .select('code name minSkillLevel pricingMode')
      .lean();
    const byCode = new Map(repairs.map((r) => [r.code, r]));

    res.json({
      capabilities: rows.map((r) => ({ ...r, repair: byCode.get(r.repairCode) || null })),
    });
  } catch (err) { next(err); }
}

async function upsertCapability(req, res, next) {
  try {
    const { repairCode, brandCodes = [], modelCodes = [], qualityCodes = [], serviceModes, skillLevel = 1, estimatedDurationMin } = req.body;

    const repair = await Repair.findOne({ code: repairCode, vertical: verticalOf(req), isActive: true }).lean();
    if (!repair) return res.status(400).json({ error: 'Unknown repair', code: 'UNKNOWN_REPAIR' });

    // A provider cannot claim work above the repair's skill floor.
    if (skillLevel < repair.minSkillLevel) {
      return res.status(400).json({
        error: `This repair requires skill level ${repair.minSkillLevel} or above`,
        code: 'SKILL_TOO_LOW',
        requiredLevel: repair.minSkillLevel,
      });
    }

    // Verification-gated levels are held pending until an admin approves (§16).
    const level = await SkillLevel.findOne({ level: skillLevel, vertical: verticalOf(req) }).lean();
    const needsVerification = !!level?.requiresVerification;

    const owner = ownerOf(req);
    const filter = owner.shopId ? { shopId: owner.shopId, repairCode } : { workerId: owner.workerId, repairCode };

    const existing = await ProviderCapability.findOne(filter);
    // Re-claiming a level already approved should not silently reset to pending.
    const alreadyApprovedAtLevel = existing?.verificationStatus === 'approved' && existing.skillLevel === skillLevel;

    const doc = await ProviderCapability.findOneAndUpdate(
      filter,
      {
        $set: {
          ...owner,
          vertical: verticalOf(req),
          repairCode,
          brandCodes, modelCodes, qualityCodes,
          serviceModes: serviceModes || ['doorstep'],
          skillLevel,
          estimatedDurationMin: estimatedDurationMin ?? null,
          verificationStatus: needsVerification
            ? (alreadyApprovedAtLevel ? 'approved' : 'pending')
            : 'not_required',
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (needsVerification && doc.verificationStatus === 'pending') {
      await ApprovalRequest.findOneAndUpdate(
        { kind: 'skill_level', entityId: doc._id, status: 'pending' },
        {
          $set: {
            entityType: 'ProviderCapability',
            title: `Skill level ${skillLevel} claim for ${repair.name}`,
            summary: `${req.auth.role} ${req.auth.sub} claims level ${skillLevel}`,
            proposed: { repairCode, skillLevel },
            requestedByRole: req.auth.role === 'shop' ? 'shop' : 'worker',
            requestedById: req.auth.sub,
            priority: 'normal',
          },
        },
        { upsert: true },
      );
    }

    res.json({
      capability: doc,
      pendingVerification: doc.verificationStatus === 'pending',
      note: doc.verificationStatus === 'pending'
        ? 'This skill level needs admin verification before you receive jobs for it.'
        : undefined,
    });
  } catch (err) { next(err); }
}

async function removeCapability(req, res, next) {
  try {
    const doc = await ProviderCapability.findOneAndUpdate(
      { ...ownerFilter(req), _id: req.params.id },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'Capability not found' });
    res.json({ capability: doc });
  } catch (err) { next(err); }
}

/* Service areas (§17) */

async function listServiceAreas(req, res, next) {
  try {
    const areas = await ProviderServiceArea.find(ownerFilter(req)).lean();
    res.json({ areas });
  } catch (err) { next(err); }
}

async function upsertServiceArea(req, res, next) {
  try {
    const { cityCode, areaNames = [], pincodes = [], center, radiusKm = 10, serviceModes, workshopAddress, workshopLocation } = req.body;

    // Workshop and pickup modes are meaningless without somewhere to take the
    // device, so the address is required rather than silently optional.
    const modes = serviceModes || ['doorstep'];
    const needsWorkshop = modes.includes('workshop') || modes.includes('pickup_repair');
    if (needsWorkshop && !workshopAddress) {
      return res.status(400).json({
        error: 'A workshop address is required to offer workshop or pickup service',
        code: 'WORKSHOP_ADDRESS_REQUIRED',
      });
    }

    const owner = ownerOf(req);
    const filter = owner.shopId ? { shopId: owner.shopId, cityCode } : { workerId: owner.workerId, cityCode };

    /**
     * A half-written GeoJSON point breaks the 2dsphere index.
     *
     * `center` and `workshopLocation` default their `type` to 'Point' but leave
     * `coordinates` undefined, so saving an area without a map pin stored
     * `{ type: 'Point' }` — which Mongo rejects outright: "Point must be an
     * array or object". Most providers set a city and a radius and never drop a
     * pin, so this was the common path, not an edge case. Unset the field
     * entirely rather than storing half of one.
     */
    const hasCenter = Array.isArray(center) && center.length === 2;
    const hasWorkshopPin = Array.isArray(workshopLocation) && workshopLocation.length === 2;

    /**
     * An area with no pin and no pincodes can never match a single customer.
     *
     * findServiceableProviders covers a provider one of two ways: the customer's
     * pincode is on their list, or the customer is inside radiusKm of their
     * CENTRE. With neither, every check fails and the provider is invisible —
     * fully verified, fully priced, and never offered a job, with nothing on any
     * screen to say why. Refusing the save is the only honest answer.
     *
     * Note what the centre is NOT: it is not where the owner happens to be
     * standing. It is the shop's fixed location, set once. An owner who is out
     * of the shop still receives the job and assigns it to a technician, so
     * matching must never follow their live position.
     */
    if (!hasCenter && !(pincodes || []).length) {
      return res.status(400).json({
        error: 'Drop a pin on your shop location, or list the pincodes you cover — '
          + 'without one of the two, no customer can ever be matched to you.',
        code: 'SERVICE_AREA_UNREACHABLE',
      });
    }

    const unset = {};
    if (!hasCenter) unset.center = '';
    if (!hasWorkshopPin) unset.workshopLocation = '';

    const doc = await ProviderServiceArea.findOneAndUpdate(
      filter,
      {
        $set: {
          ...owner, cityCode, areaNames, pincodes,
          ...(hasCenter ? { center: { type: 'Point', coordinates: center } } : {}),
          radiusKm, serviceModes: modes,
          workshopAddress: workshopAddress || '',
          ...(hasWorkshopPin ? { workshopLocation: { type: 'Point', coordinates: workshopLocation } } : {}),
          isActive: true,
        },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ area: doc });
  } catch (err) { next(err); }
}

/* Inventory (§14) */

async function listInventory(req, res, next) {
  try {
    const rows = await ProviderInventory.find(ownerFilter(req)).lean();

    /**
     * Stock rows have no vertical of their own — the PART carries it. So the
     * vertical filter is applied to the parts, and a row whose part belongs to
     * another vertical simply is not this screen's business.
     */
    const parts = await Part.find({
      _id: { $in: rows.map((r) => r.partId) },
      vertical: verticalOf(req),
    }).select('sku name componentCode brandCode qualityCode compatibleModelCodes').lean();
    const byId = new Map(parts.map((p) => [String(p._id), p]));

    res.json({
      inventory: rows.filter((r) => byId.has(String(r.partId))).map((r) => ({
        ...r,
        // `available` is a virtual, so it is recomputed here for lean() rows.
        available: Math.max(0, (r.quantity || 0) - (r.reserved || 0)),
        part: byId.get(String(r.partId)) || null,
      })),
    });
  } catch (err) { next(err); }
}

async function upsertInventory(req, res, next) {
  try {
    const { partId, quantity = 0, costPaise = 0, lowStockThreshold = 2, onOrder = false } = req.body;

    const part = await Part.findById(partId).lean();
    if (!part) return res.status(400).json({ error: 'Unknown part', code: 'UNKNOWN_PART' });

    const owner = ownerOf(req);
    const filter = owner.shopId ? { shopId: owner.shopId, partId } : { workerId: owner.workerId, partId };

    // Fetched-then-saved (rather than a raw update) so the pre-save hook
    // recomputes status from the new quantity.
    let doc = await ProviderInventory.findOne(filter);
    if (!doc) doc = new ProviderInventory({ ...owner, partId, partSku: part.sku });

    doc.quantity = quantity;
    doc.costPaise = costPaise;
    doc.lowStockThreshold = lowStockThreshold;
    doc.onOrder = onOrder;
    doc.lastUpdatedBy = req.auth.sub;
    if (quantity > 0) doc.lastRestockedAt = new Date();
    await doc.save();

    res.json({ inventory: { ...doc.toObject(), available: doc.available } });
  } catch (err) { next(err); }
}

module.exports = {
  listCapabilities,
  upsertCapability,
  removeCapability,
  listServiceAreas,
  upsertServiceArea,
  listInventory,
  upsertInventory,
};
