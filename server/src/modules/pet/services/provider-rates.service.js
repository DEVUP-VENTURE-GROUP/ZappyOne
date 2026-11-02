// A pet care provider's own rate card: a price per pet size for each service they offer, and their own add-on, pickup and return fees (pet/services/pricing uses it; ZappyOne sets no price).
const { httpError } = require('../../../core/errors');
const { PetProviderCapability } = require('../models/config.model');
const { PetServiceVariant, PetServiceAddon } = require('../models/catalog.model');
const { PET_SIZES } = require('../../service/pet-passport.model');

const UNIT_WORD = { per_night: 'a night', per_day: 'a day', per_visit: 'a visit', per_minute: 'a session', per_km: 'a trip', flat: 'a session', quote: null };

async function capabilityOf(owner) {
  const cap = await PetProviderCapability.findOne(owner.shopId ? { shopId: owner.shopId } : { workerId: owner.workerId });
  if (!cap) throw httpError('Get verified for a pet care service first.', 404, 'NO_PET_SERVICE');
  return cap;
}

async function card(owner) {
  const cap = await capabilityOf(owner);
  const cats = cap.categoryCodes || [];
  const [variants, addons] = await Promise.all([
    PetServiceVariant.find({ categoryCode: { $in: cats }, isActive: true, pricingUnit: { $ne: 'quote' } }).select('code name categoryCode pricingUnit allowedSizes displayOrder').sort({ categoryCode: 1, displayOrder: 1 }).lean(),
    PetServiceAddon.find({ isActive: true, $or: [{ categoryCodes: { $size: 0 } }, { categoryCodes: { $in: cats } }] }).select('code name').sort({ name: 1 }).lean(),
  ]);
  const sizes = cap.sizes?.length ? PET_SIZES.filter((s) => cap.sizes.includes(s)) : PET_SIZES;
  const rateOf = new Map((cap.rates || []).map((r) => [r.variantCode, r.prices || {}]));
  const addonOf = new Map((cap.addonPrices || []).map((a) => [a.code, a.pricePaise]));
  return {
    sizes,
    services: variants.map((v) => ({
      code: v.code, name: v.name, categoryCode: v.categoryCode, per: UNIT_WORD[v.pricingUnit] || 'a session',
      sizes: (v.allowedSizes?.length ? sizes.filter((s) => v.allowedSizes.includes(s)) : sizes),
      prices: Object.fromEntries(sizes.map((s) => [s, rateOf.get(v.code)?.[s] ?? null])),
    })),
    addons: addons.map((a) => ({ code: a.code, name: a.name, pricePaise: addonOf.get(a.code) ?? null })),
    pickupPaise: cap.pickupPaise || 0,
    returnPaise: cap.returnPaise || 0,
  };
}

// Saving replaces the card; a blank price means they do not offer that service for that size.
async function saveCard(owner, body) {
  const cap = await capabilityOf(owner);
  const current = await card(owner);
  const known = new Map(current.services.map((s) => [s.code, s]));
  const addonCodes = new Set(current.addons.map((a) => a.code));
  const ok = (p) => p == null || (Number.isInteger(p) && p >= 100 && p <= 100000000);
  const rates = [];
  for (const r of body.rates || []) {
    const service = known.get(r.variantCode);
    if (!service) throw httpError('That is not one of your pet services.', 400, 'UNKNOWN_SERVICE');
    const prices = {};
    for (const s of service.sizes) {
      const p = r.prices?.[s] ?? null;
      if (!ok(p)) throw httpError('Each price must be at least ₹1.', 400, 'BAD_PRICE');
      if (p != null) prices[s] = p;
    }
    if (Object.keys(prices).length) rates.push({ variantCode: r.variantCode, prices });
  }
  const addonPrices = (body.addonPrices || []).filter((a) => addonCodes.has(a.code) && a.pricePaise != null);
  if (addonPrices.some((a) => !ok(a.pricePaise))) throw httpError('Each add-on price must be at least ₹1.', 400, 'BAD_PRICE');
  for (const fee of ['pickupPaise', 'returnPaise']) {
    if (body[fee] != null && !(Number.isInteger(body[fee]) && body[fee] >= 0 && body[fee] <= 10000000)) throw httpError('Enter a fee in rupees.', 400, 'BAD_PRICE');
  }
  cap.rates = rates;
  cap.addonPrices = addonPrices;
  cap.pickupPaise = body.pickupPaise ?? 0;
  cap.returnPaise = body.returnPaise ?? 0;
  await cap.save();
  return card(owner);
}

module.exports = { card, saveCard };
