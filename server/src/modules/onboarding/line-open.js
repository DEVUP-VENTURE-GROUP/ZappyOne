const { ServiceLine } = require('./onboarding.model');

// What the provider sent rides into the new service: each job's included items and photo, the service photo, and the requester's own menu at their prices, enrolled to finish verification.
async function carryRequestOver(reqDoc, line, offered, slug, { serviceImage } = {}) {
  const { Repair } = require('../repair/models/repair.model');
  const prefix = (line.repairVertical || line.code).split('_').map((w) => w.slice(0, 3)).join('').slice(0, 8);
  for (const [i, p] of offered.entries()) {
    const code = `${prefix}_${p.code || `${slug(p.name)}_${i + 1}`.slice(0, 30)}`;
    const src = (reqDoc.packages || []).find((x) => x.name === p.name) || p;
    // A job sent without its own photo takes one of the photos sent for the whole service, so no job starts blank.
    const photos = reqDoc.photos || [];
    await Repair.updateOne({ vertical: line.repairVertical, code }, { $set: { includes: src.includes || [], photoKey: src.photoKey || photos[i % (photos.length || 1)] || '' } });
  }
  // The picture every customer sees for the service: the one admin picked from what the partner sent, or by default their first photo when the service has none.
  if (serviceImage !== undefined) await ServiceLine.updateOne({ code: line.code }, { $set: { imageUrl: serviceImage } });
  else if (reqDoc.photos?.[0]) await ServiceLine.updateOne({ code: line.code, imageUrl: { $in: ['', null] } }, { $set: { imageUrl: reqDoc.photos[0] } });
  if (line.status !== 'live' || !line.repairVertical) return;
  const owner = reqDoc.shopId ? { shopId: reqDoc.shopId, workerId: null } : { shopId: null, workerId: reqDoc.workerId };
  try {
    await require('./onboarding.service').enrol({ owner: { kind: reqDoc.shopId ? 'shop' : 'worker', id: reqDoc.shopId || reqDoc.workerId }, providerKind: reqDoc.providerKind, lineCode: line.code });
    await require('../repair/services/provider-menu.service').useSamples(owner, line.repairVertical, { role: reqDoc.shopId ? 'shop' : 'worker', id: String(reqDoc.shopId || reqDoc.workerId) });
  } catch (e) {
    require('../../core/logger').warn({ err: e.message, line: line.code }, '[line-request] could not set up the requester');
  }
  require('../notification/notification.service').notify({
    recipient: reqDoc.shopId ? { kind: 'shop', id: reqDoc.shopId } : { kind: 'worker', id: reqDoc.workerId },
    type: 'report_received', title: `${line.name} is approved`,
    body: 'Your jobs and prices are on your menu. Finish verification for this service to start getting bookings.',
    deepLink: '/provider/onboarding',
  }).catch(() => {});
}

// Opens a requested service for real: the line (bookable at once when it comes with jobs), the requester's menu and enrolment, and the request marked approved.
// Used by admin's approval and by a partner's own request going live directly (onboarding.service requestLine).
async function openService(reqDoc, { code, name, domainCode, status = 'coming_soon', repairVertical = null, serviceImage, note = '', reviewerId = null, packages, typeWord, types, thing } = {}) {
  // With packages (the provider's own, or admin's edit of them) the approval opens a bookable fixed-price line at once; without, a bare line as before.
  const offered = packages?.length ? packages : (reqDoc.packages || []);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'job';
  const line = offered.length
    ? await require('../repair/package-lines.service').upsertPackageLine({
      code: String(code).toLowerCase(), name: name || reqDoc.proposedName, domainCode: String(domainCode).toLowerCase(), description: reqDoc.description,
      typeWord: typeWord || '', types: types, thing: thing || 'job',
      packages: offered.map((p, i) => ({ code: p.code || `${slug(p.name)}_${i + 1}`.slice(0, 30), name: p.name, minutes: p.minutes, prices: p.prices || { one: Math.round((p.pricePaise || 0) / 100) } })),
      modes: reqDoc.serviceModes?.length ? reqDoc.serviceModes : undefined,
    })
    : await ServiceLine.create({
      code: String(code).toLowerCase(),
      name: name || reqDoc.proposedName,
      domainCode: String(domainCode).toLowerCase(),
      description: reqDoc.description,
      status,
      repairVertical,
    });

  if (offered.length) await carryRequestOver(reqDoc, line, offered, slug, { serviceImage });
  else if (serviceImage !== undefined) await ServiceLine.updateOne({ code: line.code }, { $set: { imageUrl: serviceImage } });

  reqDoc.status = 'approved';
  reqDoc.resultLineCode = line.code;
  reqDoc.reviewedById = reviewerId || null;
  reqDoc.reviewedAt = new Date();
  reqDoc.reviewNote = note;
  await reqDoc.save();
  return line;
}

module.exports = { openService, carryRequestOver };
