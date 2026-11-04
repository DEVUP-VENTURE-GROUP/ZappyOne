// The customer pays the pro directly (UPI to the pro's own ID, or cash); ZappyOne only shows whom and how much, and tells the pro.
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
// The 12-digit reference every UPI app shows on a payment (the bank's UTR).
const UPI_REF = /^\d{12}$/;
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
    claim: doc.payClaim?.method ? { method: doc.payClaim.method, at: doc.payClaim.at, utr: doc.payClaim.utr || null } : null,
    help: await helpLine(),
  };
}

// ZappyOne's phone for a stuck payment (Admin -> Messages -> Business details), and when the button shows.
async function helpLine() {
  const [s, cfg] = await Promise.all([require('../messaging/settings').get().catch(() => ({})), require('../order/cancellation.service').getConfig()]);
  return s.supportPhone ? { phone: s.supportPhone, afterMinutes: cfg.payConfirmRemindMinutes ?? 5 } : null;
}

// "I've paid": recorded and the pro is told to check and tap Received. UPI needs its reference, which the pro checks against their app.
async function claim({ id, userId, method, utr = null }) {
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
  const ref = method === 'upi' ? String(utr || '').replace(/\s+/g, '') : null;
  if (method === 'upi' && !UPI_REF.test(ref)) throw fail(400, 'UPI_REF_REQUIRED', 'Enter the 12-digit UPI reference from your UPI app (it is on the payment receipt).');
  // One payment pays one job.
  if (ref) {
    for (const k of Object.keys(DUE_AT)) {
      if (await KINDS[k].model().exists({ 'payClaim.utr': ref, _id: { $ne: doc._id } })) throw fail(409, 'UPI_REF_USED', 'That UPI reference is already used on another booking. Check it in your UPI app.');
    }
  }

  await Model.updateOne({ _id: doc._id, userId }, { $set: { payClaim: { method, at: new Date(), amountPaise: v.amountPaise, ...(ref && { utr: ref }) } } });
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
        ? `${doc.reference || 'A booking'}: check your UPI app for ${rupees} (ref ${ref}), then tap Received.`
        : `${doc.reference || 'A booking'}: take ${rupees} in cash, then tap Received.`,
      deepLink: KINDS[kind].providerLink(String(doc._id)), data: payload,
    }).catch(() => {});
  }
  // The pro already said it was not paid: now two stories about the same money, so a person decides.
  if (await require('./give-back').JobGiveBack.exists({ jobId: doc._id, type: 'cash_refused' })) {
    await require('../admin/ops-alerts').raise({
      type: 'pay_disputed', key: `pay:${doc._id}`, urgent: false, title: `Payment dispute on ${doc.reference || 'a job'}`,
      body: `Customer says they paid ${rupees} by ${method === 'upi' ? 'UPI' : 'cash'}; the pro reported it was not paid. Call both.`,
      data: { kind, id: String(doc._id), reference: doc.reference || null },
    });
  }
  return { ok: true, message: method === 'upi' ? 'Thanks. Your pro will confirm they got it.' : `Hand ${rupees} to your pro. They will confirm it.` };
}

const minutesAgo = (m, now) => new Date(now - m * 60000);
const providerOf = (doc) => (doc.shopId && !doc.workerId ? { kind: 'shop', id: doc.shopId } : doc.workerId ? { kind: 'worker', id: doc.workerId } : null);

// Records the payment exactly as the pro's own Received button does, per kind, acting as the job's holder.
const RECEIVE = {
  repair: (doc) => require('../repair/services/booking.service').collectCash({ bookingId: doc._id, actorRole: doc.shopId ? 'shop' : 'worker', actorId: doc.shopId || doc.workerId }),
  pet: (doc) => require('../pet/services/payment.service').recordCash({ bookingId: doc._id, providerId: doc.workerId || doc.shopId }),
  helping: (doc) => require('../helping/services/task.service').recordCash({ taskId: doc._id, workerId: doc.workerId }),
};

