/**
 * The start code, for every kind that declares one in jobs/kinds.js.
 *
 * The first version's order flow did this for orders: the customer is shown a
 * code once the pro arrives, and the pro can't start until they type it — proof
 * the right person is at the right door, and that the customer agreed to start.
 * Repairs keep their own richer set (start, handover, return) in
 * repair/services/handover.service.
 *
 * Codes are four digits from a real random source, shown only to the customer.
 */
const crypto = require('crypto');
const { KINDS } = require('./kinds');

const newCode = () => String(crypto.randomInt(1000, 10000));

/** Does moving this job to `next` need the customer's code? */
function needsCode(kind, doc, next) {
  const rule = KINDS[kind]?.startCode;
  return Boolean(rule && rule.required(doc, next));
}

/**
 * Throws unless the code is right (or not needed). Call before the move.
 * A job created before codes existed gets one now, so it can still start.
 */
async function assertStartCode(kind, doc, next, code) {
  if (!needsCode(kind, doc, next)) return;
  const { field } = KINDS[kind].startCode;
  if (!doc[field]) {
    doc[field] = newCode();
    await doc.save();
    throw Object.assign(new Error('Ask the customer for the start code shown in their app'), { status: 409, code: 'START_CODE_REQUIRED' });
  }
  if (!code) throw Object.assign(new Error('Ask the customer for the start code shown in their app'), { status: 409, code: 'START_CODE_REQUIRED' });
  const a = Buffer.from(String(code).trim());
  const b = Buffer.from(String(doc[field]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('That code is not right. Ask the customer to read it again.'), { status: 401, code: 'START_CODE_INVALID' });
  }
}

module.exports = { needsCode, assertStartCode, newCode };
