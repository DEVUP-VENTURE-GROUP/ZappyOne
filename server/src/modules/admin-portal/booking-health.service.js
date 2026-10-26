// Where bookings go wrong, over a window: per job kind and per service, how many were made, finished, cancelled (customer or provider/system), never got a provider, or are still waiting, and how long acceptance took.
const { KINDS } = require('../jobs/kinds');
const { RULES } = require('../jobs/give-back');

const SCAN_LIMIT = 3000;
const NO_PROVIDER = new Set(['EXPIRED', 'FAILED', 'REJECTED']);
const DONE = {
  repair: new Set(['COMPLETED']),
  pet: new Set(['PAYMENT_COMPLETED', 'CLOSED']),
  helping: new Set(['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED']),
};
const keyOf = {
  repair: (d) => d.vertical || 'repair',
  pet: (d) => d.categoryCode || 'pet care',
  helping: (d) => d.serviceType || 'errand',
};

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null);

function cancelledBy(doc) {
  const h = [...(doc.statusHistory || [])].reverse().find((x) => x.status === 'CANCELLED');
  const role = h?.byRole || h?.actorRole || doc.cancelledBy || '';
  return ['user', 'customer'].includes(role) ? 'customer' : 'provider_or_system';
}

async function scanKind(kind, since) {
  const k = KINDS[kind];
  const accepted = new Set(RULES[kind]?.accepted || []);
  const docs = await k.model().find({ createdAt: { $gte: since } })
    .select('status createdAt statusHistory vertical categoryCode serviceType cancelledBy workerId shopId')
    .sort({ createdAt: -1 }).limit(SCAN_LIMIT).lean();
  const terminal = new Set(k.ops.terminal);
  const services = new Map();
  const acceptMins = [];
  for (const d of docs) {
    const key = keyOf[kind](d);
    const row = services.get(key) || { service: key, made: 0, done: 0, cancelledByCustomer: 0, cancelledOther: 0, noProvider: 0, waiting: 0 };
    row.made += 1;
    if (DONE[kind].has(d.status)) row.done += 1;
    else if (d.status === 'CANCELLED') row[cancelledBy(d) === 'customer' ? 'cancelledByCustomer' : 'cancelledOther'] += 1;
    else if (NO_PROVIDER.has(d.status)) row.noProvider += 1;
    else if (!terminal.has(d.status)) row.waiting += 1;
    services.set(key, row);
    const first = (d.statusHistory || []).find((x) => accepted.has(x.status));
    if (first?.at) acceptMins.push((new Date(first.at) - new Date(d.createdAt)) / 60000);
  }
  acceptMins.sort((a, b) => a - b);
  const rows = [...services.values()].map((r) => ({ ...r, lostPct: r.made ? Math.round(((r.cancelledOther + r.noProvider) / r.made) * 100) : 0 }));
  const total = rows.reduce((s, r) => {
    for (const f of ['made', 'done', 'cancelledByCustomer', 'cancelledOther', 'noProvider', 'waiting']) s[f] = (s[f] || 0) + r[f];
    return s;
  }, { kind });
  return {
    ...total,
    acceptMedianMin: acceptMins.length ? Math.round(pct(acceptMins, 0.5)) : null,
    acceptP90Min: acceptMins.length ? Math.round(pct(acceptMins, 0.9)) : null,
    capped: docs.length >= SCAN_LIMIT,
    services: rows.sort((a, b) => (b.cancelledOther + b.noProvider) - (a.cancelledOther + a.noProvider) || b.made - a.made),
  };
}

async function bookingHealth({ days = 7 } = {}) {
  const d = Math.min(Math.max(Number(days) || 7, 1), 90);
  const since = new Date(Date.now() - d * 86400000);
  const kinds = await Promise.all(['repair', 'pet', 'helping'].map((k) => scanKind(k, since).catch(() => null)));
  return { days: d, since, kinds: kinds.filter(Boolean) };
}

module.exports = { bookingHealth };
