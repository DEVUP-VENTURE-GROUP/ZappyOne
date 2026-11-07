/**
 * The start code, for every kind that declares one in jobs/kinds.js.
 *
 * The first version's order flow did this for orders: the customer is shown a
 * code once the pro arrives, and the pro can't start until they type it — proof
 * the right person is at the right door, and that the customer agreed to start.
 * Repairs keep their own richer set (start, handover, return) in
 * repair/services/handover.service.
 *
 * The code is the customer's own PIN (jobs/customer-pin), the same for every booking.
 */
const { KINDS } = require('./kinds');


/** Does moving this job to `next` need the customer's code? */
function needsCode(kind, doc, next) {
  const rule = KINDS[kind]?.startCode;
  return Boolean(rule && rule.required(doc, next));
}

/**
 * Throws unless the code is right (or not needed). Call before the move.
 */
async function assertStartCode(kind, doc, next, code) {
  if (!needsCode(kind, doc, next)) return;
  if (!code) throw Object.assign(new Error('Ask the customer for the start code shown in their app'), { status: 409, code: 'START_CODE_REQUIRED' });
  const { pinOf, sameCode } = require('./customer-pin');
  // Events still show their own booking code until they move to the PIN (next version).
  const expected = kind === 'event' ? doc[KINDS[kind].startCode.field] : await pinOf(doc.userId);
  if (!sameCode(expected, code)) {
    throw Object.assign(new Error('That code is not right. Ask the customer to read it again.'), { status: 401, code: 'START_CODE_INVALID' });
  }
}

module.exports = { needsCode, assertStartCode };
