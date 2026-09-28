const Worker = require('../worker.model');

/** The worker's profile: public card, edits, onboarding, avatar, bank accounts, skills. */

async function getPublicProfile(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id)
      .select('name rating completedJobs skills kyc.status penalties createdAt')
      .lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    /**
     * What this technician is VERIFIED to do, for the customer to see.
     *
     * `skills` was a list the worker typed about themselves; a customer reading
     * it had no way to know whether anyone had checked. Verified services come
     * from approved enrolments — a human reviewed their documents for each one —
     * so it is a claim the platform is standing behind.
     */
    const { ProviderEnrolment } = require('../../onboarding/onboarding.model');
    const { ServiceLine } = require('../../onboarding/onboarding.model');
    const approved = await ProviderEnrolment.find({ workerId: worker._id, status: 'approved' })
      .select('lineCode')
      .lean();
    const lines = approved.length
      ? await ServiceLine.find({ code: { $in: approved.map((a) => a.lineCode) } })
        .select('code name customerPath repairVertical')
        .lean()
      : [];
    worker.verifiedServices = lines.map((l) => ({
      code: l.code, name: l.name, path: l.customerPath, vertical: l.repairVertical,
    }));

    // Trust signals: recent reviews + star breakdown + top services this pro does.
    const Order = require('../../order/order.model');
    const rated = await Order.find({ workerId: worker._id, userRating: { $exists: true, $ne: null } })
      .select('userRating userReview service ratingSubmittedAt completedAt')
      .sort({ ratingSubmittedAt: -1 })
      .limit(60)
      .lean();

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const serviceCounts = {};
    const reviews = [];
    for (const o of rated) {
      breakdown[o.userRating] = (breakdown[o.userRating] || 0) + 1;
      if (o.service) serviceCounts[o.service] = (serviceCounts[o.service] || 0) + 1;
      if (o.userReview && reviews.length < 12) {
        reviews.push({
          rating: o.userRating,
          text: String(o.userReview).slice(0, 400),
          service: o.service,
          at: o.ratingSubmittedAt || o.completedAt,
        });
      }
    }
    const topServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);

    res.json({
      worker: {
        _id:           worker._id,
        name:          worker.name,
        rating:        worker.rating,
        completedJobs: worker.completedJobs,
        skills:        worker.skills || [],
        verified:      worker.kyc?.status === 'approved',
        memberSince:   worker.createdAt,
        acceptRate:    worker.penalties?.totalOffers > 0
          ? Math.round(((worker.penalties.totalOffers - (worker.penalties.totalRejects || 0)) / worker.penalties.totalOffers) * 100)
          : null,
        ratingCount:   rated.length,
        breakdown,
        topServices,
      },
      reviews,
    });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const { name, skills, bio, expertise } = req.body;
    const update = {};
    if (name)   update.name   = name;
    if (bio !== undefined) update.bio = bio;

    // When rich expertise is provided, it becomes the source of truth and the flat
    // `skills` dispatch match-set is derived from the union of all handled services.
    // An explicit `skills` array still wins if sent without expertise (legacy path).
    let effectiveSkills = skills;
    if (Array.isArray(expertise)) {
      update.expertise = expertise;
      const derived = [...new Set(expertise.flatMap(e => e.services || []))];
      if (derived.length) effectiveSkills = derived;
    }
    if (effectiveSkills) update.skills = effectiveSkills;

    // Capture the previous skills so removed ones can be pruned from Redis.
    const before = effectiveSkills
      ? await require('../worker.model').findById(workerId).select('skills').lean()
      : null;

    const worker = await require('../worker.model').findByIdAndUpdate(
      workerId,
      { $set: update },
      { new: true, runValidators: true }
    ).select('name skills bio expertise').lean();

    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Resync the Redis skill sets. (markOnline alone only ADDS — it never removed
    // skills the worker dropped, so they kept getting offers for them.)
    if (effectiveSkills) {
      const geoService = require('../geo.service');
      await geoService.syncSkills(workerId, before?.skills || [], effectiveSkills).catch(() => {});
    }

    res.json({ worker });
  } catch (err) { next(err); }
}

async function completeOnboarding(req, res, next) {
  try {
    const { name, skills, emergencyContact } = req.body;
    const before = await Worker.findById(req.auth.sub).select('skills').lean();

    // Only write `skills` when the caller actually sent them. Onboarding no
    // longer collects them, and setting the field unconditionally would wipe
    // the list of an existing worker who re-runs this step.
    const worker = await Worker.findByIdAndUpdate(
      req.auth.sub,
      {
        $set: {
          name,
          ...(Array.isArray(skills) ? { skills } : {}),
          onboardingComplete: true,
          ...(emergencyContact && { emergencyContact }),
        },
      },
      { new: true }
    );
    // Keep the Redis skill sets in step (no-op if they're offline, which is usual here).
    if (Array.isArray(skills)) {
      const geoService = require('../geo.service');
      await geoService.syncSkills(req.auth.sub, before?.skills || [], skills).catch(() => {});
    }
    res.json({ worker });
  } catch (err) { next(err); }
}

