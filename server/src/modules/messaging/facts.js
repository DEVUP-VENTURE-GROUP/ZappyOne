/**
 * The facts of a job that messages and receipts show, read the same way for
 * every kind (repairs, pet care, helping): what, when, where, who, and the
 * bill line by line, in rupees, in India's time.
 */
const { KINDS } = require('../jobs/kinds');

const rupees = (p) => `₹${(Math.round(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const tidy = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
}) : null);

/** The bill, as [label, paise] lines, and its total — the same lines the customer's screen shows. */
function bill(kind, doc) {
  let lines = [];
  let total = 0;
  if (kind === 'repair') {
    const s = doc.priceSnapshot || {};
    const service = (s.subtotalPaise || 0);
    lines = [['Service', service], ['Platform fee', s.platformFeePaise], ['Discount', -(s.discountPaise || 0)], ['Taxes', s.taxPaise]];
    if (s.inspectionCreditPaise) lines.push(['Inspection already paid', -s.inspectionCreditPaise]);
    total = s.totalPaise || 0;
  } else if (kind === 'pet') {
    const p = doc.pricing || {};
    lines = [['Services', p.servicesPaise], ['Add-ons', p.addonsPaise], ['Travel', p.travelPaise], ['Platform fee', p.platformFeePaise], ['Taxes', p.taxPaise]];
    total = p.totalPaise || 0;
  } else if (kind === 'helping') {
    const c = doc.charge || {};
    lines = [['Service', c.baseFeePaise], ['Distance', c.distanceFeePaise], ['Waiting', c.waitingFeePaise], ['Extra stops', c.multiStopFeePaise], ['Platform fee', c.platformFeePaise], ['Taxes', c.taxPaise]];
    total = c.serviceChargePaise || 0;
  }
  const boost = doc.boost?.paise || 0;
  const carried = doc.carriedFee?.paise || 0;
  if (boost) lines.push(['Boost for a faster match', boost]);
  if (carried) lines.push(['Cancellation fee from an earlier booking', carried]);
  total += boost + carried;
  return { lines: lines.filter(([, p]) => p), total };
}

async function providerOf(doc) {
  if (doc.workerId) {
    const w = await require('../worker/worker.model').findById(doc.workerId).select('name profilePhotoKey rating').lean();
    if (w) return { kind: 'worker', id: String(doc.workerId), name: w.name || 'Your provider', photoKey: w.profilePhotoKey || null, rating: w.rating || null };
  }
  if (doc.shopId) {
    const sh = await require('../shop/shop.model').findById(doc.shopId).select('businessName coverImageUrl rating').lean();
    if (sh) return { kind: 'shop', id: String(doc.shopId), name: sh.businessName || 'Your provider', photoKey: sh.coverImageUrl || null, rating: sh.rating || null };
  }
  return null;
}

async function serviceName(kind, doc) {
  if (kind === 'repair' && doc.repairCode) {
    const { Repair } = require('../repair/models/repair.model');
    const r = await Repair.findOne({ code: doc.repairCode }).select('name').lean();
    if (r?.name) return r.name;
  }
  if (kind === 'repair') return doc.serviceMode === 'diagnosis_only' ? `${tidy(doc.vertical)} inspection` : `${tidy(doc.vertical)} repair`;
  if (kind === 'pet') return tidy(doc.categoryCode || 'Pet care');
  if (kind === 'helping') return doc.title || `${tidy(doc.serviceType || 'Helping')} task`;
  return 'Service';
}

/** Everything a message about this job may show. */
async function jobFacts(kind, doc) {
  const k = KINDS[kind];
  const id = String(doc._id);
  const where = k?.ops?.where?.(doc) || null;
  const { lines, total } = bill(kind, doc);
  return {
    kind,
    id,
    reference: doc.reference || id.slice(-8).toUpperCase(),
    service: await serviceName(kind, doc),
    at: when(doc.scheduledAt || doc.checkInAt || null),
    bookedAt: when(doc.createdAt),
    address: where?.address || '',
    provider: await providerOf(doc),
    lines: lines.map(([l, p]) => [l, p < 0 ? `− ${rupees(-p)}` : rupees(p)]),
    linesPaise: lines,
    totalPaise: total,
    total: rupees(total),
    paid: doc.paymentStatus === 'paid',
    method: doc.paymentMethod === 'cash' ? 'Cash' : doc.paymentMethod === 'wallet' ? 'Wallet' : 'Online',
    link: k ? k.link(id) : '/',
    providerLink: k ? k.providerLink(id) : '/worker',
    userId: doc.userId ? String(doc.userId) : null,
  };
}

module.exports = { jobFacts, bill, rupees, tidy, when };
