// "Edit" on booking details: the customer fixes their address or adds door directions before the pro sets off.
// A move is capped so the price and the matched pro stay right; a bigger change is a cancel and rebook.
const MAX_MOVE_M = 500;
const FIELDS = { repair: 'location', pet: 'serviceLocation' };
// Where door directions go, for the kinds that keep them.
const DIRECTIONS = { repair: 'landmark' };

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function metres([lng1, lat1], [lng2, lat2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const x = rad(lng2 - lng1) * Math.cos(rad((lat1 + lat2) / 2));
  const y = rad(lat2 - lat1);
  return Math.sqrt(x * x + y * y) * 6371000;
}

async function editable(kind, doc) {
  const { MOVABLE } = require('./reschedule');
  if (!FIELDS[kind] || !MOVABLE[kind]) return { allowed: false };
  if (kind === 'pet' && doc.serviceMode === 'provider_location') return { allowed: false };
  if (!MOVABLE[kind].includes(doc.status)) return { allowed: false, reason: 'Your pro is already on the way, so the address cannot change now. Call them instead.' };
  return { allowed: true, maxMoveM: MAX_MOVE_M };
}

async function editPlace({ id, userId, lat, lng, address, directions }) {
  const { findJob, KINDS } = require('./kinds');
  const found = await findJob(id, `userId status serviceMode workerId shopId reference ${Object.values(FIELDS).join(' ')}`);
  if (!found) throw fail(404, 'NOT_FOUND', 'Booking not found');
  const { kind, doc } = found;
  if (String(doc.userId) !== String(userId)) throw fail(403, 'FORBIDDEN', 'This is not your booking');
  const gate = await editable(kind, doc);
  if (!gate.allowed) throw fail(409, 'NOT_EDITABLE', gate.reason || 'This booking cannot be edited here.');

  const field = FIELDS[kind];
  const current = doc[field] || {};
  const set = {};
  if (lat != null && lng != null) {
    const to = [Number(lng), Number(lat)];
    if (!current.coordinates || metres(current.coordinates, to) > MAX_MOVE_M) {
      throw fail(409, 'TOO_FAR', `You can move the pin up to ${MAX_MOVE_M} m. For a different address, cancel and book again.`);
    }
    set[`${field}.coordinates`] = to;
  }
  if (address != null) set[`${field}.address`] = String(address).trim().slice(0, 300);
  if (directions != null && DIRECTIONS[kind]) set[`${field}.${DIRECTIONS[kind]}`] = String(directions).trim().slice(0, 200);
  if (!Object.keys(set).length) throw fail(400, 'NOTHING_TO_CHANGE', 'Nothing to change.');

  // Atomic: only while still before the pro sets off.
  const { MOVABLE } = require('./reschedule');
  const row = await KINDS[kind].model().findOneAndUpdate({ _id: doc._id, userId, status: { $in: MOVABLE[kind] } }, { $set: set }, { new: true }).lean();
  if (!row) throw fail(409, 'CHANGED', 'This booking just changed. Refresh and try again.');

  const events = require('./job-events');
  const provider = row.workerId ? { kind: 'worker', id: row.workerId } : row.shopId ? { kind: 'shop', id: row.shopId } : null;
  const payload = { kind, id: String(row._id), status: row.status, at: new Date().toISOString() };
  events.toProvider('user', row.userId, 'job.update', payload);
  if (provider) {
    events.toProvider(provider.kind, provider.id, 'job.update', payload);
    await events.push(provider, {
      title: 'Customer updated the address',
      body: `${row.reference || 'A booking'}: check the new pin and directions before you set off.`,
      deepLink: KINDS[kind].providerLink(String(row._id)), data: { kind, id: String(row._id), status: row.status },
    }).catch(() => {});
  }
  return { ok: true, message: provider ? 'Updated. Your pro has been told.' : 'Updated.' };
}

module.exports = { editable, editPlace, MAX_MOVE_M, FIELDS, DIRECTIONS };
