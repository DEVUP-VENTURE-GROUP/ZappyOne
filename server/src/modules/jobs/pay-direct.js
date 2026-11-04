// The customer pays the pro directly (UPI to the pro's own ID, or cash); ZappyOne only shows whom and how much, and tells the pro.
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
const AT_CUSTOMER = ['return', 'exchange', 'parcel_drop', 'doctor_escort', 'queue_errand', 'elder_checkin', 'party_helper', 'puja_help'];

// When the money is due, per kind: the same moments the pro's screen asks them to collect.
const DUE_AT = {
  repair: (b) => ['QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN', 'COMPLETED'].includes(b.status),
  pet: (b) => ['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING'].includes(b.status),
  helping: (b) => (AT_CUSTOMER.includes(b.serviceType) ? ['IN_PROGRESS', 'RETURNING', 'AT_DROPOFF', 'HANDED_OVER'] : ['RETURNING', 'HANDED_OVER']).includes(b.status),
};

const defaultUpi = (list = []) => {
  const pick = list.find((u) => u.isDefault) || list[0];
  return pick && UPI_ID.test(String(pick.upiId || '').trim()) ? String(pick.upiId).trim() : null;
};

// Who gets paid: the shop for a shop's job, else the pro; their default UPI ID when it looks valid.
async function payee(doc) {
  if (doc.shopId) {
    const s = await require('../shop/shop.model').findById(doc.shopId).select('businessName savedUpiIds').lean();
    return s ? { name: s.businessName, upiId: defaultUpi(s.savedUpiIds) } : null;
  }
  if (doc.workerId) {
    const w = await require('../worker/worker.model').findById(doc.workerId).select('name savedUpiIds').lean();
    return w ? { name: String(w.name || 'Your pro').split(/\s+/)[0], upiId: defaultUpi(w.savedUpiIds) } : null;
  }
  return null;
}

// What the tracking screen shows once the work is done: how much, to whom, and how; null until then or once paid.
async function view(kind, doc) {
  const p = require('../payment/payables').PAYABLES[kind];
  if (!p || !DUE_AT[kind] || !DUE_AT[kind](doc)) return null;
  const hydrated = doc.$isMongooseDocument ? doc : p.load ? await p.load(doc._id) : doc;
  if (!hydrated || p.isPaid(hydrated)) return null;
  let amountPaise = 0;
  try { amountPaise = p.payable(hydrated).amountPaise || 0; } catch { return null; }
  if (amountPaise <= 0) return null;
  const to = await payee(doc);
  if (!to) return null;
  return {
    amountPaise, to, reference: doc.reference || null,
    methods: to.upiId ? ['upi', 'cash'] : ['cash'],
    claim: doc.payClaim?.method ? { method: doc.payClaim.method, at: doc.payClaim.at } : null,
  };
}

// "I've paid": recorded and the pro is told to check and tap Received; it never marks the job paid by itself.
async function claim({ id, userId, method }) {
  const { findJob, KINDS } = require('./kinds');
  const found = await findJob(id, '_id');
  if (!found || !DUE_AT[found.kind]) throw fail(404, 'NOT_FOUND', 'Booking not found');
  const { kind } = found;
  const Model = KINDS[kind].model();
  const doc = await Model.findById(id).lean();
  if (!doc || String(doc.userId) !== String(userId)) throw fail(404, 'NOT_FOUND', 'Booking not found');
  const v = await view(kind, doc);
  if (!v) throw fail(409, 'NOT_DUE', 'There is nothing to pay on this booking right now.');
  if (!v.methods.includes(method)) throw fail(400, 'BAD_METHOD', 'Your pro has not added a UPI ID. Pay in cash.');

  await Model.updateOne({ _id: doc._id, userId }, { $set: { payClaim: { method, at: new Date(), amountPaise: v.amountPaise } } });
  const events = require('./job-events');
  const payload = { kind, id: String(doc._id), status: doc.status, at: new Date().toISOString() };
  const rupees = `₹${Math.round(v.amountPaise / 100).toLocaleString('en-IN')}`;
  const provider = doc.workerId ? { kind: 'worker', id: doc.workerId } : doc.shopId ? { kind: 'shop', id: doc.shopId } : null;
  events.toProvider('user', doc.userId, 'job.update', payload);
  if (provider) {
    events.toProvider(provider.kind, provider.id, 'job.update', payload);
    if (doc.shopId && doc.workerId) events.toProvider('shop', doc.shopId, 'job.update', payload);
    await events.push(provider, {
      title: method === 'upi' ? `Customer paid ${rupees} by UPI` : `Customer is paying ${rupees} in cash`,
      body: method === 'upi'
        ? `${doc.reference || 'A booking'}: check your UPI app for ${rupees}, then tap Received.`
        : `${doc.reference || 'A booking'}: take ${rupees} in cash, then tap Received.`,
      deepLink: KINDS[kind].providerLink(String(doc._id)), data: payload,
    }).catch(() => {});
  }
  // The pro already said it was not paid: now two stories about the same money, so a person decides.
  if (await require('./give-back').JobGiveBack.exists({ jobId: doc._id, type: 'cash_refused' })) {
    await require('../admin/ops-alerts').raise({
      type: 'pay_disputed', key: `pay:${doc._id}`, urgent: true, title: `Payment dispute on ${doc.reference || 'a job'}`,
      body: `Customer says they paid ${rupees} by ${method === 'upi' ? 'UPI' : 'cash'}; the pro reported it was not paid. Call both.`,
      data: { kind, id: String(doc._id), reference: doc.reference || null },
    });
  }
  return { ok: true, message: method === 'upi' ? 'Thanks. Your pro will confirm they got it.' : `Hand ${rupees} to your pro. They will confirm it.` };
}

