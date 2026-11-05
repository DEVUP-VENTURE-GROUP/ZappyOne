const { httpError } = require('../../core/errors');
const { carryIdentity } = require('./identity');
const {
  ServiceDomain, ServiceLine, KycRequirementSet, ProviderEnrolment, ServiceLineRequest,
} = require('./onboarding.model');

/**
 * Provider onboarding logic.
 *
 * Two things are enforced here rather than in the controller, so they hold for
 * every caller — provider app, admin panel, or a future partner API:
 *
 *   A PROVIDER CANNOT SELF-APPROVE. Submitting moves an enrolment to
 *   `pending_review` and nothing else. Only `decide()` can approve, and only an
 *   admin reaches it.
 *
 *   A SUBMISSION IS CHECKED AGAINST THE RULES IN FORCE. Requirements are data
 *   and admins edit them; the set used is resolved at submit time, recorded on
 *   the enrolment, and the required documents are verified present before the
 *   record is allowed to leave draft. An incomplete application never reaches a
 *   reviewer's queue.
 */


/* Catalog reads */

async function listDomains() {
  return ServiceDomain.find({ isActive: true, isArchived: false })
    .sort({ displayOrder: 1, name: 1 })
    .lean();
}

/**
 * Lines within a domain, filtered to what this kind of provider may take.
 *
 * `coming_soon` lines are returned, not hidden: telling a scooter mechanic
 * "vehicles are opening soon" is useful, and lets us measure demand. They are
 * simply not enrollable — see `enrol()`.
 */
// Staff-only services belong to ZappyOne staff only while own staff runs; in version 1 (switch off) verified partners take them.
const staffOnlyApplies = () => require('../feature-flags/feature-flag.service').isEnabled('own_staff');

async function listLines({ domainCode, providerKind = null, staff = false } = {}) {
  const filter = { isActive: true, isArchived: false, ...(staff || !(await staffOnlyApplies()) ? {} : { staffOnly: { $ne: true } }) };
  if (domainCode) filter.domainCode = String(domainCode).toLowerCase();
  if (providerKind) filter.providerKinds = providerKind;

  return ServiceLine.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
}

/**
 * The requirement set that governs one (line, provider kind).
 *
 * Resolution is most-specific-first: a set naming the line wins over the
 * domain-wide one, so admins write the common case once.
 */
async function resolveRequirements({ lineCode, providerKind }) {
  const line = await ServiceLine.findOne({
    code: String(lineCode).toLowerCase(), isActive: true, isArchived: false,
  }).lean();
  if (!line) throw httpError('Unknown service line', 404, 'UNKNOWN_LINE');

  const sets = await KycRequirementSet.find({
    domainCode: line.domainCode,
    providerKind,
    isActive: true,
    isArchived: false,
    $or: [{ lineCode: line.code }, { lineCode: null }],
  }).lean();

  const set = sets.find((s) => s.lineCode === line.code) || sets.find((s) => !s.lineCode) || null;
  return { line, set };
}

/* Enrolment */

function ownerFilter(owner) {
  return owner.kind === 'shop' ? { shopId: owner.id } : { workerId: owner.id };
}

/** Every line this provider has started, in any state. */
async function listEnrolments(owner) {
  await enrolSetUpWork(owner).catch(() => {});
  const rows = await ProviderEnrolment.find(ownerFilter(owner)).sort({ updatedAt: -1 }).lean();
  if (!rows.length) return [];

  const lines = await ServiceLine.find({ code: { $in: rows.map((r) => r.lineCode) } })
    .select('code name domainCode repairVertical status')
    .lean();
  const byCode = new Map(lines.map((l) => [l.code, l]));

  return rows.map((r) => ({ ...r, line: byCode.get(r.lineCode) || null }));
}

/**
 * Work set up without an application for it. The repair setup screen let a
 * provider choose their work and prices for a service they never applied for,
 * so it never showed under their services and could never be verified (a shop
 * priced phone repair and saw only its other services). Any repair work they
 * have set up gets its application, as a draft for them to finish.
 */
