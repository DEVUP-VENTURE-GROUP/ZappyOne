// The partner agreement a shop, agency, company or independent professional accepts to take ZappyOne jobs: the rate is their type's live rate (shop/partner-commission), the acceptance is kept on the shop.
const VERSION = '2026-10';
const TYPES = ['shop', 'agency', 'company', 'individual'];

const points = (pct) => [
  pct > 0
    ? 'Nothing to join, no monthly fee and nothing on parts. Customers pay ZappyOne a small booking fee; a small service fee on your work, at the rate in your partner terms, is settled from your balance.'
    : 'You keep 100% of your price. Nothing to join, no monthly fee; customers pay ZappyOne a small booking fee.',
  'Customers pay the price shown in the app. You never charge more without the customer approving the new price in the app.',
  'Online payments build up in your ZappyOne balance; withdraw to your bank or UPI any time from ₹100. On cash jobs you keep the cash and the service fee is settled from your balance or paid to ZappyOne.',
  'You and everyone in your team complete ID verification, and keep your documents current.',
  'Ratings, cancellations and no-shows decide how many jobs you are offered. You can appeal any decision in the app.',
  'Either side can end the partnership at any time; what is owed either way is settled within 7 days.',
];

async function termsFor(type = 'shop') {
  const t = TYPES.includes(type) ? type : 'shop';
  const rates = await require('../pricing/services/config.service').partnerCommissionSettings();
  const ratePct = Number.isFinite(Number(rates[t])) ? Number(rates[t]) : 5;
  return { version: VERSION, type: t, ratePct, points: points(ratePct), fullTermsUrl: 'https://www.zappyone.com/policy/terms' };
}

async function accept(shopId) {
  const Shop = require('./shop.model');
  const shop = await Shop.findById(shopId).select('partnerType commissionOverride').lean();
  if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404, code: 'NOT_FOUND' });
  const rate = await require('./partner-commission').rateOf({ kind: 'shop', id: shopId });
  const agreement = { version: VERSION, acceptedAt: new Date(), ratePct: rate?.pct ?? (await termsFor(shop.partnerType)).ratePct };
  await Shop.updateOne({ _id: shopId }, { $set: { agreement } });
  return agreement;
}

const isCurrent = (agreement) => agreement?.version === VERSION;

module.exports = { VERSION, TYPES, termsFor, accept, isCurrent };
