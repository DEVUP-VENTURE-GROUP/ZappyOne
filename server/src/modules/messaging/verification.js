/**
 * Verification messages: ops hears about each new submission; the provider
 * hears the decision (approved, or what to fix), by push and email.
 */
const { send } = require('./send');

async function partyOf(enrolment) {
  const { ServiceLine } = require('../onboarding/onboarding.model');
  const line = await ServiceLine.findOne({ code: enrolment.lineCode }).select('name').lean();
  const service = line?.name || enrolment.lineCode;
  if (enrolment.shopId) {
    const shop = await require('../shop/shop.model').findById(enrolment.shopId).select('businessName').lean();
    return { to: { kind: 'shop', id: enrolment.shopId }, who: `${shop?.businessName || 'A shop'} (shop)`, service };
  }
  const w = await require('../worker/worker.model').findById(enrolment.workerId).select('name').lean();
  return { to: { kind: 'worker', id: enrolment.workerId }, who: `${w?.name || 'A worker'} (worker)`, service };
}

async function submitted(enrolment) {
  const p = await partyOf(enrolment);
  await send('admin.kyc_review', { to: 'ops', ctx: { who: p.who, service: p.service }, refId: `kyc:${enrolment._id}:${new Date(enrolment.submittedAt || Date.now()).getTime()}` });
}

async function decided(enrolment) {
  const p = await partyOf(enrolment);
  await send('provider.kyc', {
    to: p.to,
    ctx: { approved: enrolment.status === 'approved', service: p.service, reason: enrolment.reviewNote || '' },
    refId: `kyc:${enrolment._id}:${enrolment.status}:${new Date(enrolment.reviewedAt || Date.now()).getTime()}`,
  });
}

module.exports = { submitted, decided };
