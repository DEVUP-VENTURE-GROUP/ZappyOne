/**
 * Identity is verified once per person; services are verified per service.
 *
 * Aadhaar, PAN, a live selfie and address proof say who someone is, and that
 * does not change between pet care and helping. A worker who has given them
 * once — in any service's verification, or the earlier ID check — is never
 * asked again: they are carried into every other service they apply for,
 * marked as carried, and the reviewer still sees them on the application.
 *
 * And one approval is enough: approving a worker's service also verifies the
 * person (onboarding-admin.controller syncLegacyKyc), so going online needs no
 * separate ID check.
 *
 * Shops likewise: the owner's ID, the owner's selfie, the storefront photo, the
 * GST certificate and the shop's numbers (GST, PAN, years in business) describe
 * the shop, not the service. Given once — in Shop Verification or any service's
 * application — they are carried into every other service the shop adds.
 */
const { ProviderEnrolment } = require('./onboarding.model');
const Worker = require('../worker/worker.model');

/** Document codes that describe the person, not the service. */
const IDENTITY_CODES = ['aadhaar', 'pan', 'selfie', 'address_proof'];

/**
 * Identity documents this worker already has on file, by code.
 * An approved application's copy is preferred, then the ID check's, then the newest.
 */
async function identityOnFile(workerId, { exceptEnrolmentId = null } = {}) {
  const found = new Map();
  const consider = (code, row, rank) => {
    if (!row?.url) return;
    const prev = found.get(code);
    if (!prev || rank > prev.rank || (rank === prev.rank && new Date(row.uploadedAt || 0) > new Date(prev.row.uploadedAt || 0))) {
      found.set(code, { row, rank });
    }
  };

  const others = await ProviderEnrolment.find({
    workerId, providerKind: 'individual', ...(exceptEnrolmentId ? { _id: { $ne: exceptEnrolmentId } } : {}),
    'documents.code': { $in: IDENTITY_CODES },
  }).select('status documents').lean();
  for (const e of others) {
    const rank = e.status === 'approved' ? 3 : e.status === 'rejected' ? 0 : 1;
    for (const d of e.documents || []) if (IDENTITY_CODES.includes(d.code)) consider(d.code, d, rank);
  }

  // The earlier ID check (worker KYC) counts too, so nobody who did it re-uploads.
  const w = await Worker.findById(workerId).select('kyc').lean();
  const kycRank = w?.kyc?.status === 'approved' ? 2 : 1;
  if (w?.kyc?.aadhaarUrl) consider('aadhaar', { url: w.kyc.aadhaarUrl, captureMethod: 'upload', uploadedAt: w.kyc.submittedAt }, kycRank);
  if (w?.kyc?.selfieUrl) {
    const m = w.kyc.selfieMetadata || {};
    consider('selfie', {
      url: w.kyc.selfieUrl, captureMethod: m.captureMethod === 'live_camera' ? 'live_camera' : 'upload',
      capturedAt: m.capturedAt || null, lat: m.lat ?? null, lng: m.lng ?? null, uploadedAt: w.kyc.submittedAt,
    }, kycRank);
  }

  return new Map([...found].map(([code, { row }]) => [code, row]));
}

/**
 * Fill an individual's application with the identity documents already on
 * file, for every identity code it doesn't have yet. Returns how many it added.
 */
async function carryIdentity(enrolment) {
  if (!enrolment || ['approved', 'suspended'].includes(enrolment.status)) return 0;
  if (enrolment.providerKind === 'shop' && enrolment.shopId) return carryShop(enrolment);
  if (enrolment.providerKind !== 'individual' || !enrolment.workerId) return 0;
  const have = new Set((enrolment.documents || []).filter((d) => d.url).map((d) => d.code));
  const onFile = await identityOnFile(enrolment.workerId, { exceptEnrolmentId: enrolment._id });
  let added = 0;
  for (const [code, row] of onFile) {
    if (have.has(code)) continue;
    enrolment.documents.push({
      code, url: row.url, uploadedAt: row.uploadedAt || new Date(),
      captureMethod: row.captureMethod || 'upload', capturedAt: row.capturedAt || null,
      lat: row.lat ?? null, lng: row.lng ?? null, carried: true,
    });
    added += 1;
  }
  if (added) await enrolment.save();
  return added;
}

/* Shops */

/** Documents and numbers that describe the shop, not the service. */
const SHOP_CODES = ['owner_id', 'selfie', 'shop_photo', 'gst_certificate'];
const SHOP_FIELD_CODES = ['gst_number', 'pan_number', 'years_active'];

/** What the shop already gave, by code: its other applications first (approved best), then Shop Verification. */
async function shopOnFile(shopId, { exceptEnrolmentId = null } = {}) {
  const docs = new Map(); const fields = new Map();
  const others = await ProviderEnrolment.find({
    shopId, providerKind: 'shop', ...(exceptEnrolmentId ? { _id: { $ne: exceptEnrolmentId } } : {}),
  }).select('status documents fields').lean();
  // Approved first, rejected never: a rejected document is not evidence.
  const order = { approved: 0, pending_review: 1, submitted: 1, draft: 2 };
  others.filter((e) => e.status !== 'rejected').sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3)).forEach((e) => {
    for (const d of e.documents || []) if (SHOP_CODES.includes(d.code) && d.url && !docs.has(d.code)) docs.set(d.code, d);
    for (const f of e.fields || []) if (SHOP_FIELD_CODES.includes(f.code) && f.value && !fields.has(f.code)) fields.set(f.code, f.value);
  });
  const shop = await require('../shop/shop.model').findById(shopId).select('kyc yearsActive').lean();
  const k = shop?.kyc || {};
  if (k.status !== 'rejected') {
    const fromKyc = { owner_id: k.ownerIdUrl, selfie: k.selfieUrl, shop_photo: k.shopPhotoUrl, gst_certificate: k.gstCertificateUrl };
    for (const [code, url] of Object.entries(fromKyc)) if (url && !docs.has(code)) docs.set(code, { url, uploadedAt: k.submittedAt, captureMethod: 'upload' });
    const nums = { gst_number: k.gstNumber, pan_number: k.panNumber, years_active: shop?.yearsActive != null ? String(shop.yearsActive) : null };
    for (const [code, value] of Object.entries(nums)) if (value && !fields.has(code)) fields.set(code, value);
  }
  return { docs, fields };
}

async function carryShop(enrolment) {
  const haveDocs = new Set((enrolment.documents || []).filter((d) => d.url).map((d) => d.code));
  const haveFields = new Set((enrolment.fields || []).filter((f) => f.value).map((f) => f.code));
  const { docs, fields } = await shopOnFile(enrolment.shopId, { exceptEnrolmentId: enrolment._id });
  let added = 0;
  for (const [code, row] of docs) {
    if (haveDocs.has(code)) continue;
    enrolment.documents.push({
      code, url: row.url, uploadedAt: row.uploadedAt || new Date(), captureMethod: row.captureMethod || 'upload',
      capturedAt: row.capturedAt || null, lat: row.lat ?? null, lng: row.lng ?? null, carried: true,
    });
    added += 1;
  }
  for (const [code, value] of fields) {
    if (haveFields.has(code)) continue;
    enrolment.fields = [...(enrolment.fields || []).filter((f) => f.code !== code), { code, value }];
    added += 1;
  }
  if (added) await enrolment.save();
  return added;
}

module.exports = { IDENTITY_CODES, SHOP_CODES, identityOnFile, shopOnFile, carryIdentity };