async function streamAvatar(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).select('profilePhotoKey kyc').lean();
    const key = worker?.profilePhotoKey ?? worker?.kyc?.selfieUrl;
    if (!key) return res.status(404).json({ error: 'No profile photo set' });
    const s3Service = require('../../../core/storage/s3');
    await s3Service.streamToResponse(key, res);
  } catch (err) {
    if (err?.name === 'NoSuchKey') return res.status(404).json({ error: 'Photo not found' });
    next(err);
  }
}

/* Bank Account Management */

async function getBankAccounts(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).select('savedBankAccounts savedUpiIds').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    const banks = (worker.savedBankAccounts || []).map(b => ({
      ...b,
      accountNumber: `XXXX${b.accountNumber.slice(-4)}`,
    }));
    res.json({ banks, upiIds: worker.savedUpiIds || [] });
  } catch (err) { next(err); }
}

async function addBankAccount(req, res, next) {
  try {
    const { label, accountName, accountNumber, bankName, ifsc, type, upiId, upiLabel } = req.body;
    const worker = await Worker.findById(req.auth.sub).select('savedBankAccounts savedUpiIds').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const MAX_ACCOUNTS = 5;
    if (type === 'upi') {
      if ((worker.savedUpiIds || []).length >= MAX_ACCOUNTS) {
        return res.status(400).json({ error: `Maximum ${MAX_ACCOUNTS} UPI IDs allowed. Delete one first.` });
      }
      // Prevent duplicate UPI IDs
      const exists = (worker.savedUpiIds || []).some(u => u.upiId === upiId);
      if (exists) return res.status(409).json({ error: 'This UPI ID is already saved' });

      await Worker.updateOne({ _id: req.auth.sub }, { $push: { savedUpiIds: { upiId, label: upiLabel || upiId, isDefault: false } } });
    } else {
      if ((worker.savedBankAccounts || []).length >= MAX_ACCOUNTS) {
        return res.status(400).json({ error: `Maximum ${MAX_ACCOUNTS} bank accounts allowed. Delete one first.` });
      }
      // Prevent duplicate account numbers
      const exists = (worker.savedBankAccounts || []).some(b => b.accountNumber === accountNumber && b.ifsc === ifsc);
      if (exists) return res.status(409).json({ error: 'This bank account is already saved' });

      await Worker.updateOne({ _id: req.auth.sub }, { $push: { savedBankAccounts: { label, accountName, accountNumber, bankName, ifsc, isDefault: false } } });
    }
    const w = await Worker.findById(req.auth.sub).select('savedBankAccounts savedUpiIds').lean();
    res.status(201).json({
      banks: (w.savedBankAccounts || []).map(b => ({ ...b, accountNumber: `XXXX${b.accountNumber.slice(-4)}` })),
      upiIds: w.savedUpiIds || [],
    });
  } catch (err) { next(err); }
}

async function deleteBankAccount(req, res, next) {
  try {
    const { id, type } = req.params;
    if (type === 'upi') {
      await Worker.updateOne({ _id: req.auth.sub }, { $pull: { savedUpiIds: { _id: id } } });
    } else {
      await Worker.updateOne({ _id: req.auth.sub }, { $pull: { savedBankAccounts: { _id: id } } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function setDefaultBankAccount(req, res, next) {
  try {
    const { id, type } = req.params;
    if (type === 'upi') {
      await Worker.updateOne({ _id: req.auth.sub }, { $set: { 'savedUpiIds.$[].isDefault': false } });
      await Worker.updateOne({ _id: req.auth.sub, 'savedUpiIds._id': id }, { $set: { 'savedUpiIds.$.isDefault': true } });
    } else {
      await Worker.updateOne({ _id: req.auth.sub }, { $set: { 'savedBankAccounts.$[].isDefault': false } });
      await Worker.updateOne({ _id: req.auth.sub, 'savedBankAccounts._id': id }, { $set: { 'savedBankAccounts.$.isDefault': true } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function updateSkills(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const { skills, skillPrimary, expertise } = req.body;

    // Read the current skills BEFORE the write so we can diff the Redis sets.
    const before = await Worker.findById(workerId).select('skills').lean();
    const oldSkills = before?.skills || [];

    const update = {};
    // Rich expertise is the source of truth when present; the flat `skills`
    // dispatch set is derived from the union of its services so the two never drift.
    let effectiveSkills = Array.isArray(skills) ? skills : null;
    if (Array.isArray(expertise)) {
      update.expertise = expertise;
      const derived = [...new Set(expertise.flatMap(e => e.services || []))];
      if (derived.length) effectiveSkills = derived;
    }
    if (Array.isArray(effectiveSkills)) update.skills = effectiveSkills;
    if (skillPrimary !== undefined) update.skillPrimary = skillPrimary ?? null;
    await Worker.updateOne({ _id: workerId }, { $set: update });

    // Dispatch matches on the Redis skill sets, not Mongo. Without this resync an
    // online worker who adds a skill would never be offered those jobs (and a
    // removed skill would keep producing offers) until they toggled offline/online.
    if (Array.isArray(effectiveSkills)) {
      const geoService = require('../geo.service');
      await geoService.syncSkills(workerId, oldSkills, effectiveSkills).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  getPublicProfile,
  updateProfile,
  completeOnboarding,
  streamAvatar,
  getBankAccounts,
  addBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
  updateSkills,
};