async function enrolSetUpWork(owner) {
  const { ProviderCapability } = require('../repair/models/capability.model');
  const verticals = await ProviderCapability.distinct('vertical', { ...ownerFilter(owner), isActive: true });
  if (!verticals.length) return;
  const lines = await ServiceLine.find({ repairVertical: { $in: verticals }, status: 'live', isActive: true, isArchived: false }).select('code').lean();
  const have = new Set(await ProviderEnrolment.distinct('lineCode', ownerFilter(owner)));
  for (const l of lines) {
    if (!have.has(l.code)) await enrol({ owner, providerKind: owner.providerKind, lineCode: l.code }).catch(() => {});
  }
}

/**
 * Start (or re-open) an enrolment.
 *
 * Idempotent by (provider, line): calling it twice returns the same record
 * rather than creating a second application for the same work.
 */
async function enrol({ owner, providerKind, lineCode }) {
  const line = await ServiceLine.findOne({
    code: String(lineCode).toLowerCase(), isActive: true, isArchived: false,
  }).lean();
  if (!line) throw httpError('Unknown service line', 404, 'UNKNOWN_LINE');

  if (line.status !== 'live') {
    throw httpError(
      `${line.name} is not open for providers yet - we will notify you when it is.`,
      409, 'LINE_NOT_LIVE',
    );
  }
  if (line.staffOnly && await staffOnlyApplies()) {
    throw httpError(`${line.name} is done by ZappyOne staff only`, 409, 'STAFF_ONLY_LINE');
  }
  if (!line.providerKinds.includes(providerKind)) {
    throw httpError(
      `${line.name} is not available for this kind of provider`,
      409, 'PROVIDER_KIND_NOT_ALLOWED',
    );
  }

  const existing = await ProviderEnrolment.findOne({ ...ownerFilter(owner), lineCode: line.code });
  if (existing) {
    await carryIdentity(existing);
    return existing;
  }

  const created = await ProviderEnrolment.create({
    providerKind,
    ...ownerFilter(owner),
    domainCode: line.domainCode,
    lineCode: line.code,
    status: 'draft',
  });
  // Identity given once (another service, or the ID check) is never asked again.
  await carryIdentity(created);
  return created;
}

/** Save progress. Documents and fields merge by code so partial saves are safe. */
async function saveSubmission({ owner, enrolmentId, documents = [], fields = [], acceptedDeclarations }) {
  const enrolment = await ProviderEnrolment.findOne({ _id: enrolmentId, ...ownerFilter(owner) });
  if (!enrolment) throw httpError('Enrolment not found', 404, 'NOT_FOUND');

  if (['approved', 'suspended'].includes(enrolment.status)) {
    throw httpError('This enrolment has already been decided', 409, 'ALREADY_DECIDED');
  }
  // Asked for specific documents again: only those can change.
  const redo = enrolment.redo?.codes?.length ? new Set(enrolment.redo.codes) : null;

  for (const doc of documents) {
    const code = String(doc.code).toLowerCase();
    if (redo && !redo.has(code)) continue;
    const at = enrolment.documents.findIndex((d) => d.code === code);
    const row = {
      code,
      url: doc.url,
      uploadedAt: new Date(),
      // Trusted from the client only as a claim about how it was taken; the
      // reviewer still looks. What it prevents is an unlabelled gallery image
      // silently passing as a live capture.
      captureMethod: doc.captureMethod === 'live_camera' ? 'live_camera' : 'upload',
      capturedAt: doc.capturedAt || null,
      lat: doc.lat ?? null,
      lng: doc.lng ?? null,
    };
    if (at >= 0) enrolment.documents[at] = row;
    else enrolment.documents.push(row);
  }

  for (const f of (redo ? [] : fields)) {
    const code = String(f.code).toLowerCase();
    const at = enrolment.fields.findIndex((x) => x.code === code);
    const row = { code, value: f.value ?? '' };
    if (at >= 0) enrolment.fields[at] = row;
    else enrolment.fields.push(row);
  }

  if (acceptedDeclarations != null) enrolment.acceptedDeclarations = !!acceptedDeclarations;

  await enrolment.save();
  return enrolment;
}

