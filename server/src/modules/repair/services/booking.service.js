/**
 * Booking lifecycle: creation, transitions, quoting, completion.
 *
 * Three hard rules are enforced here rather than in controllers, so they hold
 * no matter which surface calls in (customer app, worker app, admin panel):
 *
 *   §46 IDEMPOTENCY — a repeated create/approve must not produce a second
 *       booking or a second approved quote. Enforced by a unique index on
 *       `idempotencyKey`, caught as a duplicate-key error and turned back into
 *       the original record rather than an error the client has to interpret.
 *
 *   §45 CONCURRENCY — stock is reserved with an atomic conditional update, so
 *       two customers racing for the last screen cannot both win. The update
 *       matches on available quantity, so it either reserves or it does not.
 *
 *   §31 PRICE INTEGRITY — an approved quote is never edited. Extra work creates
 *       a new revision that the customer must approve separately.
 */

module.exports = {
  ...require('./booking/stock'),
  ...require('./booking/create'),
  ...require('./booking/lifecycle'),
  ...require('./booking/assignment'),
  ...require('./booking/quotes'),
};