// After "I've paid": the pro is reminded twice; a UPI payment with its reference that the pro never answers counts as received. Cash is only ever closed by the pro.
async function sweepClaims({ now = Date.now(), limit = 50 } = {}) {
  const cfg = await require('../order/cancellation.service').getConfig();
  const first = cfg.payConfirmRemindMinutes ?? 5;
  const again = Math.max(cfg.payConfirmRemindAgainMinutes ?? 10, first + 1);
  const auto = Math.max(cfg.payAutoReceiveMinutes ?? 30, again + 1);
  const { KINDS } = require('./kinds');
  const { PAYABLES } = require('../payment/payables');
  const { JobGiveBack } = require('./give-back');
  const events = require('./job-events');
  const out = { reminded: 0, autoReceived: 0 };
  for (const kind of Object.keys(DUE_AT)) {
    const Model = KINDS[kind].model();
    const rows = await Model.find({
      'payClaim.at': { $lte: minutesAgo(first, now) },
      'payClaim.autoReceivedAt': null,
      $or: [
        { 'payClaim.remindedAt': null },
        { 'payClaim.remindedAgainAt': null, 'payClaim.at': { $lte: minutesAgo(again, now) } },
        { 'payClaim.method': 'upi', 'payClaim.utr': { $type: 'string' }, 'payClaim.at': { $lte: minutesAgo(auto, now) } },
      ],
    }).sort({ 'payClaim.at': 1 }).limit(limit).lean();
    for (const doc of rows) {
      const c = doc.payClaim;
      const age = (now - new Date(c.at).getTime()) / 60000;
      const paid = PAYABLES[kind]?.isPaid(doc);
      const answered = paid || await JobGiveBack.exists({ jobId: doc._id, type: 'cash_refused' });
      const step = answered ? 'closed' : age >= auto && c.method === 'upi' && c.utr ? 'auto' : age >= again && c.remindedAt ? 'again' : 'first';
      const set = step === 'closed' ? { 'payClaim.remindedAt': c.remindedAt || new Date(now), 'payClaim.remindedAgainAt': c.remindedAgainAt || new Date(now), 'payClaim.autoReceivedAt': c.autoReceivedAt || new Date(0) }
        : step === 'auto' ? { 'payClaim.autoReceivedAt': new Date(now) }
          : step === 'again' ? { 'payClaim.remindedAgainAt': new Date(now) } : { 'payClaim.remindedAt': new Date(now) };
      // Claimed by exactly one sweep, however many servers run it.
      const won = await Model.updateOne({ _id: doc._id, 'payClaim.at': c.at, 'payClaim.remindedAt': c.remindedAt ?? null, 'payClaim.remindedAgainAt': c.remindedAgainAt ?? null, 'payClaim.autoReceivedAt': null }, { $set: set });
      if (!won.modifiedCount || step === 'closed') continue;
      const rupees = `₹${Math.round((c.amountPaise || 0) / 100).toLocaleString('en-IN')}`;
      const by = c.method === 'upi' ? `UPI (ref ${c.utr})` : 'cash';
      const payload = { kind, id: String(doc._id), status: doc.status, at: new Date(now).toISOString() };
      const provider = providerOf(doc);
      const holders = [provider, doc.shopId && doc.workerId ? { kind: 'shop', id: doc.shopId } : null].filter(Boolean);
      if (step === 'auto') {
        try { await RECEIVE[kind](doc); } catch (err) {
          await Model.updateOne({ _id: doc._id }, { $unset: { 'payClaim.autoReceivedAt': 1 } });
          require('../../core/logger').error({ err: err.message, kind, id: String(doc._id) }, '[pay] auto receive failed - will retry');
          continue;
        }
        out.autoReceived++;
        for (const h of holders) {
          events.toProvider(h.kind, h.id, 'job.update', payload);
          events.push(h, { title: `${rupees} marked received`, body: `${doc.reference || 'A booking'}: the customer paid by ${by} and there was no answer for ${auto} minutes. Find that reference in your UPI app.`, deepLink: KINDS[kind].providerLink(String(doc._id)), data: payload }).catch(() => {});
        }
        events.toProvider('user', doc.userId, 'job.update', payload);
        events.push({ kind: 'user', id: doc.userId }, { title: 'Payment confirmed', body: `${rupees} for ${doc.reference || 'your booking'} is recorded. Thank you.`, deepLink: KINDS[kind].link(String(doc._id)), data: payload }).catch(() => {});
        require('../admin/ops-alerts').raise({ type: 'pay_auto_received', urgent: false, title: `Payment auto-confirmed on ${doc.reference || 'a job'}`, body: `${rupees} by ${by}. The pro did not answer for ${auto} minutes.`, data: { kind, id: String(doc._id), reference: doc.reference || null } }).catch(() => {});
        continue;
      }
      out.reminded++;
      for (const h of holders) {
        events.push(h, {
          title: step === 'again' ? `Still waiting: did you get ${rupees}?` : `Did you get ${rupees}?`,
          body: `${doc.reference || 'A booking'}: the customer says they paid by ${by}. Tap Received, or Customer did not pay.${c.method === 'upi' && c.utr ? ` No answer in ${auto} minutes counts as received.` : ''}`,
          deepLink: KINDS[kind].providerLink(String(doc._id)), data: payload,
        }).catch(() => {});
      }
      if (step === 'first') events.toProvider('user', doc.userId, 'job.update', payload);
    }
  }
  return out;
}

module.exports = { view, claim, payee, sweepClaims, helpLine, DUE_AT, UPI_ID, UPI_REF };