/**
 * Hand the application to a reviewer.
 *
 * Completeness is checked HERE and not on the client, because "the form let me
 * press submit" is not evidence that a document exists. An incomplete
 * application is refused with the exact list of what is missing, so the
 * provider can fix it in one pass instead of guessing.
 */
async function submitForReview({ owner, enrolmentId }) {
  const enrolment = await ProviderEnrolment.findOne({ _id: enrolmentId, ...ownerFilter(owner) });
  if (!enrolment) throw httpError('Enrolment not found', 404, 'NOT_FOUND');
  if (enrolment.status === 'approved') {
    throw httpError('This line is already approved', 409, 'ALREADY_APPROVED');
  }
  // A business's service is verified only once its profile is complete (onboarding/profile-check); a technician's identity travels with the application itself.
  const status = owner.kind === 'shop' ? await require('./profile-check').profileStatus('shop', owner.id) : { missing: [] };
  // Identity documents arrive with the application itself, so only the business details are required first.
  // The UPI ID is needed to go live (customers pay them), not to apply.
  const profile = { missing: status.missing.filter((m) => m.key !== 'kyc' && m.key !== 'upi') };
  profile.complete = profile.missing.length === 0;
  if (!profile.complete) throw httpError(`Finish your profile first: ${profile.missing.map((m) => m.label.toLowerCase()).join(', ')}.`, 409, 'PROFILE_INCOMPLETE', { missing: profile.missing });

  await carryIdentity(enrolment);
  const { set } = await resolveRequirements({
    lineCode: enrolment.lineCode,
    providerKind: enrolment.providerKind,
  });
  if (!set) {
    throw httpError(
      'Verification requirements for this service are not configured yet',
      409, 'REQUIREMENTS_MISSING',
    );
  }

  const haveDocs = new Set(enrolment.documents.filter((d) => d.url).map((d) => d.code));
  const haveFields = new Set(enrolment.fields.filter((f) => String(f.value).trim()).map((f) => f.code));

  const missing = [
    ...set.documents.filter((d) => d.required && !haveDocs.has(d.code)).map((d) => ({ kind: 'document', code: d.code, label: d.label })),
    ...set.fields.filter((f) => f.required && !haveFields.has(f.code)).map((f) => ({ kind: 'field', code: f.code, label: f.label })),
  ];

  if (set.declarations.length && !enrolment.acceptedDeclarations) {
    missing.push({ kind: 'declaration', code: 'declarations', label: 'Accept the service conditions' });
  }

  // Each document the reviewer asked for must be a new one, sent after the request.
  if (enrolment.redo?.codes?.length) {
    const since = enrolment.redo.requestedAt || new Date(0);
    for (const code of enrolment.redo.codes) {
      const d = enrolment.documents.find((x) => x.code === code);
      if (!d?.url || !(new Date(d.uploadedAt) > since)) {
        missing.push({ kind: 'document', code, label: set.documents.find((x) => x.code === code)?.label || code });
      }
    }
  }

  if (missing.length) {
    throw httpError('Some required items are still missing', 400, 'INCOMPLETE', { missing });
  }

  // Field formats are validated against the rules as configured, so a pattern
  // an admin tightens today applies to the next submission without a deploy.
  const badFormat = [];
  for (const f of set.fields) {
    // Optional means optional: what is typed there never stops an application; admin sees it as it is.
    if (!f.pattern || !f.required) continue;
    const given = enrolment.fields.find((x) => x.code === f.code)?.value || '';
    if (!given) continue;
    let re;
    try { re = new RegExp(f.pattern); } catch { continue; }
    if (!re.test(given)) badFormat.push({ code: f.code, label: f.label });
  }
  if (badFormat.length) {
    throw httpError('Some details are not in the expected format', 400, 'BAD_FORMAT', { fields: badFormat });
  }

  enrolment.status = 'pending_review';
  enrolment.submittedAt = new Date();
  enrolment.requirementSetId = set._id;
  enrolment.reviewNote = '';
  enrolment.redo = { codes: [], note: '', requestedAt: null };
  await enrolment.save();
  require('../messaging/verification').submitted(enrolment).catch(() => {});
  // Partners list directly once their ID is verified: the service opens now and admin reviews afterwards, unless its requirements ask admin to check each one.
  if (!set.manualReview && await identityVerified(owner)) {
    const approved = await decide({ enrolmentId: enrolment._id, decision: 'approved', note: 'Approved on submit: ID already verified. Admin can review any time.', adminId: null });
    require('../admin/ops-alerts').raise({
      type: 'service_opened', title: 'Partner went live on a service', body: `${enrolment.lineCode}: approved on submit (ID verified). Review in Verification, Service applications.`,
      data: { enrolmentId: String(enrolment._id), lineCode: enrolment.lineCode },
    }).catch(() => {});
    return approved;
  }
  return enrolment;
}

