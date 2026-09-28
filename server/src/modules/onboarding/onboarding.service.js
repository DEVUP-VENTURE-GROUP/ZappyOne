const { httpError } = require('../../core/errors');
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
async function listLines({ domainCode, providerKind = null } = {}) {
  const filter = { isActive: true, isArchived: false };
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
  const rows = await ProviderEnrolment.find(ownerFilter(owner)).sort({ updatedAt: -1 }).lean();
  if (!rows.length) return [];

  const lines = await ServiceLine.find({ code: { $in: rows.map((r) => r.lineCode) } })
    .select('code name domainCode repairVertical status')
    .lean();
  const byCode = new Map(lines.map((l) => [l.code, l]));

  return rows.map((r) => ({ ...r, line: byCode.get(r.lineCode) || null }));
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
      `${line.name} is not open for providers yet — we will notify you when it is.`,
      409, 'LINE_NOT_LIVE',
    );
  }
  if (!line.providerKinds.includes(providerKind)) {
    throw httpError(
      `${line.name} is not available for this kind of provider`,
      409, 'PROVIDER_KIND_NOT_ALLOWED',
    );
  }

  const existing = await ProviderEnrolment.findOne({ ...ownerFilter(owner), lineCode: line.code });
  if (existing) return existing;

  return ProviderEnrolment.create({
    providerKind,
    ...ownerFilter(owner),
    domainCode: line.domainCode,
    lineCode: line.code,
    status: 'draft',
  });
}

/** Save progress. Documents and fields merge by code so partial saves are safe. */
async function saveSubmission({ owner, enrolmentId, documents = [], fields = [], acceptedDeclarations }) {
  const enrolment = await ProviderEnrolment.findOne({ _id: enrolmentId, ...ownerFilter(owner) });
  if (!enrolment) throw httpError('Enrolment not found', 404, 'NOT_FOUND');

  if (['approved', 'suspended'].includes(enrolment.status)) {
    throw httpError('This enrolment has already been decided', 409, 'ALREADY_DECIDED');
  }

  for (const doc of documents) {
    const code = String(doc.code).toLowerCase();
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

  for (const f of fields) {
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

  if (missing.length) {
    throw httpError('Some required items are still missing', 400, 'INCOMPLETE', { missing });
  }

  // Field formats are validated against the rules as configured, so a pattern
  // an admin tightens today applies to the next submission without a deploy.
  const badFormat = [];
  for (const f of set.fields) {
    if (!f.pattern) continue;
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
  await enrolment.save();
  return enrolment;
}

/* Admin decision */

/**
 * Approve, reject or suspend one enrolment.
 *
 * Scoped to a single line on purpose: revoking a provider's laptop approval
 * must not touch the phone work they are already doing well.
 */
async function decide({ enrolmentId, decision, note = '', adminId }) {
  const allowed = ['approved', 'rejected', 'suspended'];
  if (!allowed.includes(decision)) {
    throw httpError('Unknown decision', 400, 'UNKNOWN_DECISION', { allowed });
  }

  const enrolment = await ProviderEnrolment.findById(enrolmentId);
  if (!enrolment) throw httpError('Enrolment not found', 404, 'NOT_FOUND');

  if (decision === 'approved' && enrolment.status === 'draft') {
    throw httpError('This application has not been submitted yet', 409, 'NOT_SUBMITTED');
  }

  enrolment.status = decision;
  enrolment.reviewedById = adminId || null;
  enrolment.reviewedAt = new Date();
  enrolment.reviewNote = note;
  await enrolment.save();

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

async function requestLine({ owner, providerKind, domainCode = '', proposedName, description = '' }) {
  const filter = {
    ...ownerFilter(owner),
    proposedName: new RegExp(`^${String(proposedName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    status: 'pending',
  };
  const existing = await ServiceLineRequest.findOne(filter);
  if (existing) return { request: existing, deduped: true };

  const request = await ServiceLineRequest.create({
    providerKind,
    ...ownerFilter(owner),
    domainCode: String(domainCode || '').toLowerCase(),
    proposedName,
    description,
  });
  return { request, deduped: false };
}

module.exports = {
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
