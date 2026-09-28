/**
 * Customer- and technician-facing repair handlers, one file per concern.
 * Provider (catalog/pricing self-service) and admin handlers are required
 * directly by their own routes.
 */
module.exports = {
  ...require('./catalog.controller'),
  ...require('./booking.controller'),
  ...require('./assets.controller'),
};