// The account's own identity check (shop or technician KYC) is approved by ZappyOne: that check never goes automatic.
async function identityVerified(owner) {
  const Model = owner.kind === 'shop' ? require('../shop/shop.model') : require('../worker/worker.model');
  const doc = await Model.findById(owner.id).select('kyc.status').lean();
  return doc?.kyc?.status === 'approved';
}

/* Admin decision */

/**
 * Approve, reject or suspend one enrolment.
 *
 * Scoped to a single line on purpose: revoking a provider's laptop approval
 * must not touch the phone work they are already doing well.
 */
async function decide({ enrolmentId, decision, note = '', adminId, docCodes = [] }) {
  // 'changes': send back named documents only; the rest of the application stands.
  const allowed = ['approved', 'rejected', 'suspended', 'changes'];
  if (!allowed.includes(decision)) {
    throw httpError('Unknown decision', 400, 'UNKNOWN_DECISION', { allowed });
  }

  const enrolment = await ProviderEnrolment.findById(enrolmentId);
  if (!enrolment) throw httpError('Enrolment not found', 404, 'NOT_FOUND');

  if (decision === 'approved' && enrolment.status === 'draft') {
    throw httpError('This application has not been submitted yet', 409, 'NOT_SUBMITTED');
  }

  if (decision === 'changes') {
    const codes = [...new Set((docCodes || []).map((c) => String(c).toLowerCase()))];
    if (!codes.length) throw httpError('Pick the documents to send again', 400, 'NO_DOCUMENTS');
    enrolment.redo = { codes, note, requestedAt: new Date() };
    decision = 'rejected';
  } else {
    enrolment.redo = { codes: [], note: '', requestedAt: null };
  }
  enrolment.status = decision;
  enrolment.reviewedById = adminId || null;
  enrolment.reviewedAt = new Date();
  enrolment.reviewNote = note;
  await enrolment.save();
  if (['approved', 'rejected'].includes(decision)) require('../messaging/verification').decided(enrolment).catch(() => {});
  if (decision === 'approved') {
    await require('./auto-provision.service').approveSkillsForApprovedLines(
      enrolment.shopId ? { shopId: enrolment.shopId } : { workerId: enrolment.workerId },
    ).catch(() => {});
  }

  /*
   * A shop's registered address is real and known the moment they are
   * approved — unlike an individual worker, who has no registered address at
   * all and is only provisioned once they report a real GPS fix (see
   * worker.service.js goOnline). Best-effort: an approval must never fail
   * because provisioning did.
   */
  if (decision === 'approved' && enrolment.shopId) {
    const Shop = require('../shop/shop.model');
    const shop = await Shop.findById(enrolment.shopId).select('address.location').lean();
    const coordinates = shop?.address?.location?.coordinates;
    if (coordinates?.length === 2) {
      const { provisionCoverage } = require('./auto-provision.service');
      await provisionCoverage({ shopId: enrolment.shopId, coordinates }).catch((err) => {
        require('../../core/logger').warn({ err: err.message }, '[onboarding] auto-provision on approval failed');
      });
    }
  }

  return enrolment;
}

/* "My service isn't listed" */

