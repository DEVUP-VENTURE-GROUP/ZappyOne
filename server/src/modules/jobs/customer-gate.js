const logger = require('../../core/logger');

const err = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });

// Every kind of booking passes here first: the cancel freeze, then any cash job the customer did not pay.
async function assertCustomerCanBook(userId) {
  if (!userId) return;
  try {
    await require('../order/abuse.service').assertNotFrozen(userId);
  } catch (e) {
    if (e.code === 'USER_BOOKING_FROZEN') throw e;
    logger.warn({ err: e.message }, '[customer-gate] freeze check skipped');
  }
  const [due] = await require('./give-back').openCashDues(userId);
  if (due) {
    throw err(402, 'CASH_DUE', `Your pro says booking ${due.reference || ''} was not paid. Pay them for it first, or tell us from that booking if something went wrong.`.replace('  ', ' '), {
      details: { kind: due.kind, jobId: due.jobId, reference: due.reference },
    });
  }
}

module.exports = { assertCustomerCanBook };
