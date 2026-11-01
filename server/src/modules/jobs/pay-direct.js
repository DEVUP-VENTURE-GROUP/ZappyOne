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
  return { ok: true, message: method === 'upi' ? 'Thanks. Your pro will confirm they got it.' : `Hand ${rupees} to your pro. They will confirm it.` };
}

module.exports = { view, claim, payee, DUE_AT, UPI_ID };