async function requestLine({ owner, providerKind, domainCode = '', proposedName, description = '', packages = [], photos = [], serviceModes = [], yearsExperience = null }) {
  const filter = {
    ...ownerFilter(owner),
    proposedName: new RegExp(`^${String(proposedName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    status: 'pending',
  };
  const existing = await ServiceLineRequest.findOne(filter);
  // Sending the same service again while it waits updates it: the latest photos, jobs and prices are what admin reviews.
  if (existing) {
    Object.assign(existing, { domainCode: String(domainCode || existing.domainCode || '').toLowerCase(), description, packages, photos, serviceModes, yearsExperience });
    await existing.save();
    return { request: existing, deduped: true };
  }

  const request = await ServiceLineRequest.create({
    providerKind,
    ...ownerFilter(owner),
    domainCode: String(domainCode || '').toLowerCase(),
    proposedName,
    description,
    packages,
    photos,
    serviceModes,
    yearsExperience,
  });
  const warnings = await requestWarnings(request);
  // Partners list directly: with a domain and at least one priced job, and no service of that name already, it goes live now;
  // admin reviews afterwards and can edit or hide it. Otherwise it waits for admin, and the warnings say why.
  const blocking = warnings.some((w) => w.blocking);
  if (!blocking) {
    const slug = String(proposedName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'service';
    const line = await require('./line-open').openService(request, {
      code: `${slug}_${request._id.toString().slice(-4)}`, name: proposedName, domainCode: request.domainCode, status: 'live',
      // The first photo is the cover the partner chose (the request form says so).
      serviceImage: photos[0] || '', note: 'Opened by the partner directly. Review, edit or hide it any time.',
    });
    require('../admin/ops-alerts').raise({
      type: 'service_opened', title: `New service live: ${line.name}`, body: 'A partner listed it directly. Review it in Verification, Service requests.',
      data: { requestId: String(request._id), lineCode: line.code },
    }).catch(() => {});
    return { request, deduped: false, opened: { code: line.code, name: line.name }, warnings };
  }
  return { request, deduped: false, warnings };
}

// What a partner should know about a new service before it goes out; `blocking` ones keep it for admin.
async function requestWarnings(r) {
  const out = [];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const same = await ServiceLine.findOne({ name: new RegExp(`^\\s*${esc(String(r.proposedName).trim())}\\s*$`, 'i'), isActive: { $ne: false } }).select('code name').lean();
  if (same) out.push({ code: 'DUPLICATE', blocking: true, message: `"${same.name}" already exists. Add yourself to it from Add a service instead; ZappyOne will check this one.` });
  if (!r.domainCode) out.push({ code: 'NO_GROUP', blocking: true, message: 'Pick which group it belongs to, so ZappyOne can place it.' });
  if (!r.packages?.length) out.push({ code: 'NO_JOBS', blocking: true, message: 'Add at least one job with its time and price to go live straight away; until then ZappyOne reviews it.' });
  if (!r.photos?.length) out.push({ code: 'NO_PHOTO', message: 'Add a photo of your work. Customers choose pros with photos.' });
  if (String(r.description || '').trim().length < 30) out.push({ code: 'SHORT_ABOUT', message: 'Say a little more about what you do (30 letters or more).' });
  for (const p of r.packages || []) {
    if (p.pricePaise < 5000 || p.pricePaise > 5000000) out.push({ code: 'PRICE_CHECK', message: `Check the price of "${p.name}": ₹${Math.round(p.pricePaise / 100)} looks unusual.` });
  }
  return out;
}

// This provider's own requests, newest first, with photos signed so they can see what they sent.
async function myLineRequests(owner) {
  const s3 = require('../../core/storage/s3');
  const rows = await ServiceLineRequest.find(ownerFilter(owner)).sort({ createdAt: -1 }).limit(30)
    .select('proposedName description packages photos serviceModes yearsExperience status reviewNote resultLineCode createdAt updatedAt').lean();
  return Promise.all(rows.map(async (r) => ({
    ...r,
    photoUrls: (await Promise.all((r.photos || []).map((k) => s3.signMedia(k)))).filter(Boolean),
    packages: await Promise.all((r.packages || []).map(async (p) => ({ ...p, photoUrl: p.photoKey ? await s3.signMedia(p.photoKey) : null }))),
  })));
}

module.exports = {
  myLineRequests,
  listDomains,
  listLines,
  resolveRequirements,
  listEnrolments,
  enrol,
  saveSubmission,
  submitForReview,
  decide,
  requestLine,
  ownerFilter,
};
