/**
 * Provider self-service: capabilities, service areas, inventory and pricing.
 *
 * "Provider" is a shop OR an independent worker — every handler resolves the
 * owner from the token rather than the body, so a worker cannot write rows
 * belonging to a shop by guessing an id (§51).
 *
 * Prices submitted here are NOT live. They are scored against the Zappy
 * reference band and either auto-approved (green, if config allows) or queued
 * for review (§12). A provider can never publish their own price unchecked.
 */


module.exports = {
  ...require('./provider/setup.controller'),
  ...require('./provider/pricing.controller'),
  ...require('./provider/catalog.controller'),
};
