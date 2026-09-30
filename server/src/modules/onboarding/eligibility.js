/**
 * Who may see and take a job: a provider holding an APPROVED enrolment for
 * that job's service line.
 *
 * Every service is gated by its own verification. A worker approved for pet
 * walks is not thereby trusted to carry a customer's shopping money, and a
 * customer account is never a provider at all — so an open job's address and
 * details are shown only to the people who could legitimately take it.
 */
const { ProviderEnrolment } = require('./onboarding.model');
const { lineOf, HELPING_LINE } = require('../jobs/kinds');

const ownerOf = ({ role, id }) => (role === 'shop' ? { shopId: id } : role === 'worker' ? { workerId: id } : null);

/** Line codes this provider is approved for; empty for anyone who isn't a provider. */
async function approvedLines(auth) {
  const owner = ownerOf(auth);
  if (!owner) return new Set();
  const codes = await ProviderEnrolment.distinct('lineCode', { ...owner, status: 'approved' });
  return new Set(codes);
}

/** Throws 403 unless this provider is approved for the line. */
async function assertApproved(auth, lineCode) {
  if (lineCode && (await approvedLines(auth)).has(lineCode)) return;
  throw Object.assign(new Error('You are not verified for this service yet'), { status: 403, code: 'NOT_APPROVED_FOR_SERVICE' });
}

/** Everyone approved for a line — for alerting them to a new job. */
async function approvedProviders(lineCode) {
  const rows = await ProviderEnrolment.find({ lineCode, status: 'approved' }).select('workerId shopId').lean();
  return rows.map((r) => (r.shopId ? { kind: 'shop', id: String(r.shopId) } : { kind: 'worker', id: String(r.workerId) }))
    .filter((p) => p.id && p.id !== 'null');
}

module.exports = { lineOf, approvedLines, assertApproved, approvedProviders, HELPING_LINE };
