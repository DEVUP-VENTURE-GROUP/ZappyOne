// Services opened from one partner's request before they were private: each goes back to that partner alone, unless another partner already signed up for it.
const { ServiceLine, ServiceLineRequest, ProviderEnrolment } = require('./onboarding.model');

async function makeRequestedPrivate({ apply = false } = {}) {
  const requests = await ServiceLineRequest.find({ status: 'approved', resultLineCode: { $nin: [null, ''] } }).select('resultLineCode shopId workerId').lean();
  const report = { checked: 0, madePrivate: [], keptPublic: [] };
  for (const r of requests) {
    const line = await ServiceLine.findOne({ code: r.resultLineCode, privateTo: null }).select('code name').lean();
    if (!line) continue;
    report.checked += 1;
    const requester = r.shopId ? { kind: 'shop', id: r.shopId } : { kind: 'worker', id: r.workerId };
    if (!requester.id) continue;
    const others = await ProviderEnrolment.countDocuments({
      lineCode: line.code, status: { $ne: 'draft' },
      [requester.kind === 'shop' ? 'shopId' : 'workerId']: { $ne: requester.id },
    });
    if (others) { report.keptPublic.push({ code: line.code, name: line.name, otherPartners: others }); continue; }
    report.madePrivate.push({ code: line.code, name: line.name, to: `${requester.kind}:${requester.id}` });
    if (apply) await ServiceLine.updateOne({ code: line.code, privateTo: null }, { $set: { privateTo: requester } });
  }
  return { apply, ...report };
}

module.exports = { makeRequestedPrivate };