const minutesAgo = (m, now) => new Date(now - m * 60000);
const providerOf = (doc) => (doc.workerId ? { kind: 'worker', id: doc.workerId } : doc.shopId ? { kind: 'shop', id: doc.shopId } : null);

// Customer said they paid and the pro has not answered: remind the pro, then call in ZappyOne. Never marks anything paid; only the pro's Received does.
async function sweepClaims({ now = Date.now(), limit = 50 } = {}) {
  const cfg = await require('../order/cancellation.service').getConfig();
  const remindMin = cfg.payConfirmRemindMinutes ?? 5;
  const escalateMin = Math.max(cfg.payConfirmEscalateMinutes ?? 10, remindMin + 1);
  const { KINDS } = require('./kinds');
  const { PAYABLES } = require('../payment/payables');
  const events = require('./job-events');
  const alerts = require('../admin/ops-alerts');
  let reminded = 0; let escalated = 0;
  for (const kind of Object.keys(DUE_AT)) {
    const Model = KINDS[kind].model();
    const due = await Model.find({
      'payClaim.at': { $lte: minutesAgo(remindMin, now) },
      $or: [{ 'payClaim.remindedAt': null }, { 'payClaim.escalatedAt': null, 'payClaim.at': { $lte: minutesAgo(escalateMin, now) } }],
    }).sort({ 'payClaim.at': 1 }).limit(limit);
    for (const doc of due) {
      const paid = PAYABLES[kind]?.isPaid(doc);
      const late = doc.payClaim.at <= minutesAgo(escalateMin, now);
      const set = { 'payClaim.remindedAt': doc.payClaim.remindedAt || new Date(now), ...(late || paid ? { 'payClaim.escalatedAt': doc.payClaim.escalatedAt || new Date(now) } : {}) };
      const claimed = await Model.updateOne({ _id: doc._id, 'payClaim.at': doc.payClaim.at, 'payClaim.escalatedAt': doc.payClaim.escalatedAt ?? null, 'payClaim.remindedAt': doc.payClaim.remindedAt ?? null }, { $set: set });
      if (!claimed.modifiedCount || paid) continue;
      // The pro did answer (Customer did not pay): that is already a dispute case, not silence.
      if (await require('./give-back').JobGiveBack.exists({ jobId: doc._id, type: 'cash_refused' })) continue;
      const rupees = `₹${Math.round((doc.payClaim.amountPaise || 0) / 100).toLocaleString('en-IN')}`;
      const by = doc.payClaim.method === 'upi' ? 'UPI' : 'cash';
      const payload = { kind, id: String(doc._id), status: doc.status, at: new Date(now).toISOString() };
      const provider = providerOf(doc);
      if (late) {
        escalated++;
        await alerts.raise({
          type: 'pay_unconfirmed', key: `pay:${doc._id}`, urgent: true, title: `Pro has not confirmed payment on ${doc.reference || 'a job'}`,
          body: `Customer said they paid ${rupees} by ${by} ${escalateMin}+ minutes ago and the pro has not tapped Received or Not paid. Call the pro.`,
          data: { kind, id: String(doc._id), reference: doc.reference || null },
        });
        events.push({ kind: 'user', id: doc.userId }, { title: 'ZappyOne is checking your payment', body: 'Your pro has not confirmed it yet. We are calling them now.', deepLink: KINDS[kind].link(String(doc._id)), data: payload }).catch(() => {});
      } else if (provider) {
        reminded++;
        events.push(provider, {
          title: `Did you get ${rupees}?`, body: `${doc.reference || 'A booking'}: the customer says they paid by ${by}. Tap Received, or Customer did not pay.`,
          deepLink: KINDS[kind].providerLink(String(doc._id)), data: payload,
        }).catch(() => {});
      }
    }
  }
  return { reminded, escalated };
}

module.exports = { view, claim, payee, sweepClaims, DUE_AT, UPI_ID };
