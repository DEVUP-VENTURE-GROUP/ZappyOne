/**
 * Pricing Service
 * ----------------------------------------------------------------------------
 * price = (base + distance*perKm + time*perMin + platformFee) * surge
 *
 * Config sources (precedence):
 *   1. Redis cache `config:pricing:active` (5s in-process cache too)
 *   2. PricingConfig collection (the active one)
 *   3. Env-based defaults
 *
 * Premium effects (only applied when computing for a specific user):
 *   - waivePlatformFee → platformFee = 0
 *   - surgeCap         → cap surge multiplier at the user's tier
 *
 * All money is computed in PAISE internally (integer math). Returned both
 * in paise and rupees for the frontend's convenience.
 * ----------------------------------------------------------------------------
 */

const verticals = require('./services/verticals');
const configService = require('./services/config.service');
const surge = require('./services/surge.service');
const engines = require('./services/engines.service');
const { calculatePrice, quote } = require('./services/quote.service');
const { calculateEarnings } = require('./services/earnings.service');

module.exports = {
  calculatePrice,
  quote, // alias
  calculateEarnings,
  computeSurge: surge.computeSurge,
  computeSurgeBreakdown: surge.computeSurgeBreakdown,
  recordDemand: surge.recordDemand,
  recordSupply: surge.recordSupply,
  zoneGapBonusPaise: surge.zoneGapBonusPaise,
  zoneGap: surge.zoneGap,
  getActiveConfig: configService.getActiveConfig,
  updateActiveConfig: configService.updateActiveConfig,
  bustCache: configService.bustCache,
  // Vertical-specific pricing engines
  calculateMobilePrice: engines.calculateMobilePrice,
  calculateLaptopPrice: engines.calculateLaptopPrice,
  calculateSmartDevicePrice: engines.calculateSmartDevicePrice,
  calculateVehiclePrice: engines.calculateVehiclePrice,
  calculateTowingPrice: engines.calculateTowingPrice,
  calculateTankCleaningPrice: engines.calculateTankCleaningPrice,
  calculateFamilyAssistPrice: engines.calculateFamilyAssistPrice,
  calculateEventPrice: engines.calculateEventPrice,
  calculatePetPrice: engines.calculatePetPrice,
  calculateConstructionPrice: engines.calculateConstructionPrice, // disabled at service level — kept for re-activation
  // Vertical sets (used by geo.service, worker.service, etc.)
  ...verticals,
};
